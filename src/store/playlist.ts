// 播放列表管理 Store
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import { nanoid } from 'nanoid'
import type { Song, MusicMetadata, PlayMode } from './types'

export const usePlaylistStore = defineStore('playlist', {
    state: () => ({
        playlist: [] as Song[],
        playMode: 'sequential' as PlayMode,
    }),

    getters: {
        // 获取播放列表长度
        length: (state) => state.playlist.length,

        // 根据 ID 获取歌曲
        getSongById: (state) => (id: string) => state.playlist.find(song => song.id === id),

        // 根据索引获取歌曲
        getSongByIndex: (state) => (index: number) => state.playlist[index],
    },

    actions: {
        // 添加歌曲
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
                            id: nanoid(),
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

            return addedCount
        },

        // 删除歌曲（返回下一首应该播放的歌曲索引，如果删除的是当前歌曲）
        removeSong(songId: string, currentSongId?: string): { removed: boolean; nextIndex?: number } {
            const index = this.playlist.findIndex(song => song.id === songId)
            if (index === -1) return { removed: false }

            const isCurrentSong = currentSongId === songId

            this.playlist.splice(index, 1)
            this.updateLocalCache()

            if (isCurrentSong && this.playlist.length > 0) {
                const nextIndex = index < this.playlist.length ? index : index - 1
                return { removed: true, nextIndex: Math.max(0, nextIndex) }
            }

            return { removed: true }
        },

        // 清空播放列表
        clearPlaylist() {
            this.playlist = []
            this.updateLocalCache()
        },

        // 重排序播放列表
        reorderPlaylist(fromIndex: number, toIndex: number) {
            if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 ||
                fromIndex >= this.playlist.length || toIndex >= this.playlist.length) {
                return
            }

            const [movedSong] = this.playlist.splice(fromIndex, 1)
            this.playlist.splice(toIndex, 0, movedSong)
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

        // 获取下一首歌曲索引
        getNextIndex(currentSongId: string | undefined): number {
            if (!currentSongId || this.playlist.length <= 1) return 0

            const currentIndex = this.playlist.findIndex(song => song.id === currentSongId)

            if (this.playMode === 'random') {
                return this.getRandomIndex(currentIndex)
            }
            // 顺序播放和单曲循环下，手动点击下一首都是去下一首
            return (currentIndex + 1) % this.playlist.length
        },

        // 获取上一首歌曲索引
        getPrevIndex(currentSongId: string | undefined): number {
            if (!currentSongId || this.playlist.length <= 1) return 0

            const currentIndex = this.playlist.findIndex(song => song.id === currentSongId)

            if (this.playMode === 'random') {
                return this.getRandomIndex(currentIndex)
            }
            // 顺序播放和单曲循环下，手动点击上一首都是去上一首
            return (currentIndex - 1 + this.playlist.length) % this.playlist.length
        },

        // 切换播放模式
        togglePlayMode() {
            if (this.playMode === 'sequential') {
                this.playMode = 'random'
            } else if (this.playMode === 'random') {
                this.playMode = 'single'
            } else {
                this.playMode = 'sequential'
            }
            this.updateLocalCache()
        },

        // 使用本地缓存初始化
        initFromLocalCache(volumeSetter?: (v: number) => void) {
            const cache = localStorage.getItem('musicPlayerCache')
            if (cache) {
                try {
                    const { playlist, volume, playMode } = JSON.parse(cache)

                    // 恢复播放列表
                    this.playlist = (playlist || []).map((song: Partial<Song>) => ({
                        ...song,
                        howl: null,
                        playSrc: undefined
                    })) as Song[]

                    this.playMode = playMode || 'sequential'

                    // 如果提供了音量设置器，恢复音量
                    if (volumeSetter && typeof volume === 'number') {
                        volumeSetter(volume)
                    }
                } catch (e) {
                    console.error('解析缓存失败:', e)
                    localStorage.removeItem('musicPlayerCache')
                }
            }
        },

        // 更新本地缓存
        updateLocalCache(volume?: number) {
            try {
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
                    volume: volume ?? 0.3,
                    playMode: this.playMode
                }
                localStorage.setItem('musicPlayerCache', JSON.stringify(cache))
            } catch (e) {
                console.warn('缓存写入失败，尝试清理旧数据:', e)
                try {
                    const minimalPlaylist = this.playlist.map(song => ({
                        id: song.id,
                        title: song.title,
                        artist: song.artist,
                        album: song.album,
                        duration: song.duration,
                        path: song.path
                    }))
                    const minimalCache = {
                        playlist: minimalPlaylist,
                        volume: volume ?? 0.3,
                        playMode: this.playMode
                    }
                    localStorage.setItem('musicPlayerCache', JSON.stringify(minimalCache))
                } catch {
                    localStorage.removeItem('musicPlayerCache')
                }
            }
        }
    }
})
