/**
 * 平台检测与功能可用性模块
 *
 * 统一管理 web 端 / Electron 桌面端的环境判断和功能开关，
 * 避免在业务代码中散写 `window.appEnv?.xxx` 检测。
 */

/** 本地歌曲 API 接口类型 */
export interface LocalLyricMatch {
  localTrackId: string
  localPath: string
  cloudSongId: number
  cloudSongName: string
  cloudArtists: string
  cloudAlbum: string
  cloudAlbumId?: number
  cloudAlbumPicUrl?: string
  cloudDuration: number
  cloudTrackNo?: number
  cloudDiscNo?: number
  cloudYear?: number
  cloudGenre?: string
  cloudLyrics?: string
  cloudSyncedLyrics?: string
  cloudTranslationLyrics?: string
  cloudRomanizedLyrics?: string
  sourceVersion?: string
  confidence?: number
  matchMode?: string
  createdAt?: string
  updatedAt?: string
}

export interface LocalApi {
  selectDirectory(): Promise<string | null>
  scan(dirPath: string): Promise<{ success: boolean }>
  search(query: string): Promise<any[]>
  getAll(): Promise<any[]>
  trackCount(): Promise<number>
  openFolder?(folderPath: string): Promise<{ success: boolean; error?: string }>
  openCoverCache?(): Promise<{ success: boolean; error?: string }>
  listScanDirs?(): Promise<string[]>
  saveScanDir?(dirPath: string): Promise<{ success: boolean }>
  removeScanDir?(dirPath: string): Promise<{ success: boolean }>
  getLyric(filePath: string): Promise<{ text: string; format: string } | null>
  getLyricMatch?(localTrackId: string, localPath?: string): Promise<LocalLyricMatch | null>
  saveLyricMatch?(payload: LocalLyricMatch): Promise<{ success: boolean; error?: string }>
  removeLyricMatch?(localTrackId: string, localPath?: string): Promise<{ success: boolean; error?: string }>
  previewMetadataWrite?(payload: { filePath: string; localTrackId?: string; overrides?: Record<string, any> }): Promise<any>
  writeMetadata?(payload: { filePath: string; localTrackId?: string; mode?: 'fill-missing'; overrides?: Record<string, any> }): Promise<any>
  revertMetadata?(payload: { filePath: string; localTrackId?: string }): Promise<any>
  getMetadataStatus?(payload: { filePath: string; localTrackId?: string }): Promise<any>
  getMetadataStatusBatch?(payload: { items: Array<{ filePath: string; localTrackId?: string }> }): Promise<Record<string, any>>
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
  getStreamingPort?(): Promise<number>
}

export const platform = {
  /**
   * 是否运行在 Electron 桌面端
   */
  get isDesktop(): boolean {
    if (typeof window === 'undefined') return false
    return Boolean((window as any).appEnv?.isDesktop)
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
    // Web 端走 Vite 代理路径（相对路径，自动跟随当前 host），确保局域网设备也能访问
    return import.meta.env.VITE_UNBLOCK_MATCH_TARGET || '/unblock-api'
  },

  /** 是否具备 Electron 内置 unblock 匹配桥 */
  get hasNativeUnblockBridge(): boolean {
    return this.isDesktop && typeof (window as any).appEnv?.unblockBridge?.matchSong === 'function'
  },

  /** Electron 内置 unblock 匹配桥 */
  get unblockBridge() {
    if (!this.isDesktop) return null
    return (window as any).appEnv?.unblockBridge ?? null
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

  /** 流媒体服务端口（子进程 HTTP 服务，用于 NAS 音频零拷贝播放） */
  _streamingPort: 0,
  _streamingPortInitPromise: null as Promise<number> | null,

  /** 获取流媒体服务端口，含自动初始化和重试逻辑 */
  async getStreamingPort(): Promise<number> {
    // 已获取成功，直接返回
    if (this._streamingPort > 0) return this._streamingPort
    // 正在初始化中，等待已有 Promise
    if (this._streamingPortInitPromise) return this._streamingPortInitPromise
    // 不支持本地 API
    if (!this.localApi) return 0
    // 开始初始化，带重试
    this._streamingPortInitPromise = this._doGetStreamingPort()
    const port = await this._streamingPortInitPromise
    return port
  },

  /** 内部重试逻辑：最多 3 次，间隔 200ms */
  async _doGetStreamingPort(): Promise<number> {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const port = await this.localApi!.getStreamingPort?.() || 0
        if (port > 0) {
          this._streamingPort = port
          return port
        }
      } catch {}
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 200))
      }
    }
    console.warn('[platform] streaming server not available after 3 retries')
    return 0
  },

  /** ??????? URL?HTTP ???NAS ????????? */
  getStreamingUrl(path: string): string {
    if (this._streamingPort > 0) {
      return `http://127.0.0.1:${this._streamingPort}/stream?path=${encodeURIComponent(path)}`
    }
    // fallback: use local:// protocol (zero-copy)
    return `local:///${path.replace(/\\/g, '/')}`
  },

  get hasLocalMusicSupport(): boolean {
    return this.isDesktop && Boolean((window as any).localApi)
  },
}

// 模块加载时自动初始化流媒体服务端口
if (typeof window !== 'undefined' && (window as any).localApi) {
  // 延迟到微任务中执行，不阻塞模块加载
  Promise.resolve().then(() => {
    platform.getStreamingPort().catch(() => {})
  })
}
