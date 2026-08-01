<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="artist-panel">
    <div class="panel-head">
      <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="panel-title">歌手分类</AnimatedAppear>
      <button type="button" class="refresh-btn" :disabled="loading" @click="reload">
        <RefreshCw :size="16" :class="{ spinning: loading }" />
        <span>{{ loading ? '刷新中…' : '刷新' }}</span>
      </button>
    </div>

    <div class="filters">
      <div v-for="group in filterGroups" :key="group.key" class="filter-group">
        <span class="filter-label">{{ group.label }}</span>
        <div class="filter-options ui-safe-group" role="group" :aria-label="`${group.label}筛选`">
          <button
            v-for="option in group.options"
            :key="String(option.value)"
            type="button"
            class="chip"
            :class="{ active: group.current === option.value }"
            :disabled="loading"
            @click="selectFilter(group.key, option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="error" class="status-message error">{{ error }}</p>

    <div v-if="artists.length" class="artist-grid">
      <AnimatedAppear
        v-for="(artist, index) in artists"
        :key="artist.id"
        tag="button"
        variant="media"
        rhythm="list"
        :index="index"
        class-name="artist-card"
        type="button"
        @click="emit('open-artist', artist)"
      >
        <span class="avatar-wrap">
          <img :src="resolveSizedImageUrl(artist.picUrl || artist.img1v1Url, 320)" :alt="artist.name" loading="lazy" />
        </span>
        <span class="artist-name" :title="artist.name">{{ artist.name || '未知歌手' }}</span>
        <span v-if="artist.alias?.length" class="artist-alias">{{ artist.alias.join(' / ') }}</span>
      </AnimatedAppear>
    </div>

    <p v-else-if="!loading" class="status-message">暂无符合条件的歌手</p>

    <div class="load-more-wrap">
      <button v-if="hasMore" type="button" class="load-more" :disabled="loading" @click="loadMore">
        {{ loading ? '加载中…' : '加载更多' }}
      </button>
      <span v-else-if="artists.length" class="load-end">已加载全部歌手</span>
    </div>
    <div ref="loadTrigger" class="load-trigger" aria-hidden="true" />
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { getArtistList } from '../api/music';
import { resolveSizedImageUrl } from '../utils/image';
import AnimatedAppear from './AnimatedAppear.vue';

type ArtistType = -1 | 1 | 2 | 3;
type ArtistArea = -1 | 0 | 7 | 8 | 16 | 96;
type ArtistInitial = -1 | 0 | string;
type FilterKey = 'type' | 'area' | 'initial';

type ArtistItem = {
  id: number;
  name: string;
  picUrl?: string;
  img1v1Url?: string;
  alias?: string[];
};

const emit = defineEmits<{ (event: 'open-artist', artist: ArtistItem): void }>();

const TYPE_OPTIONS = [
  { label: '全部', value: -1 },
  { label: '男歌手', value: 1 },
  { label: '女歌手', value: 2 },
  { label: '乐队', value: 3 },
] as const;
const AREA_OPTIONS = [
  { label: '全部', value: -1 },
  { label: '华语', value: 7 },
  { label: '欧美', value: 96 },
  { label: '日本', value: 8 },
  { label: '韩国', value: 16 },
  { label: '其他', value: 0 },
] as const;
const INITIAL_OPTIONS = [
  { label: '热门', value: -1 },
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => ({ label: letter, value: letter })),
  { label: '#', value: 0 },
];

const artistType = ref<ArtistType>(-1);
const artistArea = ref<ArtistArea>(-1);
const artistInitial = ref<ArtistInitial>(-1);
const artists = ref<ArtistItem[]>([]);
const loading = ref(false);
const error = ref('');
const hasMore = ref(false);
const loadTrigger = ref<HTMLElement | null>(null);
const limit = 30;
let observer: IntersectionObserver | null = null;

const filterGroups = computed(() => [
  { key: 'type' as const, label: '类型', options: TYPE_OPTIONS, current: artistType.value },
  { key: 'area' as const, label: '地区', options: AREA_OPTIONS, current: artistArea.value },
  { key: 'initial' as const, label: '首字母', options: INITIAL_OPTIONS, current: artistInitial.value },
]);

async function fetchArtists(reset = false) {
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    const offset = reset ? 0 : artists.value.length;
    const { data } = await getArtistList({
      type: artistType.value,
      area: artistArea.value,
      initial: artistInitial.value,
      limit,
      offset,
    });
    const next = (data?.artists || data?.data?.artists || data?.list || []) as ArtistItem[];
    if (reset) {
      artists.value = next;
    } else {
      const existing = new Set(artists.value.map((artist) => artist.id));
      artists.value = [...artists.value, ...next.filter((artist) => !existing.has(artist.id))];
    }
    hasMore.value = Boolean(data?.more ?? data?.hasMore ?? next.length >= limit);
  } catch (reason: any) {
    if (reset) artists.value = [];
    error.value = reason?.message || '歌手列表加载失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

function selectFilter(key: FilterKey, value: ArtistType | ArtistArea | ArtistInitial) {
  if (key === 'type') artistType.value = value as ArtistType;
  if (key === 'area') artistArea.value = value as ArtistArea;
  if (key === 'initial') artistInitial.value = value as ArtistInitial;
  void fetchArtists(true);
}

function reload() {
  void fetchArtists(true);
}

function loadMore() {
  if (hasMore.value) void fetchArtists(false);
}

onMounted(async () => {
  await fetchArtists(true);
  observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting && hasMore.value && !loading.value) loadMore();
  }, { rootMargin: '240px 0px' });
  if (loadTrigger.value) observer.observe(loadTrigger.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped>
.artist-panel {
  width: 100%;
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  box-sizing: border-box;
  color: var(--text-main);
}

.panel-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.panel-title { margin: 0; font-size: var(--text-headline-md); font-weight: var(--text-headline-md-weight); line-height: var(--text-headline-md-line); }
.refresh-btn, .load-more { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); padding: 0 var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-muted); color: var(--text-main); cursor: pointer; font-size: var(--text-label-md); }
.refresh-btn:hover, .load-more:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); background: var(--bg-hover); }
.refresh-btn:active, .load-more:active { transform: scale(0.98); }
.refresh-btn:disabled, .load-more:disabled { opacity: 0.6; cursor: not-allowed; }
.spinning { animation: spin 0.8s linear infinite; }

.filters { display: grid; gap: var(--space-3); }
.filter-group { display: grid; grid-template-columns: 56px minmax(0, 1fr); align-items: center; gap: var(--space-3); }
.filter-label { color: var(--text-sub); font-size: var(--text-label-md); font-weight: 600; }
.filter-options { display: flex; flex-wrap: wrap; gap: var(--space-2); min-width: 0; }
.chip { flex: 0 0 auto; min-height: 36px; padding: 0 var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-full); background: var(--bg-muted); color: var(--text-sub); cursor: pointer; font-size: var(--text-label-md); font-weight: 500; }
.chip:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); color: var(--text-main); background: var(--bg-hover); }
.chip.active { background: color-mix(in srgb, var(--accent) 14%, var(--bg-solid)) !important; border-color: color-mix(in srgb, var(--accent) 36%, var(--border)) !important; color: var(--accent) !important; font-weight: 700 !important; }
.chip:disabled { cursor: not-allowed; opacity: 0.65; }

.artist-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--space-4); }
.artist-card { min-width: 0; display: grid; justify-items: center; align-content: start; gap: var(--space-2); padding: var(--space-3); border: none; border-radius: var(--radius-lg); background: transparent; color: inherit; cursor: pointer; }
.artist-card:hover { background: var(--bg-hover); }
.artist-card:active { transform: scale(0.98); }
.avatar-wrap { width: 100%; max-width: 152px; aspect-ratio: 1; overflow: hidden; border-radius: var(--radius-full); background: var(--bg-muted); }
.avatar-wrap img { width: 100%; height: 100%; display: block; object-fit: cover; transition: transform 220ms var(--an-ease); }
.artist-card:hover img { transform: scale(var(--image-hover-scale)); }
.artist-name, .artist-alias { width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: center; }
.artist-name { font-size: var(--text-label-lg); font-weight: 600; }
.artist-alias { color: var(--text-soft); font-size: var(--text-label-sm); }
.status-message { min-height: 120px; display: grid; place-items: center; margin: 0; color: var(--text-soft); font-size: var(--text-body-md); }
.status-message.error { color: var(--danger); }
.load-more-wrap { min-height: 40px; display: flex; align-items: center; justify-content: center; }
.load-end { color: var(--text-soft); font-size: var(--text-label-md); }
.load-trigger { height: 1px; }

@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1280px) { .artist-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
@media (max-width: 1024px) { .artist-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 767px) {
  .artist-panel { padding: var(--space-2); }
  .filter-group { grid-template-columns: 1fr; gap: var(--space-2); }
  .artist-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
  .artist-card { padding: var(--space-2); }
}
</style>
