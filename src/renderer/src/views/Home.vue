<template>
  <div class="home-container">
    <!-- 顶部音乐列表标题和导入按钮 -->
    <div class="top-bar">
      <h1 class="page-title">音乐列表</h1>
      <NButton type="primary" size="large" @click="importMusic">
        <template #icon>
          <NIcon :component="AddOutline" />
        </template>
        导入歌曲
      </NButton>
    </div>
    
    <!-- 音乐列表 -->
    <div class="music-list" v-if="playerStore.playlist.length > 0">
      <div class="list-header">
        <span class="track-number">#</span>
        <span class="track-title">标题</span>
        <span class="track-artist">歌手</span>
        <span class="track-album">专辑</span>
        <span class="track-duration">时长</span>
      </div>
      
      <div class="list-content">
        <div 
          v-for="(song, index) in playerStore.playlist" 
          :key="song.id"
          class="track-item"
          :class="{ 'active': playerStore.currentSong?.id === song.id }"
          @click="playSong(song)"
          @dblclick="playSong(song)"
        >
          <span class="track-number">{{ index + 1 }}</span>
          <div class="track-info">
            <div class="track-title-container">
              <img v-if="song.albumArt" :src="song.albumArt" class="track-cover" />
              <div class="track-cover-placeholder" v-else>
                <NIcon :component="MusicalNotesOutline" />
              </div>
              <div class="track-details">
                <span class="track-title">{{ song.title }}</span>
                <span class="track-artist">{{ song.artist }}</span>
              </div>
            </div>
          </div>
          <span class="track-artist">{{ song.artist }}</span>
          <span class="track-album">{{ song.album }}</span>
          <span class="track-duration">{{ formatTime(song.duration) }}</span>
        </div>
      </div>
    </div>
    
    <!-- 空状态 -->
    <div v-else class="empty-state">
      <div class="empty-content">
        <NIcon :component="MusicalNotesOutline" size="80" class="empty-icon" />
        <h2>还没有音乐</h2>
        <p>点击上方按钮导入您的音乐文件</p>
        <NButton type="primary" size="large" @click="importMusic">
          <template #icon>
            <NIcon :component="AddOutline" />
          </template>
          导入歌曲
        </NButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePlayerStore } from '../store/player'
import { 
  NButton, NIcon
} from 'naive-ui'
import { 
  AddOutline, MusicalNotesOutline
} from '@vicons/ionicons5'

const playerStore = usePlayerStore()

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const importMusic = async () => {
  try {
    const filePaths = await window.musicPlayerAPI.openMusicFiles()
    if (filePaths.length > 0) {
      await playerStore.addSongs(filePaths)
    }
  } catch (error) {
    console.error('Error importing music:', error)
  }
}

const playSong = (song: any) => {
  playerStore.play(song)
}
</script>

<style scoped>
.home-container {
  min-height: 100%;
  background: #121212;
  color: #fff;
  display: flex;
  flex-direction: column;
  padding: 24px;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 16px;
  border-bottom: 1px solid #333;
  position: sticky;
  top: 0;
  background: #121212;
  z-index: 10;
}

.page-title {
  font-size: 32px;
  font-weight: bold;
  margin: 0;
  color: #fff;
}

.music-list {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.list-header {
  display: grid;
  grid-template-columns: 50px 1fr 200px 200px 80px;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #333;
  font-weight: 500;
  color: #b3b3b3;
  margin-bottom: 8px;
  position: sticky;
  top: 88px;
  background: #121212;
  z-index: 9;
}

.list-content {
  flex: 1;
}

.track-item {
  display: grid;
  grid-template-columns: 50px 1fr 200px 200px 80px;
  gap: 16px;
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
}

.track-item:hover {
  background: #1a1a1a;
}

.track-item.active {
  background: #188f41;
}

.track-info {
  display: flex;
  align-items: center;
}

.track-title-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.track-cover, .track-cover-placeholder {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  background: #333;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.track-details {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.track-title {
  font-weight: 500;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-artist {
  color: #e2dede;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-album, .track-duration {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-album {
  color: #e2dede;
}

.track-duration {
  color: #e2dede;
  text-align: right;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-content {
  text-align: center;
  max-width: 400px;
}

.empty-icon {
  color: #666;
  margin-bottom: 24px;
}

.empty-content h2 {
  font-size: 24px;
  margin: 0 0 12px 0;
  color: #fff;
}

.empty-content p {
  color: #b3b3b3;
  margin: 0 0 24px 0;
  font-size: 16px;
}
</style>