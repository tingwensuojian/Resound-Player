/** 本地音乐功能类型定义 - 主进程侧 */

export type ScanEvent =
  | { type: 'progress'; current: number; total: number }
  | { type: 'batch'; tracks: TrackRecord[] }
  | { type: 'complete'; total: number }
  | { type: 'error'; path: string; message: string }

export interface TrackRecord {
  id: string
  path: string
  title: string
  artist: string
  album: string
  albumArtist: string
  duration: number
  bitrate: number
  sampleRate: number
  trackNo: number
  discNo: number
  genre: string
  year: number
  coverPath: string
  fileSize: number
  mtime: number
  hasLyrics: boolean
  createdAt: string
  updatedAt: string
}

export interface LocalLyricMatchRecord {
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

export interface IMusicScanner {
  scanDir(dirPath: string, cachedMtimes?: Map<string, number>): AsyncIterable<ScanEvent>
  supportedExtensions: string[]
}

export interface IMetadataDB {
  init(): Promise<void>
  getAllTracks(): Promise<TrackRecord[]>
  getTrackByPath(path: string): Promise<TrackRecord | null>
  upsertTracks(tracks: TrackRecord[]): Promise<void>
  removeTracks(paths: string[]): Promise<void>
  removeTracksByDirectory(dirPath: string): Promise<void>
  clearAllTracks(): Promise<number>
  search(query: string): Promise<TrackRecord[]>
  getTrackCount(): Promise<number>
  getAllMtimes(): Promise<Map<string, number>>
  upsertScanDir(path: string): Promise<void>
  listScanDirs(): Promise<string[]>
  removeScanDir(path: string): Promise<void>
  getLocalLyricMatch?(localTrackId: string, localPath?: string): Promise<LocalLyricMatchRecord | null>
  saveLocalLyricMatch?(payload: LocalLyricMatchRecord): Promise<{ success: boolean; error?: string }>
  removeLocalLyricMatch?(localTrackId: string, localPath?: string): Promise<{ success: boolean; error?: string }>
  close(): Promise<void>
}
