import { reactive, computed } from 'vue'
import { platform } from '../utils/platform'

export interface LocalTrack {
  id: string
  path: string
  title: string
  artist: string
  album: string
  albumArtist: string
  duration: number
  coverUrl: string
  hasLyrics: boolean
  source: 'local'
  createdAt: string
}

export type LocalView = 'songs' | 'artists' | 'albums' | 'folders' | 'playlists' | 'playlist-detail' | 'stats'
export type SortField = 'title' | 'artist' | 'album' | 'duration'
export type SortOrder = 'asc' | 'desc'

export interface FolderNode {
  name: string
  path: string
  children: FolderNode[]
  count: number
}

export const localMusicStore = reactive({
  tracks: [] as LocalTrack[],
  directories: [] as string[],
  scanning: false,
  progress: { current: 0, total: 0 },
  searchKeyword: '',
  sortField: 'title' as SortField,
  sortOrder: 'asc' as SortOrder,
  activeView: 'songs' as LocalView,
  selectedArtist: '',
  selectedAlbum: '',
  selectedFolderPath: '',
  collapsedFolders: new Set<string>(),
  playlists: [] as any[],
  activePlaylistId: '',
  activePlaylistDetail: null as any,

  get hasLocalSupport() {
    return platform.hasLocalMusicSupport
  },

  get filteredTracks() {
    let list = this.tracks
    if (this.searchKeyword) {
      const kw = this.searchKeyword.toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(kw) ||
        t.artist.toLowerCase().includes(kw) ||
        t.album.toLowerCase().includes(kw)
      )
    }
    // 排序
    const field = this.sortField
    const order = this.sortOrder
    list = [...list].sort((a, b) => {
      let cmp = 0
      if (field === 'duration') {
        cmp = a.duration - b.duration
      } else {
        cmp = (a[field] || '').localeCompare(b[field] || '', 'zh-CN')
      }
      return order === 'desc' ? -cmp : cmp
    })
    return list
  },

  toggleSort(field: SortField) {
    if (this.sortField === field) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc'
    } else {
      this.sortField = field
      this.sortOrder = 'asc'
    }
  },

  get sortLabel(): string {
    const labels: Record<SortField, string> = { title: '标题', artist: '歌手', album: '专辑', duration: '时长' }
    const arrow = this.sortOrder === 'asc' ? '↑' : '↓'
    return `${labels[this.sortField]} ${arrow}`
  },

  get artistList() {
    const map = new Map<string, LocalTrack[]>()
    for (const t of this.tracks) {
      const artists = t.artist.replace(/\s*\/\s*/g, '/').split('/')
      for (const a of artists) {
        const key = a.trim()
        if (!key) continue
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(t)
      }
    }
    return Array.from(map.entries())
      .map(([name, tracks]) => ({ name, count: tracks.length, tracks }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  },

  get albumList() {
    const map = new Map<string, LocalTrack[]>()
    for (const t of this.tracks) {
      const key = t.album || '未知专辑'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return Array.from(map.entries())
      .map(([name, tracks]) => ({ name, count: tracks.length, tracks, coverUrl: tracks[0]?.coverUrl || '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  },

  get selectedArtistTracks() {
    if (!this.selectedArtist) return this.filteredTracks
    return this.filteredTracks.filter(t =>
      t.artist.toLowerCase().includes(this.selectedArtist.toLowerCase())
    )
  },

  get selectedAlbumTracks() {
    if (!this.selectedAlbum) return this.filteredTracks
    return this.filteredTracks.filter(t => t.album === this.selectedAlbum)
  },

  // ── 文件夹树 ──
  get folderTree(): FolderNode[] {
    // 如果目录列表为空，尝试从 localStorage 恢复
    if (!this.directories.length) this.loadDirectories()

    // 构建扫描目录映射：baseName → 完整路径（同名时后者覆盖，属于可接受限制）
    const dirMap = new Map<string, string>()
    for (const d of this.directories) {
      const normalized = d.replace(/\/$/g, '')
      const baseName = normalized.split('/').filter(Boolean).pop() || normalized
      dirMap.set(baseName, normalized)
    }

    // 计算每个 track 相对于对应扫描目录的路径
    const dirs = new Set<string>()
    for (const t of this.tracks) {
      const absDir = this.getDirPath(t.path)
      if (!absDir) continue
      dirs.add(this._toTreePath(absDir, dirMap))
    }

    // 构建树节点
    const roots: FolderNode[] = []
    for (const dir of [...dirs].sort()) {
      const parts = dir.replace(/\\/g, '/').split('/').filter(Boolean)
      let current = roots
      let pathAcc = ''
      for (const part of parts) {
        pathAcc = pathAcc ? `${pathAcc}/${part}` : part
        let node = current.find(n => n.name === part)
        if (!node) {
          node = { name: part, path: pathAcc, children: [], count: 0 }
          current.push(node)
        }
        current = node.children
      }
    }

    // 统计每个目录下的歌曲数（仅本级）
    const countMap = new Map<string, number>()
    for (const t of this.tracks) {
      const absDir = this.getDirPath(t.path)
      if (!absDir) continue
      const key = this._toTreePath(absDir, dirMap)
      if (key) countMap.set(key, (countMap.get(key) || 0) + 1)
    }

    const setCount = (nodes: FolderNode[]): void => {
      for (const n of nodes) {
        n.count = countMap.get(n.path) || 0
        setCount(n.children)
      }
    }
    setCount(roots)
    return roots
  },

  /** 将绝对目录路径转换为树路径（相对扫描目录），无匹配时返回原路径去前导 / */
  _toTreePath(absDir: string, dirMap: Map<string, string>): string {
    for (const [baseName, scannedDir] of dirMap) {
      if (absDir === scannedDir) return baseName
      if (absDir.startsWith(scannedDir + '/')) {
        return baseName + absDir.slice(scannedDir.length)
      }
    }
    return absDir.replace(/^\//, '')
  },

  setSelectedFolder(path: string) {
    this.selectedFolderPath = path
  },

  toggleFolderCollapse(path: string) {
    if (this.collapsedFolders.has(path)) {
      this.collapsedFolders.delete(path)
    } else {
      this.collapsedFolders.add(path)
    }
  },

  get selectedFolderTracks(): LocalTrack[] {
    if (!this.selectedFolderPath) return []
    const relativePath = this.selectedFolderPath.replace(/\/$/g, '')

    // 构建同样的扫描目录映射
    const dirMap = new Map<string, string>()
    for (const d of this.directories) {
      const normalized = d.replace(/\/$/g, '')
      const baseName = normalized.split('/').filter(Boolean).pop() || normalized
      dirMap.set(baseName, normalized)
    }

    // 从相对路径还原完整目录路径并匹配
    const firstSeg = relativePath.split('/')[0]
    const scannedDir = dirMap.get(firstSeg)

    return this.tracks.filter(t => {
      const absDir = this.getDirPath(t.path)
      if (!absDir) return false
      if (scannedDir) {
        if (absDir === scannedDir) return relativePath === firstSeg
        if (absDir.startsWith(scannedDir + '/')) {
          const rest = absDir.slice(scannedDir.length)
          return (firstSeg + rest) === relativePath
        }
        return false
      }
      // 无匹配时回退到直接比较
      return absDir.replace(/^\//, '') === relativePath
    })
  },

  /** 从文件路径提取目录路径 */
  getDirPath(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const idx = normalized.lastIndexOf('/')
    if (idx === -1) return ''
    return normalized.substring(0, idx) || '/'
  },

  async scanAll() {
    if (!platform.localApi || this.scanning) return
    this.scanning = true
    this.progress = { current: 0, total: 0 }
    console.log('[localMusic] scanAll start, dirs=', this.directories)

    // 先清理旧的监听器再注册，防重复注册
    platform.localApi.removeScanListeners()
    platform.localApi.onScanProgress((data: any) => {
      if (data.type === 'progress') {
        this.progress = { current: data.current, total: data.total }
      }
    })

    for (const dir of this.directories) {
      try {
        console.log('[localMusic] scanning dir:', dir)
        const result = await platform.localApi.scan(dir)
        console.log('[localMusic] scan result for', dir, ':', result)
      } catch (e) {
        console.error('[localMusic] scan failed:', dir, e)
      }
    }
    this.scanning = false
    platform.localApi.removeScanListeners()
    console.log('[localMusic] scanAll done, loading tracks...')
    await this.loadTracks()
    console.log('[localMusic] after scanAll, tracks count:', this.tracks.length)
  },

  async scanSingleDirectory(dirPath: string) {
    if (!platform.localApi) return
    this.scanning = true
    this.progress = { current: 0, total: 0 }

    platform.localApi.removeScanListeners()
    platform.localApi.onScanProgress((data: any) => {
      if (data.type === 'progress') {
        this.progress = { current: data.current, total: data.total }
      }
    })

    try {
      await platform.localApi.scan(dirPath)
    } catch (e) {
      console.error('[localMusic] scan dir failed:', dirPath, e)
    }

    this.scanning = false
    platform.localApi.removeScanListeners()
    await this.loadTracks()
  },

  addDirectoryPath(dirPath: string) {
    if (!dirPath || this.directories.includes(dirPath)) return
    this.directories.push(dirPath)
  },

  removeDirectoryPath(dirPath: string) {
    this.directories = this.directories.filter(d => d !== dirPath)
  },

  async clearAll() {
    this.directories = []
    // 先清空 localStorage 中的目录列表，防止 saveDirectories 合并旧数据加回来
    localStorage.setItem('local_music_dirs', '[]')
    if (platform.localApi) {
      try {
        await platform.localApi.clearAllData()
      } catch (e) {
        console.error('[localMusic] clear all failed:', e)
      }
    }
    await this.loadTracks()
    this._statsRefresh++
    this._coverCache.clear()
    this.saveDirectories()
  },

  async loadTracks() {
    if (!platform.localApi) {
      console.log('[localMusic] loadTracks skipped: no localApi')
      return
    }
    try {
      console.log('[localMusic] loadTracks calling getAll()...')
      const rows = await platform.localApi.getAll()
      console.log('[localMusic] loadTracks got rows:', rows?.length ?? 0, rows?.length ? JSON.stringify(rows[0]).slice(0, 120) : 'empty')
      this.tracks = (rows || []).map((t: any) => ({
        id: t.id,
        path: t.path,
        title: t.title,
        artist: t.artist,
        album: t.album,
        albumArtist: t.albumArtist || '',
        duration: t.duration || 0,
        coverUrl: this._coverCache.has(t.id) ? this._coverCache.get(t.id)! : '',
        hasLyrics: Boolean(t.hasLyrics),
        source: 'local' as const,
        createdAt: t.createdAt || '',
      }))
      console.log('[localMusic] loadTracks completed, this.tracks.length=', this.tracks.length)
      // 重置封面加载状态，确保新 tracks 能重新开始加载封面
      this._coversLoading = false
      // 懒加载封面（在空闲时逐个加载）
      this.lazyLoadCovers()
    } catch (e) {
      console.error('[localMusic] load tracks failed:', e)
    }
  },

  // 封面缓存 Map<trackId, base64Url>
  _coverCache: new Map<string, string>(),

  async getCoverUrl(trackId: string, filePath: string): Promise<string> {
    if (this._coverCache.has(trackId)) return this._coverCache.get(trackId)!
    if (!platform.localApi) return ''
    try {
      const url = await platform.localApi.getCover(filePath)
      if (url) {
        this._coverCache.set(trackId, url)
        return url
      }
    } catch { /* no cover */ }
    return ''
  },

  // 封面加载中标志，防止并发
  _coversLoading: false,
  _statsRefresh: 0,

  lazyLoadCovers(trackIds?: Set<string>) {
    if (!platform.localApi || !this.tracks.length || this._coversLoading) return
    this._coversLoading = true
    let pending = this.tracks.filter(t => !this._coverCache.has(t.id))
    // 如果指定了 trackIds，只加载这些 track 的封面
    if (trackIds && trackIds.size > 0) {
      pending = pending.filter(t => trackIds.has(t.id))
    }
    if (!pending.length) {
      this._coversLoading = false
      return
    }
    Promise.all(pending.map(track =>
      this.getCoverUrl(track.id, track.path).then(url => {
        if (url && this.tracks.includes(track)) {
          track.coverUrl = url
        }
      })
    )).then(() => { this._coversLoading = false })
  },

  async lazyLoadPlaylistCovers() {
    if (!platform.localApi) return
    for (const pl of this.playlists) {
      if (!pl.coverPaths || pl.coverUrls) continue
      const paths: string[] = pl.coverPaths.split('|||').filter(Boolean)
      if (!paths.length) { pl.coverUrls = []; continue }
      pl.coverUrls = await Promise.all(paths.map((p: string) =>
        platform.localApi!.getCover(p).catch(() => '')
      ))
    }
    // 封面加载完毕后生成马赛克封面并存入 DB
    for (const pl of this.playlists) {
      if (!pl.coverUrls?.length) continue
      const validUrls = pl.coverUrls.filter(Boolean)
      if (!validUrls.length) continue
      // 已有 customCoverUrl 且是 data URL（mosaic 已生成且存储正确）则跳过
      if (pl.customCoverUrl?.startsWith('data:image/')) continue
      this.generatePlaylistMosaic(pl.id, validUrls)
    }
  },

  /** 用 canvas 生成马赛克封面图片并保存到 DB */
  generatePlaylistMosaic(playlistId: string, coverUrls: string[]) {
    if (!platform.localApi) return
    const canvas = document.createElement('canvas')
    const cols = 2
    const rows = Math.min(Math.ceil(Math.min(coverUrls.length, 6) / cols), 3)
    const cellSize = 154
    canvas.width = cellSize * cols
    canvas.height = cellSize * rows
    const ctx = canvas.getContext('2d')!
    // 白色背景
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const imgs: HTMLImageElement[] = []
    let loaded = 0
    const maxCovers = Math.min(coverUrls.length, cols * rows)

    for (let i = 0; i < maxCovers; i++) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      imgs.push(img)
      img.onload = () => {
        loaded++
        if (loaded === maxCovers) {
          // 所有图片加载完成后绘制
          for (let j = 0; j < maxCovers; j++) {
            ctx.drawImage(imgs[j], (j % cols) * cellSize, Math.floor(j / cols) * cellSize, cellSize, cellSize)
          }
          // 导出并保存
          canvas.toBlob((blob) => {
            if (!blob) return
            const reader = new FileReader()
            reader.onload = () => {
              const dataUrl = reader.result as string
              platform.localApi!.savePlaylistMosaic(playlistId, dataUrl)
                .then((res: any) => {
                  if (res?.success) {
                    // 更新 store 中的 customCoverUrl（使用 dataUrl，而非本地路径）
                    const pl = this.playlists.find(p => p.id === playlistId)
                    if (pl) pl.customCoverUrl = dataUrl
                  }
                })
                .catch(() => {})
            }
            reader.readAsDataURL(blob)
          }, 'image/jpeg', 0.8)
        }
      }
      img.onerror = () => {
        loaded++
        if (loaded === maxCovers) {
          canvas.toBlob((blob) => {
            if (!blob) return
            const reader = new FileReader()
            reader.onload = () => {
              const dataUrl = reader.result as string
              platform.localApi!.savePlaylistMosaic(playlistId, dataUrl)
                .then((res: any) => {
                  if (res?.success) {
                    const pl = this.playlists.find(p => p.id === playlistId)
                    if (pl) pl.customCoverUrl = dataUrl
                  }
                })
                .catch(() => {})
            }
            reader.readAsDataURL(blob)
          }, 'image/jpeg', 0.8)
        }
      }
      img.src = coverUrls[i]
    }
  },

  async addDirectory() {
    if (!platform.localApi || !platform.localApi.selectDirectory) return
    try {
      const result = await platform.localApi.selectDirectory()
      if (result) {
        this.directories.push(result)
        this.saveDirectories()
        await this.scanAll()
      }
    } catch (e) {
      console.error('[localMusic] add directory failed:', e)
    }
  },

  saveDirectories() {
    try {
      // 合并已有的 localStorage 数据，防止因 loadDirectories 未执行而覆盖丢失
      const existing = localStorage.getItem('local_music_dirs')
      if (existing) {
        const parsed = JSON.parse(existing) as string[]
        for (const dir of parsed) {
          if (!this.directories.includes(dir)) {
            this.directories.push(dir)
          }
        }
      }
      localStorage.setItem('local_music_dirs', JSON.stringify(this.directories))
    } catch { /* ignore */ }
  },

  loadDirectories() {
    try {
      const saved = localStorage.getItem('local_music_dirs')
      if (saved) this.directories = JSON.parse(saved)
    } catch { /* ignore */ }
  },

  // ── 歌单管理 ──

  async loadPlaylists() {
    if (!platform.localApi) return
    try {
      this.playlists = await platform.localApi.listPlaylists()
      // 批量获取所有歌单的前 6 首封面路径
      const coverMap = await platform.localApi.getPlaylistCoverPaths()
      for (const pl of this.playlists) {
        const paths = (coverMap[pl.id] || []).slice(0, 6)
        pl.coverPaths = paths.join('|||')
      }
      this.lazyLoadPlaylistCovers()
    } catch (e) {
      console.error('[localMusic] load playlists failed:', e)
    }
  },

  async createPlaylist(name: string, description?: string) {
    if (!platform.localApi) return null
    try {
      const result = await platform.localApi.createPlaylist(name, description || '')
      await this.loadPlaylists()
      return result
    } catch (e) {
      console.error('[localMusic] create playlist failed:', e)
      return null
    }
  },

  async deletePlaylist(id: string) {
    if (!platform.localApi) return
    try {
      await platform.localApi.deletePlaylist(id)
      if (this.activePlaylistId === id) {
        this.activePlaylistId = ''
        this.activePlaylistDetail = null
      }
      await this.loadPlaylists()
    } catch (e) {
      console.error('[localMusic] delete playlist failed:', e)
    }
  },

  async renamePlaylist(id: string, name: string) {
    if (!platform.localApi) return
    try {
      await platform.localApi.renamePlaylist(id, name)
      await this.loadPlaylists()
      if (this.activePlaylistDetail?.id === id) {
        this.activePlaylistDetail.name = name
      }
    } catch (e) {
      console.error('[localMusic] rename playlist failed:', e)
    }
  },

  async updatePlaylist(id: string, updates: { name?: string; customCoverUrl?: string; description?: string }) {
    if (!platform.localApi) return
    try {
      await platform.localApi.updatePlaylist(id, updates)
      await this.loadPlaylists()
      if (this.activePlaylistDetail?.id === id) {
        if (updates.name !== undefined) this.activePlaylistDetail.name = updates.name
      }
    } catch (e) {
      console.error('[localMusic] update playlist failed:', e)
    }
  },

  async openPlaylist(id: string) {
    if (!platform.localApi) return
    try {
      const detail = await platform.localApi.getPlaylist(id)
      const tracks = (await platform.localApi.getPlaylistTracks(id)) || []
      // 为每个 track 解析封面 URL
      for (const t of tracks) {
        if (this._coverCache.has(t.id)) {
          t.coverUrl = this._coverCache.get(t.id)!
        } else {
          t.coverUrl = ''
          // 异步加载封面（不阻塞渲染）
          this.getCoverUrl(t.id, t.path).then((url) => {
            if (url && this.activePlaylistDetail?.tracks) {
              const found = this.activePlaylistDetail.tracks.find((pt: any) => pt.id === t.id)
              if (found) found.coverUrl = url
            }
          })
        }
      }
      console.log('[localMusic] openPlaylist id=', id, 'tracks count=', tracks.length, JSON.stringify(tracks).slice(0, 200))
      this.activePlaylistDetail = { ...detail, tracks: tracks || [] }
      this.activePlaylistId = id
      this.activeView = 'playlist-detail'
      window.dispatchEvent(new CustomEvent('local-navigate', { detail: { page: 'local-playlist-detail' } }))
    } catch (e) {
      console.error('[localMusic] open playlist failed:', e)
    }
  },

  async addTrackToPlaylist(playlistId: string, trackId: string) {
    if (!platform.localApi) return
    try {
      console.log('[localMusic] addTrackToPlaylist playlistId=', playlistId, 'trackId=', trackId)
      await platform.localApi.addTrackToPlaylist(playlistId, trackId)
      if (this.activePlaylistId === playlistId) {
        await this.openPlaylist(playlistId)
      }
      await this.loadPlaylists()
    } catch (e) {
      console.error('[localMusic] add track to playlist failed:', e)
    }
  },

  async removeTrackFromPlaylist(playlistId: string, trackId: string) {
    if (!platform.localApi) return
    try {
      await platform.localApi.removeTrackFromPlaylist(playlistId, trackId)
      if (this.activePlaylistId === playlistId) {
        await this.openPlaylist(playlistId)
      }
      await this.loadPlaylists()
    } catch (e) {
      console.error('[localMusic] remove track from playlist failed:', e)
    }
  },

  formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return '--:--'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  },
})

// 初始化：从 localStorage 恢复已保存的扫描目录 & 预加载歌单
localMusicStore.loadDirectories()
if (localMusicStore.hasLocalSupport) {
  localMusicStore.loadPlaylists()
}