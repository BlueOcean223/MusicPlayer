// 播放控制 Store
import { defineStore } from 'pinia'
import { Howl } from 'howler'
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import type { Song } from './types'
import { usePlaylistStore } from './playlist'
import { useLyricsStore } from './lyrics'

// 重新导出类型供组件使用
export type { Song } from './types'

// 时间更新定时器
let timeUpdateInterval: ReturnType<typeof setInterval> | null = null

export const usePlayerStore = defineStore('player', {
  state: () => ({
    currentSong: null as Song | null,
    isPlaying: false,
    currentTime: 0,
    volume: 0.3,
    playError: null as string | null
  }),

  getters: {
    // 获取播放模式（从 playlist store 获取）
    playMode: () => {
      const playlistStore = usePlaylistStore()
      return playlistStore.playMode
    },

    // 获取播放列表（从 playlist store 获取）
    playlist: () => {
      const playlistStore = usePlaylistStore()
      return playlistStore.playlist
    },

    // 获取解析后的歌词（从 lyrics store 获取）
    parsedLyrics: () => {
      const lyricsStore = useLyricsStore()
      return lyricsStore.parsedLyrics
    },

    // 获取原始歌词
    lyrics: () => {
      const lyricsStore = useLyricsStore()
      return lyricsStore.lyrics
    }
  },

  actions: {
    // 播放歌曲
    async play(song?: Song) {
      const playlistStore = usePlaylistStore()

      const targetSong = song || this.currentSong || playlistStore.playlist[0]
      if (!targetSong) return

      // 停止并卸载上一首
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

        // 检测是否为转码后的临时文件
        const isTranscodedFile = playablePath !== this.currentSong.path

        if (isTranscodedFile) {
          await this.playWithDataUrl(playablePath, ext, currentId)
          return
        }

        const fileSrc = convertFileSrc(playablePath)
        this.currentSong.playSrc = fileSrc
        let triedDataFallback = false

        const buildHowl = (sources: string[], fmt: string) => new Howl({
          src: sources,
          html5: false,
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
            if (playlistStore.playMode === 'single') {
              if (this.currentSong?.howl) {
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
              await this.playWithDataUrl(playablePath, ext, currentId)
              return
            }
            this.playError = `无法播放: ${this.currentSong?.title || '未知歌曲'}`
            this.isPlaying = false
          },
          onplayerror: async (_id, error) => {
            console.error('Error playing audio:', error, this.currentSong?.title)
            if (!this.currentSong || this.currentSong.id !== currentId) return
            if (!triedDataFallback) {
              triedDataFallback = true
              await this.playWithDataUrl(playablePath, ext, currentId)
              return
            }
            this.playError = `播放错误: ${this.currentSong?.title || '未知歌曲'}`
            this.isPlaying = false
            if (this.currentSong?.howl) {
              this.currentSong.howl.once('unlock', () => {
                this.currentSong?.howl?.play()
              })
            }
          }
        })

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
        this.loadLyrics()
      } catch (error) {
        console.error('播放失败:', error)
        this.playError = `播放失败: ${this.currentSong?.title || '未知歌曲'}`
        this.isPlaying = false
      }
    },

    // 使用 data URL 播放音频
    async playWithDataUrl(playablePath: string, ext: string, songId: string) {
      const playlistStore = usePlaylistStore()

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
          onpause: () => { if (this.currentSong?.id === songId) this.isPlaying = false },
          onstop: () => {
            if (!this.currentSong || this.currentSong.id !== songId) return
            this.isPlaying = false
            this.currentTime = 0
          },
          onend: () => {
            if (!this.currentSong || this.currentSong.id !== songId) return
            if (playlistStore.playMode === 'single') {
              if (this.currentSong?.howl) {
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
          this.loadLyrics()
        }
      } catch (e) {
        console.error('加载音频失败:', e)
        this.playError = `播放失败: ${this.currentSong?.title || '未知歌曲'}`
        this.isPlaying = false
      }
    },

    // 暂停
    pause() {
      if (this.currentSong?.howl) {
        this.currentSong.howl.pause()
        this.isPlaying = false
      }
    },

    // 切换播放/暂停
    togglePlay() {
      if (this.isPlaying) {
        this.pause()
      } else {
        this.play()
      }
    },

    // 下一首
    next() {
      const playlistStore = usePlaylistStore()
      if (!this.currentSong || playlistStore.playlist.length <= 1) return

      const nextIndex = playlistStore.getNextIndex(this.currentSong.id)
      this.play(playlistStore.playlist[nextIndex])
    },

    // 上一首
    prev() {
      const playlistStore = usePlaylistStore()
      if (!this.currentSong || playlistStore.playlist.length <= 1) return

      const prevIndex = playlistStore.getPrevIndex(this.currentSong.id)
      this.play(playlistStore.playlist[prevIndex])
    },

    // 时间更新
    updateTime() {
      if (timeUpdateInterval) return

      timeUpdateInterval = setInterval(() => {
        const howl = this.currentSong?.howl
        if (howl && howl.playing()) {
          const currentTime = howl.seek() as number
          if (typeof currentTime === 'number' && !isNaN(currentTime)) {
            this.currentTime = currentTime
          }
        } else {
          this.stopTimeUpdate()
        }
      }, 250)
    },

    // 停止时间更新
    stopTimeUpdate() {
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval)
        timeUpdateInterval = null
      }
    },

    // 跳转
    seek(position: number) {
      if (this.currentSong?.howl && typeof position === 'number' && position >= 0) {
        const duration = this.currentSong.howl.duration()
        if (duration && position <= duration) {
          this.currentSong.howl.seek(position)
          this.currentTime = position
        }
      }
    },

    // 设置音量
    setVolume(volume: number) {
      if (typeof volume === 'number' && volume >= 0 && volume <= 1) {
        this.volume = volume
        if (this.currentSong?.howl) {
          this.currentSong.howl.volume(volume)
        }
        // 保存音量到缓存
        const playlistStore = usePlaylistStore()
        playlistStore.updateLocalCache(volume)
      }
    },

    // 切换播放模式（委托给 playlist store）
    togglePlayMode() {
      const playlistStore = usePlaylistStore()
      playlistStore.togglePlayMode()
    },

    // 加载歌词
    loadLyrics() {
      if (!this.currentSong) return
      const lyricsStore = useLyricsStore()
      lyricsStore.loadLyrics(
        this.currentSong.path,
        this.currentSong.title,
        this.currentSong.artist
      )
    },

    // 获取当前歌词
    getCurrentLyric() {
      const lyricsStore = useLyricsStore()
      return lyricsStore.getCurrentLyric(this.currentTime)
    },

    // 删除歌曲
    removeSong(songId: string) {
      const playlistStore = usePlaylistStore()
      const isCurrentSong = this.currentSong?.id === songId

      if (isCurrentSong && this.currentSong?.howl) {
        this.currentSong.howl.stop()
        this.currentSong.howl.unload()
        this.currentSong.howl = null
      }

      const result = playlistStore.removeSong(songId, this.currentSong?.id)

      if (isCurrentSong) {
        if (result.nextIndex !== undefined && playlistStore.playlist.length > 0) {
          this.play(playlistStore.playlist[result.nextIndex])
        } else {
          this.currentSong = null
          this.isPlaying = false
          this.currentTime = 0
        }
      }
    },

    // 清空播放列表
    clearPlaylist() {
      if (this.currentSong?.howl) {
        this.currentSong.howl.stop()
        this.currentSong.howl.unload()
      }

      const playlistStore = usePlaylistStore()
      const lyricsStore = useLyricsStore()

      playlistStore.clearPlaylist()
      lyricsStore.clearLyrics()

      this.currentSong = null
      this.isPlaying = false
      this.currentTime = 0
    },

    // 添加歌曲（委托给 playlist store）
    async addSongs(paths: string[]) {
      const playlistStore = usePlaylistStore()
      return playlistStore.addSongs(paths)
    },

    // 重排序播放列表（委托给 playlist store）
    reorderPlaylist(fromIndex: number, toIndex: number) {
      const playlistStore = usePlaylistStore()
      playlistStore.reorderPlaylist(fromIndex, toIndex)
    },

    // 从本地缓存初始化
    initFromLocalCache() {
      const playlistStore = usePlaylistStore()
      playlistStore.initFromLocalCache((v: number) => {
        this.volume = v
      })
    }
  }
})