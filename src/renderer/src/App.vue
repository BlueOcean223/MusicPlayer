<template>
  <div class="app-container">
    <!-- 固定菜单栏 -->
    <div class="app-header">
      <TitleBar />
    </div>
    
    <!-- 可滚动的主内容区域 -->
    <div class="app-content">
      <router-view />
    </div>
    
    <!-- 固定音乐控制栏 -->
    <div class="app-footer">
      <MusicPlayer />
    </div>
  </div>
</template>

<script setup lang="ts">
import TitleBar from './components/TitleBar.vue'
import MusicPlayer from './components/MusicPlayer.vue'
import { usePlayerStore } from './store/player'
import { onMounted } from 'vue'

// 在程序启动时，加载本地缓存
onMounted(() => {
  const playerStore = usePlayerStore()
  playerStore.initFromLocalCache()
})
</script>

<style>
.app-container {
  height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.app-header {
  flex-shrink: 0;
  z-index: 100;
}

.app-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.app-footer {
  flex-shrink: 0;
  z-index: 100;
}

#app {
  max-width: none;
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100vh;
}
</style>
