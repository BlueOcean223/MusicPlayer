<template>
  <div class="home-container">
    <!-- Header Section with Title and Search/Actions -->
    <div class="header-section">
      <div class="header-top">
        <h1 class="page-title">我的音乐库</h1>
        <div class="header-actions">
           <NInput 
            v-if="playerStore.playlist.length > 0"
            v-model:value="searchQuery" 
            placeholder="搜索歌曲 / 歌手 / 专辑..." 
            class="search-input"
            round
            clearable
          >
            <template #prefix>
              <NIcon :component="SearchOutline" />
            </template>
          </NInput>
          <NButton 
            v-if="playerStore.playlist.length > 0" 
            secondary 
            type="primary"
            @click="toggleManageMode"
            class="action-btn"
          >
            <template #icon>
              <NIcon :component="isManageMode ? CheckmarkOutline : SettingsOutline" />
            </template>
            {{ isManageMode ? '完成' : '管理' }}
          </NButton>
          <NButton type="primary" @click="importMusic" class="action-btn glow-effect">
            <template #icon>
              <NIcon :component="AddOutline" />
            </template>
            导入歌曲
          </NButton>
        </div>
      </div>
      
      <!-- Stats / Filter Info -->
       <div class="library-stats" v-if="playerStore.playlist.length > 0">
        <span>共 {{ playerStore.playlist.length }} 首歌曲</span>
        <span v-if="searchQuery"> · 搜索结果: {{ filteredPlaylist.length }}</span>
      </div>
    </div>
    
    <!-- Music List -->
    <div class="music-list-container" v-if="playerStore.playlist.length > 0">
      <div class="list-header glass-panel">
        <span class="col-index">#</span>
        <span class="col-title">标题</span>
        <span class="col-artist">歌手</span>
        <span class="col-album">专辑</span>
        <span class="col-duration">时长</span>
        <span v-if="isManageMode" class="col-actions">操作</span>
      </div>
      
      <div class="list-content">
        <div 
          v-for="(song, index) in filteredPlaylist" 
          :key="song.id"
          class="track-item glass-hover"
          :class="{ 
            'active': playerStore.currentSong?.id === song.id, 
            'manage-mode': isManageMode,
            'playing-indic': playerStore.currentSong?.id === song.id && playerStore.isPlaying 
          }"
          @click="!isManageMode && playSong(song)"
          @dblclick="!isManageMode && playSong(song)"
        >
          <span class="col-index">
             <div v-if="playerStore.currentSong?.id === song.id && playerStore.isPlaying" class="playing-icon">
               <span class="bar bar1"></span>
               <span class="bar bar2"></span>
               <span class="bar bar3"></span>
             </div>
             <span v-else>{{ index + 1 }}</span>
          </span>
          
          <div class="col-title">
            <div class="song-cover-wrapper">
              <img v-if="song.albumArt" :src="song.albumArt" class="song-cover" loading="lazy" />
              <div class="song-cover-placeholder" v-else>
                <NIcon :component="MusicalNotesOutline" />
              </div>
              <div class="play-overlay">
                 <NIcon :component="PlayOutline" />
              </div>
            </div>
            <span class="song-name" :title="song.title">{{ song.title }}</span>
          </div>
          
          <span class="col-artist" :title="song.artist">{{ song.artist }}</span>
          <span class="col-album" :title="song.album">{{ song.album }}</span>
          <span class="col-duration">{{ formatTime(song.duration) }}</span>
          
          <div v-if="isManageMode" class="col-actions">
            <NButton 
              text
              :disabled="index === 0"
              @click.stop="moveSongUp(song.id)"
              class="move-btn"
              title="上移"
            >
              <template #icon>
                <NIcon :component="ArrowUpOutline" />
              </template>
            </NButton>
            <NButton 
              text
              :disabled="index === filteredPlaylist.length - 1"
              @click.stop="moveSongDown(song.id)"
              class="move-btn"
              title="下移"
            >
              <template #icon>
                <NIcon :component="ArrowDownOutline" />
              </template>
            </NButton>
            <NButton 
              text
              type="error" 
              @click.stop="removeSong(song.id)"
              class="delete-btn"
              title="删除"
            >
              <template #icon>
                <NIcon :component="TrashOutline" />
              </template>
            </NButton>
          </div>
        </div>
        
         <div v-if="filteredPlaylist.length === 0" class="no-results">
          <NIcon :component="SearchOutline" size="40" />
          <p>没有找到相关歌曲</p>
        </div>
      </div>
      
      <!-- Batch Actions -->
      <div v-if="isManageMode" class="batch-actions glass-panel">
        <NButton type="error" ghost @click="clearAllSongs">
          <template #icon>
            <NIcon :component="TrashOutline" />
          </template>
          清空列表
        </NButton>
      </div>
    </div>
    
    <!-- Empty State -->
    <div v-else class="empty-state">
      <div class="empty-content glass-panel">
        <div class="empty-icon-wrapper">
          <NIcon :component="MusicalNotesOutline" size="60" />
        </div>
        <h2>开启你的音乐之旅</h2>
        <p>添加本地音乐文件，享受沉浸式播放体验</p>
        <NButton type="primary" size="large" @click="importMusic" class="glow-effect">
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
import { ref, computed } from 'vue'
import { usePlayerStore } from '../store/player'
import { NButton, NIcon, NInput, useMessage } from 'naive-ui'
import { 
  AddOutline, 
  MusicalNotesOutline,
  SettingsOutline,
  CheckmarkOutline,
  TrashOutline,
  SearchOutline,
  PlayOutline,
  ArrowUpOutline,
  ArrowDownOutline
} from '@vicons/ionicons5'
import { invoke } from '@tauri-apps/api/core'

const playerStore = usePlayerStore()
const isManageMode = ref(false)
const searchQuery = ref('')
const message = useMessage()

// Filter logic
const filteredPlaylist = computed(() => {
  if (!searchQuery.value) return playerStore.playlist
  
  const query = searchQuery.value.toLowerCase()
  return playerStore.playlist.filter(song => 
    song.title.toLowerCase().includes(query) ||
    song.artist.toLowerCase().includes(query) ||
    song.album.toLowerCase().includes(query)
  )
})

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const importMusic = async () => {
  try {
    const filePaths = await invoke<string[]>('open_music_files')
    if (filePaths.length > 0) {
      const result = await playerStore.addSongs(filePaths)
      if (result) {
        message.success(`导入成功 ${result.success} 首，重复 ${result.duplicate} 首，失败 ${result.failed} 首`)
      }
    }
  } catch (error) {
    console.error('Error importing music:', error)
    message.error('导入音乐失败')
  }
}

const playSong = (song: any) => {
  playerStore.play(song)
}

const toggleManageMode = () => {
  isManageMode.value = !isManageMode.value
}

const removeSong = (songId: string) => {
  playerStore.removeSong(songId)
}

const clearAllSongs = () => {
  if (confirm('确定要清空整个播放列表吗？')) {
    playerStore.clearPlaylist()
    isManageMode.value = false
  }
}

// Move song up in playlist
const moveSongUp = (songId: string) => {
  const index = playerStore.playlist.findIndex(s => s.id === songId)
  if (index > 0) {
    playerStore.reorderPlaylist(index, index - 1)
  }
}

// Move song down in playlist
const moveSongDown = (songId: string) => {
  const index = playerStore.playlist.findIndex(s => s.id === songId)
  if (index < playerStore.playlist.length - 1) {
    playerStore.reorderPlaylist(index, index + 1)
  }
}

</script>

<style scoped>
.home-container {
  min-height: 100%;
  padding: 24px 32px;
  max-width: 1400px;
  margin: 0 auto;
}

/* Header */
.header-section {
  margin-bottom: 24px;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 16px;
}

.page-title {
  font-size: 32px;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #fff 0%, #ccc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.5px;
}

.header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.search-input {
  width: 240px;
  background-color: var(--glass-surface);
  backdrop-filter: blur(10px);
}

.library-stats {
  font-size: 13px;
  color: var(--text-secondary);
  margin-left: 2px;
}

/* Glass Panels */
.glass-panel {
  background: var(--glass-surface);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  border-radius: 12px;
}

.glass-hover {
  transition: all 0.2s ease;
  border-radius: 8px;
}
.glass-hover:hover {
  background: rgba(255, 255, 255, 0.08); 
  transform: translateX(4px);
}

/* List Layout */
.music-list-container {
  display: flex;
  flex-direction: column;
}

.list-header {
  display: grid;
  grid-template-columns: 50px 4fr 3fr 3fr 100px 80px;
  padding: 12px 16px;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--text-secondary);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.list-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.track-item {
  display: grid;
  grid-template-columns: 50px 4fr 3fr 3fr 100px 80px;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 14px;
}

.track-item.active {
  background: rgba(29, 185, 84, 0.15); /* Primary green low opacity */
  color: var(--primary-color);
  font-weight: 500;
}
.track-item.active .song-name {
  color: var(--primary-color);
}

/* Manage Mode adjustments */
.list-header:not(:has(.col-actions)), 
.track-item:not(:has(.col-actions)) {
    /* If col-actions is hidden, these specific selectors might be tricky in pure CSS without dynamic class. 
       Relying on JS v-if logic rendering the DOM element and Grid layout. */
    /* Handled by v-if on the col-actions span/div, but grid columns need adjustment */
}
/* Re-define grid when no actions */
.list-header:has(.col-actions) {
  /* Default definition above covers this */
}
/* When managing mode is OFF (default), adjust columns. This requires a parent class usually or just v-bind in CSS. 
   Simplest is just fixed width for actions column or hide it. */
/* Let's strictly use the class logic from template */

/* Dynamic Grid Cols */
.list-header, .track-item {
  grid-template-columns: 50px 4fr 3fr 3fr 80px; /* Default without manage */
}
.list-header:has(.col-actions),
.track-item:has(.col-actions) {
  grid-template-columns: 50px 4fr 3fr 3fr 80px 100px; /* With manage - wider for 3 buttons */
}


/* Column Styles */
.col-index {
  color: var(--text-disabled);
  font-size: 13px;
  display: flex;
  align-items: center;
}

.col-title {
  display: flex;
  align-items: center;
  gap: 16px;
  overflow: hidden;
}

.song-cover-wrapper {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.song-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.song-cover-placeholder {
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.play-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  color: #fff;
}
.track-item:hover .play-overlay {
  opacity: 1;
}

.song-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}

.col-artist, .col-album {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-duration {
  font-family: monospace;
  opacity: 0.7;
}

.col-actions {
  display: flex;
  justify-content: center;
  gap: 4px;
}

.move-btn {
  color: var(--text-secondary);
  opacity: 0.7;
  transition: all 0.2s;
}
.move-btn:hover:not(:disabled) {
  opacity: 1;
  color: var(--primary-color);
}
.move-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Playing Animation Equalizer */
.playing-icon {
  display: flex;
  gap: 2px;
  align-items: flex-end;
  height: 12px;
  padding-bottom: 2px;
}
.bar {
  width: 3px;
  background-color: var(--primary-color);
  animation: equalize 1s infinite alternate;
}
.bar1 { animation-delay: 0.1s; height: 6px; }
.bar2 { animation-delay: 0.3s; height: 10px; }
.bar3 { animation-delay: 0.5s; height: 8px; }

@keyframes equalize {
  0% { height: 3px; }
  100% { height: 12px; }
}

/* Empty State */
.empty-state {
  height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-content {
  text-align: center;
  padding: 48px;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.empty-icon-wrapper {
  color: var(--primary-color);
  margin-bottom: 8px;
  filter: drop-shadow(0 0 10px rgba(29, 185, 84, 0.4));
}

.empty-content h2 {
  font-size: 24px;
  margin: 0;
}

.empty-content p {
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.glow-effect {
  box-shadow: 0 0 20px rgba(29, 185, 84, 0.3);
  transition: box-shadow 0.3s ease;
}
.glow-effect:hover {
  box-shadow: 0 0 30px rgba(29, 185, 84, 0.5);
}

.batch-actions {
  margin-top: 20px;
  padding: 16px;
  display: flex;
  justify-content: center;
}

.no-results {
  padding: 60px;
  text-align: center;
  color: var(--text-disabled);
}

/* Adjust grid for different window sizes if needed */
@media (max-width: 900px) {
  .list-header, .track-item {
    grid-template-columns: 40px 4fr 3fr 60px !important;
  }
  .col-album { display: none; }
  .list-header:has(.col-actions),
  .track-item:has(.col-actions) {
     grid-template-columns: 40px 4fr 3fr 60px 90px !important;
  }
}
</style>