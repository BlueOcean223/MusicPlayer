<template>
  <div class="music-player-wrapper" v-if="playerStore.currentSong">
    <div class="music-player glass-panel">
      <!-- 歌曲信息 -->
      <div class="song-info" @click="showNowPlaying">
        <div class="cover-wrapper">
          <img v-if="playerStore.currentSong.albumArt" :src="playerStore.currentSong.albumArt" class="current-cover" />
          <div class="current-cover-placeholder" v-else>
            <NIcon :component="MusicalNotesOutline" />
          </div>
          <div class="expand-icon">
            <NIcon :component="ChevronUpOutline" />
          </div>
        </div>
        
        <div class="current-info">
          <div class="current-title">{{ playerStore.currentSong.title }}</div>
          <div class="current-artist">{{ playerStore.currentSong.artist }}</div>
        </div>
      </div>
      
      <!-- 播放控制 -->
      <div class="player-controls">
        <div class="control-buttons">

          <NButton text class="control-btn small" @click="playerStore.togglePlayMode" :title="getModeTitle">
            <div class="mode-icon-wrapper">
               <NIcon v-if="playerStore.playMode === 'sequential'" :component="RepeatOutline" size="20" />
               <NIcon v-else-if="playerStore.playMode === 'random'" :component="ShuffleOutline" size="20" />
               <NIcon v-else :component="RefreshOutline" size="20" />
               <span v-if="playerStore.playMode === 'single'" class="single-badge">1</span>
            </div>
          </NButton>
        
          <NButton text class="control-btn" @click="playerStore.prev">
            <NIcon :component="PlaySkipBackOutline" size="24" />
          </NButton>
          
          <button class="play-btn-circle" @click="playerStore.togglePlay">
             <NIcon :component="playerStore.isPlaying ? PauseOutline : PlayOutline" size="28" />
          </button>
          
          <NButton text class="control-btn" @click="playerStore.next">
            <NIcon :component="PlaySkipForwardOutline" size="24" />
          </NButton>
          
           <!-- 占位，保持对称 -->
           <div class="control-btn small dummy"></div>
        </div>
        
        <!-- 进度条 -->
        <div class="progress-bar-container">
          <span class="time-text">{{ formatTime(playerStore.currentTime) }}</span>
          <div class="slider-wrapper">
             <NSlider
              :value="progress"
              @update:value="handleDragUpdate"
              @dragstart="handleDragStart"
              @dragend="handleDragEnd"
              @click="handleSeek"
              class="progress-slider"
              :tooltip="false"
            />
          </div>
          <span class="time-text">{{ formatTime(duration) }}</span>
        </div>
      </div>
      
      <!-- 音量控制 -->
      <div class="volume-control">
        <div class="volume-icon">
          <NIcon :component="volumeIcon" size="20" @click="toggleMute" />
        </div>
        <div class="volume-slider-wrapper">
          <NSlider
            v-model:value="volume"
            :min="0"
            :max="100"
            :step="1"
            class="volume-slider"
            :tooltip="false"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlayerStore } from '../store/player'
import { NButton, NSlider, NIcon } from 'naive-ui'
import { 
  PlayOutline, 
  PauseOutline, 
  PlaySkipBackOutline, 
  PlaySkipForwardOutline, 
  VolumeHighOutline,
  VolumeMediumOutline,
  VolumeLowOutline,
  VolumeMuteOutline,
  MusicalNotesOutline,
  RepeatOutline,
  ShuffleOutline,
  ChevronUpOutline,
  RefreshOutline
} from '@vicons/ionicons5'
import { useRouter, useRoute } from 'vue-router'

const playerStore = usePlayerStore()
const router = useRouter()
const route = useRoute()

// 拖动状态管理
const isDragging = ref(false)
const dragValue = ref(0)
const lastVolume = ref(100)

// 模式标题
const getModeTitle = computed(() => {
  switch (playerStore.playMode) {
    case 'sequential': return '顺序播放'
    case 'random': return '随机播放'
    case 'single': return '单曲循环'
    default: return ''
  }
})

// 计算音量
const volume = computed({
  get: () => playerStore.volume * 100,
  set: (value: number) => {
    playerStore.setVolume(value / 100)
    if (value > 0) lastVolume.value = value
  }
})

const volumeIcon = computed(() => {
  const v = volume.value
  if (v === 0) return VolumeMuteOutline
  if (v < 30) return VolumeLowOutline
  if (v < 70) return VolumeMediumOutline
  return VolumeHighOutline
})

const toggleMute = () => {
  if (volume.value > 0) {
    lastVolume.value = volume.value
    volume.value = 0
  } else {
    volume.value = lastVolume.value || 50
  }
}

// 格式化时间为m:ss
const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 计算进度条进度
const progress = computed(() => {
  if (isDragging.value) return dragValue.value
  if (!playerStore.currentSong) return 0
  
  const duration = playerStore.currentSong.duration
  return duration ? (playerStore.currentTime / duration) * 100 : 0
})

// 计算总时长
const duration = computed(() => {
  if (!playerStore.currentSong) return 0
  return playerStore.currentSong.duration
})

// 拖动处理
const handleDragStart = () => { isDragging.value = true }
const handleDragUpdate = (value: number) => { if (isDragging.value) dragValue.value = value }
const handleDragEnd = () => {
  if (isDragging.value && playerStore.currentSong?.duration) {
    const seekTime = (dragValue.value / 100) * playerStore.currentSong.duration
    playerStore.seek(seekTime)
  }
  isDragging.value = false
}
const handleSeek = (value: number) => {
  if (!isDragging.value && playerStore.currentSong?.duration) {
    playerStore.seek((value / 100) * playerStore.currentSong.duration)
  }
}

const showNowPlaying = () => {
  const currentRoute = route.path
  if (currentRoute !== '/now-playing') {
    router.push('/now-playing')
  } else {
    router.back()
  }
}
</script>

<style scoped>
.music-player-wrapper {
  padding: 0 24px 24px;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
}

.music-player {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 1200px; /* Limit max width for better ergonomics */
  height: 80px;
  padding: 0 24px;
  
  /* Glassmorphism */
  background: rgba(18, 18, 18, 0.85); /* Slightly more opaque for controls visibility */
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

/* Song Info */
.song-info {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 250px;
  cursor: pointer;
  transition: opacity 0.2s;
}
.song-info:hover {
  opacity: 0.8;
}

.cover-wrapper {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.current-cover, .current-cover-placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.current-cover-placeholder {
  background: #282828;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
}

.expand-icon {
  position: absolute;
  top: 0; 
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}
.cover-wrapper:hover .expand-icon {
  opacity: 1;
}

.current-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.current-title {
  font-weight: 600;
  color: #fff;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.current-artist {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Controls */
.player-controls {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  max-width: 600px;
}

.control-buttons {
  display: flex;
  align-items: center;
  gap: 24px;
}

.control-btn {
  color: #bdbdbd;
  transition: all 0.2s;
}
.control-btn:hover {
  color: #fff;
}
.control-btn.small {
  opacity: 0.7;
}
.control-btn.small:hover {
  opacity: 1;
}
.dummy { width: 20px; } /* Spacer */

.play-btn-circle {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #fff;
  color: #000;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.2s ease, background-color 0.2s;
}
.play-btn-circle:hover {
  transform: scale(1.05); /* slightly enlarge */
}
.play-btn-circle:active {
  transform: scale(0.95);
}

/* Progress */
.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.time-text {
  font-size: 11px;
  color: var(--text-disabled);
  width: 35px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.slider-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
}

/* Volume */
.volume-control {
  width: 250px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
}

.volume-icon {
  cursor: pointer;
  color: var(--text-secondary);
}
.volume-icon:hover {
  color: #fff;
}

.volume-slider-wrapper {
  width: 100px;
}

/* Customized Naive UI Slider (Global overrides might be needed or deep selectors) */
:deep(.n-slider .n-slider-rail) {
  background-color: rgba(255, 255, 255, 0.1);
  height: 4px;
}
:deep(.n-slider .n-slider-rail .n-slider-rail__fill) {
  background-color: #fff;
}
:deep(.n-slider:hover .n-slider-rail .n-slider-rail__fill) {
  background-color: var(--primary-color);
}
:deep(.n-slider .n-slider-handle) {
  width: 12px;
  height: 12px;
  border: none;
  box-shadow: none;
  background-color: #fff;
  opacity: 0; 
  transition: opacity 0.2s;
}
:deep(.n-slider:hover .n-slider-handle) {
  opacity: 1;
}

.mode-icon-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.single-badge {
  position: absolute;
  top: -4px;
  right: -6px;
  font-size: 9px;
  font-weight: bold;
  background: var(--primary-color);
  color: #000;
  border-radius: 50%;
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}


</style>