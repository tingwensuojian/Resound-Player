<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="playlist-detail-page">
    <div class="playlist-detail-back">
      <button class="back-btn" @click="goBack">← 返回歌单</button>
    </div>

    <DetailStickyHeroHeader
      :loading="false"
      :ready="!!localMusicStore.activePlaylistDetail"
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
          @dblclick="playTrack(track, idx)"
          @contextmenu.prevent="showContextMenu($event, track, idx)"
        >
          <button class="local-song-pp" @click.stop="handlePPClick(track, idx)" :title="ppTitle(track, idx)">
            <span v-if="!isTrackPlaying(track) && hoveredIdx !== idx" class="local-song-idx-inner">{{ idx + 1 }}</span>
            <svg v-else-if="!isTrackPlaying(track) && hoveredIdx === idx" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="local-song-pp__icon"><path d="M9 7.2v9.6c0 .7.8 1.1 1.4.7l8-4.8c.6-.4.6-1.3 0-1.7l-8-4.8c-.6-.4-1.4 0-1.4.7z" fill="currentColor"/></svg>
            <svg v-else-if="isTrackPlaying(track) && hoveredIdx === idx" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="local-song-pp__icon"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>
            <span v-else class="local-song-pp__wave" aria-hidden="true"><i></i><i></i><i></i></span>
          </button>
          <span class="local-song-cover">
            <img v-if="track.coverUrl" :src="track.coverUrl" class="local-cover-img" alt="" loading="lazy" />
            <span v-else class="local-cover-placeholder"></span>
          </span>
          <div class="local-song-meta">
            <span class="local-song-title" :title="track.title">
              <span v-if="track.hasLyrics" class="local-lyric-icon" title="有歌词">♪</span>
              {{ track.title }}
            </span>
            <span class="local-song-artist" :title="track.artist">{{ track.artist }}</span>
          </div>
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
      :default-value="localMusicStore.activePlaylistDetail?.name || ''"
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
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { localMusicStore, type LocalTrack } from '../stores/localMusic'
import { playerStore } from '../stores/player'
import { platform } from '../utils/platform'
import { useDetailStickyState } from '../composables/useDetailStickyState'
import AnimatedAppear from '../components/AnimatedAppear.vue'
import DetailStickyHeroHeader from '../components/DetailStickyHeroHeader.vue'
import HeroCoverMedia from '../components/HeroCoverMedia.vue'
import LocalContextMenu, { type ContextMenuItem } from '../components/LocalContextMenu.vue'
import PromptModal from '../components/ui/PromptModal.vue'

// ── Data ──
const nowPlayingId = computed(() => playerStore.currentTrack?.id ?? null)
const tracks = computed(() => localMusicStore.activePlaylistDetail?.tracks || [])

const playlistName = computed(() => localMusicStore.activePlaylistDetail?.name || '本地歌单')

const coverUrl = computed(() => {
  const pl = localMusicStore.activePlaylistDetail
  if (!pl) return ''
  return pl.customCoverUrl?.trim()
    || pl.coverPath?.trim()
    || (pl.tracks?.[0]?.coverUrl?.trim() ?? '')
})

// 封面马赛克：最多取前 6 首有封面的歌曲
const coverUrls = computed(() => {
  const pl = localMusicStore.activePlaylistDetail
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
  !!localMusicStore.activePlaylistDetail?.customCoverUrl?.trim()
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
  return nowPlayingId.value === track.id
}

function ppTitle(track: LocalTrack, idx: number) {
  return isTrackPlaying(track) && hoveredIdx.value !== idx ? '正在播放'
    : hoveredIdx.value === idx ? (isTrackPlaying(track) ? '暂停' : '播放')
    : `第 ${idx + 1} 首`
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
  localMusicStore.activeView = 'playlists'
  localMusicStore.activePlaylistDetail = null
  localMusicStore.activePlaylistId = ''
  window.dispatchEvent(new CustomEvent('local-navigate', { detail: { page: 'local-music' } }))
}

function handleRename() {
  showRenameModal.value = true
}

async function onRenameConfirm(name: string) {
  const pl = localMusicStore.activePlaylistDetail
  if (!pl) return
  await localMusicStore.renamePlaylist(pl.id, name.trim())
}

function handleAddTrack() {
  showAddTrackModal.value = true
}

async function onAddTrackConfirm(kw: string) {
  const pl = localMusicStore.activePlaylistDetail
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
      await localMusicStore.addTrackToPlaylist(pl.id, t.id)
    }
    alert(`已添加 ${newTracks.length} 首歌曲到歌单`)
  } catch (e) {
    console.error('[localPlaylist] add track error:', e)
  }
}

async function handleRemoveTrack(track: LocalTrack) {
  const pl = localMusicStore.activePlaylistDetail
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
  }))
  playerStore.setPlaylist(playlist as any, index)
  playerStore.playByIndex(index)
}

function handlePlayAll() {
  if (!tracks.value.length) return
  playTrack(tracks.value[0], 0)
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
  display: grid;
  grid-template-columns: 40px 52px 1fr;
  align-items: center;
  gap: var(--space-3);
  padding: 8px 12px;
  height: 68px;
  box-sizing: border-box;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
  border-radius: 16px;
  overflow: hidden;
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
.local-song-row:hover .local-song-pp:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
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
.local-lyric-icon { font-size: 13px; color: var(--accent); flex-shrink: 0; }
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
