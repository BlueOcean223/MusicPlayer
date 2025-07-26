import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  }
});
contextBridge.exposeInMainWorld("musicPlayerAPI", {
  // 选择音乐文件
  openMusicFiles: async () => {
    return await ipcRenderer.invoke("open-music-files");
  },
  // 读取文件内容
  readFile: async (filePath) => {
    return await ipcRenderer.invoke("read-file", filePath);
  },
  // 读取歌词
  readLyrics: async (filePath) => {
    return await ipcRenderer.invoke("read-lyrics", filePath);
  },
  // 解析音乐元数据
  parseMusicMetadata: async (filePath) => {
    return await ipcRenderer.invoke("parse-music-metadata", filePath);
  }
});
contextBridge.exposeInMainWorld("windowControl", {
  minimize: () => ipcRenderer.send("window-control", "minimize"),
  maximize: () => ipcRenderer.send("window-control", "maximize"),
  close: () => ipcRenderer.send("window-control", "close")
});
