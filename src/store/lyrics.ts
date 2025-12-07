// 歌词管理 Store
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import type { LyricLine } from './types'

export const useLyricsStore = defineStore('lyrics', {
    state: () => ({
        lyrics: null as string | null,
        parsedLyrics: [] as LyricLine[],
    }),

    getters: {
        // 是否有歌词
        hasLyrics: (state) => state.parsedLyrics.length > 0,
    },

    actions: {
        // 加载歌词
        async loadLyrics(filePath: string, title: string, artist: string) {
            try {
                const lyrics = await invoke<string | null>('read_lyrics', {
                    filePath,
                    title,
                    artist
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

        // 解析 LRC 格式歌词
        parseLyrics(lyrics: string) {
            if (!lyrics || typeof lyrics !== 'string') {
                this.parsedLyrics = []
                return
            }

            const lines = lyrics.split('\n')
            // 支持多种时间格式：[mm:ss.xx] [mm:ss.xxx] [mm:ss:xx] [mm:ss]
            const timeRegex = /\[(\d+):(\d+)(?:[.:]+(\d+))?\]/g
            const parsedLines: LyricLine[] = []

            for (const line of lines) {
                // 跳过元数据标签 [ti:] [ar:] [al:] 等
                if (/^\[[a-zA-Z]+:/.test(line)) {
                    continue
                }

                timeRegex.lastIndex = 0
                const matches: RegExpExecArray[] = []
                let match: RegExpExecArray | null
                while ((match = timeRegex.exec(line)) !== null) {
                    matches.push([...match] as unknown as RegExpExecArray)
                }

                if (matches.length > 0) {
                    const text = line.replace(/\[\d+:\d+(?:[.:]+\d+)?\]/g, '').trim()

                    if (text) {
                        for (const m of matches) {
                            const minutes = parseInt(m[1], 10)
                            const seconds = parseInt(m[2], 10)
                            const msStr = m[3] || '0'

                            let milliseconds = parseInt(msStr, 10)
                            if (msStr.length === 2) {
                                milliseconds = milliseconds * 10
                            } else if (msStr.length === 1) {
                                milliseconds = milliseconds * 100
                            }

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

        // 获取当前时间对应的歌词索引
        getCurrentLyricIndex(currentTime: number): number {
            if (!this.parsedLyrics.length) return -1

            for (let i = this.parsedLyrics.length - 1; i >= 0; i--) {
                if (this.parsedLyrics[i].time <= currentTime) {
                    return i
                }
            }
            return -1
        },

        // 获取当前时间对应的歌词文本
        getCurrentLyric(currentTime: number): string {
            const index = this.getCurrentLyricIndex(currentTime)
            return index >= 0 ? this.parsedLyrics[index].text : ''
        },

        // 清除歌词
        clearLyrics() {
            this.lyrics = null
            this.parsedLyrics = []
        }
    }
})
