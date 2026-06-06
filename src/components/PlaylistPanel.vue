<template>
  <AnimatedAppear tag="section" variant="content" rhythm="body" class-name="panel">
    <div class="head">
      <AnimatedAppear tag="h2" variant="title" rhythm="head" class-name="title">歌单分类</AnimatedAppear>
      <div class="head-ops">
        <button class="chip" :class="{ active: order === 'hot' }" @click="setOrder('hot')">热门</button>
        <button class="chip" :class="{ active: order === 'new' }" @click="setOrder('new')">最新</button>
      </div>
    </div>

    <AnimatedAppear v-if="error" tag="p" variant="text" rhythm="body" class-name="error">{{ error }}</AnimatedAppear>

    <div
      v-if="allCatsFlat.length"
      ref="catHeaderRef"
      class="cat-header"
      :class="{ 'cat-header--fixed': stickyFallbackActive }"
      :style="{ '--playlist-panel-sticky-top': `${stickyTopOffset}px` }"
    >
      <HorizontalScrollRail
        aria-label="歌单分类"
        content-layout="flex"
        content-class="cat-tags"
        :style="{ '--horizontal-scroll-gap': 'var(--space-2)' }"
      >
        <button
          v-for="cat in allCatsFlat"
          :key="cat"
          class="tag"
          :class="{ active: activeCat === cat }"
          role="tab"
          :aria-selected="activeCat === cat"
          @click="setCat(cat)"
        >
          {{ cat }}
        </button>
      </HorizontalScrollRail>
    </div>

    <PlaylistHighlightSection
      title="精品歌单"
      fallback-sub="精品推荐"
      :items="highQuality"
      @open-detail="openDetail"
    />

    <div v-if="playlists.length" ref="listWrapRef" class="list-wrap">
      <AnimatedAppear
        v-for="(item, idx) in playlists"
        :key="item.id"
        variant="media"
        rhythm="list"
        :index="idx"
      >
        <GradientCard
          tag="article"
          :cover="resolveCover(item)"
          :name="item.name"
          :subtitle="`${item.creator?.nickname || '未知用户'} · ${item.trackCount || 0} 首`"
          hover-play-size="md"
          :play-count="item.playCount"
          @click="openDetail(item.id)"
        />
      </AnimatedAppear>
    </div>

    <AnimatedAppear v-else-if="!loading" tag="p" variant="text" rhythm="body" class-name="muted">暂无歌单数据</AnimatedAppear>

    <div class="load-more-wrap">
      <button v-if="hasMore" class="load-more" :disabled="loading" @click="loadMore">
        {{ loading ? '加载中…' : '加载更多' }}
      </button>
      <span v-else-if="playlists.length" class="load-end">已加载全部歌单</span>
    </div>

    <div ref="loadMoreTrigger" class="load-trigger" />
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getHighQualityPlaylists, getPlaylistCatList, getTopPlaylists } from '../api/music';
import { useApiQuery } from '../composables/useApiQuery';
import { resolvePlaylistCoverUrl } from '../utils/image';
import AnimatedAppear from './AnimatedAppear.vue';
import GradientCard from './ui/GradientCard.vue';
import HorizontalScrollRail from './ui/HorizontalScrollRail.vue';
import PlaylistHighlightSection from './PlaylistHighlightSection.vue';

type PlaylistItem = {
  id: number;
  name: string;
  coverImgUrl?: string;
  picUrl?: string;
  playCount?: number;
  trackCount?: number;
  copywriter?: string;
  creator?: { nickname?: string };
};

const emit = defineEmits<{
  (e: 'open-detail', playlistId: number): void;
}>();

const props = withDefaults(
  defineProps<{
    initialCat?: string;
  }>(),
  {
    initialCat: '',
  },
);

const loading = ref(false);
const error = ref('');
const order = ref<'hot' | 'new'>('hot');
const activeCat = ref('每日推荐');
const limit = 30;
const hasMore = ref(false);

const allCats = ref<Record<string, string[]>>({});
const playlists = ref<PlaylistItem[]>([]);
const highQuality = ref<PlaylistItem[]>([]);
const loadMoreTrigger = ref<HTMLElement | null>(null);
const listWrapRef = ref<HTMLElement | null>(null);
const catHeaderRef = ref<HTMLElement | null>(null);
const stickyFallbackActive = ref(false);
const stickyTopOffset = ref(0);
let observer: IntersectionObserver | null = null;
let stickyFallbackHost: HTMLElement | Window | null = null;
let stickyFallbackTop = 0;
const mountedReady = ref(false);

// 歌单分类缓存
const { data: catData } = useApiQuery({
  queryKey: ['playlist', 'cats'],
  queryFn: async () => {
    const { data } = await getPlaylistCatList();
    const sub = data?.sub || [];
    const categoriesMap: Record<number, string> = data?.categories || {};
    const groupMap: Record<string, string[]> = {};
    for (const item of sub) {
      const group = categoriesMap[item.category] || '其他';
      if (!groupMap[group]) groupMap[group] = [];
      groupMap[group].push(item.name);
    }
    return groupMap;
  },
  ttl: 'LIST',
});

// 歌单列表首次加载缓存
const { data: listCacheData } = useApiQuery({
  queryKey: computed(() => ['playlist', 'list', activeCat.value === '每日推荐' ? '全部' : activeCat.value, order.value, 0]),
  queryFn: async () => {
    const { data } = await getTopPlaylists({
      cat: activeCat.value === '每日推荐' ? '全部' : activeCat.value,
      order: order.value,
      limit,
      offset: 0,
    });
    return { list: (data?.playlists || []) as PlaylistItem[], hasMore: Boolean(data?.more) };
  },
  ttl: 'LIST_VOLATILE',
});

// 恢复首次加载缓存
watch(listCacheData, (val) => {
  if (val && playlists.value.length === 0) {
    playlists.value = val.list;
    hasMore.value = val.hasMore;
  }
}, { immediate: true });

// 精品歌单缓存
const { data: hqData } = useApiQuery({
  queryKey: computed(() => ['playlist', 'highquality', activeCat.value]),
  queryFn: async () => {
    const { data } = await getHighQualityPlaylists({ cat: activeCat.value, limit: 6 });
    return (data?.playlists || []) as PlaylistItem[];
  },
  ttl: 'LIST_VOLATILE',
});

const allCatsFlat = computed(() => {
  const set = new Set<string>();
  set.add('每日推荐');
  for (const group of Object.keys(allCats.value)) {
    for (const cat of allCats.value[group] || []) {
      set.add(cat);
    }
  }
  return Array.from(set);
});


function resolveCover(item: PlaylistItem) {
  return resolvePlaylistCoverUrl(item.coverImgUrl || item.picUrl || '', 800);
}

function openDetail(id: number) {
  emit('open-detail', id);
}

function setOrder(next: 'hot' | 'new') {
  if (order.value === next) return;
  order.value = next;
  reloadAll();
}

async function setCat(cat: string) {
  if (activeCat.value === cat) return;
  activeCat.value = cat;
  await reloadAll();
  await nextTick();
  scrollListIntoView();
}

async function loadCategories() {
  // 分类数据由 useApiQuery 管理缓存
  if (catData.value) {
    allCats.value = catData.value;
    return;
  }
  const { data } = await getPlaylistCatList();
  const sub = data?.sub || [];
  const categoriesMap: Record<number, string> = data?.categories || {};
  const groupMap: Record<string, string[]> = {};
  for (const item of sub) {
    const group = categoriesMap[item.category] || '其他';
    if (!groupMap[group]) groupMap[group] = [];
    groupMap[group].push(item.name);
  }
  allCats.value = groupMap;
}

async function loadTopPlaylists(reset = false) {
  if (loading.value) return;
  loading.value = true;
  error.value = '';

  try {
    const cat = activeCat.value === '每日推荐' ? '全部' : activeCat.value;
    const offset = reset ? 0 : playlists.value.length;

    // 首次加载由 useApiQuery 缓存处理
    if (reset && offset === 0) {
      // 缓存由 useApiQuery 自动管理
    }

    const { data } = await getTopPlaylists({
      cat,
      order: order.value,
      limit,
      offset,
    });

    const nextList = (data?.playlists || []) as PlaylistItem[];
    playlists.value = reset ? nextList : [...playlists.value, ...nextList];
    hasMore.value = Boolean(data?.more);

    // 首次加载结果写入缓存
    if (reset && offset === 0) {
      // 缓存由 useApiQuery 自动处理
    }
  } catch (e: any) {
    error.value = e?.message || '加载歌单失败';
    if (reset) playlists.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadHighQuality() {

  if (hqData.value) {
    highQuality.value = hqData.value as PlaylistItem[];
    return;
  }
  try {
    const { data } = await getHighQualityPlaylists({
      cat: activeCat.value,
      limit: 6,
    });
    highQuality.value = data?.playlists || [];
    // 缓存由 useApiQuery 自动处理
  } catch {
    highQuality.value = [];
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return;
  loadTopPlaylists(false);
}

function resolveSafeCategory(raw: string) {
  const next = raw.trim();
  if (!next) return '每日推荐';
  return allCatsFlat.value.includes(next) ? next : '每日推荐';
}

function applyInitialCategory(raw: string) {
  const next = resolveSafeCategory(raw);
  if (next === activeCat.value) return false;
  activeCat.value = next;
  return true;
}

async function reloadAll() {
  await Promise.all([loadTopPlaylists(true), loadHighQuality()]);
}

function scrollListIntoView() {
  const contentHost = document.querySelector('.content') as HTMLElement | null;
  const listWrap = listWrapRef.value;
  const catHeader = catHeaderRef.value;

  if (!contentHost || !listWrap) return;

  const contentRect = contentHost.getBoundingClientRect();
  const listRect = listWrap.getBoundingClientRect();
  const headerRect = catHeader?.getBoundingClientRect();
  const currentScrollTop = contentHost.scrollTop;
  const stickyBottom = headerRect ? headerRect.bottom - contentRect.top : 0;
  const targetTop = currentScrollTop + (listRect.top - contentRect.top) - stickyBottom;

  contentHost.style.scrollBehavior = 'smooth';
  contentHost.scrollTo({ top: Math.max(targetTop, 0), behavior: 'smooth' });
}

function setupInfiniteLoad() {
  if (!loadMoreTrigger.value) return;

  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasMore.value && !loading.value) {
        loadTopPlaylists(false);
      }
    },
    { root: null, rootMargin: '220px 0px 220px 0px', threshold: 0.01 },
  );

  observer.observe(loadMoreTrigger.value);
}

function getStickyScrollHost() {
  return (document.querySelector('.content') as HTMLElement | null) || window;
}

function updateStickyTopOffset() {
  const content = document.querySelector('.content') as HTMLElement | null;
  if (!content) {
    stickyTopOffset.value = 0;
    return;
  }

  const styles = window.getComputedStyle(content);
  stickyTopOffset.value = Number.parseFloat(styles.paddingTop || '0') || 0;
}

function updateStickyFallbackMetrics() {
  const header = catHeaderRef.value;
  if (!header) return;

  const rect = header.getBoundingClientRect();
  const viewportTop = rect.top + window.scrollY;
  const host = stickyFallbackHost;

  if (host instanceof HTMLElement) {
    const hostRect = host.getBoundingClientRect();
    stickyFallbackTop = viewportTop - (hostRect.top + window.scrollY) + host.scrollTop - stickyTopOffset.value;
    return;
  }

  stickyFallbackTop = viewportTop - stickyTopOffset.value;
}

function updateStickyFallbackState() {
  const host = stickyFallbackHost;
  if (!host) return;

  const scrollTop = host instanceof HTMLElement ? host.scrollTop : window.scrollY;
  stickyFallbackActive.value = scrollTop >= Math.max(stickyFallbackTop, 0);
}

function handleStickyFallbackScroll() {
  updateStickyFallbackState();
}

function setupStickyFallback() {
  updateStickyTopOffset();

  if (typeof window === 'undefined' || typeof CSS === 'undefined' || CSS.supports('position', 'sticky')) {
    return;
  }

  stickyFallbackHost = getStickyScrollHost();
  updateStickyFallbackMetrics();
  updateStickyFallbackState();

  if (stickyFallbackHost instanceof HTMLElement) {
    stickyFallbackHost.addEventListener('scroll', handleStickyFallbackScroll, { passive: true });
  } else {
    window.addEventListener('scroll', handleStickyFallbackScroll, { passive: true });
  }

  window.addEventListener('resize', updateStickyFallbackMetrics);
}

function cleanupStickyFallback() {
  if (stickyFallbackHost instanceof HTMLElement) {
    stickyFallbackHost.removeEventListener('scroll', handleStickyFallbackScroll);
  } else if (stickyFallbackHost) {
    window.removeEventListener('scroll', handleStickyFallbackScroll);
  }

  window.removeEventListener('resize', updateStickyFallbackMetrics);
  stickyFallbackHost = null;
  stickyFallbackActive.value = false;
}

onMounted(async () => {
  await loadCategories();
  applyInitialCategory(props.initialCat);
  await reloadAll();
  mountedReady.value = true;
  updateStickyTopOffset();
  setupInfiniteLoad();
  setupStickyFallback();
});

onBeforeUnmount(() => {
  if (observer) observer.disconnect();
  cleanupStickyFallback();
});

watch(
  () => props.initialCat,
  async (nextCat) => {
    if (!mountedReady.value) return;
    if (!applyInitialCategory(nextCat)) return;
    await reloadAll();
  },
);
</script>

<style scoped>
.panel {
  --playlist-panel-sticky-top: 0px;
  width: 100%;
  padding: var(--space-4);
  color: var(--text-main);
  box-sizing: border-box;
  display: grid;
  gap: var(--space-3);
  scroll-behavior: smooth;
}

.head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.title { margin: 0; font-size: 20px; font-weight: 700; }
.head-ops { display: flex; gap: var(--space-2); }
.chip { height: 32px; padding: 0 var(--space-3); border-radius: 999px; border: 1px solid var(--border); background: var(--bg-muted); color: var(--text-main); cursor: pointer; }
.chip.active { background: var(--accent-soft); color: var(--accent); border-color: color-mix(in srgb, var(--accent) 46%, var(--border)); }
.error { color: color-mix(in srgb, #ef4444 74%, var(--text-main)); margin: 0; }

.cat-header {
  position: sticky;
  top: calc(var(--playlist-panel-sticky-top, 0px) * -1);
  z-index: 999;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 64px;
  margin: var(--space-2) 0 0;
  overflow: hidden;
  box-sizing: border-box;
  padding: var(--space-1) 0;
}

.cat-header--fixed {
  position: fixed;
  top: 0;
  left: 50%;
  width: min(calc(100vw - 32px), 100%);
  transform: translateX(-50%);
}

:global(.dark-mode) .cat-header,
:global(.dark) .cat-header,
:global([data-theme='dark']) .cat-header {
  border-color: var(--border);
}

.tag {
  flex: 0 0 auto;
  height: 36px;
  padding: 0 var(--space-4);
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg-muted);
  color: var(--text-sub);
  cursor: pointer;
  font-size: var(--text-label-md);
  font-weight: 600;
  transition: all 0.2s ease;
}

.tag:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  color: var(--text-main);
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-surface));
}

.tag.active {
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 90%, #fff), color-mix(in srgb, var(--accent) 74%, #000));
  border-color: color-mix(in srgb, var(--accent) 56%, var(--border));
  color: #fff;
  box-shadow: 0 6px 14px color-mix(in srgb, var(--accent) 24%, rgba(15, 23, 42, 0.18));
}

.hq-section h3 { margin: 0 0 var(--space-2); font-size: var(--text-body-md); }
.hq-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
.hq-item { border: 1px solid #edf2f7; border-radius: 12px; overflow: hidden; background: #f8fafc; cursor: pointer; }
.hq-item img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; }
.hq-item .meta { padding: var(--space-2); }
.hq-item .name { margin: 0; font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hq-item .sub { margin: var(--space-1) 0 0; font-size: var(--text-label-sm); color: #6b7280; }

.list-wrap { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-3); padding: var(--space-1); }

.muted { margin: 0; color: #6b7280; }
.load-more-wrap { display: flex; align-items: center; justify-content: center; min-height: 36px; }
.load-more { height: 34px; padding: 0 var(--space-3); border-radius: 10px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; }
.load-more:disabled { cursor: not-allowed; opacity: 0.6; }
.load-end { color: #9ca3af; font-size: 13px; }
.load-trigger { width: 100%; height: 1px; }

@media (max-width: 1280px) {
  .list-wrap { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 980px) {
  .hq-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .list-wrap { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 767px) {
  .head { align-items: flex-start; flex-direction: column; }
  .list-wrap { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
