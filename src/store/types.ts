// 共享类型定义
import { Howl } from 'howler'

// 歌曲接口
export interface Song {
    id: string
    title: string
    artist: string
    album: string
    duration: number
    path: string
    howl: Howl | null
    albumArt?: string
    genre?: string
    year?: number
    playSrc?: string
}

// 音乐元数据（从后端返回）
export interface MusicMetadata {
    title: string
    artist: string
    album: string
    duration: number
    albumArt?: string
    genre?: string
    year?: number
}

// 播放模式
export type PlayMode = 'sequential' | 'random' | 'single'

// 解析后的歌词行
export interface LyricLine {
    time: number
    text: string
}
