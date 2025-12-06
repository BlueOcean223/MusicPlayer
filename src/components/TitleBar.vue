<template>
  <div class="title-bar">
    <div class="title-section" data-tauri-drag-region>
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
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow'
const appWindow = getCurrentWebviewWindow()


// 窗口控制函数
const minimizeWindow = () => {
  appWindow.minimize()
}

const maximizeWindow = async () => {
  if (await appWindow.isMaximized()) {
    appWindow.unmaximize()
  } else {
    appWindow.maximize()
  }
}

const closeWindow = () => {
  appWindow.close()
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
  user-select: none;
}

.title-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  height: 100%;
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