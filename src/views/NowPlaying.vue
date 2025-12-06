<template>
  <div class="now-playing-container">
    <div class="background-blur" :style="{ backgroundImage: playerStore.currentSong?.albumArt ? `url(${playerStore.currentSong.albumArt})` : 'none' }"></div>
    <div class="background-overlay"></div>
    
    <div class="content">
      <!-- Back Arrow -->
      <div class="header-nav">
        <NButton circle text class="back-btn" @click="goBack">
          <NIcon :component="ChevronDownOutline" size="32" />
        </NButton>
      </div>

      <!-- Main Content -->
      <div class="main-content">
        <!-- Album Art Section -->
        <div class="album-section">
          <div class="album-cover" :class="{ 'playing': playerStore.isPlaying }">
            <img v-if="playerStore.currentSong?.albumArt" :src="playerStore.currentSong.albumArt" />
            <div v-else class="album-placeholder">
              <NIcon :component="MusicalNotesOutline" size="80" />
            </div>
          </div>
          
           <!-- Song Metadata under cover for mobile/compact view or visual balance -->
          <div class="song-meta-mobile">
            <span class="song-title">{{ playerStore.currentSong?.title }}</span>
            <span class="song-artist">{{ playerStore.currentSong?.artist }}</span>
          </div>
        </div>
        
        <!-- Lyrics / Info Section -->
        <div class="info-section">
          <div class="song-header-desktop">
             <h1 class="song-title">{{ playerStore.currentSong?.title }}</h1>
             <h2 class="song-artist">{{ playerStore.currentSong?.artist }}</h2>
             <span class="song-album">{{ playerStore.currentSong?.album }}</span>
          </div>
          
          <div class="lyrics-viewport" ref="lyricsViewport">
             <div class="lyrics-scroll-container" ref="scrollContainer" :style="scrollStyle">
               <div 
                 v-for="(line, index) in playerStore.parsedLyrics" 
                 :key="index"
                 class="lyric-line"
                 :class="{ 
                   'active': index === activeLyricIndex, 
                   'near-active-1': index === activeLyricIndex - 1 || index === activeLyricIndex + 1,
                   'near-active-2': index === activeLyricIndex - 2 || index === activeLyricIndex + 2
                 }"
                 @click="seekToLyric(line.time)"
               >
                 {{ line.text }}
               </div>
               <div v-if="playerStore.parsedLyrics.length === 0" class="no-lyrics">
                 暂无歌词
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '../store/player'
import { NIcon, NButton } from 'naive-ui'
import { MusicalNotesOutline, ChevronDownOutline } from '@vicons/ionicons5'

const playerStore = usePlayerStore()
const router = useRouter()
const lyricsViewport = ref<HTMLElement | null>(null)
const scrollContainer = ref<HTMLElement | null>(null)

const goBack = () => {
    router.back()
}

// Active Lyric Logic
const activeLyricIndex = computed(() => {
  if (!playerStore.parsedLyrics.length || !playerStore.currentSong) return -1
  const currentTime = playerStore.currentTime
  for (let i = playerStore.parsedLyrics.length - 1; i >= 0; i--) {
    if (playerStore.parsedLyrics[i].time <= currentTime) {
      return i
    }
  }
  return -1
})

// Smooth scrolling with interpolation
const targetTranslateY = ref(0)
const currentTranslateY = ref(0)
let animationFrameId: number | null = null

// Scroll style computed property
const scrollStyle = computed(() => ({
  transform: `translateY(${currentTranslateY.value}px)`
}))

// Smooth animation loop using lerp (linear interpolation)
const animate = () => {
  const diff = targetTranslateY.value - currentTranslateY.value
  
  // Use easing for smoother animation - lerp factor controls speed
  // Lower value = smoother but slower, higher = faster but less smooth
  const lerpFactor = 0.08
  
  if (Math.abs(diff) > 0.5) {
    currentTranslateY.value += diff * lerpFactor
    animationFrameId = requestAnimationFrame(animate)
  } else {
    currentTranslateY.value = targetTranslateY.value
    animationFrameId = null
  }
}

const startAnimation = () => {
  if (animationFrameId === null) {
    animationFrameId = requestAnimationFrame(animate)
  }
}

// Watch active index to calculate scroll target
watch(activeLyricIndex, (newIndex) => {
  if (newIndex >= 0 && lyricsViewport.value && scrollContainer.value) {
    const lyricsEl = scrollContainer.value.children[newIndex] as HTMLElement
    if (lyricsEl) {
      const viewportHeight = lyricsViewport.value.clientHeight
      const lyricTop = lyricsEl.offsetTop
      const lyricHeight = lyricsEl.offsetHeight
      
      // Center the active lyric in the viewport
      const offset = (viewportHeight / 2) - (lyricTop + lyricHeight / 2)
      targetTranslateY.value = offset
      startAnimation()
    }
  }
}, { immediate: true })

// Initialize scroll position on mount
onMounted(() => {
  // Use setTimeout to ensure DOM is fully rendered and has correct dimensions
  setTimeout(() => {
    if (lyricsViewport.value && scrollContainer.value) {
      const viewportHeight = lyricsViewport.value.clientHeight
      
      // If there's an active lyric, scroll to it
      if (activeLyricIndex.value >= 0) {
        const lyricsEl = scrollContainer.value.children[activeLyricIndex.value] as HTMLElement
        if (lyricsEl) {
          const offset = (viewportHeight / 2) - (lyricsEl.offsetTop + lyricsEl.offsetHeight / 2)
          currentTranslateY.value = offset
          targetTranslateY.value = offset
        }
      } else {
        // No active lyric, center the first visible lyric
        const firstLyric = scrollContainer.value.children[0] as HTMLElement
        if (firstLyric && firstLyric.classList.contains('lyric-line')) {
          const offset = (viewportHeight / 2) - (firstLyric.offsetTop + firstLyric.offsetHeight / 2)
          currentTranslateY.value = offset
          targetTranslateY.value = offset
        } else {
          // Fallback: position at top-ish
          currentTranslateY.value = viewportHeight * 0.4
          targetTranslateY.value = viewportHeight * 0.4
        }
      }
    }
  }, 50)
})

// Cleanup animation on unmount
onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
})

const seekToLyric = (time: number) => {
    playerStore.seek(time)
}


</script>

<style scoped>
.now-playing-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 200; /* Above everything */
  overflow: hidden;
  background: #000;
  color: #fff;
}

.background-blur {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;
  background-position: center;
  filter: blur(60px) brightness(0.5);
  transform: scale(1.1); /* Prevent blur edges */
  z-index: 0;
  opacity: 0.6;
}

.background-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, #121212 0%, rgba(18,18,18,0.5) 50%, rgba(18,18,18,0.3) 100%);
    z-index: 1;
}

.content {
  position: relative;
  z-index: 2;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.header-nav {
    padding: 24px;
}

.back-btn {
    color: rgba(255,255,255,0.7);
}
.back-btn:hover {
    color: #fff;
    background: rgba(255,255,255,0.1);
}

.main-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 120px; /* Increased gap between album and lyrics */
  padding: 0 60px 60px;
  max-width: 1400px;
  margin: 0 auto;
}

/* Album Section */
.album-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
}

.album-cover {
  width: 350px;
  height: 350px;
  border-radius: 12px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
  transition: transform 0.4s ease;
  overflow: hidden; /* Ensure image fits radius */
}

/* Optional scale effect when playing */
/* .album-cover.playing {
    transform: scale(1.02);
} */

.album-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.album-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #333, #666);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255,255,255,0.5);
}

.song-meta-mobile {
    display: none; /* Desktop hidden */
}

/* Info & Lyrics Section */
.info-section {
  /* Fixed width to prevent layout shift when lyric lengths change */
  width: 500px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 500px; /* Fixed height container for stability */
}

.song-header-desktop {
    margin-bottom: 24px;
}

.song-title {
    font-size: 32px;
    font-weight: 700;
    margin: 0 0 8px;
    line-height: 1.2;
}

.song-artist {
    font-size: 18px;
    color: rgba(255,255,255,0.7);
    margin: 0 0 4px;
    font-weight: 500;
}

.song-album {
    font-size: 14px;
    color: rgba(255,255,255,0.5);
}

.lyrics-viewport {
    flex: 1;
    overflow: hidden;
    mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%);
    position: relative;
}

.lyrics-scroll-container {
    /* Animation handled by JS requestAnimationFrame for smoother scrolling */
    display: flex;
    flex-direction: column;
    align-items: flex-start; /* Left align lyrics usually looks cleaner with title */
    /* Add padding to allow centering first and last lyrics */
    padding-top: 40%;
    padding-bottom: 40%;
}

.lyric-line {
    font-size: 18px; /* Slightly smaller for elegance */
    padding: 12px 0;
    color: rgba(255,255,255,0.4);
    cursor: pointer;
    transition: color 0.3s ease, font-size 0.3s ease, font-weight 0.3s ease;
    min-height: 26px;
    font-weight: 500;
    transform-origin: left center;
    width: 100%; /* Fixed width to prevent layout shift */
    word-wrap: break-word;
}

.lyric-line:hover {
    color: rgba(255,255,255,0.8);
}

.lyric-line.near-active-1 {
    color: rgba(255,255,255,0.65);
    font-size: 19px;
}

.lyric-line.near-active-2 {
    color: rgba(255,255,255,0.5);
}

.lyric-line.active {
    color: #fff;
    font-size: 24px;
    font-weight: 700;
    /* transform: scale(1.1); */
    text-shadow: 0 0 20px rgba(255,255,255,0.3);
}

.no-lyrics {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    color: rgba(255,255,255,0.3);
    font-size: 16px;
}

@media (max-width: 900px) {
    .main-content {
        flex-direction: column;
        gap: 32px;
        padding: 0 24px 40px;
    }
    
    .album-cover {
        width: 260px;
        height: 260px;
    }
    
    .info-section {
        width: 100%;
        height: auto;
        flex: 1;
        align-items: center;
        text-align: center;
    }
    
    .song-header-desktop {
        display: none;
    }
    
    .song-meta-mobile {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    }
    
    .lyrics-scroll-container {
        align-items: center; /* Center align on mobile */
    }
    
    .lyric-line {
        transform-origin: center center;
        text-align: center;
    }
}
</style>