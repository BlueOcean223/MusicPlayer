import { defineStore } from 'pinia'
import { Howl } from 'howler'
import { invoke } from '@tauri-apps/api/tauri'

interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  path: string;
  audioData?: string; // 添加音频数据字段
  howl: Howl | null;
  albumArt?: string;
  genre?: string;
  year?: number;
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
    // 播放模式：'sequential' 顺序播放, 'random' 随机播放
    playMode: 'sequential' as 'sequential' | 'random'
  }),

  actions: {
    async addSongs(paths: string[]) {
      for (const path of paths) {
        try {
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
            // 保存到本地缓存
            this.updateLocalCache()
          }
        } catch (error) {
          console.error('Error adding song:', error)
        }
      }
    },

    async play(song?: Song) {
      if (song) {
        // 如果指定了歌曲，播放该歌曲
        if (this.currentSong && this.currentSong.howl) {
          this.currentSong.howl.stop()
        }

        this.currentSong = song
      } else if (!this.currentSong && this.playlist.length > 0) {
        // 如果没有当前歌曲但有播放列表，播放第一首
        this.currentSong = this.playlist[0]
      }

      if (!this.currentSong) return

      // 如果当前歌曲没有howl实例，创建一个
      if (!this.currentSong.howl) {
        try {
          // 如果没有音频数据，先读取文件
          if (!this.currentSong.audioData) {
            const base64Data = await invoke<string>('read_file', { filePath: this.currentSong.path })
            if (!base64Data) {
              console.error('无法读取音频文件')
              return
            }

            // 根据文件扩展名确定MIME类型
            const ext = this.currentSong.path.split('.').pop()?.toLowerCase()
            let mimeType = 'audio/mpeg' // 默认MP3

            switch (ext) {
              case 'wav':
                mimeType = 'audio/wav'
                break
              case 'flac':
                mimeType = 'audio/flac'
                break
              case 'ogg':
                mimeType = 'audio/ogg'
                break
              case 'm4a':
                mimeType = 'audio/mp4'
                break
            }

            this.currentSong.audioData = `data:${mimeType};base64,${base64Data}`
          }

          this.currentSong.howl = new Howl({
            src: [this.currentSong.audioData],
            html5: true,
            volume: this.volume,
            onplay: () => {
              this.isPlaying = true
              this.updateTime()
            },
            onpause: () => {
              this.isPlaying = false
            },
            onstop: () => {
              this.isPlaying = false
              this.currentTime = 0
            },
            onend: () => {
              this.next()
            },
            onloaderror: (_id, error) => {
              console.error('Error loading audio:', error)
              this.next()
            }
          })
        } catch (error) {
          console.error('创建音频实例失败:', error)
          return
        }
      }

      this.currentSong.howl.play()
      this.isPlaying = true

      // 加载歌词
      this.loadLyrics()
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
      this.playMode = this.playMode === 'sequential' ? 'random' : 'sequential'
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
        prevIndex = (currentIndex - 1 + this.playlist.length) % this.playlist.length
      }

      this.play(this.playlist[prevIndex])
    },

    updateTime() {
      if (this.currentSong && this.currentSong.howl && this.isPlaying) {
        const currentTime = this.currentSong.howl.seek() as number
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
      const timeRegex = /\[(\d+):(\d+)\.(\d+)\]/

      const parsedLines = []

      for (const line of lines) {
        const match = timeRegex.exec(line)
        if (match) {
          const minutes = parseInt(match[1], 10)
          const seconds = parseInt(match[2], 10)
          const milliseconds = parseInt(match[3], 10)

          if (!isNaN(minutes) && !isNaN(seconds) && !isNaN(milliseconds)) {
            const time = minutes * 60 + seconds + milliseconds / 1000
            const text = line.replace(timeRegex, '').trim()

            if (text) {
              parsedLines.push({ time, text })
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
          audioData: ''
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