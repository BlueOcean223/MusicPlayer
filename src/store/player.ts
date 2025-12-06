import { defineStore } from 'pinia'
import { Howl } from 'howler'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'

interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  path: string;
  howl: Howl | null;
  albumArt?: string;
  genre?: string;
  year?: number;
  playSrc?: string;
}

interface MusicMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  albumArt?: string;
  genre?: string;
  year?: number;
}

export const usePlayerStore = defineStore('player', {
  state: () => ({
    currentSong: null as Song | null,
    playlist: [] as Song[],
    isPlaying: false,
    currentTime: 0,
    volume: 0.3,
    lyrics: null as string | null,
    parsedLyrics: [] as { time: number, text: string }[],
    // 播放模式：'sequential' 顺序播放, 'random' 随机播放, 'single' 单曲循环
    playMode: 'sequential' as 'sequential' | 'random' | 'single',
    // 播放错误信息
    playError: null as string | null
  }),

  actions: {
    async addSongs(paths: string[]) {
      const addedCount = { success: 0, duplicate: 0, failed: 0 }

      // 统一路径分隔符并去重输入列表，防止同一次批量导入重复
      const normalizedPaths = Array.from(new Set(paths.map(p => p.replace(/\\/g, '/'))))
      
      for (const rawPath of normalizedPaths) {
        const path = rawPath
        try {
          // 检查是否已存在相同路径的歌曲（去重）
          const existingSong = this.playlist.find(song => song.path === path)
          if (existingSong) {
            addedCount.duplicate++
            console.log(`歌曲已存在，跳过: ${path}`)
            continue
          }
          
          // 解析音乐元数据
          const metadata = await invoke<MusicMetadata>('parse_music_metadata', { filePath: path })

          if (metadata) {
            const song: Song = {
              id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
              title: metadata.title || '未知标题',
              artist: metadata.artist || '未知艺术家',
              album: metadata.album || '未知专辑',
              duration: metadata.duration || 0,
              path,
              howl: null,
              albumArt: metadata.albumArt,
              genre: metadata.genre,
              year: metadata.year
            }

            this.playlist.push(song)
            addedCount.success++
            // 保存到本地缓存
            this.updateLocalCache()
          }
        } catch (error) {
          addedCount.failed++
          console.error('Error adding song:', error)
        }
      }
      
      // 返回添加结果信息
      return addedCount
    },

    async play(song?: Song) {
      const targetSong = song || this.currentSong || this.playlist[0]
      if (!targetSong) return

      // 停止并卸载上一首，避免残留状态
      if (this.currentSong?.howl) {
        this.currentSong.howl.stop()
        this.currentSong.howl.unload()
      }

      this.currentSong = targetSong
      this.currentTime = 0
      const currentId = this.currentSong.id

      try {
        const playablePath = await invoke<string>('ensure_playable_file', { filePath: this.currentSong.path })
        const ext = playablePath.split('.').pop()?.toLowerCase() || 'mp3'
        const fileSrc = convertFileSrc(playablePath)
        this.currentSong.playSrc = fileSrc
        let triedDataFallback = false

        const buildHowl = (sources: string[], fmt: string) => new Howl({
          src: sources,
          html5: false, // 优先使用 WebAudio，避免自定义协议在 audio 标签上受限
          volume: this.volume,
          format: [fmt],
          onload: () => {
            if (!this.currentSong || this.currentSong.id !== currentId) return
            const realDuration = this.currentSong?.howl?.duration()
            if (realDuration && !isNaN(realDuration)) {
              this.currentSong!.duration = realDuration
            }
          },
          onplay: () => {
            if (!this.currentSong || this.currentSong.id !== currentId) return
            this.isPlaying = true
            this.playError = null
            this.updateTime()
          },
          onpause: () => {
            if (!this.currentSong || this.currentSong.id !== currentId) return
            this.isPlaying = false
          },
          onstop: () => {
            if (!this.currentSong || this.currentSong.id !== currentId) return
            this.isPlaying = false
            this.currentTime = 0
          },
          onend: () => {
            if (!this.currentSong || this.currentSong.id !== currentId) return
            if (this.playMode === 'single') {
              if (this.currentSong && this.currentSong.howl) {
                this.currentSong.howl.seek(0)
                this.currentSong.howl.play()
                this.currentTime = 0
                this.loadLyrics()
              }
            } else {
              this.next()
            }
          },
          onloaderror: async (_id, error) => {
            console.error('Error loading audio:', error, this.currentSong?.title)
            if (!this.currentSong || this.currentSong.id !== currentId) return
            if (!triedDataFallback) {
              triedDataFallback = true
              await this.fallbackToDataUrl(playablePath, ext, currentId)
              return
            }
            const errorMsg = `无法播放: ${this.currentSong?.title || '未知歌曲'}`
            this.playError = errorMsg
            this.isPlaying = false
          },
          onplayerror: async (_id, error) => {
            console.error('Error playing audio:', error, this.currentSong?.title)
            if (!this.currentSong || this.currentSong.id !== currentId) return
            if (!triedDataFallback) {
              triedDataFallback = true
              await this.fallbackToDataUrl(playablePath, ext, currentId)
              return
            }
            const errorMsg = `播放错误: ${this.currentSong?.title || '未知歌曲'}`
            this.playError = errorMsg
            this.isPlaying = false
            if (this.currentSong?.howl) {
              this.currentSong.howl.once('unlock', () => {
                this.currentSong?.howl?.play()
              })
            }
          }
        })

        // 清除之前的错误状态
        this.playError = null

        this.currentSong.howl = buildHowl([fileSrc], ext)
      } catch (error) {
        console.error('创建音频实例失败:', error)
        this.playError = `创建音频失败: ${this.currentSong?.title || '未知歌曲'}`
        return
      }

      try {
        this.currentSong.howl?.play()
        this.isPlaying = true
        // 加载歌词
        this.loadLyrics()
      } catch (error) {
        console.error('播放失败:', error)
        this.playError = `播放失败: ${this.currentSong?.title || '未知歌曲'}`
        this.isPlaying = false
      }
    },

    // 若自定义协议播放失败，回退为 data URL（兼容性更高）
    async fallbackToDataUrl(playablePath: string, ext: string, songId: string) {
      if (!this.currentSong || this.currentSong.id !== songId) return
      try {
        const base64Data = await invoke<string>('read_file', { filePath: playablePath })
        if (!base64Data) {
          this.playError = `无法读取音频文件: ${this.currentSong?.title || '未知歌曲'}`
          return
        }

        const mimeMap: Record<string, string> = {
          mp3: 'audio/mpeg',
          wav: 'audio/wav',
          flac: 'audio/flac',
          ogg: 'audio/ogg',
          oga: 'audio/ogg',
          m4a: 'audio/mp4',
          aac: 'audio/aac',
          wma: 'audio/x-ms-wma',
          webm: 'audio/webm',
          opus: 'audio/opus'
        }
        const mimeType = mimeMap[ext] || 'audio/mpeg'
        const dataSrc = `data:${mimeType};base64,${base64Data}`

        if (!this.currentSong || this.currentSong.id !== songId) return

        if (this.currentSong.howl) {
          this.currentSong.howl.stop()
          this.currentSong.howl.unload()
        }

        this.currentSong.playSrc = dataSrc
        this.currentSong.howl = new Howl({
          src: [dataSrc],
          html5: false,
          volume: this.volume,
          format: [ext],
          onload: () => {
            if (!this.currentSong || this.currentSong.id !== songId) return
            const realDuration = this.currentSong?.howl?.duration()
            if (realDuration && !isNaN(realDuration)) {
              this.currentSong.duration = realDuration
            }
          },
          onplay: () => {
            if (!this.currentSong || this.currentSong.id !== songId) return
            this.isPlaying = true
            this.playError = null
            this.updateTime()
          },
          onpause: () => { if (this.currentSong && this.currentSong.id === songId) this.isPlaying = false },
          onstop: () => {
            if (!this.currentSong || this.currentSong.id !== songId) return
            this.isPlaying = false
            this.currentTime = 0
          },
          onend: () => {
            if (!this.currentSong || this.currentSong.id !== songId) return
            if (this.playMode === 'single') {
              if (this.currentSong && this.currentSong.howl) {
                this.currentSong.howl.seek(0)
                this.currentSong.howl.play()
                this.currentTime = 0
                this.loadLyrics()
              }
            } else {
              this.next()
            }
          },
          onloaderror: (_id, error) => {
            console.error('Fallback load error:', error)
            if (!this.currentSong || this.currentSong.id !== songId) return
            this.playError = `无法播放: ${this.currentSong?.title || '未知歌曲'}`
            this.isPlaying = false
          },
          onplayerror: (_id, error) => {
            console.error('Fallback play error:', error)
            if (!this.currentSong || this.currentSong.id !== songId) return
            this.playError = `播放错误: ${this.currentSong?.title || '未知歌曲'}`
            this.isPlaying = false
          }
        })

        if (this.currentSong?.id === songId) {
          this.currentSong.howl?.play()
        }
      } catch (e) {
        console.error('回退为 data URL 失败:', e)
        this.playError = `播放失败: ${this.currentSong?.title || '未知歌曲'}`
        this.isPlaying = false
      }
    },

    pause() {
      if (this.currentSong && this.currentSong.howl) {
        this.currentSong.howl.pause()
        this.isPlaying = false
      }
    },

    togglePlay() {
      if (this.isPlaying) {
        this.pause()
      } else {
        this.play()
      }
    },

    // 切换播放模式
    togglePlayMode() {
      // 顺序 -> 随机 -> 单曲 -> 顺序
      if (this.playMode === 'sequential') {
        this.playMode = 'random'
      } else if (this.playMode === 'random') {
        this.playMode = 'single'
      } else {
        this.playMode = 'sequential'
      }
      this.updateLocalCache()
    },

    // 获取随机歌曲索引
    getRandomIndex(currentIndex: number): number {
      if (this.playlist.length <= 1) return currentIndex

      let randomIndex
      do {
        randomIndex = Math.floor(Math.random() * this.playlist.length)
      } while (randomIndex === currentIndex && this.playlist.length > 1)

      return randomIndex
    },

    next() {
      if (!this.currentSong || this.playlist.length <= 1) return

      const currentIndex = this.playlist.findIndex(song => song.id === this.currentSong?.id)
      let nextIndex

      if (this.playMode === 'random') {
        nextIndex = this.getRandomIndex(currentIndex)
      } else {
        // 顺序播放和单曲循环下，手动点击下一首都是去下一首
        nextIndex = (currentIndex + 1) % this.playlist.length
      }

      this.play(this.playlist[nextIndex])
    },

    prev() {
      if (!this.currentSong || this.playlist.length <= 1) return

      const currentIndex = this.playlist.findIndex(song => song.id === this.currentSong?.id)
      let prevIndex

      if (this.playMode === 'random') {
        prevIndex = this.getRandomIndex(currentIndex)
      } else {
        // 顺序播放和单曲循环下，手动点击上一首都是去上一首
        prevIndex = (currentIndex - 1 + this.playlist.length) % this.playlist.length
      }

      this.play(this.playlist[prevIndex])
    },

    updateTime() {
      const howl = this.currentSong?.howl
      if (howl && howl.playing()) {
        const currentTime = howl.seek() as number
        if (typeof currentTime === 'number' && !isNaN(currentTime)) {
          this.currentTime = currentTime
        }
        requestAnimationFrame(() => this.updateTime())
      }
    },

    seek(position: number) {
      if (this.currentSong && this.currentSong.howl && typeof position === 'number' && position >= 0) {
        const duration = this.currentSong.howl.duration()
        if (duration && position <= duration) {
          this.currentSong.howl.seek(position)
          this.currentTime = position
        }
      }
    },
    // 调整音量
    setVolume(volume: number) {
      if (typeof volume === 'number' && volume >= 0 && volume <= 1) {
        this.volume = volume
        if (this.currentSong && this.currentSong.howl) {
          this.currentSong.howl.volume(volume)
        }
        // 保存音量设置
        this.updateLocalCache()
      }
    },

    async loadLyrics() {
      if (!this.currentSong) return

      try {
        const lyrics = await invoke<string | null>('read_lyrics', {
          filePath: this.currentSong.path,
          title: this.currentSong.title,
          artist: this.currentSong.artist
        })
        this.lyrics = lyrics

        if (lyrics) {
          this.parseLyrics(lyrics)
        } else {
          this.parsedLyrics = []
        }
      } catch (error) {
        console.error('Error loading lyrics:', error)
        this.lyrics = null
        this.parsedLyrics = []
      }
    },

    parseLyrics(lyrics: string) {
      if (!lyrics || typeof lyrics !== 'string') {
        this.parsedLyrics = []
        return
      }

      // 解析LRC格式歌词
      const lines = lyrics.split('\n')
      // 改进的正则表达式，支持多种时间格式：
      // [mm:ss.xx] - 标准格式，毫秒两位数
      // [mm:ss.xxx] - 毫秒三位数
      // [mm:ss:xx] - 使用冒号分隔毫秒
      // [mm:ss] - 无毫秒
      const timeRegex = /\[(\d+):(\d+)(?:[.:]+(\d+))?\]/g

      const parsedLines: { time: number; text: string }[] = []

      for (const line of lines) {
        // 跳过元数据标签 [ti:] [ar:] [al:] 等
        if (/^\[[a-zA-Z]+:/.test(line)) {
          continue
        }
        
        // 重置正则表达式的lastIndex
        timeRegex.lastIndex = 0
        
        // 提取所有时间标签
        const matches: RegExpExecArray[] = []
        let match: RegExpExecArray | null
        while ((match = timeRegex.exec(line)) !== null) {
          matches.push([...match] as unknown as RegExpExecArray)
        }
        
        if (matches.length > 0) {
          // 提取歌词文本（移除所有时间标签）
          const text = line.replace(/\[\d+:\d+(?:[.:]+\d+)?\]/g, '').trim()
          
          if (text) {
            // 为每个时间标签创建一个条目
            for (const m of matches) {
              const minutes = parseInt(m[1], 10)
              const seconds = parseInt(m[2], 10)
              const msStr = m[3] || '0'
              
              // 处理毫秒，根据位数决定如何计算
              let milliseconds = parseInt(msStr, 10)
              if (msStr.length === 2) {
                // 两位数毫秒格式 (xx -> 0.xx秒)
                milliseconds = milliseconds * 10
              } else if (msStr.length === 1) {
                // 单位数毫秒格式
                milliseconds = milliseconds * 100
              }
              // 三位数保持原样
              
              if (!isNaN(minutes) && !isNaN(seconds) && !isNaN(milliseconds)) {
                const time = minutes * 60 + seconds + milliseconds / 1000
                parsedLines.push({ time, text })
              }
            }
          }
        }
      }

      this.parsedLyrics = parsedLines.sort((a, b) => a.time - b.time)
    },

    getCurrentLyric() {
      if (!this.parsedLyrics.length || !this.currentSong) return ''

      const currentTime = this.currentTime

      // 找到当前时间对应的歌词
      for (let i = this.parsedLyrics.length - 1; i >= 0; i--) {
        if (this.parsedLyrics[i].time <= currentTime) {
          return this.parsedLyrics[i].text
        }
      }

      return ''
    },

    removeSong(songId: string) {
      const index = this.playlist.findIndex(song => song.id === songId)
      if (index !== -1) {
        // 如果要删除的是当前播放的歌曲
        if (this.currentSong && this.currentSong.id === songId) {
          // 停止播放
          if (this.currentSong.howl) {
            this.currentSong.howl.stop()
            this.currentSong.howl.unload()
            this.currentSong.howl = null
          }

          // 如果还有其他歌曲，播放下一首
          if (this.playlist.length > 1) {
            const nextIndex = index < this.playlist.length - 1 ? index : index - 1
            this.playlist.splice(index, 1)
            if (this.playlist.length > 0) {
              this.play(this.playlist[nextIndex] || this.playlist[0])
            } else {
              this.currentSong = null
              this.isPlaying = false
              this.currentTime = 0
            }
          } else {
            this.playlist.splice(index, 1)
            this.currentSong = null
            this.isPlaying = false
            this.currentTime = 0
          }
        } else {
          // 删除非当前播放的歌曲
          this.playlist.splice(index, 1)
        }
        // 更新本地缓存
        this.updateLocalCache()
      }
    },

    clearPlaylist() {
      // 停止当前播放
      if (this.currentSong && this.currentSong.howl) {
        this.currentSong.howl.stop()
        this.currentSong.howl.unload()
      }

      // 清空播放列表
      this.playlist = []
      this.currentSong = null
      this.isPlaying = false
      this.currentTime = 0
      this.lyrics = null
      this.parsedLyrics = []
      // 更新本地缓存
      this.updateLocalCache()
    },

    // 重排序播放列表
    reorderPlaylist(fromIndex: number, toIndex: number) {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 ||
        fromIndex >= this.playlist.length || toIndex >= this.playlist.length) {
        return
      }

      // 移动歌曲
      const [movedSong] = this.playlist.splice(fromIndex, 1)
      this.playlist.splice(toIndex, 0, movedSong)

      // 更新本地缓存
      this.updateLocalCache()
    },

    // 使用本地缓存初始化
    initFromLocalCache() {
      const cache = localStorage.getItem('musicPlayerCache')
      if (cache) {
        const {
          playlist,
          volume,
          playMode
        } = JSON.parse(cache)

        // 恢复播放列表，为每首歌添加howl: null
        this.playlist = playlist.map((song: any) => ({
          ...song,
          howl: null,
          playSrc: undefined
        }))

        this.volume = volume
        this.playMode = playMode || 'sequential' // 默认顺序播放
      }
    },

    // 更新本地缓存
    updateLocalCache() {
      // howl实例不能序列化，移除
      // 移除 audioData 字段，其包含原始音频数据，过大,容易导致localStorage超配额
      const serializablePlaylist = this.playlist.map(song => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        path: song.path,
        albumArt: song.albumArt,
        genre: song.genre,
        year: song.year
      }))

      const cache = {
        playlist: serializablePlaylist,
        volume: this.volume,
        playMode: this.playMode
      }
      localStorage.setItem('musicPlayerCache', JSON.stringify(cache))
    }
  }
})