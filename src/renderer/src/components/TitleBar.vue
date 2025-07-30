<template>
  <div class="title-bar">
    <div class="title-section">
      <img src="../assets/music.svg" alt="Logo" class="logo" />
      <span class="title">MusicPlayer</span>
    </div>
  
    
    <div class="window-controls">
      <NSpace :size="4">
        <NButton
          text
          size="small"
          class="control-btn minimize"
          @click="minimizeWindow"
        >
          <NIcon :component="RemoveOutline" />
        </NButton>
        <NButton
          text
          size="small"
          class="control-btn maximize"
          @click="maximizeWindow"
        >
          <NIcon :component="CropOutline" />
        </NButton>
        <NButton
          text
          size="small"
          class="control-btn close"
          @click="closeWindow"
        >
          <NIcon :component="CloseOutline" />
        </NButton>
      </NSpace>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton, NIcon, NSpace } from 'naive-ui'
import { RemoveOutline, CropOutline, CloseOutline } from '@vicons/ionicons5'


// 窗口控制函数
const minimizeWindow = () => {
  if (window.windowControl) {
    window.windowControl.minimize()
  } else {
    console.error('windowControl not available')
  }
}

const maximizeWindow = () => {
  if (window.windowControl) {
    window.windowControl.maximize()
  } else {
    console.error('windowControl not available')
  }
}

const closeWindow = () => {
  if (window.windowControl) {
    window.windowControl.close()
  } else {
    console.error('windowControl not available')
  }
}
</script>


<style scoped>
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #1a1a1a;
  height: 40px;
  padding: 0 10px;
  -webkit-app-region: drag;
  user-select: none;
}

.title-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  width: 20px;
  height: 20px;
}

.title {
  font-size: 14px;
  font-weight: 600;
  color: white;
}

.window-controls {
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 24px !important;
  height: 24px !important;
  color: #aaa !important;
  border-radius: 4px;
}

.control-btn:hover {
  background-color: #333 !important;
  color: white !important;
}

.close:hover {
  background-color: #e81123 !important;
  color: white !important;
}
</style>