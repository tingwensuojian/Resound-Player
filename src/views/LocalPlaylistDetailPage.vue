<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="playlist-detail-page">
    <div class="playlist-detail-back">
      <button class="back-btn" @click="goBack">← 返回歌单</button>
    </div>

    <DetailStickyHeroHeader
      :loading="false"
      :ready="!!localMusicStore.state.activePlaylistDetail"
    >
      <template #media>
        <template v-if="hasCustomCover">
          <HeroCoverMedia :src="coverUrl" :alt="playlistName" />
        </template>
        <template v-else>
          <div class="local-detail-cover-mosaic" :class="'mosaic-' + Math.min(coverUrls.length, 6)">
            <img
              v-for="(url, i) in coverUrls.slice(0, 6)"
              :key="i"
              :src="url"
              class="mosaic-cell"
              alt=""
              loading="lazy"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
          </div>
        </template>
      </template>
      <template #title>
        <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="title">{{ playlistName }}</AnimatedAppear>
      </template>
      <template #meta>
        <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="sub-row">
          <AnimatedAppear tag="p" variant="text" rhythm="body" class-name="sub">
            {{ tracks.length }} 首歌曲
          </AnimatedAppear>
        </AnimatedAppear>
      </template>
      <template #actions>
        <AnimatedAppear tag="button" variant="control" rhythm="actions" class-name="add-to-queue" @click="handleRename">重命名</AnimatedAppear>
        <AnimatedAppear tag="button" variant="control" rhythm="actions" class-name="add-to-queue" @click="handleAddTrack">从曲库添加</AnimatedAppear>
        <AnimatedAppear tag="button" variant="control" rhythm="actions" class-name="play-all" @click="handlePlayAll">播放全部</AnimatedAppear>
      </template>
    </DetailStickyHeroHeader>

    <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="playlist-detail-body">
      <div v-if="!tracks.length" class="local-empty">
        <p>歌单为空，点击"从曲库添加"添加歌曲</p>
      </div>

      <div v-if="tracks.length" class="local-song-list">
        <div
          v-for="(track, idx) in tracks"
          :key="track.id"
          class="local-song-row"
          :class="{ playing: nowPlayingId === track.id }"
          @mouseenter="hoveredIdx = idx"
          @mouseleave="hoveredIdx = -1"
          @dblclick="playTrack(track, idx)"
          @contextmenu.prevent="showContextMenu($event, track, idx)"
        >
          <button class="local-song-pp" @click.stop="handlePPClick(track, idx)" :title="ppTitle(track, idx)">
            <span v-if="!isTrackPlaying(track) && hoveredIdx !== idx" class="local-song-idx-inner">{{ idx + 1 }}</span>
            <svg v-else-if="(!isTrackPlaying(track) || isTrackPaused(track)) && hoveredIdx === idx" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="local-song-pp__icon"><path d="M9 7.2v9.6c0 .7.8 1.1 1.4.7l8-4.8c.6-.4.6-1.3 0-1.7l-8-4.8c-.6-.4-1.4 0-1.4.7z" fill="currentColor"/></svg>
            <svg v-else-if="isTrackPlaying(track) && !isTrackPaused(track) && hoveredIdx === idx" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="local-song-pp__icon"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>
            <span v-else class="local-song-pp__wave" aria-hidden="true"><i></i><i></i><i></i></span>
          </button>
          <span class="local-song-cover">
            <img v-if="track.coverUrl" :src="track.coverUrl" class="local-cover-img" alt="" loading="lazy" />
            <span v-else class="local-cover-placeholder"></span>
          </span>
          <div class="local-song-meta">
            <span class="local-song-title" :title="track.title">
              <TooltipWrapper v-if="track.hasLyrics" text="内嵌歌词">
                <span class="local-lyric-icon">♪</span>
              </TooltipWrapper>
              {{ track.title }}
            </span>
            <span class="local-song-artist" :title="track.artist">{{ track.artist }}</span>
          </div>
          <LocalSongActions
            @play="playTrack(track, idx)"
            @play-next="addToQueue(track)"
            @add-to-playlist="addToPlaylist(track)"
            @show-in-folder="showInFolder(track)"
            @show-local-album="showLocalAlbum(track)"
            @show-online-album="showOnlineAlbum(track)"
            @upload-to-cloud="uploadToCloud(track)"
          />
        </div>
      </div>
    </AnimatedAppear>

    <LocalContextMenu
      :visible="ctxVisible"
      :x="ctxX"
      :y="ctxY"
      :items="ctxItems"
      @action="handleCtxAction"
      @close="ctxVisible = false"
    />

    <PromptModal
      :open="showRenameModal"
      title="重命名歌单"
      placeholder="请输入新名称"
      :default-value="localMusicStore.state.activePlaylistDetail?.name || ''"
      @confirm="onRenameConfirm"
      @cancel="showRenameModal = false"
      @update:open="showRenameModal = $event"
    />
    <PromptModal
      :open="showAddTrackModal"
      title="从曲库添加"
      placeholder="搜索歌名、歌手或专辑关键词"
      @confirm="onAddTrackConfirm"
      @cancel="showAddTrackModal = false"
      @update:open="showAddTrackModal = $event"
    />
  </AnimatedAppear>

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
            <span class="playlist-picker-count">{{ pl.tracks?.length || 0 }} 首</span>
          </button>
        </div>
        <div class="dialog-actions">
          <button class="button-surface" @click="cancelPlaylistPicker">取消</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocalMusicStore, type LocalTrack } from '../stores/localMusic'
const localMusicStore = useLocalMusicStore()
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore()
import { platform } from '../utils/platform'
import { useDetailStickyState } from '../composables/useDetailStickyState'
import AnimatedAppear from '../components/AnimatedAppear.vue'
import DetailStickyHeroHeader from '../components/DetailStickyHeroHeader.vue'
import HeroCoverMedia from '../components/HeroCoverMedia.vue'
import LocalContextMenu, { type ContextMenuItem } from '../components/LocalContextMenu.vue'
import PromptModal from '../components/ui/PromptModal.vue'
import LocalSongActions from '../components/ui/LocalSongActions.vue'
import TooltipWrapper from '../components/ui/TooltipWrapper.vue'
import { useLoginModalStore } from '../stores/loginModal'
const loginModalStore = useLoginModalStore()
import { useUserStore } from '../stores/user'
const userStore = useUserStore()
import { searchMusic, importToCloud } from '../api/music'

// ── Data ──
const nowPlayingId = computed(() => playerStore.state.currentTrack?.id ?? null)
const tracks = computed(() => localMusicStore.state.activePlaylistDetail?.tracks || [])

const playlistName = computed(() => localMusicStore.state.activePlaylistDetail?.name || '本地歌单')

const coverUrl = computed(() => {
  const pl = localMusicStore.state.activePlaylistDetail
  if (!pl) return ''
  return pl.customCoverUrl?.trim()
    || pl.coverPath?.trim()
    || (pl.tracks?.[0]?.coverUrl?.trim() ?? '')
})

// 封面马赛克：最多取前 6 首有封面的歌曲
const coverUrls = computed(() => {
  const pl = localMusicStore.state.activePlaylistDetail
  if (!pl) return []
  const urls: string[] = []
  for (const t of (pl.tracks || [])) {
    if (t.coverUrl?.trim() && !urls.includes(t.coverUrl)) {
      urls.push(t.coverUrl.trim())
      if (urls.length >= 6) break
    }
  }
  return urls
})

const hasCustomCover = computed(() =>
  !!localMusicStore.state.activePlaylistDetail?.customCoverUrl?.trim()
)

const error = ref('')

// ── 吸顶 + blur 背景 ──
const { refresh } = useDetailStickyState(coverUrl)

// ── Modal state ──
const showRenameModal = ref(false)
const showAddTrackModal = ref(false)

// ── 行 hover / 播放暂停音浪 ──
const hoveredIdx = ref(-1)

function isTrackPlaying(track: LocalTrack) {
  return String(nowPlayingId.value) === String(track.id)
}

function isTrackPaused(track: LocalTrack) {
  return isTrackPlaying(track) && !playerStore.state.isPlaying
}

function ppTitle(track: LocalTrack, idx: number) {
  if (!isTrackPlaying(track) && hoveredIdx.value !== idx) return `第 ${idx + 1} 首`
  if ((!isTrackPlaying(track) || isTrackPaused(track)) && hoveredIdx.value === idx) return '播放'
  if (isTrackPlaying(track) && !isTrackPaused(track) && hoveredIdx.value === idx) return '暂停'
  return '正在播放'
}

function handlePPClick(track: LocalTrack, idx: number) {
  if (nowPlayingId.value === track.id) {
    playerStore.togglePlay()
  } else {
    playTrack(track, idx)
  }
}

// ── 右键菜单 ──
const ctxVisible = ref(false)
const ctxX = ref(0)
const ctxY = ref(0)
const ctxTrack = ref<LocalTrack | null>(null)

const ctxItems = computed<ContextMenuItem[]>(() => {
  const track = ctxTrack.value
  if (!track) return []
  return [
    { key: 'remove', label: '从歌单移除', icon: '✕' },
  ]
})

function showContextMenu(e: MouseEvent, track: LocalTrack, _index: number) {
  ctxTrack.value = track
  ctxX.value = e.clientX
  ctxY.value = e.clientY
  ctxVisible.value = true
}

function handleCtxAction(key: string) {
  const track = ctxTrack.value
  if (!track) return
  if (key === 'remove') {
    handleRemoveTrack(track)
  }
}

// ── 业务逻辑 ──

function goBack() {
  localMusicStore.state.activeView = 'playlists'
  localMusicStore.state.activePlaylistDetail = null
  localMusicStore.state.activePlaylistId = ''
  window.dispatchEvent(new CustomEvent('local-navigate', { detail: { page: 'local-music' } }))
}

function handleRename() {
  showRenameModal.value = true
}

async function onRenameConfirm(name: string) {
  const pl = localMusicStore.state.activePlaylistDetail
  if (!pl) return
  await localMusicStore.renamePlaylist(pl.id, name.trim())
}

function handleAddTrack() {
  showAddTrackModal.value = true
}

async function onAddTrackConfirm(kw: string) {
  const pl = localMusicStore.state.activePlaylistDetail
  if (!pl) return
  if (!platform.localApi) return

  try {
    const results = await platform.localApi.search(kw.trim())
    if (!results?.length) {
      alert('未找到匹配的歌曲')
      return
    }
    const newTracks = results.filter((t: any) =>
      !tracks.value.some((pt: any) => pt.id === t.id)
    )
    if (!newTracks.length) {
      alert('搜索结果已全部在歌单中')
      return
    }
    if (!confirm(`找到 ${newTracks.length} 首未添加的歌曲，确定全部加入歌单？`)) return

    for (const t of newTracks) {
      await localMusicStore.addTrackToPlaylist(pl.id, t)
    }
    alert(`已添加 ${newTracks.length} 首歌曲到歌单`)
  } catch (e) {
    console.error('[localPlaylist] add track error:', e)
  }
}

async function handleRemoveTrack(track: LocalTrack) {
  const pl = localMusicStore.state.activePlaylistDetail
  if (!pl || !track) return
  if (!confirm(`确定从歌单移除「${track.title}」？`)) return
  await localMusicStore.removeTrackFromPlaylist(pl.id, track.id)
}

function playTrack(track: any, index: number) {
  const playlist = tracks.value.map((t: any) => ({
    id: t.id, name: t.title,
    ar: [{ name: t.artist }],
    al: { name: t.album, picUrl: t.coverUrl },
    source: 'local' as const, path: t.path,
    duration: t.duration,
  }))
  playerStore.setPlaylist(playlist as any, index)
  playerStore.playByIndex(Number(index))
}

function handlePlayAll() {
  if (!tracks.value.length) return
  playTrack(tracks.value[0], 0)
}

/** 下一首播放：插入到当前播放之后 */
function addToQueue(track: LocalTrack) {
  const song = {
    id: track.id, name: track.title,
    ar: [{ name: track.artist }],
    al: { name: track.album, picUrl: track.coverUrl },
    source: 'local' as const, path: track.path,
    duration: track.duration,
  }
  playerStore.insertNext(song)
  loginModalStore.showGlobalToast('已加入播放队列', 'success', 3000)
}

/** 添加到歌单 */
const showPlaylistPicker = ref(false)
const pendingTrackForPlaylist = ref<LocalTrack | null>(null)

async function addToPlaylist(track: LocalTrack) {
  if (!localMusicStore.state.playlists.length) {
    await localMusicStore.loadPlaylists()
  }
  if (!localMusicStore.state.playlists.length) {
    const create = confirm('还没有本地歌单，是否创建一个？')
    if (!create) return
    const pl = await localMusicStore.createPlaylist('新歌单')
    if (pl) {
      await localMusicStore.addTrackToPlaylist(pl.id, track)
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
  try {
    await localMusicStore.addTrackToPlaylist(playlistId, track)
    loginModalStore.showGlobalToast('已添加到歌单', 'success', 3000)
  } catch {
    loginModalStore.showGlobalToast('添加失败，请重试', 'error', 3000)
  }
}

function cancelPlaylistPicker() {
  showPlaylistPicker.value = false
  pendingTrackForPlaylist.value = null
}

/** 定位到目录 */
function showInFolder(track: LocalTrack) {
  if (!track.path) {
    loginModalStore.showGlobalToast('未找到对应目录，文件可能已被移动或删除', 'warning', 3000)
    return
  }
  const parentDir = track.path.replace(/\\/g, '/').replace(/\/[^/]*$/, '')
  localMusicStore.expandFolderAncestors(parentDir)
  localMusicStore.state.selectedFolderPath = parentDir
  localMusicStore.state.locatedTrackId = track.id
  localMusicStore.state.activeView = 'folders'
  window.dispatchEvent(new CustomEvent('local-navigate', { detail: { page: 'local-music' } }))
}

/** 查看本地专辑 */
function showLocalAlbum(track: LocalTrack) {
  localMusicStore.state.selectedAlbum = track.album
  localMusicStore.state.locatedTrackId = track.id
  localMusicStore.state.activeView = 'albums'
  window.dispatchEvent(new CustomEvent('local-navigate', { detail: { page: 'local-music' } }))
}

/** 查看在线专辑 */
async function showOnlineAlbum(track: LocalTrack) {
  try {
    const songKw = [track.title, track.artist].filter(Boolean).join(' ')
    const songRes = await searchMusic(songKw, { type: 1, limit: 3 })
    const song = songRes?.result?.songs?.[0]
    let albumId = song?.al?.id || song?.album?.id
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

/** 上传至云盘 */
async function uploadToCloud(track: LocalTrack) {
  if (!platform.localApi) return
  if (!userStore.state.isLogin) { loginModalStore.showLoginModal('none'); return }
  if (userStore.state.loginMode !== 'cookie' && userStore.state.loginMode !== 'qr') {
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
      cookie: userStore.state.loginCookie || undefined,
    })
    if ((data as any)?.duplicate === true) {
      loginModalStore.showGlobalToast('文件已在云盘', 'info', 3000)
    } else if ((data as any)?.body?.code === 200 || (data as any)?.code === 200) {
      loginModalStore.showGlobalToast('已上传至云盘', 'success', 3000)
    } else {
      loginModalStore.showGlobalToast('上传失败，请稍后重试', 'warning', 3000)
    }
  } catch {
    loginModalStore.showGlobalToast('上传至云盘失败', 'error', 3000)
  }
}
</script>

<style scoped>
@import '../styles/detail-page.css';

/* 确保 .playlist-detail-page 是滚动容器，即使 @import 加载失败 */
.playlist-detail-page {
  overflow: clip auto !important;
  overflow-anchor: none;
}

.local-empty {
  text-align: center;
  padding: var(--space-8);
  color: var(--text-soft);
}

/* 歌曲行 — 匹配 .song-item 风格 */
.local-song-list {
  margin: 0;
  padding: var(--space-2);
  border-top: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--bg-surface) 72%, transparent);
}
.local-song-row {
  position: relative;
  display: grid;
  grid-template-columns: 40px 52px 1fr;
  align-items: center;
  gap: var(--space-3);
  padding: 8px 12px;
  height: 68px;
  box-sizing: border-box;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
  border-radius: 16px;
  overflow: visible;
  cursor: default;
  transition: background 0.15s;
}
.local-song-row:hover { background: var(--bg-muted); }
.local-song-row.playing { background: var(--accent-soft); }
.local-song-row:last-child { border-bottom: 0; }

/* PP 按钮 */
.local-song-pp {
  background: none; border: none; padding: 0; cursor: pointer;
  width: 40px; height: 40px;
  display: inline-flex; align-items: center; justify-content: center;
  color: var(--text-soft); flex-shrink: 0;
  border-radius: 50%;
  transition: background 0.15s, color 0.15s;
}
.local-song-row:hover .local-song-pp { color: var(--accent); }
.local-song-idx-inner { font-size: var(--text-label-sm); color: var(--text-soft); }
.local-song-pp__icon { width: 18px; height: 18px; display: block; }
.local-song-pp__wave {
  width: 18px; height: 18px;
  display: inline-flex; align-items: flex-end; justify-content: center; gap: 2px;
  color: var(--accent);
}
.local-song-pp__wave i {
  width: 3px; border-radius: 999px; background: currentColor;
  transform-origin: center bottom;
  animation: local-song-pp-wave 0.9s ease-in-out infinite;
  will-change: transform, opacity;
}
.local-song-pp__wave i:nth-child(1) { height: 14px; animation-delay: 0s; }
.local-song-pp__wave i:nth-child(2) { height: 18px; animation-delay: 0.15s; }
.local-song-pp__wave i:nth-child(3) { height: 11px; animation-delay: 0.3s; }
@keyframes local-song-pp-wave {
  0%, 100% { transform: scaleY(0.4); opacity: 0.55; }
  50% { transform: scaleY(1); opacity: 1; }
}

/* 封面 52px */
.local-song-cover {
  display: flex; align-items: center; justify-content: center;
}
.local-cover-img { width: 52px; height: 52px; border-radius: 10px; object-fit: cover; }
.local-cover-placeholder {
  display: block; width: 52px; height: 52px; border-radius: 10px; background: var(--bg-muted);
}

/* meta — 标题 + 歌手上下布局 */
.local-song-meta {
  display: flex; flex-direction: column; gap: 2px;
  min-width: 0; overflow: hidden;
}
.local-song-title {
  color: var(--text-main); font-weight: 600;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: flex; align-items: center; gap: 4px;
}
.local-song-row.playing .local-song-title { color: var(--accent); }
.local-lyric-icon { position: relative; display: inline-flex; align-items: center; font-size: 13px; color: var(--accent); flex-shrink: 0; }
.local-song-artist {
  color: var(--text-sub); font-size: var(--text-label-sm);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* 封面马赛克（无自定义封面时使用） */
.local-detail-cover-mosaic {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 18px;
  background: var(--bg-muted);
  display: grid;
  gap: 2px;
  overflow: hidden;
}
.local-detail-cover-mosaic.mosaic-1 { grid-template: 1fr / 1fr; }
.local-detail-cover-mosaic.mosaic-2 { grid-template: 1fr 1fr / 1fr; }
.local-detail-cover-mosaic.mosaic-3,
.local-detail-cover-mosaic.mosaic-4 { grid-template: 1fr 1fr / 1fr 1fr; }
.local-detail-cover-mosaic.mosaic-5,
.local-detail-cover-mosaic.mosaic-6 { grid-template: 1fr 1fr 1fr / 1fr 1fr; }
.local-detail-cover-mosaic .mosaic-cell {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>

<style>
/* 选择歌单对话框 — 与 LocalSongsPage 共用样式 */
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
