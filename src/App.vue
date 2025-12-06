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
  background: transparent; /* Changed to transparent to show body gradient */
  position: relative;
}

.app-header {
  flex-shrink: 0;
  z-index: 100;
  /* Header specific glass effect can be added in TitleBar, but ensuring container is safe */
}

.app-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  z-index: 1; 
  padding-bottom: calc(var(--footer-height) + 20px);
}

.app-footer {
  flex-shrink: 0;
  z-index: 100;
  /* Floating effect */
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
}


/* 去除所有元素的focus outline */
* {
  outline: none !important;
}

/* 去除按钮的focus样式 */
button:focus,
button:active {
  outline: none !important;
  box-shadow: none !important;
}

/* 去除输入框的focus样式 */
input:focus,
textarea:focus {
  outline: none !important;
}
</style>
