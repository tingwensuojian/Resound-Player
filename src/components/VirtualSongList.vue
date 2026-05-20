<template>
  <div ref="containerRef" class="vl-container" @scroll="onScroll">
    <!-- 表头 -->
    <div v-if="showHeader" class="local-song-header" :class="{ 'has-checkbox': selectionMode }">
      <span v-if="selectionMode" class="local-song-check" @click.stop="emitToggleSelectAll">
        <input type="checkbox" :checked="allSelected" @click.stop="emitToggleSelectAll" />
      </span>
      <span class="local-song-idx">#</span>
      <span class="local-song-cover"></span>
      <span class="local-song-title" @click="$emit('sort-by', 'title')">标题</span>
      <span class="local-song-artist" @click="$emit('sort-by', 'artist')">歌手</span>
      <span class="local-song-album" @click="$emit('sort-by', 'album')">专辑</span>
      <span class="local-song-action"></span>
      <span class="local-song-duration" @click="$emit('sort-by', 'duration')">时长</span>
    </div>

    <!-- 虚拟滚动区 -->
    <div class="vl-body" :style="{ height: `${totalHeight}px` }">
      <div
        v-for="vi in visibleItems"
        :key="vi.track.id"
        class="local-song-row"
        :class="{
          playing: nowPlayingId === vi.track.id,
          'row-selected': selectionMode && selectedIdsSet.has(vi.track.id),
          'has-checkbox': selectionMode,
        }"
        :style="{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.index * ROW_HEIGHT}px)` }"
        @dblclick="$emit('play', vi.track, vi.index)"
        @contextmenu.prevent="$emit('show-context-menu', $event, vi.track, vi.index)"
        @click="selectionMode && $emit('toggle-select', vi.track.id)"
      >
        <span v-if="selectionMode" class="local-song-check" @click.stop="$emit('toggle-select', vi.track.id)">
          <input type="checkbox" :checked="selectedIdsSet.has(vi.track.id)" @click.stop="$emit('toggle-select', vi.track.id)" />
        </span>
        <span class="local-song-idx">{{ vi.index + 1 }}</span>
        <span class="local-song-cover">
          <img v-if="vi.track.coverUrl" :src="vi.track.coverUrl" class="local-cover-img" alt="" />
          <span v-else class="local-cover-placeholder"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M844.743872 64.641229l-483.775168 80.814584c-1.567705 0.25071-3.031033 0.710175-4.453429 1.254573l-17.475 0c-11.915377 0-21.38403 9.532097-21.38403 21.280676l0 553.029462c-18.875906-10.912537-40.825824-17.140379-64.216557-17.140379-70.927399 0-128.433114 57.359382-128.433114 128.139425S182.512289 960.15695 253.439688 960.15695c70.926376 0 128.433114-57.359382 128.433114-128.139425 0-5.184069-0.314155-10.285251-0.899486-15.259542 0.585331-1.964748 0.899486-4.013407 0.899486-6.187933l0-449.764564 449.513854-79.267345 0 311.298955c-18.875906-10.870582-40.825824-17.142425-64.216557-17.142425-70.927399 0-128.433114 57.401338-128.433114 128.183428 0 70.738088 57.505715 128.139425 128.433114 128.139425 70.926376 0 128.432091-57.401338 128.432091-128.139425 0-5.184069-0.313132-10.285251-0.898463-15.301498 0.585331-1.966795 0.898463-4.015454 0.898463-6.187933l0-597.97307c0-10.45205-7.587815-19.190061-17.579377-20.946055-3.491521-2.173502-7.881504-3.051499-12.710486-2.257413l-11.370978 1.922792-1.170662 0C849.927941 63.135946 847.21004 63.679321 844.743872 64.641229z" fill="currentColor"/></svg></span>
        </span>
        <span class="local-song-title" :title="vi.track.title">
          <span v-if="vi.track.hasLyrics" class="local-lyric-icon" title="有歌词">♪</span>
          {{ vi.track.title }}
        </span>
        <span class="local-song-artist" :title="vi.track.artist">{{ vi.track.artist }}</span>
        <span class="local-song-album" :title="vi.track.album">{{ vi.track.album }}</span>
        <button class="local-song-play btn-text" @click.stop="$emit('play', vi.track, vi.index)" title="播放">▶</button>
        <span class="local-song-duration">{{ formatDuration(vi.track.duration) }}</span>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!tracks.length" class="local-empty">暂无数据</div>

    <ScrollToTopFab scrollHostSelector=".vl-container" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { localMusicStore } from '../stores/localMusic'
import ScrollToTopFab from './ui/ScrollToTopFab.vue'

const ROW_HEIGHT = 38
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
    showHeader?: boolean
  }>(),
  { selectionMode: false, selectedIds: () => [], showHeader: true }
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
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight
    ro = new ResizeObserver(() => {
      if (containerRef.value) {
        containerHeight.value = containerRef.value.clientHeight
      }
    })
    ro.observe(containerRef.value)
  }
})

onUnmounted(() => {
  ro?.disconnect()
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

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.vl-container {
  height: 100%;
  overflow-y: auto;
}
.vl-body {
  position: relative;
  width: 100%;
}
.local-song-header,
.local-song-row {
  display: grid;
  grid-template-columns: 32px 36px minmax(160px, 2fr) minmax(120px, 1fr) minmax(120px, 1fr) 40px 60px;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) var(--space-2);
  font-size: var(--text-body-sm);
}
.local-song-header.has-checkbox,
.local-song-row.has-checkbox {
  grid-template-columns: 28px 32px 36px minmax(160px, 2fr) minmax(120px, 1fr) minmax(120px, 1fr) 40px 60px;
}
.local-song-header {
  color: var(--text-soft);
  font-size: var(--text-label-xs);
  text-transform: uppercase;
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-1);
  background: var(--bg-app);
  position: sticky;
  top: 0;
  z-index: 1;
}
.local-song-header span { cursor: default; }
.local-song-header span:nth-child(3),
.local-song-header span:nth-child(4),
.local-song-header span:nth-child(5),
.local-song-header span:nth-child(7) {
  cursor: pointer;
  user-select: none;
}
.local-song-header span:nth-child(3):hover,
.local-song-header span:nth-child(4):hover,
.local-song-header span:nth-child(5):hover,
.local-song-header span:nth-child(7):hover {
  color: var(--accent);
}
.local-song-row {
  border-radius: var(--radius-sm);
  cursor: default;
  transition: background 0.15s;
  height: 38px;
  box-sizing: border-box;
}
.local-song-row:hover { background: var(--bg-muted); }
.local-song-row.playing { background: var(--accent-soft); }
.local-song-row.playing .local-song-title { color: var(--accent); }
.local-song-row.row-selected { background: color-mix(in srgb, var(--accent) 8%, var(--bg-surface)); }
.local-song-check {
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.local-song-check input[type="checkbox"] {
  cursor: pointer; margin: 0; accent-color: var(--accent); width: 14px; height: 14px;
}
.local-song-idx { color: var(--text-soft); text-align: right; font-size: var(--text-label-sm); }
.local-song-cover { display: flex; align-items: center; justify-content: center; }
.local-cover-img { width: 30px; height: 30px; border-radius: 4px; object-fit: cover; }
.local-cover-placeholder {
  display: flex; align-items: center; justify-content: center; width: 30px; height: 30px;
  border-radius: 4px; background: color-mix(in srgb, var(--bg-muted) 70%, var(--border)); color: var(--text-soft);
}
.local-cover-placeholder svg { width: 16px; height: 16px; display: block; }
.local-song-title {
  color: var(--text-main); font-weight: 500; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; display: flex; align-items: center; gap: 4px;
}
.local-lyric-icon { font-size: 13px; color: var(--accent); flex-shrink: 0; }
.local-song-artist { color: var(--text-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.local-song-album { color: var(--text-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.local-song-play { background: none; border: none; cursor: pointer; color: var(--text-soft); padding: 0; font-size: 12px; }
.local-song-row:hover .local-song-play { color: var(--accent); }
.local-song-duration { color: var(--text-soft); text-align: right; font-size: var(--text-label-sm); }
.local-empty { text-align: center; padding: var(--space-8); color: var(--text-soft); }
</style>