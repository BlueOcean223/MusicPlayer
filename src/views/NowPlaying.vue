<template>
  <div class="now-playing-container">
    <div class="background-blur" :style="{ backgroundImage: playerStore.currentSong?.albumArt ? `url(${playerStore.currentSong.albumArt})` : 'none' }"></div>
    
    <div class="content">
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
            <div class="lyrics-container" ref="lyricsContainer">
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
import { computed, ref } from 'vue'
import { usePlayerStore } from '../store/player'
import { NIcon } from 'naive-ui'
import { MusicalNotesOutline } from '@vicons/ionicons5'

const playerStore = usePlayerStore()
const lyricsContainer = ref<HTMLElement>()

// 显示歌词
const displayLyrics = computed(() => {
  return playerStore.parsedLyrics.length 
    ? playerStore.parsedLyrics.map(lyric => lyric.text)
    : ['暂无歌词']
})

// 限制显示的歌词数量（最多显示8行）
const limitedDisplayLyrics = computed(() => {
  const lyrics = displayLyrics.value
  if (lyrics.length <= 8) {
    return lyrics.map((text, index) => ({ text, originalIndex: index }))
  }
  
  const currentIndex = activeLyricIndex.value
  const start = currentIndex === -1 ? 0 : Math.max(0, currentIndex - 3)
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
  return currentIndex === -1 ? -1 : limitedDisplayLyrics.value.findIndex(item => item.originalIndex === currentIndex)
})

</script>

<style scoped>
.now-playing-container {
  position: relative;
  height: 100%;
  width: 100%;
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
  height: 85vh;
  display: flex;
  flex-direction: column;
  padding: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.8) 100%);
  box-sizing: border-box;
}

.main-content {
  flex: 1;
  display: flex;
  gap: 4vw;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: 0 auto;
  padding: 2vh 3vw;
  box-sizing: border-box;
  max-height: calc(100vh - 4vh);
}

/* 专辑封面区域 */
.album-section {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.album-cover {
  width: min(28vw, 280px);
  height: min(28vw, 280px);
  min-width: 160px;
  min-height: 160px;
  border-radius: 15px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.album-cover:hover {
  transform: scale(1.03) rotateY(5deg);
}

.album-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 15px;
}

.album-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #333, #555);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
  border-radius: 15px;
}

/* 信息区域 */
.info-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2vh;
  min-width: 0;
  max-width: 400px;
  align-items: center;
  text-align: center;
}

.song-info {
  text-align: center;
  width: 100%;
  flex-shrink: 0;
}

.song-title {
  font-size: clamp(1.2rem, 2.8vw, 1.8rem);
  font-weight: bold;
  color: #fff;
  margin: 0 0 0.5rem 0;
  line-height: 1.2;
  word-break: break-word;
  display: block;
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
  width: 100%;
}

.lyrics-container {
  flex: 1;
  padding: 0;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.lyric-line {
  padding: 0.3rem 0.8rem;
  font-size: clamp(0.85rem, 1.8vw, 1rem);
  line-height: 1.4;
  color: #b3b3b3;
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  text-align: center;
  margin: 0.1rem 0;
  border-radius: 6px;
  position: relative;
  transform-origin: center;
  flex-shrink: 0;
}

.lyric-line.active {
  color: #fff;
  font-weight: 600;
  transform: scale(1.05);
}

/* 响应式设计 */
@media (max-width: 900px) {
  .main-content {
    flex-direction: column;
    align-items: center;
    gap: 3vh;
    padding: 2vh 2vw;
    max-height: calc(100vh - 4vh);
  }
  
  .album-cover {
    width: min(45vw, 200px);
    height: min(45vw, 200px);
  }
  
  .info-section {
    width: 100%;
    max-width: none;
    gap: 1.5vh;
  }
}

@media (max-width: 600px) {
  .main-content {
    padding: 1.5vh 2vw;
    gap: 2vh;
  }
  
  .album-cover {
    width: min(55vw, 180px);
    height: min(55vw, 180px);
  }
  
  .lyric-line {
    font-size: clamp(0.8rem, 1.6vw, 0.95rem);
    padding: 0.25rem 0.6rem;
    margin: 0.05rem 0;
  }
}

@media (max-height: 600px) {
  .main-content {
    gap: 1.5vh;
    padding: 1vh 2vw;
  }
  
  .song-title {
    font-size: clamp(1rem, 2.4vw, 1.4rem);
    margin-bottom: 0.3rem;
  }
  
  .song-artist {
    font-size: clamp(0.8rem, 1.8vw, 1rem);
  }
  
  .info-section {
    gap: 1vh;
  }
}
</style>