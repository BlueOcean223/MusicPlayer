<template>
  <div class="now-playing-container">
    <div class="background-blur" :style="{ backgroundImage: playerStore.currentSong?.albumArt ? `url(${playerStore.currentSong.albumArt})` : 'none' }"></div>
    
    <div class="content">
      <div class="back-button">
        <NButton circle size="large" @click="router.push('/')">
          <NIcon :component="ArrowBackOutline" size="24" />
        </NButton>
      </div>
      
      <!-- 主要内容区域 -->
      <div class="main-content">
        <!-- 专辑封面 -->
        <div class="album-section">
          <div class="album-cover">
            <img v-if="playerStore.currentSong?.albumArt" :src="playerStore.currentSong.albumArt" />
            <div v-else class="album-placeholder">
              <NIcon :component="MusicalNotesOutline" size="60" />
            </div>
          </div>
        </div>
        
        <!-- 歌曲信息区域 -->
        <div class="info-section">
          <div class="song-info">
            <span class="song-title">{{ playerStore.currentSong?.title }}</span>
            <p class="song-artist">{{ playerStore.currentSong?.artist }}</p>
          </div>
          
          <!-- 歌词区域 -->
          <div class="lyrics-section">
            <div class="lyrics-container">
              <div 
                v-for="(item, index) in limitedDisplayLyrics" 
                :key="item.originalIndex"
                class="lyric-line"
                :class="{ 'active': index === relativeActiveLyricIndex }"
              >
                {{ item.text }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../store/player'
import { NButton, NIcon } from 'naive-ui'
import { 
  ArrowBackOutline, 
  MusicalNotesOutline
} from '@vicons/ionicons5'

const playerStore = usePlayerStore()
const router = useRouter()

// 显示歌词
const displayLyrics = computed(() => {
  if (!playerStore.parsedLyrics.length) {
    return ['暂无歌词']
  }
  return playerStore.parsedLyrics.map(lyric => lyric.text)
})

// 限制显示的歌词数量（最多显示8行）
const limitedDisplayLyrics = computed(() => {
  const lyrics = displayLyrics.value
  if (lyrics.length <= 8) {
    return lyrics.map((text, index) => ({ text, originalIndex: index }))
  }
  
  const currentIndex = activeLyricIndex.value
  if (currentIndex === -1) {
    return lyrics.slice(0, 8).map((text, index) => ({ text, originalIndex: index }))
  }
  
  // 以当前歌词为中心，显示前后各3-4行
  const start = Math.max(0, currentIndex - 3)
  const end = Math.min(lyrics.length, start + 8)
  
  return lyrics.slice(start, end).map((text, index) => ({ text, originalIndex: start + index }))
})

// 当前激活的歌词行
const activeLyricIndex = computed(() => {
  if (!playerStore.parsedLyrics.length || !playerStore.currentSong) return -1
  
  const currentTime = playerStore.currentTime
  
  // 找到当前时间对应的歌词索引
  for (let i = playerStore.parsedLyrics.length - 1; i >= 0; i--) {
    if (playerStore.parsedLyrics[i].time <= currentTime) {
      return i
    }
  }
  
  return -1
})

// 计算在限制显示歌词中的相对索引
const relativeActiveLyricIndex = computed(() => {
  const currentIndex = activeLyricIndex.value
  if (currentIndex === -1) return -1
  
  return limitedDisplayLyrics.value.findIndex(item => item.originalIndex === currentIndex)
})
</script>

<style scoped>
.now-playing-container {
  position: relative;
  height: 100vh;
  overflow: hidden;
  background: #1a1a1a;
}

.background-blur {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;
  background-position: center;
  filter: blur(30px);
  opacity: 0.2;
  z-index: 0;
}

.content {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 2vh 3vw;
  background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.8) 100%);
}

.back-button {
  margin-bottom: 2vh;
}

.main-content {
  flex: 1;
  display: flex;
  gap: 4vw;
  align-items: flex-start;
  justify-content: center;
  min-height: 0;
}

/* 专辑封面区域 */
.album-section {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.album-cover {
  width: min(35vw, 350px);
  height: min(35vw, 350px);
  max-width: 350px;
  max-height: 350px;
  min-width: 200px;
  min-height: 200px;
  border-radius: 15px;
  overflow: hidden;
  box-shadow: 0 15px 30px rgba(0, 0, 0, 0.5);
  transition: transform 0.3s ease;
}

.album-cover:hover {
  transform: scale(1.02);
}

.album-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.album-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #333, #555);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
}

/* 信息区域 */
.info-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2vh;
  min-width: 0;
  max-width: 500px;
}

.song-info {
  text-align: left;
}

.song-title {
  font-size: clamp(1.2rem, 3vw, 2rem);
  font-weight: bold;
  color: #fff;
  margin: 0 0 0.5rem 0;
  line-height: 1.2;
  word-break: break-word;
}

.song-artist {
  font-size: clamp(0.9rem, 2vw, 1.1rem);
  color: #b3b3b3;
  margin: 0;
  font-weight: 500;
}

/* 歌词区域 */
.lyrics-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.lyrics-container {
  flex: 1;
  padding: 1rem 0;
  min-height: 180px;
  max-height: 240px;
  overflow: hidden;
}

.lyric-line {
  padding: 0.3rem 0;
  font-size: clamp(0.85rem, 1.8vw, 1rem);
  line-height: 1.4;
  color: #b3b3b3;
  transition: all 0.3s ease;
  text-align: left;
  border-left: 3px solid transparent;
  padding-left: 0.5rem;
}

.lyric-line.active {
  color: #fff;
  font-weight: 600;
  transform: translateX(8px);
  border-left-color: #18a058;
  background: rgba(24, 160, 88, 0.15);
  border-radius: 4px;
  padding-left: 0.8rem;
  box-shadow: 0 2px 8px rgba(24, 160, 88, 0.3);
}

/* 响应式设计 */
@media (max-width: 900px) {
  .main-content {
    flex-direction: column;
    align-items: center;
    gap: 3vh;
  }
  
  .album-cover {
    width: min(60vw, 250px);
    height: min(60vw, 250px);
  }
  
  .info-section {
    width: 100%;
    max-width: none;
  }
  
  .song-info {
    text-align: center;
  }
}

@media (max-width: 600px) {
  .content {
    padding: 1vh 2vw;
  }
  
  .main-content {
    gap: 2vh;
  }
  
  .album-cover {
    width: min(70vw, 200px);
    height: min(70vw, 200px);
  }
  
  .lyrics-container {
    padding: 0.5rem 0;
    min-height: 150px;
    max-height: 180px;
  }
}

@media (max-height: 600px) {
  .lyrics-container {
    min-height: 120px;
    max-height: 150px;
  }
}
</style>