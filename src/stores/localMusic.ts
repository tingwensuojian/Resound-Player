import { defineStore } from 'pinia';
import { reactive, computed, toRaw } from 'vue';
import { platform, type LocalLyricMatch } from '../utils/platform';
import { usePlayerStore } from './player';

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

export type LocalMetadataStatus =
  | 'unmatched'
  | 'matched_not_written'
  | 'written'
  | 'written_duplicate'
  | 'revertible'
  | 'partially_reverted'
  | 'reverted'
  | 'conflicted'
  | 'no_missing_fields'

export interface LocalMetadataStatusResult {
  status: LocalMetadataStatus
  hasMatch: boolean
  hasWrittenMetadata: boolean
  canRevert: boolean
  hasEmbeddedArtwork: boolean
  coverSource: 'embedded' | 'match-cache' | 'placeholder'
  message: string
  filePath?: string
  localTrackId?: string
}

export type LocalLyricMatchPayload = LocalLyricMatch

export type LocalView = 'songs' | 'artists' | 'albums' | 'folders' | 'playlists' | 'playlist-detail' | 'stats'
export type SortField = 'title' | 'artist' | 'album' | 'duration'
export type SortOrder = 'asc' | 'desc'

export interface FolderNode {
  name: string
  path: string
  children: FolderNode[]
  count: number
}

export const useLocalMusicStore = defineStore('localMusic', () => {
  const playerStore = usePlayerStore()
  const state = reactive({
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
    _coverVersion: 0,
    loadingTracks: false,
    activePlaylistId: '',
    activePlaylistDetail: null as any,
    locatedTrackId: '',
    _statsRefresh: 0,
    metadataStatusMap: {} as Record<string, LocalMetadataStatusResult>,
    currentMetadataStatus: null as LocalMetadataStatusResult | null,
  });

  const hasLocalSupport = computed(() => platform.hasLocalMusicSupport);

  const filteredTracks = computed(() => {
    state._coverVersion  // 依赖版本号，封面加载后重新求值
    let list = state.tracks
    if (state.searchKeyword) {
      const kw = state.searchKeyword.toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(kw) ||
        t.artist.toLowerCase().includes(kw) ||
        t.album.toLowerCase().includes(kw)
      )
    }
    const field = state.sortField
    const order = state.sortOrder
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
  });

  const artistList = computed(() => {
    state._coverVersion
    const map = new Map<string, LocalTrack[]>()
    for (const t of state.tracks) {
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
  });

  const albumList = computed(() => {
    state._coverVersion
    const map = new Map<string, LocalTrack[]>()
    for (const t of state.tracks) {
      const key = t.album || '未知专辑'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return Array.from(map.entries())
      .map(([name, tracks]) => ({ name, count: tracks.length, tracks, coverUrl: tracks[0]?.coverUrl || '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  });

  const selectedArtistTracks = computed(() => {
    if (!state.selectedArtist) return filteredTracks.value
    return filteredTracks.value.filter(t =>
      t.artist.toLowerCase().includes(state.selectedArtist.toLowerCase())
    )
  });

  const selectedAlbumTracks = computed(() => {
    if (!state.selectedAlbum) return filteredTracks.value
    return filteredTracks.value.filter(t => t.album === state.selectedAlbum)
  });

  const sortLabel = computed(() => {
    const labels: Record<SortField, string> = { title: '标题', artist: '歌手', album: '专辑', duration: '时长' }
    const arrow = state.sortOrder === 'asc' ? '↑' : '↓'
    return `${labels[state.sortField]} ${arrow}`
  });

  function normalizeLocalPath(value: string): string {
    return (value || '').replace(/\\/g, '/').replace(/\/+$/, '')
  }

  function getParentDir(filePath: string): string {
    const normalized = normalizeLocalPath(filePath)
    return normalized.replace(/\/[^/]*$/, '')
  }

  function inferDirectoryRootsFromTracks(): string[] {
    const dirs = Array.from(new Set(
      state.tracks
        .map(t => getParentDir(t.path || ''))
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'zh-CN'))

    return dirs.filter((dir, index) => {
      return !dirs.some((other, otherIndex) =>
        otherIndex !== index && dir.startsWith(other + '/')
      )
    })
  }

  // ── Methods ──

  function toggleSort(field: SortField) {
    if (state.sortField === field) {
      state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc'
    } else {
      state.sortField = field
      state.sortOrder = 'asc'
    }
  }

  // ── 文件夹树 ──
  const folderTree = computed((): FolderNode[] => {
    state._coverVersion

    // 规范化目录列表
    const dirList: { path: string; name: string }[] = []
    const roots = state.directories.length ? state.directories : inferDirectoryRootsFromTracks()
    for (const d of roots) {
      if (!d) continue
      const clean = normalizeLocalPath(d)
      const name = clean.split('/').pop() || clean
      dirList.push({ path: clean, name })
    }

    // 收集 tracks 中所有出现的目录路径（用于构建层级）
    const allDirs = new Set<string>()
    const trackCount = new Map<string, number>()
    for (const t of state.tracks) {
      if (!t.path) continue
      const parentDir = getParentDir(t.path)
      trackCount.set(parentDir, (trackCount.get(parentDir) || 0) + 1)

      // 逐级向上注册目录
      let current = parentDir
      while (current) {
        allDirs.add(current)
        const next = current.replace(/\/[^/]*$/, '')
        if (next === current) break
        current = next
      }
    }

    /** 递归构建树节点 */
    function buildNode(dirPath: string): FolderNode {
      const name = dirPath.split('/').pop() || dirPath
      const directCount = trackCount.get(dirPath) || 0

      // 收集直接子目录
      const prefix = dirPath + '/'
      const childPaths = new Set<string>()
      for (const d of allDirs) {
        if (d.startsWith(prefix)) {
          const relative = d.slice(prefix.length)
          const childPart = relative.split('/')[0]
          if (childPart) {
            childPaths.add(prefix + childPart)
          }
        }
      }

      const children: FolderNode[] = []
      const sortedChildPaths = Array.from(childPaths).sort((a, b) =>
        (a.split('/').pop() || '').localeCompare(b.split('/').pop() || '', 'zh-CN')
      )
      for (const cp of sortedChildPaths) {
        children.push(buildNode(cp))
      }

      const childTotal = children.reduce((sum, c) => sum + c.count, 0)
      return { name, path: dirPath, children, count: directCount + childTotal }
    }

    return dirList.map(({ path: fullPath }) => buildNode(fullPath))
  });

  async function loadDirectories() {
    if (platform.localApi?.listScanDirs) {
      try {
        const dbDirs = await platform.localApi.listScanDirs()
        if (Array.isArray(dbDirs) && dbDirs.length) {
          state.directories = Array.from(new Set(dbDirs.map(normalizeLocalPath).filter(Boolean)))
          try { localStorage.setItem('local_music_dirs', JSON.stringify(state.directories)) } catch {}
          return
        }
      } catch (e) {
        console.warn('[localMusic] load scan dirs from DB failed:', e)
      }
    }

    try {
      const raw = localStorage.getItem('local_music_dirs')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) state.directories = parsed.map(normalizeLocalPath).filter(d => d)
      }
    } catch { /* ignore */ }

    await restoreDirectoriesFromTracks()
  }

  function saveDirectories() {
    try {
      const clean = state.directories.filter(d => d)
      if (clean.length !== state.directories.length) state.directories = clean
      localStorage.setItem('local_music_dirs', JSON.stringify(state.directories))
    } catch { /* silently fail */ }
  }

  async function restoreDirectoriesFromTracks() {
    if (state.directories.length || !state.tracks.length) return

    const inferred = inferDirectoryRootsFromTracks()
    if (!inferred.length) return

    state.directories = inferred
    saveDirectories()

    if (platform.localApi?.saveScanDir) {
      for (const dir of inferred) {
        try {
          await platform.localApi.saveScanDir(dir)
        } catch (e) {
          console.warn('[localMusic] restore scan dir failed:', dir, e)
        }
      }
    }
  }

  async function addDirectory(dir?: string) {
    if (!dir && platform.localApi?.selectDirectory) {
      dir = await platform.localApi.selectDirectory() || ''
    }
    if (!dir) return
    const clean = normalizeLocalPath(dir)
    if (!state.directories.includes(clean)) {
      state.directories.push(clean)
      saveDirectories()
    }
    try {
      await platform.localApi?.saveScanDir?.(clean)
    } catch (e) {
      console.warn('[localMusic] save scan dir failed:', e)
    }
  }

  async function removeDirectory(dir: string) {
    const clean = normalizeLocalPath(dir)
    state.directories = state.directories.filter(d => d !== clean)
    saveDirectories()
    try {
      await platform.localApi?.removeScanDir?.(clean)
    } catch (e) {
      console.warn('[localMusic] remove scan dir failed:', e)
    }
  }

  async function clearAll() {
    // 先通过 IPC 清除 SQLite 数据库（主进程端负责清 covers/mosaic-covers 缓存）
    try {
      if (platform.localApi) {
        await platform.localApi.clearAllData()
      }
    } catch (e) {
      console.warn('[localMusic] clearAll IPC failed:', e)
    }

    state.tracks = []
    state.directories = []
    state.playlists = []
    state.scanning = false
    state.progress = { current: 0, total: 0 }
    try { localStorage.setItem('local_music_dirs', '[]') } catch {}
    try { localStorage.setItem('local_music_playlists', '[]') } catch {}
    saveDirectories()
  }

  // 惰性加载无缓存封面（由组件在 mounted 时调用）
  let _coversLoading = false
  async function lazyLoadCovers() {
    if (_coversLoading) return
    _coversLoading = true
    try {
      if (!platform.localApi) return
      const uncached = state.tracks.filter(t => !t.coverUrl)
      if (!uncached.length) return
      if (typeof (platform.localApi as any).getCoversBatch === 'function') {
        const CHUNK = 50
        for (let start = 0; start < uncached.length; start += CHUNK) {
          const chunk = uncached.slice(start, start + CHUNK)
          const paths = chunk.map(t => t.path)
          const covers = await platform.localApi.getCoversBatch(paths)
          for (let i = 0; i < chunk.length; i++) {
            const batchCover = String(covers[i] || '')
            if (batchCover) {
              chunk[i].coverUrl = batchCover
              continue
            }
            const matchedCover = String((await getLyricMatch(chunk[i]))?.cloudAlbumPicUrl || '').trim()
            if (matchedCover) chunk[i].coverUrl = matchedCover
          }
        }
        // 全部批次完成后只递增一次版本号，避免每批都触发多次 computed 重算
        state._coverVersion++
      } else {
        for (const track of uncached) {
          try {
            const cover = await resolveTrackCover(track)
            if (cover) track.coverUrl = cover
          } catch { /* ignore single failure */ }
        }
        // 递增版本号，触发 filteredTracks / artistList / albumList 等 computed 重新求值
        state._coverVersion++
      }
    } catch (e) {
      console.warn('[localMusic] lazyLoadCovers failed:', e)
    } finally {
      _coversLoading = false
    }
  }

  // ???????????? NAS ????? SSD ???
  async function batchCheckLocalCovers() {
    if (!platform.localApi) return
    try {
      const uncached = state.tracks.filter(t => !t.coverUrl)
      if (!uncached.length) return
      if (typeof (platform.localApi as any).getCoversBatch === "function") {
        const CHUNK = 100
        for (let start = 0; start < uncached.length; start += CHUNK) {
          const chunk = uncached.slice(start, start + CHUNK)
          const paths = chunk.map(t => t.path)
          const covers = await (platform.localApi as any).getCoversBatch(paths)
          for (let i = 0; i < chunk.length; i++) {
            const cover = String(covers[i] || "")
            if (cover) chunk[i].coverUrl = cover
          }
        }
        // 全部批次完成后只递增一次版本号，避免每批都触发多次 computed 重算
        state._coverVersion++
      }
    } catch (e) {
      console.warn("[localMusic] batchCheckLocalCovers failed:", e)
    }
  }

  async function lazyLoadPlaylistCovers() {
    let changed = false
    for (const pl of state.playlists) {
      if (Array.isArray(pl.tracks)) {
        for (const track of pl.tracks) {
          if (!track?.coverUrl) {
            const cover = await resolveTrackCover(track)
            if (cover) {
              track.coverUrl = cover
              changed = true
            }
          }
        }
      }
      if (pl.coverUrl) continue
      if (!pl.tracks?.length) continue
      const coverUrl = await synthesizeCover(pl.tracks.slice(0, 6))
      if (coverUrl) {
        pl.coverUrl = coverUrl
        changed = true
      }
    }
    if (changed) {
      state._coverVersion++
      savePlaylists()
    }
  }

  async function synthesizeCover(tracks: LocalTrack[], maxCols = 3): Promise<string> {
    if (!tracks.length) return ''
    if (tracks.length === 1) return tracks[0].coverUrl || ''
    const canvas = document.createElement('canvas')
    const cols = Math.min(tracks.length, maxCols)
    const rows = Math.min(Math.ceil(tracks.length / maxCols), 2)
    const size = 120
    canvas.width = size * cols
    canvas.height = size * rows
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const imgs = await Promise.all(tracks.slice(0, cols * rows).map(t => loadImage(t.coverUrl)))
    imgs.forEach((img, i) => {
      if (!img) return
      const col = i % cols
      const row = Math.floor(i / cols)
      ctx.drawImage(img, col * size, row * size, size, size)
    })
    return canvas.toDataURL('image/jpeg', 0.7)
  }

  function loadImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise(resolve => {
      if (!url) return resolve(null)
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    })
  }

  const selectedFolderTracks = computed(() => {
    state._coverVersion
    if (!state.selectedFolderPath) return state.tracks
    const folder = normalizeLocalPath(state.selectedFolderPath)
    return state.tracks.filter(t => {
      const p = normalizeLocalPath(t.path || '')
      return p === folder || p.startsWith(folder + '/')
    })
  });

  function setSelectedFolder(folderPath: string) {
    state.selectedFolderPath = folderPath
  }

  function toggleFolderCollapse(folderPath: string) {
    const set = new Set(state.collapsedFolders)
    if (set.has(folderPath)) set.delete(folderPath)
    else set.add(folderPath)
    state.collapsedFolders = set
  }

  function loadPlaylists() {
    try {
      const raw = localStorage.getItem('local_music_playlists')
      if (raw) state.playlists = JSON.parse(raw)
    } catch (e) {
      console.error('[localMusic] loadPlaylists failed:', e)
    }
  }

  function savePlaylists() {
    try {
      const raw = toRaw(state.playlists)
      const json = JSON.stringify(raw)
      console.log('[localMusic] savePlaylists:', raw.length, 'playlists, json length:', json.length)
      if (raw.length > 0 && raw[0].tracks) {
        console.log('[localMusic] savePlaylists: first playlist tracks:', raw[0].tracks.length)
      }
      localStorage.setItem('local_music_playlists', json)
    } catch (e) {
      console.error('[localMusic] savePlaylists failed:', e)
    }
  }

  function createPlaylist(name: string) {
    const pl = { id: Date.now().toString(), name, tracks: [], trackCount: 0, createdAt: new Date().toISOString() }
    state.playlists.push(pl)
    savePlaylists()
    return pl
  }

  function renamePlaylist(id: string, name: string) {
    const pl = state.playlists.find((p: any) => p.id === id)
    if (pl) { pl.name = name; savePlaylists() }
  }

  function deletePlaylist(id: string) {
    state.playlists = state.playlists.filter((p: any) => p.id !== id)
    savePlaylists()
  }

  function updatePlaylist(id: string, updates: any) {
    const pl = state.playlists.find((p: any) => p.id === id)
    if (pl) { Object.assign(pl, updates); savePlaylists() }
  }

  function openPlaylist(id: string) {
    const pl = state.playlists.find((p: any) => p.id === id)
    if (pl) {
      state.activePlaylistDetail = pl
      state.activePlaylistId = id
      state.activeView = 'playlist-detail'
    }
  }

  function addTrackToPlaylist(playlistId: string, track: any) {
    const pl = state.playlists.find((p: any) => p.id === playlistId)
    if (!pl) {
      console.warn('[localMusic] addTrackToPlaylist: playlist not found', playlistId)
      return
    }
    if (pl.tracks.find((t: any) => t.id === track.id)) {
      console.warn('[localMusic] addTrackToPlaylist: track already in playlist', track.id, playlistId)
      return
    }
    pl.tracks.push(track)
    pl.trackCount = pl.tracks.length
    console.log('[localMusic] addTrackToPlaylist: pushed track', track.id, track.title, 'to playlist', playlistId, 'tracks.length=', pl.tracks.length)
    savePlaylists()
  }

  function removeTrackFromPlaylist(playlistId: string, trackId: string) {
    const pl = state.playlists.find((p: any) => p.id === playlistId)
    if (pl) { pl.tracks = pl.tracks.filter((t: any) => t.id !== trackId); pl.trackCount = pl.tracks.length; savePlaylists() }
  }

  async function loadTracks() {
    if (!platform.localApi) return
    if (state.loadingTracks) return // 防止并发调用覆盖已加载数据
    state.loadingTracks = true
    try {
      const tracks = await platform.localApi.getAll()
      state.tracks = (tracks || []).map((t: any) => ({
        ...t,
        coverUrl: '',
        source: 'local' as const,
        hasLyrics: Boolean(t.hasLyrics),
      }))
      await restoreDirectoriesFromTracks()
      // 批量检测本地缓存封面（零 NAS 穿透）
      await batchCheckLocalCovers()
      refreshMetadataStatuses(state.tracks)
    } catch (e) {
      console.warn('[localMusic] loadTracks failed:', e)
    } finally {
      state.loadingTracks = false
    }
  }

  async function scanAll() {
    if (state.scanning) return
    if (!platform.localApi) return
    if (!state.directories.length) await loadDirectories()
    if (!state.directories.length) return

    state.scanning = true
    state.progress = { current: 0, total: 0 }

    // 注册扫描进度监听
    const progressHandler = (data: any) => {
      if (data.type === 'progress') {
        state.progress = { current: data.current || 0, total: data.total || 0 }
      } else if (data.type === 'error') {
        console.warn('[localMusic] scan error:', data.message)
      }
    }
    platform.localApi.onScanProgress(progressHandler)

    try {
      for (const dir of state.directories) {
        if (!dir) continue
        try {
          await platform.localApi.scan(dir)
        } catch (e) {
          console.warn('[localMusic] scan dir failed:', dir, e)
        }
      }
      // 扫描完成后从 DB 重新加载全部歌曲
      await loadTracks()
      // 批量检测本地缓存封面（零 NAS 穿透）
      await batchCheckLocalCovers()
    } finally {
      state.scanning = false
      platform.localApi.removeScanListeners()
    }
  }

  async function removeDirectoryPath(path: string) {
    const clean = normalizeLocalPath(path)
    state.directories = state.directories.filter(d => d !== clean)
    saveDirectories()
    try {
      await platform.localApi?.removeScanDir?.(clean)
    } catch (e) {
      console.warn('[localMusic] remove scan dir failed:', e)
    }
  }

  function expandFolderAncestors(folderPath: string) {
    const parts = folderPath.replace(/\\/g, '/').split('/').filter(Boolean)
    const set = new Set(state.collapsedFolders)
    let acc = ''
    for (const p of parts) { acc += '/' + p; set.delete(acc) }
    state.collapsedFolders = set
  }

  function getLocalTrackIdentity(track: any): { localTrackId: string; localPath: string } {
    return {
      localTrackId: String(track?.id || ''),
      localPath: String(track?.path || ''),
    }
  }

  function metadataStatusKey(track: any): string {
    return String(track?.path || '').replace(/\\/g, '/')
  }

  async function getLyricMatch(track: any): Promise<LocalLyricMatch | null> {
    if (!platform.localApi?.getLyricMatch) return null
    const { localTrackId, localPath } = getLocalTrackIdentity(track)
    if (!localTrackId && !localPath) return null
    return platform.localApi.getLyricMatch(localTrackId, localPath)
  }

  async function getMetadataStatus(track: any): Promise<LocalMetadataStatusResult | null> {
    if (!platform.localApi?.getMetadataStatus) return null
    const { localTrackId, localPath } = getLocalTrackIdentity(track)
    if (!localPath) return null
    const result = await platform.localApi.getMetadataStatus({
      filePath: localPath,
      localTrackId,
    })
    if (result?.filePath) {
      state.metadataStatusMap[result.filePath] = result
    }
    return result || null
  }

  async function refreshMetadataStatus(track: any): Promise<LocalMetadataStatusResult | null> {
    const status = await getMetadataStatus(track)
    if (status) state.currentMetadataStatus = status
    return status
  }

  async function refreshMetadataStatuses(tracks: any[]): Promise<void> {
    if (!platform.localApi?.getMetadataStatusBatch) return
    const items = (tracks || [])
      .filter(track => track?.path)
      .map(track => {
        const { localTrackId, localPath } = getLocalTrackIdentity(track)
        return { filePath: localPath, localTrackId }
      })
    if (!items.length) return
    const result = await platform.localApi.getMetadataStatusBatch({ items })
    if (!result || typeof result !== 'object') return
    state.metadataStatusMap = {
      ...state.metadataStatusMap,
      ...result,
    }
  }

  function metadataStatusOf(track: any): LocalMetadataStatusResult | null {
    const key = metadataStatusKey(track)
    return state.metadataStatusMap[key] || null
  }

  async function resolveTrackCover(track: any): Promise<string> {
    if (!platform.localApi) return ''
    try {
      const embeddedCover = await platform.localApi.getCover(track.path)
      if (embeddedCover) return embeddedCover
    } catch {
      /* ignore */
    }
    try {
      const match = await getLyricMatch(track)
      return String(match?.cloudAlbumPicUrl || '').trim()
    } catch {
      return ''
    }
  }

  async function saveLyricMatch(payload: LocalLyricMatchPayload): Promise<{ success: boolean; error?: string }> {
    if (!platform.localApi?.saveLyricMatch) return { success: false, error: '当前环境不支持歌词匹配保存' }
    const result = await platform.localApi.saveLyricMatch(payload)
    await refreshMetadataStatus({ id: payload.localTrackId, path: payload.localPath })
    return result
  }

  async function previewMetadataWrite(track: any, overrides?: Record<string, any>): Promise<any> {
    if (!platform.localApi?.previewMetadataWrite) throw new Error('当前环境不支持标签补全')
    return platform.localApi.previewMetadataWrite({
      filePath: String(track?.path || ''),
      localTrackId: String(track?.id || ''),
      overrides,
    })
  }

  async function writeMetadata(track: any, overrides?: Record<string, any>): Promise<any> {
    if (!platform.localApi?.writeMetadata) throw new Error('当前环境不支持标签补全')
    const result = await platform.localApi.writeMetadata({
      filePath: String(track?.path || ''),
      localTrackId: String(track?.id || ''),
      mode: 'fill-missing',
      overrides,
    })
    await applyMetadataWriteResult(track, result)
    await refreshMetadataStatus(track)
    return result
  }

  async function revertMetadata(track: any): Promise<any> {
    if (!platform.localApi?.revertMetadata) throw new Error('当前环境不支持标签回滚')
    const result = await platform.localApi.revertMetadata({
      filePath: String(track?.path || ''),
      localTrackId: String(track?.id || ''),
    })
    await refreshTrackCover(track)
    await refreshMetadataStatus(track)
    return result
  }

  function isSameLocalTrack(target: any, candidate: any) {
    const targetId = String(target?.id || '')
    const targetPath = String(target?.path || '')
    return (
      (targetId && String(candidate?.id || '') === targetId) ||
      (targetPath && String(candidate?.path || '') === targetPath)
    )
  }

  function writePlanValueMap(result: any): Record<string, any> {
    const map: Record<string, any> = {}
    for (const item of result?.writePlan?.toWrite || []) {
      if (item?.key) map[String(item.key)] = item.value
    }
    return map
  }

  function applyTrackFieldWrites(target: any, result: any) {
    const valueMap = writePlanValueMap(result)
    if (Object.prototype.hasOwnProperty.call(valueMap, 'title')) {
      const nextTitle = String(valueMap.title || '').trim()
      if (nextTitle) target.title = nextTitle
      if (target.name !== undefined && nextTitle) target.name = nextTitle
    }
    if (Object.prototype.hasOwnProperty.call(valueMap, 'artists')) {
      const artists = Array.isArray(valueMap.artists)
        ? valueMap.artists.map((item: any) => String(item || '').trim()).filter(Boolean)
        : String(valueMap.artists || '').split('/').map((item) => item.trim()).filter(Boolean)
      const artistText = artists.join('/')
      target.artist = artistText
      if (target.ar !== undefined) {
        target.ar = artists.map((name) => ({ name }))
      }
    }
    if (Object.prototype.hasOwnProperty.call(valueMap, 'album')) {
      const nextAlbum = String(valueMap.album || '').trim()
      target.album = nextAlbum
      if (target.al !== undefined) {
        target.al = { ...(target.al || {}), name: nextAlbum }
      }
    }
    if (Object.prototype.hasOwnProperty.call(valueMap, 'albumArtist')) {
      target.albumArtist = String(valueMap.albumArtist || '').trim()
    }
    if (Object.prototype.hasOwnProperty.call(valueMap, 'genre')) {
      target.genre = String(valueMap.genre || '').trim()
    }
    if (Object.prototype.hasOwnProperty.call(valueMap, 'year')) {
      target.year = Number(valueMap.year || 0)
    }
    if (Object.prototype.hasOwnProperty.call(valueMap, 'trackNo')) {
      target.trackNo = Number(valueMap.trackNo || 0)
    }
    if (Object.prototype.hasOwnProperty.call(valueMap, 'discNo')) {
      target.discNo = Number(valueMap.discNo || 0)
    }
    if (Object.prototype.hasOwnProperty.call(valueMap, 'lyrics')) {
      target.hasLyrics = Boolean(String(valueMap.lyrics || '').trim())
    }
  }

  async function refreshTrackCover(track: any) {
    const nextCover = await resolveTrackCover(track)
    for (const localTrack of state.tracks) {
      if (!isSameLocalTrack(track, localTrack)) continue
      localTrack.coverUrl = nextCover
    }
    for (const playlist of state.playlists) {
      if (!Array.isArray(playlist?.tracks)) continue
      for (const playlistTrack of playlist.tracks) {
        if (!isSameLocalTrack(track, playlistTrack)) continue
        playlistTrack.coverUrl = nextCover
      }
    }
    const currentTrack = playerStore.state.currentTrack as any
    if (currentTrack && isSameLocalTrack(track, currentTrack)) {
      currentTrack.al = { ...(currentTrack.al || {}), picUrl: nextCover, name: currentTrack.al?.name || currentTrack.album || '' }
    }
    for (const playlistTrack of playerStore.state.playlist as any[]) {
      if (!isSameLocalTrack(track, playlistTrack)) continue
      playlistTrack.al = { ...(playlistTrack.al || {}), picUrl: nextCover, name: playlistTrack.al?.name || playlistTrack.album || '' }
    }
    state._coverVersion++
    savePlaylists()
  }

  async function applyMetadataWriteResult(track: any, result: any) {
    if (!result || result.skipped) return
    for (const localTrack of state.tracks) {
      if (!isSameLocalTrack(track, localTrack)) continue
      applyTrackFieldWrites(localTrack, result)
    }
    for (const playlist of state.playlists) {
      if (!Array.isArray(playlist?.tracks)) continue
      for (const playlistTrack of playlist.tracks) {
        if (!isSameLocalTrack(track, playlistTrack)) continue
        applyTrackFieldWrites(playlistTrack, result)
      }
    }
    const currentTrack = playerStore.state.currentTrack as any
    if (currentTrack && isSameLocalTrack(track, currentTrack)) {
      applyTrackFieldWrites(currentTrack, result)
      currentTrack.name = currentTrack.title || currentTrack.name
      currentTrack.al = {
        ...(currentTrack.al || {}),
        name: currentTrack.album || currentTrack.al?.name || '',
      }
      currentTrack.ar = String(currentTrack.artist || '')
        .split('/')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((name) => ({ name }))
    }
    for (const playlistTrack of playerStore.state.playlist as any[]) {
      if (!isSameLocalTrack(track, playlistTrack)) continue
      applyTrackFieldWrites(playlistTrack, result)
      playlistTrack.name = playlistTrack.title || playlistTrack.name
      playlistTrack.al = {
        ...(playlistTrack.al || {}),
        name: playlistTrack.album || playlistTrack.al?.name || '',
      }
      playlistTrack.ar = String(playlistTrack.artist || '')
        .split('/')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((name) => ({ name }))
    }
    await refreshTrackCover(track)
  }

  function applyLyricMatchCover(track: any, match: any) {
    const localTrackId = String(track?.id || '')
    const localPath = String(track?.path || '')
    const nextCover = String(match?.cloudAlbumPicUrl || '').trim()
    if (!nextCover) return
    const target = state.tracks.find(item =>
      String(item.id || '') === localTrackId || String(item.path || '') === localPath
    )
    if (!target) return
    target.coverUrl = nextCover
    if (!target.album && match?.cloudAlbum) target.album = String(match.cloudAlbum)
    for (const playlist of state.playlists) {
      if (!Array.isArray(playlist?.tracks)) continue
      for (const playlistTrack of playlist.tracks) {
        const sameTrack = String(playlistTrack?.id || '') === localTrackId || String(playlistTrack?.path || '') === localPath
        if (!sameTrack) continue
        playlistTrack.coverUrl = nextCover
        if (!playlistTrack.album && match?.cloudAlbum) playlistTrack.album = String(match.cloudAlbum)
      }
    }
    state._coverVersion++
    savePlaylists()
  }

  async function removeLyricMatch(track: any): Promise<{ success: boolean; error?: string }> {
    if (!platform.localApi?.removeLyricMatch) return { success: false, error: '当前环境不支持歌词匹配移除' }
    const { localTrackId, localPath } = getLocalTrackIdentity(track)
    if (!localTrackId && !localPath) return { success: true }
    const result = await platform.localApi.removeLyricMatch(localTrackId, localPath)
    await refreshMetadataStatus(track)
    return result
  }

  return {
    state,
    hasLocalSupport,
    filteredTracks,
    artistList,
    albumList,
    selectedArtistTracks,
    selectedAlbumTracks,
    sortLabel,
    folderTree,
    toggleSort,
    loadDirectories,
    saveDirectories,
    addDirectory,
    removeDirectory,
    clearAll,
    lazyLoadCovers,
    batchCheckLocalCovers,
    lazyLoadPlaylistCovers,
    selectedFolderTracks,
    setSelectedFolder,
    toggleFolderCollapse,
    loadPlaylists,
    savePlaylists,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    updatePlaylist,
    openPlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    loadTracks,
    scanAll,
    removeDirectoryPath,
    expandFolderAncestors,
    getLyricMatch,
    getMetadataStatus,
    refreshMetadataStatus,
    refreshMetadataStatuses,
    metadataStatusOf,
    saveLyricMatch,
    previewMetadataWrite,
    writeMetadata,
    revertMetadata,
    applyLyricMatchCover,
    applyMetadataWriteResult,
    resolveTrackCover,
    removeLyricMatch,
  };
});
