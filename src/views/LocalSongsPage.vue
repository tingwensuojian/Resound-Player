<template>
  <section class="local-page">
    <div class="local-page-actions ui-safe-group">
      <input
        v-model="localMusicStore.state.searchKeyword"
        class="search-input local-search"
        type="text"
        placeholder="搜索歌曲、歌手、专辑…"
      />
      <DropdownSelect
        v-if="localMusicStore.state.directories.length"
        :model-value="activeDirLabel"
        :options="['所有目录', ...dirLabels]"
        @update:model-value="onDirSelect"
      />
      <DropdownSelect
        :model-value="currentSortLabel"
        :options="['标题', '歌手', '专辑', '时长']"
        @update:model-value="onSortSelect"
      />
      <button class="button-surface" @click="handleScan" :disabled="localMusicStore.state.scanning">
        {{ localMusicStore.state.scanning ? '扫描中…' : '扫描' }}
      </button>
      <button class="button-surface" @click="handlePlayAll">
        播放全部
      </button>
      <button class="button-surface" :class="{ active: selectionMode }" @click="toggleSelectionMode">
        {{ selectionMode ? '取消选择' : '选择' }}
      </button>
    </div>

    <!-- 选择模式操作栏 -->
    <div v-if="selectionMode && filteredList.length" class="selection-bar">
      <label class="selection-all">
        <input type="checkbox" :checked="allSelected" @change="toggleSelectAll" />
        全选/取消
      </label>
      <span class="selection-count">已选 {{ selectedIds.size }} 项</span>
      <button class="button-danger btn-remove-selected" @click="removeSelected" :disabled="!selectedIds.size">
        删除选中
      </button>
    </div>

    <div v-if="!list.length && !localMusicStore.state.scanning" class="local-empty">
      <p>还没有本地歌曲，点击"扫描"添加</p>
    </div>

    <div v-if="localMusicStore.state.scanning" class="local-scanning">
      正在扫描… {{ localMusicStore.state.progress.current }} / {{ localMusicStore.state.progress.total }}
    </div>

    <VirtualSongList
      v-if="list.length"
      :tracks="filteredList"
      :selection-mode="selectionMode"
      :selected-ids="selectedIds"
      :now-playing-id="nowPlayingId"
      @play="playTrack"
      @play-next="(track: LocalTrack) => addToQueue(track, true)"
      @add-to-playlist="addToPlaylist"
      @show-in-folder="showInFolder"
      @show-local-album="showLocalAlbum"
      @show-online-album="showOnlineAlbum"
      @upload-to-cloud="uploadToCloud"
      @show-context-menu="showContextMenu"
      @toggle-select="toggleSelect"
      @toggle-select-all="toggleSelectAll"
      @sort-by="sortBy"
    />

    <LocalContextMenu
      :visible="ctxVisible"
      :x="ctxX"
      :y="ctxY"
      :items="ctxItems"
      @action="handleCtxAction"
      @close="ctxVisible = false"
    />

    <!-- 选择歌单对话框 -->
    <Teleport to="body">
      <div v-if="showPlaylistPicker" class="dialog-overlay" @click.self="cancelPlaylistPicker">
        <div class="dialog-panel">
          <h3 class="dialog-title">选择歌单</h3>
          <div class="playlist-picker-list">
            <button
              v-for="pl in localMusicStore.state.playlists"
              :key="pl.id"
              class="playlist-picker-item"
              @click="confirmPlaylistPicker(pl.id)"
            >
              {{ pl.name }}
              <span class="playlist-picker-count">{{ pl.trackCount || 0 }} 首</span>
            </button>
          </div>
          <div class="dialog-actions">
            <button class="button-surface" @click="cancelPlaylistPicker">取消</button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useLocalMusicStore, type LocalTrack, type SortField } from '../stores/localMusic'
const localMusicStore = useLocalMusicStore()
import { playerStore } from '../stores/player'
import { platform } from '../utils/platform'
import { useLoginModalStore } from '../stores/loginModal'
const loginModalStore = useLoginModalStore()
import { useUserStore } from '../stores/user'
const userStore = useUserStore()
import { importToCloud } from '../api/music'
import LocalContextMenu, { type ContextMenuItem } from '../components/LocalContextMenu.vue'
import VirtualSongList from '../components/VirtualSongList.vue'
import DropdownSelect from '../components/ui/DropdownSelect.vue'
import { searchMusic } from '../api/music'

const nowPlayingId = computed(() => playerStore.currentTrack?.id ?? null)

// ── 多选模式 ──
const selectionMode = ref(false)
const selectedIds = ref(new Set<string>())

const allSelected = computed(() =>
  filteredList.value.length > 0 && selectedIds.value.size === filteredList.value.length
)

function toggleSelectionMode() {
  selectionMode.value = !selectionMode.value
  if (!selectionMode.value) selectedIds.value.clear()
}

function toggleSelect(trackId: string) {
  const s = selectedIds.value
  if (s.has(trackId)) s.delete(trackId)
  else s.add(trackId)
  // trigger reactivity by replacing the Set ref
  selectedIds.value = new Set(s)
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value.clear()
  } else {
    selectedIds.value = new Set(filteredList.value.map(t => t.id))
  }
}

async function removeSelected() {
  const count = selectedIds.value.size
  if (!count) return
  if (!confirm(`确定删除选中的 ${count} 首歌曲？此操作不可撤销。`)) return

  // Collect paths from the current filtered list
  const paths = filteredList.value
    .filter(t => selectedIds.value.has(t.id))
    .map(t => t.path)

  if (!paths.length) return

  try {
    if (platform.localApi) {
      await platform.localApi.removeTracks(paths)
    }
  } catch (e) {
    console.error('[localSongs] remove tracks failed:', e)
  }

  selectedIds.value.clear()
  selectionMode.value = false
  await localMusicStore.loadTracks()
}

const activeDirFilter = ref('')

const labelToField: Record<string, SortField> = {
  '标题': 'title',
  '歌手': 'artist',
  '专辑': 'album',
  '时长': 'duration',
}

const currentSortLabel = computed(() => {
  const map: Record<SortField, string> = { title: '标题', artist: '歌手', album: '专辑', duration: '时长' }
  return map[localMusicStore.state.sortField]
})

function onSortSelect(label: string) {
  const field = labelToField[label]
  if (field) localMusicStore.toggleSort(field)
}

const dirLabels = computed(() => localMusicStore.state.directories.map(d => getDirLabel(d)))

const activeDirLabel = computed(() => {
  if (!activeDirFilter.value) return '所有目录'
  return getDirLabel(activeDirFilter.value)
})

function onDirSelect(label: string) {
  if (label === '所有目录') {
    activeDirFilter.value = ''
  } else {
    const idx = dirLabels.value.indexOf(label)
    if (idx >= 0) activeDirFilter.value = localMusicStore.state.directories[idx]
  }
}

const list = computed(() => {
  const tracks = localMusicStore.filteredTracks
  console.log('[LocalSongsPage] filteredTracks count=', tracks.length, 'total in store=', localMusicStore.state.tracks.length, 'directories=', localMusicStore.state.directories.length)
  return tracks
})

// 结合搜索关键词 + 目录过滤
const filteredList = computed(() => {
  let result = list.value
  if (activeDirFilter.value) {
    const prefix = activeDirFilter.value
    result = result.filter(t => t.path.startsWith(prefix))
  }
  return result
})

onMounted(async () => {
  if (!localMusicStore.hasLocalSupport) return
  if (!localMusicStore.state.tracks.length) {
    await localMusicStore.loadTracks()
  }
  // 如果数据库为空但存了目录，自动触发扫描
  if (!localMusicStore.state.tracks.length && localMusicStore.state.directories.length && !localMusicStore.state.scanning) {
    console.log('[LocalSongsPage] 数据库为空，自动扫描', localMusicStore.state.directories.length, '个目录')
    localMusicStore.scanAll()
  }
})

// 目录标签：提取最后一级目录名
function getDirLabel(dirPath: string): string {
  const parts = dirPath.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || dirPath
}

// ── 右键菜单状态 ──
const ctxVisible = ref(false)
const ctxX = ref(0)
const ctxY = ref(0)
const ctxTrack = ref<LocalTrack | null>(null)
const ctxIndex = ref(-1)

const ctxItems = computed<ContextMenuItem[]>(() => {
  const track = ctxTrack.value
  if (!track) return []
  return [
    { key: 'play', label: '播放', icon: '▶' },
    { key: 'play-next', label: '下一首播放', icon: '⏭' },
    { key: 'add-to-queue', label: '添加到队列', icon: '➕' },
    { key: 'add-to-playlist', label: '添加到歌单', icon: '📋' },
    { key: 'show-in-folder', label: '定位到目录', icon: '📁' },
  ]
})

function showContextMenu(e: MouseEvent, track: LocalTrack, index: number) {
  ctxTrack.value = track
  ctxIndex.value = index
  ctxX.value = e.clientX
  ctxY.value = e.clientY
  ctxVisible.value = true
}

function handleCtxAction(key: string) {
  const track = ctxTrack.value
  if (!track) return
  if (key === 'play') {
    playTrack(track, ctxIndex.value)
  } else if (key === 'play-next') {
    addToQueue(track, true)
  } else if (key === 'add-to-queue') {
    addToQueue(track, false)
  } else if (key === 'add-to-playlist') {
    addToPlaylist(track)
  } else if (key === 'show-in-folder') {
    showInFolder(track)
  }
}

/** 将 track 追加到播放队列（next=true 时插入到当前播放之后） */
function addToQueue(track: LocalTrack, playNext: boolean) {
  const song: any = {
    id: track.id, name: track.title,
    ar: [{ name: track.artist }],
    al: { name: track.album, picUrl: track.coverUrl },
    source: 'local', path: track.path,
  }
  if (playNext) {
    const idx = playerStore.currentIndex + 1
    playerStore.playlist.splice(idx, 0, song)
    loginModalStore.showGlobalToast('已加入播放队列', 'success', 3000)
  } else {
    playerStore.appendToQueue([song])
  }
}

/** 添加到歌单 —— 打开选择歌单对话框 */
const showPlaylistPicker = ref(false)
const pendingTrackForPlaylist = ref<LocalTrack | null>(null)

async function addToPlaylist(track: LocalTrack) {
  // 确保歌单列表已加载
  if (!localMusicStore.state.playlists.length) {
    await localMusicStore.loadPlaylists()
  }
  if (!localMusicStore.state.playlists.length) {
    const create = confirm('还没有本地歌单，是否创建一个？')
    if (!create) return
    const pl = await localMusicStore.createPlaylist('新歌单')
    if (pl) {
      await localMusicStore.addTrackToPlaylist(pl.id, track.id)
      loginModalStore.showGlobalToast('已添加到歌单', 'success', 3000)
    }
    return
  }
  pendingTrackForPlaylist.value = track
  showPlaylistPicker.value = true
}

async function confirmPlaylistPicker(playlistId: string) {
  const track = pendingTrackForPlaylist.value
  if (!track) return
  showPlaylistPicker.value = false
  pendingTrackForPlaylist.value = null
  await localMusicStore.addTrackToPlaylist(playlistId, track.id)
  loginModalStore.showGlobalToast('已添加到歌单', 'success', 3000)
}

function cancelPlaylistPicker() {
  showPlaylistPicker.value = false
  pendingTrackForPlaylist.value = null
}

/** 定位到目录：将绝对路径转换为树路径，展开祖先节点，记录高亮 track，切换到目录标签页 */
function showInFolder(track: LocalTrack) {
  const treePath = localMusicStore.getTreePath(track.path)
  if (!treePath) return
  localMusicStore.expandFolderAncestors(treePath)
  localMusicStore.state.selectedFolderPath = treePath
  localMusicStore.state.locatedTrackId = track.id
  localMusicStore.state.activeView = 'folders'
  window.dispatchEvent(new CustomEvent('local-navigate', { detail: { page: 'local-music' } }))
}

/** 查看本地专辑：切换到专辑标签页，选中该专辑并高亮当前歌曲 */
function showLocalAlbum(track: LocalTrack) {
  localMusicStore.state.selectedAlbum = track.album
  localMusicStore.state.locatedTrackId = track.id
  localMusicStore.state.activeView = 'albums'
  window.dispatchEvent(new CustomEvent('local-navigate', { detail: { page: 'local-music' } }))
}

/** 查看在线专辑：先搜歌曲名+歌手找匹配歌曲，取其专辑 ID；失败则回退搜专辑名 */
async function showOnlineAlbum(track: LocalTrack) {
  try {
    // 阶段 1：按歌曲名+歌手搜，匹配到的歌曲自带 album.id
    const songKw = [track.title, track.artist].filter(Boolean).join(' ')
    const songRes = await searchMusic(songKw, { type: 1, limit: 3 })
    const song = songRes?.result?.songs?.[0]
    let albumId = song?.al?.id || song?.album?.id

    // 阶段 2：歌曲匹配失败，回退按专辑名+歌手搜
    if (!albumId) {
      const albumKw = [track.artist, track.album].filter(Boolean).join(' ')
      const albumRes = await searchMusic(albumKw, { type: 10, limit: 1 })
      albumId = albumRes?.result?.albums?.[0]?.id
    }

    if (albumId) {
      window.dispatchEvent(new CustomEvent('open-album-detail', { detail: { albumId } }))
      loginModalStore.showGlobalToast('已跳转到在线专辑，若信息有误请使用搜索查找', 'warning', 4000)
    } else {
      loginModalStore.showGlobalToast('未找到在线专辑', 'warning', 3000)
    }
  } catch {
    loginModalStore.showGlobalToast('搜索专辑失败', 'error', 3000)
  }
}

/** 上传至云盘：读取本地文件信息，通过 API 导入云盘 */
async function uploadToCloud(track: LocalTrack) {
  if (!platform.localApi) return
  if (!userStore.isLogin) { loginModalStore.showLoginModal('none'); return }
  if (userStore.loginMode !== 'cookie' && userStore.loginMode !== 'qr') {
    loginModalStore.showGlobalToast('搜索用户方式登录不支持上传云盘功能，请使用扫码或 Cookie 登录', 'warning', 5000)
    return
  }
  try {
    const info = await platform.localApi.computeFileMd5(track.path)
    if (!info) { loginModalStore.showGlobalToast('无法读取文件信息', 'error'); return }
    const ext = track.path.split('.').pop()?.toLowerCase() || 'mp3'
    const fileType = ext === 'flac' ? 'flac' : 'mp3'
    const bitrate = track.duration > 0 ? Math.round((info.size * 8) / track.duration / 1000) : 128
    const { data } = await importToCloud({
      song: track.title,
      fileType,
      fileSize: info.size,
      bitrate,
      md5: info.md5,
      artist: track.artist || '未知歌手',
      album: track.album || '未知专辑',
      cookie: userStore.loginCookie || undefined,
    })
    if ((data as any)?.body?.code === 200 || (data as any)?.code === 200) {
      loginModalStore.showGlobalToast('已上传至云盘', 'success', 3000)
    } else {
      loginModalStore.showGlobalToast('上传失败，请稍后重试', 'warning', 3000)
    }
  } catch {
    loginModalStore.showGlobalToast('上传至云盘失败', 'error', 3000)
  }
}

function sortBy(field: SortField) {
  localMusicStore.toggleSort(field)
}

function handleScan() {
  if (!localMusicStore.state.directories.length) {
    localMusicStore.addDirectory()
  } else {
    localMusicStore.scanAll()
  }
}

function playTrack(track: LocalTrack, index: number) {
  const playlist = filteredList.value.map(t => ({
    id: t.id,
    name: t.title,
    ar: [{ name: t.artist }],
    al: { name: t.album, picUrl: t.coverUrl },
    source: 'local' as const,
    path: t.path,
  }))
  playerStore.setPlaylist(playlist as any, index)
  playerStore.playByIndex(index)
}

function handlePlayAll() {
  if (!filteredList.value.length) return
  playTrack(filteredList.value[0], 0)
}
</script>

<style scoped>
.local-page { display: grid; gap: var(--space-4); }
.local-page-actions { display: flex; gap: var(--space-2); align-items: center; position: relative; }
.local-page-actions .button-surface {
  height: 34px;
  padding: 0 var(--space-3);
  font-size: var(--text-label-sm);
  border-radius: var(--radius-sm);
}
.local-search { flex: 1; max-width: 320px; height: 38px; }
.local-search:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent) inset, var(--glass-highlight) !important;
}
.local-empty { text-align: center; padding: var(--space-8); color: var(--text-soft); }
.local-scanning { padding: var(--space-3); background: var(--accent-soft); border-radius: var(--radius-sm); color: var(--accent); font-size: var(--text-label-sm); }

/* 选择模式操作栏 */
.selection-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--accent-soft);
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  border-radius: var(--radius-sm);
  font-size: var(--text-label-sm);
  color: var(--text-main);
}
.selection-all {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  cursor: pointer;
  user-select: none;
}
.selection-all input[type="checkbox"] {
  accent-color: var(--accent);
  width: 14px; height: 14px;
  cursor: pointer;
}
.selection-count {
  color: var(--text-sub);
  flex: 1;
}
.btn-remove-selected {
  flex-shrink: 0;
}
.button-surface.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
</style>

<!-- 非 scoped 样式：对话框遮罩 -->
<style>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.dialog-panel {
  background: var(--bg-surface, #fff);
  border: 1px solid var(--border, #ddd);
  border-radius: var(--radius-md, 12px);
  padding: var(--space-5, 20px);
  min-width: 320px;
  max-width: 420px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.dialog-title {
  margin: 0 0 var(--space-3);
  font-size: var(--text-headline-md);
  font-weight: 600;
  color: var(--text-main);
}
.playlist-picker-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
  max-height: 300px;
  overflow-y: auto;
}
.playlist-picker-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg-muted) 70%, var(--border));
  color: var(--text-main);
  font-size: var(--text-body-sm);
  cursor: pointer;
  transition: background 0.12s;
}
.playlist-picker-item:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
}
.playlist-picker-count {
  font-size: var(--text-label-xs);
  color: var(--text-soft);
}
.dialog-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}
</style>