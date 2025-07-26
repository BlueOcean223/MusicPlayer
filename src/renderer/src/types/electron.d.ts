declare global {
  interface Window {
    ipcRenderer: {
      on: (channel: string, listener: (...args: any[]) => void) => void
      off: (channel: string, ...args: any[]) => void
      send: (channel: string, ...args: any[]) => void
      invoke: (channel: string, ...args: any[]) => Promise<any>
    }
    musicPlayerAPI: {
      openMusicFiles: () => Promise<string[]>
      readFile: (filePath: string) => Promise<string | null>
      readLyrics: (filePath: string) => Promise<string | null>
      parseMusicMetadata: (filePath: string) => Promise<any>
    }
    windowControl: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
  }
}

export {}