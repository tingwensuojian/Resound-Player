<template>
  <div ref="containerRef" class="vl-container" :class="{ 'vl-container--parent-scroll': scrollHostSelector }" @scroll="onScroll">
    <!-- 表头 -->
    <div v-if="showHeader" class="local-song-header" :class="{ 'has-checkbox': selectionMode }">
      <span v-if="selectionMode" class="local-song-check" @click.stop="emitToggleSelectAll">
        <input type="checkbox" :checked="allSelected" @click.stop="emitToggleSelectAll" />
      </span>
      <span class="local-song-idx">#</span>
      <span class="local-song-cover"></span>
      <span class="local-song-header-meta">
        <span class="local-song-title" @click="$emit('sort-by', 'title')">标题</span>
        <span class="local-song-artist" @click="$emit('sort-by', 'artist')">歌手</span>
      </span>
    </div>

    <!-- 虚拟滚动区 -->
    <div class="vl-body" :style="{ height: `${totalHeight}px` }">
      <div
        v-for="vi in visibleItems"
        :key="vi.track.id"
        class="local-song-row"
        :class="{
          playing: nowPlayingId === vi.track.id,
          highlighted: highlightedId === vi.track.id,
          'row-selected': selectionMode && selectedIdsSet.has(vi.track.id),
          'has-checkbox': selectionMode,
        }"
        :style="{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.index * ROW_HEIGHT}px)` }"
        @mouseenter="hoveredIdx = vi.index"
        @mouseleave="hoveredIdx = -1"
        @dblclick="$emit('play', vi.track, vi.index)"
        @contextmenu.prevent="$emit('show-context-menu', $event, vi.track, vi.index)"
        @click="selectionMode && $emit('toggle-select', vi.track.id)"
      >
        <span v-if="selectionMode" class="local-song-check" @click.stop="$emit('toggle-select', vi.track.id)">
          <input type="checkbox" :checked="selectedIdsSet.has(vi.track.id)" @click.stop="$emit('toggle-select', vi.track.id)" />
        </span>
        <button class="local-song-pp" @click.stop="handlePPClick(vi.track, vi.index)" :title="ppTitle(vi)">
          <span v-if="showIdx(vi)" class="local-song-idx-inner">{{ vi.index + 1 }}</span>
          <svg v-else-if="showPlay(vi)" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="local-song-pp__icon"><path d="M9 7.2v9.6c0 .7.8 1.1 1.4.7l8-4.8c.6-.4.6-1.3 0-1.7l-8-4.8c-.6-.4-1.4 0-1.4.7z" fill="currentColor"/></svg>
          <svg v-else-if="showPause(vi)" viewBox="0 0 24 24" aria-hidden="true" focusable="false" class="local-song-pp__icon"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>
          <span v-else class="local-song-pp__wave" aria-hidden="true"><i></i><i></i><i></i></span>
        </button>
        <span class="local-song-cover">
          <img v-if="vi.track.coverUrl" :src="vi.track.coverUrl" class="local-cover-img" alt="" loading="lazy" />
          <span v-else class="local-cover-placeholder"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M844.743872 64.641229l-483.775168 80.814584c-1.567705 0.25071-3.031033 0.710175-4.453429 1.254573l-17.475 0c-11.915377 0-21.38403 9.532097-21.38403 21.280676l0 553.029462c-18.875906-10.912537-40.825824-17.140379-64.216557-17.140379-70.927399 0-128.433114 57.359382-128.433114 128.139425S182.512289 960.15695 253.439688 960.15695c70.926376 0 128.433114-57.359382 128.433114-128.139425 0-5.184069-0.314155-10.285251-0.899486-15.259542 0.585331-1.964748 0.899486-4.013407 0.899486-6.187933l0-449.764564 449.513854-79.267345 0 311.298955c-18.875906-10.870582-40.825824-17.142425-64.216557-17.142425-70.927399 0-128.433114 57.401338-128.433114 128.183428 0 70.738088 57.505715 128.139425 128.433114 128.139425 70.926376 0 128.432091-57.401338 128.432091-128.139425 0-5.184069-0.313132-10.285251-0.898463-15.301498 0.585331-1.966795 0.898463-4.015454 0.898463-6.187933l0-597.97307c0-10.45205-7.587815-19.190061-17.579377-20.946055-3.491521-2.173502-7.881504-3.051499-12.710486-2.257413l-11.370978 1.922792-1.170662 0C849.927941 63.135946 847.21004 63.679321 844.743872 64.641229z" fill="currentColor"/></svg></span>
        </span>
        <div class="local-song-meta">
          <span class="local-song-title" :title="vi.track.title">
            <span v-if="vi.track.hasLyrics" class="local-lyric-icon" title="有歌词">♪</span>
            {{ vi.track.title }}
          </span>
          <span class="local-song-artist" :title="vi.track.artist">{{ vi.track.artist }}</span>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!tracks.length" class="local-empty">暂无数据</div>

    <ScrollToTopFab scrollHostSelector=".vl-container" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { playerStore } from '../stores/player'
import ScrollToTopFab from './ui/ScrollToTopFab.vue'

const ROW_HEIGHT = 68
const OVERSCAN = 15

interface LocalTrack {
  id: string; path: string; title: string; artist: string; album: string
  albumArtist: string; duration: number; coverUrl: string; hasLyrics: boolean
  source: 'local'; createdAt: string
}

const props = withDefaults(
  defineProps<{
    tracks: LocalTrack[]
    selectionMode?: boolean
    selectedIds?: string[] | Set<string>
    nowPlayingId: string | number | null
    highlightedId?: string
    showHeader?: boolean
    scrollHostSelector?: string
  }>(),
  { selectionMode: false, selectedIds: () => [], highlightedId: '', showHeader: true, scrollHostSelector: '' }
)

const emit = defineEmits<{
  play: [track: LocalTrack, index: number]
  'show-context-menu': [event: MouseEvent, track: LocalTrack, index: number]
  'toggle-select': [id: string]
  'toggle-select-all': []
  'sort-by': [field: string]
}>()

// ── Scroll state ──
const containerRef = ref<HTMLDivElement | null>(null)
const scrollTop = ref(0)
const containerHeight = ref(600)
let parentScrollHost: HTMLElement | null = null

// ── 父级滚动模式：监听外部 scroll host ──
function onParentScroll() {
  if (!parentScrollHost) return
  scrollTop.value = parentScrollHost.scrollTop
}

// ── 行 hover 状态 ──
const hoveredIdx = ref(-1)

// ── 可见范围计算 ──
const visibleRange = computed(() => {
  const total = props.tracks.length
  if (!total) return { start: 0, end: 0 }
  const start = Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN)
  const end = Math.min(total, Math.ceil((scrollTop.value + containerHeight.value) / ROW_HEIGHT) + OVERSCAN)
  return { start, end }
})

const visibleItems = computed(() => {
  const r = visibleRange.value
  const items: { track: LocalTrack; index: number }[] = []
  for (let i = r.start; i < r.end; i++) {
    items.push({ track: props.tracks[i], index: i })
  }
  return items
})

const totalHeight = computed(() => props.tracks.length * ROW_HEIGHT)

// ── 容器高度测量 ──
let ro: ResizeObserver | null = null

onMounted(() => {
  // 父级滚动模式：监听外部 scroll host
  if (props.scrollHostSelector) {
    parentScrollHost = document.querySelector(props.scrollHostSelector) as HTMLElement | null
    if (parentScrollHost) {
      parentScrollHost.addEventListener('scroll', onParentScroll, { passive: true })
      scrollTop.value = parentScrollHost.scrollTop
    }
  }
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight
    ro = new ResizeObserver(() => {
      if (containerRef.value) {
        containerHeight.value = containerRef.value.clientHeight
      }
    })
    ro.observe(containerRef.value)
  }
  // 挂载完成后滚动到定位高亮的歌曲
  if (props.highlightedId) {
    nextTick(() => scrollToHighlighted())
  }
})

onUnmounted(() => {
  ro?.disconnect()
  if (parentScrollHost) {
    parentScrollHost.removeEventListener('scroll', onParentScroll)
    parentScrollHost = null
  }
})

// ── 定位高亮自动滚动 ──
/** 找到最近的可滚动祖先 */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = el.parentElement
  while (current) {
    const overflowY = getComputedStyle(current).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return current
    current = current.parentElement
  }
  return null
}

async function scrollToHighlighted() {
  const id = props.highlightedId
  if (!id || !containerRef.value) return
  await nextTick()
  const idx = props.tracks.findIndex(t => t.id === id)
  if (idx < 0) return
  const targetScroll = idx * ROW_HEIGHT
  const halfHeight = containerHeight.value / 2
  const offset = Math.max(0, targetScroll - halfHeight + ROW_HEIGHT / 2)
  // 使用 requestAnimationFrame 确保布局已计算完毕
  requestAnimationFrame(() => {
    const el = parentScrollHost || containerRef.value
    if (!el) return
    // 检查 el 本身是否可滚动，否则找最近的可滚动祖先
    const style = getComputedStyle(el)
    const canScroll = style.overflowY === 'auto' || style.overflowY === 'scroll'
    const target = canScroll ? el : findScrollParent(el)
    if (target) target.scrollTop = offset
  })
}

// 监听 highlightedId 变化（后续切换）
watch(() => props.highlightedId, (id) => {
  if (id) scrollToHighlighted()
})

function onScroll(e: Event) {
  scrollTop.value = (e.target as HTMLDivElement).scrollTop
}

// ── Selection helpers ──
const selectedIdsSet = computed(() => {
  const ids = props.selectedIds
  if (ids instanceof Set) return ids
  return new Set(ids)
})

const allSelected = computed(() =>
  props.tracks.length > 0 && selectedIdsSet.value.size === props.tracks.length
)

function emitToggleSelectAll() { emit('toggle-select-all') }

// ── 播放/暂停/序号/音浪 ──
function isTrackPlaying(vi: { track: LocalTrack }) {
  return props.nowPlayingId === vi.track.id
}

function isPaused(vi: { track: LocalTrack }) {
  return isTrackPlaying(vi) && !playerStore.isPlaying
}

function showIdx(vi: { track: LocalTrack }) {
  return !isTrackPlaying(vi) && hoveredIdx.value !== vi.index
}

function showPlay(vi: { track: LocalTrack; index: number }) {
  return (!isTrackPlaying(vi) && hoveredIdx.value === vi.index) ||
         (isPaused(vi) && hoveredIdx.value === vi.index)
}

function showPause(vi: { track: LocalTrack; index: number }) {
  return isTrackPlaying(vi) && !isPaused(vi) && hoveredIdx.value === vi.index
}

function ppTitle(vi: { track: LocalTrack; index: number }) {
  if (showIdx(vi)) return `第 ${vi.index + 1} 首`
  if (showPlay(vi)) return '播放'
  if (showPause(vi)) return '暂停'
  return '正在播放'
}

function handlePPClick(track: LocalTrack, index: number) {
  if (props.nowPlayingId === track.id) {
    playerStore.togglePlay()
  } else {
    emit('play', track, index)
  }
}

</script>

<style scoped>
.vl-container {
  height: 100%;
  overflow-y: auto;
}
.vl-container--parent-scroll {
  overflow: visible;
  height: 100%;
}
.vl-body {
  position: relative;
  width: 100%;
}

/* 表头 — 匹配详情页风格 */
.local-song-header {
  display: grid;
  grid-template-columns: 40px 52px 1fr;
  align-items: center;
  gap: var(--space-3);
  padding: 6px 12px 8px;
  font-size: var(--text-label-xs);
  color: var(--text-soft);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
  background: var(--bg-app);
  position: sticky;
  top: 0;
  z-index: 1;
}
.local-song-header.has-checkbox {
  grid-template-columns: 28px 40px 52px 1fr;
}
.local-song-header span { cursor: default; }
.local-song-header-meta {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}
.local-song-header-meta .local-song-title,
.local-song-header-meta .local-song-artist {
  cursor: pointer;
  user-select: none;
}
.local-song-header-meta .local-song-title:hover,
.local-song-header-meta .local-song-artist:hover {
  color: var(--accent);
}

/* 歌曲行 — 匹配 .song-item 风格 */
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
  position: absolute;
  cursor: default;
  transition: background 0.15s;
}
.local-song-row.has-checkbox {
  grid-template-columns: 28px 40px 52px 1fr;
}
.local-song-row:hover { background: var(--bg-muted); }
.local-song-row.playing { background: var(--accent-soft); }
.local-song-row.highlighted {
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-surface));
  outline: 1.5px solid color-mix(in srgb, var(--accent) 25%, transparent);
  outline-offset: -1.5px;
}
.local-song-row.row-selected { background: color-mix(in srgb, var(--accent) 8%, var(--bg-surface)); }
.local-song-row:last-child { border-bottom: 0; }

/* 选择框 */
.local-song-check {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.local-song-check input[type="checkbox"] {
  cursor: pointer;
  margin: 0;
  accent-color: var(--accent);
  width: 14px;
  height: 14px;
}

/* 播放按钮 — 序号 / 播放暂停 / 音浪三位一体 */
.local-song-pp {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-soft);
  flex-shrink: 0;
  border-radius: 50%;
  transition: background 0.15s, color 0.15s;
}
.local-song-row:hover .local-song-pp { color: var(--accent); }
.local-song-row:hover .local-song-pp:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.local-song-idx-inner {
  font-size: var(--text-label-sm);
  color: var(--text-soft);
}
.local-song-pp__icon {
  width: 18px;
  height: 18px;
  display: block;
}
.local-song-pp__wave {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  color: var(--accent);
}
.local-song-pp__wave i {
  width: 3px;
  border-radius: 999px;
  background: currentColor;
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
  display: flex;
  align-items: center;
  justify-content: center;
}
.local-cover-img {
  width: 52px;
  height: 52px;
  border-radius: 10px;
  object-fit: cover;
}
.local-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-muted) 70%, var(--border));
  color: var(--text-soft);
}
.local-cover-placeholder svg { width: 20px; height: 20px; display: block; }

/* meta 区 — 标题 + 歌手上下布局 */
.local-song-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}
.local-song-title {
  color: var(--text-main);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 4px;
}
.local-song-row.playing .local-song-title { color: var(--accent); }
.local-lyric-icon { font-size: 13px; color: var(--accent); flex-shrink: 0; }
.local-song-artist {
  color: var(--text-sub);
  font-size: var(--text-label-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.local-empty { text-align: center; padding: var(--space-8); color: var(--text-soft); }
</style>