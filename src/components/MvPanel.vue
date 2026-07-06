<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="panel">
    <AnimatedAppear tag="div" variant="content" rhythm="head" class-name="head">
      <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="title">全部 MV</AnimatedAppear>
      <AnimatedAppear tag="button" variant="control" rhythm="actions" class-name="refresh-btn" :disabled="loading" @click="reload">
        {{ loading ? '刷新中…' : '刷新' }}
      </AnimatedAppear>
    </AnimatedAppear>

    <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="filters" role="group" aria-label="MV筛选">
      <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="filter-item">
        <AnimatedAppear tag="div" variant="content" rhythm="list" class-name="chip-row" role="group" aria-label="地区筛选">
          <AnimatedAppear
            v-for="(item, idx) in AREA_OPTIONS"
            :key="`area-${item}`"
            tag="button"
            variant="control" rhythm="actions"
            :index="idx"
            type="button"
            class-name="chip"
            :class="{ active: area === item }"
            :disabled="loading"
            @click="onAreaChange(item)"
          >
            {{ item }}
          </AnimatedAppear>
        </AnimatedAppear>
      </AnimatedAppear>

      <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="filter-item">
        <AnimatedAppear tag="div" variant="content" rhythm="list" class-name="chip-row" role="group" aria-label="类型筛选">
          <AnimatedAppear
            v-for="(item, idx) in TYPE_OPTIONS"
            :key="`type-${item}`"
            tag="button"
            variant="control" rhythm="actions"
            :index="idx"
            type="button"
            class-name="chip"
            :class="{ active: mvType === item }"
            :disabled="loading"
            @click="onTypeChange(item)"
          >
            {{ item }}
          </AnimatedAppear>
        </AnimatedAppear>
      </AnimatedAppear>

      <AnimatedAppear tag="div" variant="content" rhythm="body" class-name="filter-item">
        <AnimatedAppear tag="div" variant="content" rhythm="list" class-name="chip-row" role="group" aria-label="排序筛选">
          <AnimatedAppear
            v-for="(item, idx) in ORDER_OPTIONS"
            :key="`order-${item}`"
            tag="button"
            variant="control" rhythm="actions"
            :index="idx"
            type="button"
            class-name="chip"
            :class="{ active: order === item }"
            :disabled="loading"
            @click="onOrderChange(item)"
          >
            {{ item }}
          </AnimatedAppear>
        </AnimatedAppear>
      </AnimatedAppear>
    </AnimatedAppear>

    <AnimatedAppear v-if="error" tag="p" variant="text" rhythm="body" class-name="error">{{ error }}</AnimatedAppear>

    <AnimatedAppear v-if="list.length" tag="div" variant="content" rhythm="list" class-name="list-wrap">
      <AnimatedAppear v-for="(item, idx) in list" :key="item.id" tag="article" variant="media" rhythm="list" :index="idx" class-name="card card-clickable">
        <MvHoverPoster :src="item.cover" :alt="item.name" :count="item.playCount" @click="playMv(item)" />
        <AnimatedAppear tag="div" variant="content" rhythm="list" :index="idx" class-name="info">
          <AnimatedAppear tag="p" variant="text" rhythm="list" :index="idx" class-name="name" :title="item.name">{{ item.name }}</AnimatedAppear>
          <AnimatedAppear tag="p" variant="text" rhythm="list" :index="idx" class-name="sub">{{ item.artistName || '未知歌手' }}</AnimatedAppear>
        </AnimatedAppear>
      </AnimatedAppear>
    </AnimatedAppear>

    <AnimatedAppear v-else-if="!loading" tag="p" variant="text" rhythm="body" class-name="muted">暂无 MV 数据</AnimatedAppear>

    <AnimatedAppear tag="div" variant="content" rhythm="actions" class-name="load-more-wrap">
      <AnimatedAppear v-if="hasMore" tag="button" variant="control" rhythm="actions" class-name="load-more" :disabled="loading" @click="loadMore">
        {{ loading ? '加载中…' : '加载更多' }}
      </AnimatedAppear>
      <AnimatedAppear v-else-if="list.length" tag="span" variant="text" rhythm="body" class-name="load-end">已加载全部 MV</AnimatedAppear>
    </AnimatedAppear>

    <div ref="loadMoreTrigger" class="load-trigger" />
  </AnimatedAppear>

</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getAllMvs } from '../api/music';
import { useApiQuery } from '../composables/useApiQuery';
import AnimatedAppear from './AnimatedAppear.vue';
import MvHoverPoster from './MvHoverPoster.vue';
const emit = defineEmits<{ (e: 'open-user', userId: number): void; (e: 'play-mv', item: any): void }>();

function playMv(item: any) {
  emit('play-mv', item);
}

const props = withDefaults(
  defineProps<{
    initialMv?: any | null;
  }>(),
  {
    initialMv: null,
  },
);

const AREA_OPTIONS = ['全部', '内地', '港台', '欧美', '日本', '韩国'] as const;
const TYPE_OPTIONS = ['全部', '官方版', '原生', '现场版', '网易出品'] as const;
const ORDER_OPTIONS = ['上升最快', '最热', '最新'] as const;

type MvItem = {
  id: number;
  name: string;
  cover: string;
  playCount: number;
  artistName?: string;
};

function normalizeInputMv(item: any): MvItem | null {
  const id = Number(item?.id || item?.mvid || item?.mvId || item?.vid || 0);
  if (!id) return null;
  return {
    id,
    name: item?.name || item?.title || '未命名 MV',
    cover:
      item?.cover ||
      item?.imgurl16v9 ||
      item?.coverImgUrl ||
      item?.picUrl ||
      item?.picUrl16v9 ||
      item?.imgurl ||
      '',
    playCount: Number(item?.playCount || item?.playTime || 0),
    artistName:
      item?.artistName ||
      item?.artist?.name ||
      item?.artists?.map((a: any) => a?.name).filter(Boolean).join('/') ||
      item?.creator?.nickname ||
      '',
  };
}

const loading = ref(false);
const error = ref('');
const list = ref<MvItem[]>([]);
const hasMore = ref(false);

const area = ref<(typeof AREA_OPTIONS)[number]>('全部');
const mvType = ref<(typeof TYPE_OPTIONS)[number]>('全部');
const order = ref<(typeof ORDER_OPTIONS)[number]>('上升最快');

// 使用 useApiQuery 管理首次加载缓存（含持久化）
const firstPageQuery = useApiQuery({
  queryKey: computed(() => ['mv', 'list', area.value, mvType.value, order.value, 0]),
  queryFn: async () => {
    const { data } = await getAllMvs({
      area: area.value, type: mvType.value, order: order.value, limit: 30, offset: 0,
    });
    return { list: (data?.data || []) as MvItem[], hasMore: Boolean(data?.hasMore) };
  },
  ttl: 'LIST_VOLATILE',
});

// 首次加载数据恢复：优先使用缓存数据
watch(firstPageQuery.data, (val) => {
  if (val && list.value.length === 0) {
    list.value = val.list;
    hasMore.value = val.hasMore;
  }
}, { immediate: true });


const limit = 30;
const loadMoreTrigger = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

async function fetchMvs(reset = false) {
  if (loading.value) return;
  loading.value = true;
  error.value = '';

  try {
    const offset = reset ? 0 : list.value.length;

    // 首次加载由 useApiQuery 缓存处理
    if (reset && offset === 0) {
      // useApiQuery 通过 apiCache 持久化，首次加载时自动恢复缓存
      // 此处无需手动检查缓存
    }

    const { data } = await getAllMvs({
      area: area.value,
      type: mvType.value,
      order: order.value,
      limit,
      offset,
    });

    const next = (data?.data || []) as MvItem[];
    list.value = reset ? next : [...list.value, ...next];
    hasMore.value = Boolean(data?.hasMore);

    // 首次加载结果由 useApiQuery 自动缓存
  } catch (e: any) {
    error.value = e?.message || 'MV 加载失败';
    if (reset) list.value = [];
  } finally {
    loading.value = false;
  }
}

function onFilterChange() {
  fetchMvs(true);
}

function onAreaChange(next: (typeof AREA_OPTIONS)[number]) {
  if (area.value === next) return;
  area.value = next;
  onFilterChange();
}

function onTypeChange(next: (typeof TYPE_OPTIONS)[number]) {
  if (mvType.value === next) return;
  mvType.value = next;
  onFilterChange();
}

function onOrderChange(next: (typeof ORDER_OPTIONS)[number]) {
  if (order.value === next) return;
  order.value = next;
  onFilterChange();
}

function loadMore() {
  if (!hasMore.value || loading.value) return;
  fetchMvs(false);
}

function reload() {
  fetchMvs(true);
}

function setupInfiniteLoad() {
  if (!loadMoreTrigger.value) return;

  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasMore.value && !loading.value) {
        fetchMvs(false);
      }
    },
    { root: null, rootMargin: '220px 0px 220px 0px', threshold: 0.01 },
  );

  observer.observe(loadMoreTrigger.value);
}

onMounted(async () => {
  await fetchMvs(true);
  setupInfiniteLoad();
});

onBeforeUnmount(() => {
  if (observer) observer.disconnect();
});
</script>

<style scoped>
.panel {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 16px;
  background: #fff;
  color: #111827;
  box-sizing: border-box;
  display: grid;
  gap: 14px;
}

.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.title { margin: 0; font-size: 20px; font-weight: 700; }
.refresh-btn { height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background 0.16s ease; }
.refresh-btn:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--accent) 34%, #d1d5db); }
.refresh-btn:active { transform: translateY(0) scale(0.99); }
.refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.filters {
  display: grid;
  gap: 12px;
}

.filter-item {
  display: grid;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chip {
  height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid var(--border-soft);
  background: color-mix(in srgb, var(--bg-muted) 72%, transparent);
  color: var(--text-main);
  font-size: 15px;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.chip:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border-soft));
  background: color-mix(in srgb, var(--accent-soft) 35%, var(--bg-muted));
}

.chip.active {
  color: var(--accent) !important;
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border)) !important;
  background: var(--accent-soft) !important;
}

.chip:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.error { color: #b91c1c; margin: 0; }

.list-wrap { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
.info { padding: 8px; }
.info .name { margin: 0; font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.info .sub { margin: 4px 0 0; font-size: var(--text-label-sm); color: #6b7280; }

.muted { margin: 0; color: #6b7280; }
.load-more-wrap { display: flex; align-items: center; justify-content: center; min-height: 36px; }
.load-more { height: 34px; padding: 0 14px; border-radius: 10px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; }
.load-more:disabled { cursor: not-allowed; opacity: 0.6; }
.load-end { color: #9ca3af; font-size: 13px; }
.load-trigger { width: 100%; height: 1px; }

@media (max-width: 1280px) {
  .list-wrap { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

@media (max-width: 980px) {
  .filters { grid-template-columns: 1fr 1fr; }
  .list-wrap { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 767px) {
  .head { align-items: flex-start; flex-direction: column; }
  .filters { grid-template-columns: 1fr; }
  .list-wrap { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
