import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

// 音乐播放器API
// 在musicPlayerAPI中添加新方法
contextBridge.exposeInMainWorld('musicPlayerAPI', {
  // 选择音乐文件
  openMusicFiles: async () => {
    return await ipcRenderer.invoke('open-music-files')
  },
  // 读取文件内容
  readFile: async (filePath: string) => {
    return await ipcRenderer.invoke('read-file', filePath)
  },
  // 读取歌词
  readLyrics: async (filePath: string) => {
    return await ipcRenderer.invoke('read-lyrics', filePath)
  },
  // 解析音乐元数据
  parseMusicMetadata: async (filePath: string) => {
    return await ipcRenderer.invoke('parse-music-metadata', filePath)
  }
})

// 窗口控制API
contextBridge.exposeInMainWorld('windowControl', {
  minimize: () => ipcRenderer.send('window-control', 'minimize'),
  maximize: () => ipcRenderer.send('window-control', 'maximize'),
  close: () => ipcRenderer.send('window-control', 'close')
})
