<template>
  <div class="music-player" v-if="playerStore.currentSong">
    <!-- 歌曲信息 -->
    <div class="song-info" @click="showNowPlaying">
      <img v-if="playerStore.currentSong.albumArt" :src="playerStore.currentSong.albumArt" class="current-cover" />
      <div class="current-cover-placeholder" v-else>
        <NIcon :component="MusicalNotesOutline" />
      </div>
      <div class="current-info">
        <div class="current-title">{{ playerStore.currentSong.title }}</div>
        <div class="current-artist">{{ playerStore.currentSong.artist }}</div>
      </div>
    </div>
    
    <!-- 播放控制 -->
    <div class="player-controls">
      <div class="control-buttons">
        <!-- 主要播放控制按钮组 -->
        <div class="main-controls">
          <NButton circle type="primary" @click="playerStore.prev">
            <NIcon :component="PlaySkipBackOutline" />
          </NButton>
          <NButton circle type="primary" @click="playerStore.togglePlay" size="large">
            <NIcon :component="playerStore.isPlaying ? PauseCircleOutline : PlayCircleOutline" />
          </NButton>
          <NButton circle type="primary" @click="playerStore.next">
            <NIcon :component="PlaySkipForwardOutline" />
          </NButton>
        </div>
        
        <!-- 播放模式切换按钮 -->
        <div class="mode-control">
          <NButton 
            circle 
            type="primary" 
            @click="playerStore.togglePlayMode"
            :title="playerStore.playMode === 'sequential' ? '顺序播放' : '随机播放'"
          >
            <NIcon :component="playerStore.playMode === 'sequential' ? RepeatOutline : ShuffleOutline" />
          </NButton>
        </div>
      </div>
      
      <!-- 进度条 -->
      <div class="progress-bar">
        <span class="time-current">{{ formatTime(playerStore.currentTime) }}</span>
        <NSlider
          :value="progress"
          @update:value="handleDragUpdate"
          @dragstart="handleDragStart"
          @dragend="handleDragEnd"
          @click="handleSeek"
          class="progress-slider"
          :format-tooltip="(value) => formatTime((value / 100) * duration)"
        />
        <span class="time-total">{{ formatTime(duration) }}</span>
      </div>
    </div>
    
    <!-- 音量控制 -->
    <div class="volume-control">
      <NIcon :component="VolumeHighOutline" />
      <NSlider
        v-model:value="volume"
        :min="0"
        :max="100"
        :step="1"
        class="volume-slider"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePlayerStore } from '../store/player'
import { NButton, NSlider, NIcon } from 'naive-ui'
import { 
  PlayCircleOutline, 
  PauseCircleOutline, 
  PlaySkipBackOutline, 
  PlaySkipForwardOutline, 
  VolumeHighOutline, 
  MusicalNotesOutline,
  RepeatOutline,
  ShuffleOutline
} from '@vicons/ionicons5'
import { useRouter,useRoute } from 'vue-router'

const playerStore = usePlayerStore()
const router = useRouter()
const route = useRoute()


// 拖动状态管理
const isDragging = ref(false)
const dragValue = ref(0)

// 计算音量
const volume = computed({
  get: () => playerStore.volume * 100,
  set: (value: number) => {
    playerStore.setVolume(value / 100)
  }
})

// 格式化时间为m:ss
const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 计算进度条进度
const progress = computed(() => {
  // 如果正在拖动，返回正在拖动的值
  if (isDragging.value) return dragValue.value

  if (!playerStore.currentSong) return 0
  
  const duration = playerStore.currentSong.duration
  return (playerStore.currentTime / duration) * 100
})

// 计算总时长
const duration = computed(() => {
  if (!playerStore.currentSong) return 0

  return playerStore.currentSong.duration
})

// 拖动开始时的处理
const handleDragStart = () => {
  isDragging.value = true
}

// 拖动过程中
const handleDragUpdate = (value: number) => {
  if (isDragging.value) {
    dragValue.value = value
  }
}

// 拖动结束
const handleDragEnd = () => {
  if (isDragging.value && playerStore.currentSong && playerStore.currentSong.duration) {
    const seekTime = (dragValue.value / 100) * playerStore.currentSong.duration
    playerStore.seek(seekTime)
  }
  isDragging.value = false
}

// 进度条点击事件处理
const handleSeek = (value: number) => {
  if (!isDragging.value && playerStore.currentSong && playerStore.currentSong.duration) {
    playerStore.seek((value / 100) * playerStore.currentSong.duration)
  }
}

// 显示/关闭正在播放的歌曲页面
const showNowPlaying = () => {
  const currentRoute = route.path
  if (currentRoute !== '/now-playing') {
    router.push('/now-playing')
  } else {
    router.push('/')
  }
}
</script>

<style scoped>
.music-player {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background-color: #181818;
  border-top: 1px solid #333;
  padding: 12px 16px;
  color: white;
  height: 80px;
}

.song-info {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  width: 180px;
  min-width: 180;
}

.current-cover, .current-cover-placeholder {
  width: 56px;
  height: 56px;
  border-radius: 4px;
  background: #333;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.current-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.current-title {
  font-weight: 500;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.current-artist {
  color: #b3b3b3;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.player-controls {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.control-buttons {
  display: flex;
  align-items: center;
  gap: 32px; 
}

.main-controls {
  display: flex;
  align-items: center;
  gap: 16px; 
}

.mode-control {
  display: flex;
  align-items: center;
}

.progress-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 500px;
}

.progress-slider {
  flex: 1;
}

.time-current, .time-total {
  font-size: 12px;
  color: #b3b3b3;
  width: 40px;
  text-align: center;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 180px;
}

.volume-slider {
  width: 100px;
}

</style>