import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { parseFile } from 'music-metadata'
import axios from 'axios'

process.env.DIST = path.join(__dirname, '../..')
process.env.VITE_PUBLIC = app.isPackaged 
  ? process.env.DIST 
  : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null

const iconPath = path.join(__dirname, '../../public/music.png')

function createWindow() {
  win = new BrowserWindow({
    icon: iconPath,
    autoHideMenuBar: true,
    width: 1000,
    height: 670,
    frame: false, // 去掉窗口边框
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // 禁用沙箱
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173")
    //win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../../out/renderer/index.html'))
  }
}

// 处理选择音乐文件
ipcMain.handle('open-music-files', async () => {
  if (!win) return []
  
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Music Files', extensions: ['mp3', 'wav', 'flac', 'ogg', 'm4a'] }
    ]
  })
  
  if (canceled) return []
  return filePaths
})

// 读取音乐文件
ipcMain.handle('read-file', async (_, filePath) => {
  if (!filePath) {
    throw new Error("文件路径未定义或为空");
  }

  try {
    const buffer = await fs.promises.readFile(filePath)
    return buffer.toString('base64')
  } catch (error) {
    console.error('读取文件时出错:', error)
    return null
  }
})

// 读取歌词 
ipcMain.handle('read-lyrics', async (_, filePath, songInfo = null) => {
  if (!filePath) throw new Error("文件路径未定义");

  try {
    const metadata = await parseFile(filePath);
    
    // 1. 优先检查内嵌歌词
    if (metadata.common.lyrics) {
      if (Array.isArray(metadata.common.lyrics)) {
        return metadata.common.lyrics.join('\n');
      } else if (typeof metadata.common.lyrics === 'object') {
        const lyricsEntries = Object.entries(metadata.common.lyrics)
          .sort(([langA], [langB]) => (langA || '').localeCompare(langB));
        return lyricsEntries.map(([_, text]) => text).join('\n');
      } else if (typeof metadata.common.lyrics === 'string') {
        return metadata.common.lyrics;
      }
    }


    // 2. 内嵌歌词不存在，尝试在线获取
    
    // 获取歌曲信息用于搜索
    const title = songInfo?.title || metadata.common.title;
    const artist = songInfo?.artist || metadata.common.artist;
    
    if (title && artist) {
      const onlineLyrics = await fetchLyricsOnline(title, artist);
      if (onlineLyrics) {
        return onlineLyrics;
      }
    }

    return null; // 无歌词
  } catch (error) {
    console.error('读取歌词失败:', error);
    return null;
  }
});

// 在线获取歌词的函数
async function fetchLyricsOnline(title: string, artist: string): Promise<string | null> {
  try {
    
    // 使用网易云音乐API
    const searchQuery = encodeURIComponent(`${title} ${artist}`);
    const searchUrl = `https://music.163.com/api/search/get/web?csrf_token=hlpretag=&hlposttag=&s=${searchQuery}&type=1&offset=0&total=true&limit=5`;
    
    const searchResponse = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://music.163.com/'
      },
      timeout: 10000
    });

    if (searchResponse.data?.result?.songs && searchResponse.data.result.songs.length > 0) {
      // 尝试找到最匹配的歌曲
      const songs = searchResponse.data.result.songs;
      let bestMatch = songs[0];
      
      // 简单的匹配算法：优先选择艺术家名称匹配的歌曲
      for (const song of songs) {
        const songArtists = song.artists?.map((artist: Artist) => artist.name).join(' ') || '';
        if (songArtists.toLowerCase().includes(artist.toLowerCase()) || 
            artist.toLowerCase().includes(songArtists.toLowerCase())) {
          bestMatch = song;
          break;
        }
      }
      
      const songId = bestMatch.id;

      
      // 获取歌词
      const lyricsUrl = `https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`;
      const lyricsResponse = await axios.get(lyricsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://music.163.com/'
        },
        timeout: 10000
      });

      if (lyricsResponse.data?.lrc?.lyric) {
        return lyricsResponse.data.lrc.lyric;
      }
    }
  } catch (error) {
    console.log('cloudmusic API don not find:', error);
  }
  
  // 备用方案：使用QQ音乐API
  try {
    return await fetchLyricsFromQQMusic(title, artist);
  } catch (error) {
    console.log('QQmusic API don not find:', error);
  }
  
  return null;
}

// QQ音乐API备用方案
async function fetchLyricsFromQQMusic(title: string, artist: string): Promise<string | null> {
  try {
    const searchQuery = encodeURIComponent(`${title} ${artist}`);
    const searchUrl = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&qqmusic_ver=1298&new_json=1&remoteplace=txt.yqq.song&searchid=&t=0&aggr=1&cr=1&catZhida=1&lossless=0&flag_qc=0&p=1&n=5&w=${searchQuery}&format=json&inCharset=utf8&outCharset=utf-8`;
    
    const searchResponse = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://y.qq.com/'
      },
      timeout: 10000
    });

    if (searchResponse.data?.data?.song?.list && searchResponse.data.data.song.list.length > 0) {
      const song = searchResponse.data.data.song.list[0];
      const songmid = song.songmid;
      
      // 获取歌词
      const lyricsUrl = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&format=json&nobase64=1`;
      const lyricsResponse = await axios.get(lyricsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://y.qq.com/'
        },
        timeout: 10000
      });

      if (lyricsResponse.data?.lyric) {
        return lyricsResponse.data.lyric;
      }
    }
  } catch (error) {
    console.log('QQmusic API don not find:', error);
  }
  
  return null;
}


// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)

// 处理窗口控制
ipcMain.on('window-control', (_, command) => {
  if (!win) return
  
  switch (command) {
    case 'minimize':
      win.minimize()
      break
    case 'maximize':
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
      break
    case 'close':
      win.close()
      break
  }
})

// 添加新的IPC处理器
ipcMain.handle('parse-music-metadata', async (_, filePath) => {
  try {
    const metadata = await parseFile(filePath)
    const { common, format } = metadata
    
    // 提取专辑封面
    let albumArt = null
    if (common.picture && common.picture.length > 0) {
      const picture = common.picture[0]
      // 检查数据是否为Buffer类型
      const bufferData = picture.data instanceof Buffer ? picture.data : Buffer.from(picture.data)
      const base64Data = bufferData.toString('base64')
      albumArt = `data:${picture.format};base64,${base64Data}`
    }
    
    return {
      title: common.title || '未知标题',
      artist: common.artist || '未知艺术家',
      album: common.album || '未知专辑',
      duration: format.duration || 0,
      albumArt,
      genre: common.genre ? common.genre.join(', ') : '未知流派',
      year: common.year || null
    }
  } catch (error) {
    console.error('解析音乐元数据失败:', error)
    return null
  }
})
interface Artist {
  name: string;
  id: number;
}

