/** 本地歌曲 API（仅 Electron 桌面端通过 preload contextBridge 暴露） */
interface LocalLyricMatch {
  localTrackId: string
  localPath: string
  cloudSongId: number
  cloudSongName: string
  cloudArtists: string
  cloudAlbum: string
  cloudDuration: number
  matchMode?: string
  createdAt?: string
  updatedAt?: string
}

interface LocalApi {
  selectDirectory(): Promise<string | null>
  scan(dirPath: string): Promise<{ success: boolean }>
  search(query: string): Promise<any[]>
  getAll(): Promise<any[]>
  trackCount(): Promise<number>
  openFolder?(folderPath: string): Promise<{ success: boolean; error?: string }>
  listScanDirs?(): Promise<string[]>
  saveScanDir?(dirPath: string): Promise<{ success: boolean }>
  removeScanDir?(dirPath: string): Promise<{ success: boolean }>
  getLyric(filePath: string): Promise<{ text: string; format: string } | null>
  getLyricMatch?(localTrackId: string, localPath?: string): Promise<LocalLyricMatch | null>
  saveLyricMatch?(payload: LocalLyricMatch): Promise<{ success: boolean; error?: string }>
  removeLyricMatch?(localTrackId: string, localPath?: string): Promise<{ success: boolean; error?: string }>
  getCover(filePath: string): Promise<string | null>
  getCoversBatch?(filePaths: string[]): Promise<(string | null)[]>
  computeFileMd5?(filePath: string): Promise<{ md5: string; size: number } | null>
  readFile(filePath: string): Promise<ArrayBuffer | null>
  onScanProgress(cb: (data: any) => void): void
  removeScanListeners(): void
}

interface Window {
  localApi?: LocalApi
  appEnv?: {
    windowRole?: 'main' | 'mini'
    window?: {
      setBackgroundColor?: (color: string) => void
    }
    [key: string]: any
  }
}
