/**
 * 平台检测与功能可用性模块
 *
 * 统一管理 web 端 / Electron 桌面端的环境判断和功能开关，
 * 避免在业务代码中散写 `window.appEnv?.xxx` 检测。
 */

/** 本地歌曲 API 接口类型 */
export interface LocalApi {
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
  getCover(filePath: string): Promise<string | null>
  getCoversBatch(filePaths: string[]): Promise<(string | null)[]>
  readFile(filePath: string): Promise<ArrayBuffer | null>
  computeFileMd5(filePath: string): Promise<{ md5: string; size: number } | null>
  onScanProgress(cb: (data: any) => void): void
  removeScanListeners(): void
  // 本地歌单
  createPlaylist(name: string, description?: string): Promise<{ id: string }>
  listPlaylists(): Promise<any[]>
  getPlaylist(id: string): Promise<any | null>
  getPlaylistCoverPaths(): Promise<Record<string, string[]>>
  savePlaylistMosaic(playlistId: string, dataUrl: string): Promise<{ success: boolean; filePath?: string }>
  deletePlaylist(id: string): Promise<{ success: boolean }>
  renamePlaylist(id: string, name: string): Promise<{ success: boolean }>
  updatePlaylist(id: string, updates: { name?: string; customCoverUrl?: string; description?: string }): Promise<{ success: boolean }>
  addTrackToPlaylist(playlistId: string, trackId: string): Promise<{ success: boolean }>
  removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<{ success: boolean }>
  getPlaylistTracks(playlistId: string): Promise<any[]>
  // 删除指定目录下的所有歌曲
  deleteTracksByDirectory(dirPath: string): Promise<{ success: boolean }>
  removeTracks(paths: string[]): Promise<{ success: boolean }>
  clearAllData(): Promise<{ success: boolean }>
  // 本地歌曲统计
  getRecent(limit?: number): Promise<any[]>
  getStats(): Promise<{ totalTracks: number; totalArtists: number; totalAlbums: number; totalDuration: number; totalSize: number }>
}

export const platform = {
  /**
   * 是否运行在 Electron 桌面端
   */
  get isDesktop(): boolean {
    if (typeof window === 'undefined') return false
    if (!!(window as any).appEnv?.isDesktop) return true
    return typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')
  },

  /**
   * 是否运行在 Web 浏览器
   */
  get isWeb(): boolean {
    return !this.isDesktop
  },

  /**
   * 桌面端操作系统类型
   */
  get desktopPlatform(): 'darwin' | 'win32' | 'linux' | '' {
    if (!this.isDesktop) return ''
    return ((window as any).appEnv?.platform as 'darwin' | 'win32' | 'linux') || ''
  },

  /** 是否在 macOS 桌面端 */
  get isMacOS(): boolean {
    return this.desktopPlatform === 'darwin'
  },

  /** 是否在 Windows 桌面端 */
  get isWindows(): boolean {
    return this.desktopPlatform === 'win32'
  },

  /** 是否在 Linux 桌面端 */
  get isLinux(): boolean {
    return this.desktopPlatform === 'linux'
  },

  /** API 基础 URL */
  get apiBaseUrl(): string {
    // Electron 打包后通过 file:// 加载 → 直接连 API 端口
    // 开发模式（web 或 Electron 加载自 localhost）→ 走 Vite proxy /api
    if (this.isDesktop && typeof window !== 'undefined' && window.location.protocol === 'file:') {
      return (window as any).appEnv?.apiBaseUrl || '/api'
    }
    return '/api'
  },

  /** Unblock proxy URL */
  get unblockProxyUrl(): string {
    if (this.isDesktop) {
      return (window as any).appEnv?.unblockProxyUrl || 'http://127.0.0.1:38762'
    }
    return import.meta.env.VITE_NCM_PROXY || 'http://127.0.0.1:38762'
  },

  /** Unblock match URL */
  get unblockMatchUrl(): string {
    if (this.isDesktop) {
      return (window as any).appEnv?.unblockMatchUrl || 'http://127.0.0.1:38763'
    }
    return import.meta.env.VITE_UNBLOCK_MATCH_TARGET || 'http://127.0.0.1:38763'
  },

  /** Electron 版本号（桌面端） */
  get electronVersion(): string {
    if (!this.isDesktop) return ''
    return (window as any).appEnv?.electronVersion || ''
  },

  /** Node.js 版本号（桌面端） */
  get nodeVersion(): string {
    if (!this.isDesktop) return ''
    return (window as any).appEnv?.nodeVersion || ''
  },

  /** 本地歌曲 API（仅桌面端存在，Web 端为 null） */
  get localApi(): LocalApi | null {
    if (!this.isDesktop) return null
    return (window as any).localApi ?? null
  },

  /** 是否支持本地歌曲功能 */
  get hasLocalMusicSupport(): boolean {
    return this.isDesktop && Boolean((window as any).localApi)
  },
}
