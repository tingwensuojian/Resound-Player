<template>
  <section class="local-page">
    <!-- 页面标题 -->
    <div class="local-page-header">
      <h2 class="local-page-title">本地音乐</h2>
    </div>

    <!-- 统计栏 + 标签栏（同一行左右布局） -->
    <div class="top-row">
      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-value">{{ stats?.totalTracks || 0 }}</span>
          <span class="stat-label">歌曲</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ stats?.totalArtists || 0 }}</span>
          <span class="stat-label">歌手</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ stats?.totalAlbums || 0 }}</span>
          <span class="stat-label">专辑</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ formatDuration(stats?.totalDuration || 0) }}</span>
          <span class="stat-label">总时长</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ formatSize(stats?.totalSize || 0) }}</span>
          <span class="stat-label">总大小</span>
        </div>
      </div>

      <header class="hub-tabs-wrap">
        <nav class="hub-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="hub-tab"
            :class="{ active: activeView === tab.key }"
            @click="switchTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </nav>
      </header>
    </div>

    <div class="local-split">
      <!-- 左栏：仅歌手/专辑/目录标签显示索引列表 -->
      <aside v-if="activeView === 'artists' || activeView === 'albums' || activeView === 'folders'" class="local-split-left local-hub-left">
        <!-- 歌手列表 -->
        <template v-if="activeView === 'artists'">
          <div class="left-section-title">歌手 ({{ localMusicStore.artistList.length }})</div>
          <div class="left-index-list">
            <div
              v-for="artist in localMusicStore.artistList"
              :key="artist.name"
              class="left-index-item"
              :class="{ active: localMusicStore.state.selectedArtist === artist.name }"
              @click="localMusicStore.state.selectedArtist = artist.name"
            >
              <span class="left-index-name">{{ artist.name }}</span>
              <span class="left-index-count">{{ artist.count }}</span>
            </div>
            <div v-if="!localMusicStore.artistList.length" class="left-empty">暂无数据</div>
          </div>
        </template>

        <!-- 专辑列表 -->
        <template v-else-if="activeView === 'albums'">
          <div class="left-section-title">专辑 ({{ localMusicStore.albumList.length }})</div>
          <div class="left-index-list">
            <div
              v-for="album in localMusicStore.albumList"
              :key="album.name"
              class="left-index-item"
              :class="{ active: localMusicStore.state.selectedAlbum === album.name }"
              @click="localMusicStore.state.selectedAlbum = album.name"
            >
              <span class="left-index-name">{{ album.name }}</span>
              <span class="left-index-count">{{ album.count }}</span>
            </div>
            <div v-if="!localMusicStore.albumList.length" class="left-empty">暂无数据</div>
          </div>
        </template>

        <!-- 目录树 -->
        <template v-else>
          <div class="left-section-title">目录</div>
          <div
            class="left-index-list folder-tree"
            data-allow-dblclick-gesture="true"
            @click.capture="handleFolderTreeClick"
            @contextmenu.capture.prevent="handleFolderTreeContextMenu"
          >
            <FolderTreeNode
              v-for="(node, idx) in localMusicStore.folderTree"
              :key="node.path"
              :node="node"
              :selected="localMusicStore.state.selectedFolderPath"
              :depth="0"
              :is-last="idx === localMusicStore.folderTree.length - 1"
              @select="(path) => localMusicStore.setSelectedFolder(path)"
              @toggle="(path) => localMusicStore.toggleFolderCollapse(path)"
            />
            <div v-if="!localMusicStore.folderTree.length" class="left-empty">暂无数据</div>
          </div>
        </template>
      </aside>

      <!-- 右栏：内容区 -->
      <div class="local-hub-right">
        <div class="hub-content">
          <KeepAlive>
            <LocalStatsPage v-if="activeView === 'stats'" />
            <LocalSongsPage v-else-if="activeView === 'songs'" />
            <LocalArtistsPage v-else-if="activeView === 'artists'" />
            <LocalAlbumsPage v-else-if="activeView === 'albums'" />
            <LocalFoldersPage v-else-if="activeView === 'folders'" />
            <LocalPlaylistsPage v-else-if="activeView === 'playlists'" />
            <LocalPlaylistDetailPage v-else-if="activeView === 'playlist-detail'" />
          </KeepAlive>
        </div>
      </div>
    </div>

    <LocalContextMenu
      :visible="folderMenu.visible"
      :x="folderMenu.x"
      :y="folderMenu.y"
      :items="folderMenuItems"
      @action="handleFolderMenuAction"
      @close="closeFolderMenu"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useLocalMusicStore, type LocalView } from '../stores/localMusic'
const localMusicStore = useLocalMusicStore()
import LocalStatsPage from '../views/LocalStatsPage.vue'
import LocalSongsPage from '../views/LocalSongsPage.vue'
import LocalArtistsPage from '../views/LocalArtistsPage.vue'
import LocalAlbumsPage from '../views/LocalAlbumsPage.vue'
import LocalFoldersPage from '../views/LocalFoldersPage.vue'
import LocalPlaylistsPage from '../views/LocalPlaylistsPage.vue'
import LocalPlaylistDetailPage from '../views/LocalPlaylistDetailPage.vue'
import FolderTreeNode from '../views/FolderTreeNode.vue'
import LocalContextMenu, { type ContextMenuItem } from './LocalContextMenu.vue'
import { ref, onMounted, watch, KeepAlive } from 'vue'
import { platform } from '../utils/platform'

const tabs = [
  { key: 'stats' as LocalView, label: '概览' },
  { key: 'songs' as LocalView, label: '歌曲' },
  { key: 'artists' as LocalView, label: '歌手' },
  { key: 'albums' as LocalView, label: '专辑' },
  { key: 'folders' as LocalView, label: '目录' },
  { key: 'playlists' as LocalView, label: '歌单' },
]

const activeView = computed(() => localMusicStore.state.activeView)

const stats = ref<{ totalTracks: number; totalArtists: number; totalAlbums: number; totalDuration: number; totalSize: number } | null>(null)
const folderMenu = ref({ visible: false, x: 0, y: 0, path: '' })
const folderMenuItems: ContextMenuItem[] = [
  { key: 'open-folder', label: '打开文件夹', icon: '📁' },
]

onMounted(async () => {
  if (!platform.localApi) return
  // 从 DB / localStorage 恢复扫描目录
  await localMusicStore.loadDirectories()
  // 先加载歌曲列表，确保所有子页面共享同一份数据
  if (!localMusicStore.state.tracks.length) {
    await localMusicStore.loadTracks()
  }
  // 加载后仍为空且有已保存的目录 → 自动触发扫描
  if (!localMusicStore.state.tracks.length && localMusicStore.state.directories.length && !localMusicStore.state.scanning) {
    console.log('[LocalMusicHub] 数据库为空，自动扫描', localMusicStore.state.directories.length, '个目录')
    localMusicStore.scanAll()
  }
  try {
    stats.value = await platform.localApi.getStats()
  } catch (e) {
    console.error('[localMusicHub] stats load failed:', e)
  }
})

// 曲目变化时重新加载统计数据
watch(() => localMusicStore.state.tracks.length, () => {
  if (!platform.localApi) return
  platform.localApi.getStats().then(s => { stats.value = s }).catch(() => {})
})

// clearAll 后强制刷新概况栏
watch(() => localMusicStore.state._statsRefresh, () => {
  if (!platform.localApi) return
  platform.localApi.getStats().then(s => { stats.value = s }).catch(() => {})
})

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h${m}m`
  return `${m}分钟`
}

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++ }
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function switchTab(key: LocalView) {
  localMusicStore.state.activeView = key
}

function handleFolderTreeClick(event: MouseEvent) {
  if (event.detail < 2) return
  openFolderMenuFromEvent(event)
}

function handleFolderTreeContextMenu(event: MouseEvent) {
  openFolderMenuFromEvent(event)
}

function openFolderMenuFromEvent(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  const nodeEl = target?.closest<HTMLElement>('.folder-node[data-folder-path]')
  const folderPath = nodeEl?.dataset.folderPath || ''
  if (!folderPath) return
  event.preventDefault()
  event.stopPropagation()
  openFolderMenu(event, folderPath)
}

function openFolderMenu(event: MouseEvent, folderPath: string) {
  folderMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    path: folderPath,
  }
}

function closeFolderMenu() {
  folderMenu.value.visible = false
}

async function handleFolderMenuAction(key: string) {
  if (key !== 'open-folder') return
  const folderPath = folderMenu.value.path
  if (!folderPath || !platform.localApi?.openFolder) return
  const result = await platform.localApi.openFolder(folderPath)
  if (!result?.success) {
    console.warn('[localMusic] open folder failed:', result?.error || folderPath)
  }
}
</script>

<style scoped>
.local-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.local-split { display: flex; gap: var(--space-4); flex: 1; min-height: 0; }

/* 页面标题 */
.local-page-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.local-page-title {
  margin: 0;
  font-size: var(--text-headline-lg);
  font-weight: 700;
  color: var(--text-main);
}

/* 顶部行：统计栏 + 标签栏左右并排 */
.top-row {
  display: flex;
  gap: var(--space-3);
  align-items: stretch;
}
.top-row .stats-bar {
  display: flex;
  gap: var(--space-3);
  flex-shrink: 0;
}
.top-row .stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  text-align: center;
  min-width: 68px;
}
.top-row .stat-item .stat-value {
  font-size: var(--text-label-md);
  font-weight: 700;
  color: var(--accent);
  line-height: 1.2;
}
.top-row .stat-item .stat-label {
  font-size: 10px;
  color: var(--text-soft);
}
.top-row .hub-tabs-wrap {
  flex: 1;
  display: flex;
  align-items: center;
}

/* 公共统计栏 */
.stats-bar {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.stat-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  text-align: center;
  min-width: 100px;
  flex: 1;
}
.stat-item .stat-value {
  font-size: var(--text-headline-md);
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
}
.stat-item .stat-label {
  font-size: var(--text-label-sm);
  color: var(--text-soft);
}

/* 左栏 */
.local-hub-left {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
/* 左栏索引列表 */
.left-section-title {
  font-size: var(--text-label-sm);
  font-weight: 600;
  color: var(--text-soft);
  padding: 0 var(--space-2);
  flex-shrink: 0;
}
.left-index-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.left-index-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s;
}
.left-index-item:hover { background: var(--bg-muted); }
.left-index-item.active { background: var(--accent-soft); }
.left-index-item.active .left-index-name { color: var(--accent); font-weight: 600; }
.left-index-name {
  font-size: var(--text-body-sm);
  font-weight: 500;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.left-index-count {
  font-size: var(--text-label-xs);
  color: var(--text-soft);
  flex-shrink: 0;
  margin-left: var(--space-2);
}
.left-empty {
  text-align: center;
  padding: var(--space-4);
  color: var(--text-soft);
  font-size: var(--text-body-sm);
}
.folder-tree {
  padding: 0;
}

/* 右栏 */
.local-hub-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 标签栏 */
.hub-tabs-wrap {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  padding: var(--space-2) var(--space-2);
  overflow: visible;
}
.hub-tabs {
  display: flex;
  gap: var(--space-2);
}
.hub-tab {
  flex: 1;
  height: 34px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-muted);
  color: var(--text-sub);
  cursor: pointer;
  font-size: var(--text-label-sm);
  transition: all 0.12s;
}
.hub-tab:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.hub-tab.active {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

/* 内容区 */
.hub-content {
  flex: 1;
  overflow-y: auto;
}
</style>
