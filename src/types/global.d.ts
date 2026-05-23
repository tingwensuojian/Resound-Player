/** 本地歌曲 API（仅 Electron 桌面端通过 preload contextBridge 暴露） */
interface LocalApi {
  selectDirectory(): Promise<string | null>
  scan(dirPath: string): Promise<{ success: boolean }>
  search(query: string): Promise<any[]>
  getAll(): Promise<any[]>
  trackCount(): Promise<number>
  getLyric(filePath: string): Promise<{ text: string; format: string } | null>
  getCover(filePath: string): Promise<string | null>
  readFile(filePath: string): Promise<ArrayBuffer | null>
  onScanProgress(cb: (data: any) => void): void
  removeScanListeners(): void
}

interface Window {
  appEnv?: {
    isDesktop: boolean
    platform: string
    apiBaseUrl: string
    apiPort: number
    unblockProxyUrl: string
    unblockMatchUrl: string
    electronVersion: string
    nodeVersion: string
    cacheApi: {
      getItem: () => Promise<any>
      setItem: (data: any) => Promise<boolean>
      clear: () => Promise<boolean>
    }
    trayLyric?: {
      getConfig: () => Promise<{ enabled: boolean; mode: 'title' | 'popup'; bgColor?: string }>
      setConfig: (config: { enabled: boolean; mode: 'title' | 'popup'; bgColor?: string }) => Promise<void>
      updateLyric: (data: {
        line: string
        trackName: string
        artist: string
        isPlaying: boolean
      }) => void
      syncState: (payload: {
        type: 'lyrics-loaded' | 'playback-state' | 'track-change' | 'full-hydration'
        data: any
      }) => void
      syncTick: (payload: [number, number, number]) => void
      notifyLikeStatus: (liked: boolean) => void
      onConfigChanged: (cb: (config: { enabled: boolean; mode: 'title' | 'popup'; bgColor?: string }) => void) => () => void
    }
  }
  localApi?: LocalApi
}