import { defineStore } from 'pinia';
import { reactive, computed } from 'vue';
import { platform } from '../utils/platform';

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

export const useLocalMusicStore = defineStore('localMusic', () => {
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
    activePlaylistId: '',
    activePlaylistDetail: null as any,
    locatedTrackId: '',
    _statsRefresh: 0,
  });

  const hasLocalSupport = computed(() => platform.hasLocalMusicSupport);

  const filteredTracks = computed(() => {
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
    if (!state.directories.length) loadDirectories()

    const dirMap = new Map<string, string>()
    for (const d of state.directories) {
      const parts = d.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
      const baseName = parts[parts.length - 1] || d
      dirMap.set(baseName, d)
    }

    const trackCount = new Map<string, number>()
    for (const t of state.tracks) {
      if (!t.path) continue
      const dir = t.path.replace(/\\/g, '/').replace(/\/[^/]*$/, '')
      trackCount.set(dir, (trackCount.get(dir) || 0) + 1)
    }

    const root: FolderNode[] = []
    const map = new Map<string, FolderNode>()

    // 为每个扫描的目录创建节点
    for (const [baseName, fullPath] of dirMap) {
      const node: FolderNode = { name: baseName, path: fullPath, children: [], count: trackCount.get(fullPath) || 0 }
      map.set(fullPath, node)
      root.push(node)
    }

    return root
  });

  function loadDirectories() {
    try {
      const raw = localStorage.getItem('local_music_dirs')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) state.directories = parsed
      }
    } catch { /* ignore */ }
  }

  function saveDirectories() {
    try {
      localStorage.setItem('local_music_dirs', JSON.stringify(state.directories))
    } catch { /* silently fail */ }
  }

  function addDirectory(dir: string) {
    if (!state.directories.includes(dir)) {
      state.directories.push(dir)
      saveDirectories()
    }
  }

  function removeDirectory(dir: string) {
    state.directories = state.directories.filter(d => d !== dir)
    saveDirectories()
  }

  function clearAll() {
    state.tracks = []
    state.directories = []
    state.playlists = []
    state.scanning = false
    state.progress = { current: 0, total: 0 }
    try { localStorage.setItem('local_music_dirs', '[]') } catch {}
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
      await Promise.all(uncached.map(async (track) => {
        try {
          const cover = await platform.localApi!.readCover(track.path)
          if (cover) track.coverUrl = cover
        } catch { /* ignore single failure */ }
      }))
    } finally { _coversLoading = false }
  }

  async function lazyLoadPlaylistCovers() {
    for (const pl of state.playlists) {
      if (pl.coverUrl) continue
      if (!pl.tracks?.length) continue
      const coverUrl = await synthesizeCover(pl.tracks.slice(0, 6))
      if (coverUrl) pl.coverUrl = coverUrl
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
    if (!state.selectedFolderPath) return state.tracks
    return state.tracks.filter(t => t.path.startsWith(state.selectedFolderPath))
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
    } catch { /* ignore */ }
  }

  function savePlaylists() {
    try { localStorage.setItem('local_music_playlists', JSON.stringify(state.playlists)) }
    catch { /* silently fail */ }
  }

  function createPlaylist(name: string) {
    const pl = { id: Date.now().toString(), name, tracks: [], createdAt: new Date().toISOString() }
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
    if (pl && !pl.tracks.find((t: any) => t.id === track.id)) {
      pl.tracks.push(track)
      savePlaylists()
    }
  }

  function removeTrackFromPlaylist(playlistId: string, trackId: string) {
    const pl = state.playlists.find((p: any) => p.id === playlistId)
    if (pl) { pl.tracks = pl.tracks.filter((t: any) => t.id !== trackId); savePlaylists() }
  }

  async function loadTracks() {}

  async function scanAll() {
    if (state.scanning) return
    state.scanning = true
    state.progress = { current: 0, total: 0 }
    try {
      if (platform.localApi?.startScan) await platform.localApi.startScan()
    } catch (e) { console.warn('[localMusic] scanAll failed:', e) }
    finally { state.scanning = false }
  }

  function removeDirectoryPath(path: string) {
    state.directories = state.directories.filter(d => d !== path)
    saveDirectories()
  }

  function getTreePath(folderPath: string): string[] {
    return folderPath.split('/').filter(Boolean)
  }

  function expandFolderAncestors(folderPath: string) {
    const parts = folderPath.replace(/\\/g, '/').split('/').filter(Boolean)
    const set = new Set(state.collapsedFolders)
    let acc = ''
    for (const p of parts) { acc += '/' + p; set.delete(acc) }
    state.collapsedFolders = set
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
    getTreePath,
    expandFolderAncestors,
  };
});