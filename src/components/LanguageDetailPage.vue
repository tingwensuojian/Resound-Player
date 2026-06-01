<template>
  <DetailShrinkShell
      :cover-url="heroCoverUrl"
    
  :list-scrolling="listScrolling"
  >
      <template #media>
        <HeroCoverMedia v-if="heroCoverUrl" :src="heroCoverUrl" :alt="playlistCategory" />
      </template>
      <template #title>
        <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="title">
          {{ playlistCategory }} · 歌单
        </AnimatedAppear>
      </template>
      <template #meta>
        <AnimatedAppear tag="p" variant="text" rhythm="body" class-name="sub">
          共 {{ totalCount }} 个歌单
        </AnimatedAppear>
      </template>
      <template #content>
      <div class="page-content-scroll" @scroll="handleListScroll">
        <div v-if="loading && !playlists.length" class="state">加载中…</div>
        <div v-else-if="error" class="state error">{{ error }}</div>
        <template v-else>
          <!-- 精品歌单 -->
          <PlaylistHighlightSection
            v-if="highQuality.length"
            title="精品歌单"
            fallback-sub="精品推荐"
            :items="highQuality"
            @open-detail="openDetail"
          />

          <!-- 歌单列表 -->
          <div v-if="playlists.length" class="playlist-grid">
            <AnimatedAppear
              v-for="(item, idx) in playlists"
              :key="item.id"
              tag="article"
              variant="media"
              rhythm="list"
              :index="idx"
              class-name="playlist-card hover-play-button-trigger"
              @click="openDetail(item.id)"
            >
              <div class="cover playlist-card-media-shell">
                <div class="playlist-card-cover-motion-shell">
                  <img class="playlist-card-cover-image" :src="resolveCover(item)" :alt="item.name" loading="lazy" />
                </div>
                <HoverPlayButton :count="item.playCount" size="md" />
              </div>
              <div class="info">
                <p class="name" :title="item.name">{{ item.name }}</p>
                <p class="sub">{{ item.creator?.nickname || '未知用户' }} · {{ item.trackCount || 0 }} 首</p>
              </div>
            </AnimatedAppear>
          </div>

          <AnimatedAppear v-else-if="!loading" tag="p" variant="text" rhythm="body" class-name="muted">暂无歌单数据</AnimatedAppear>

          <div class="load-more-wrap">
            <button v-if="hasMore" class="load-more-btn" :disabled="loading" @click="loadMore">
              {{ loading ? '加载中…' : '加载更多' }}
            </button>
            <span v-else-if="playlists.length" class="load-end">已加载全部歌单</span>
          </div>
        </template>
      </div>
      </template>
    </DetailShrinkShell>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, type ComponentPublicInstance } from 'vue';
import { useListScroll } from '../composables/useScrollShrink';
const { listScrolling, handleListScroll, resetScroll } = useListScroll();
import { useDominantColor } from '../composables/useDominantColor';
import { getTopPlaylists, getHighQualityPlaylists } from '../api/music';
import { useApiQuery } from '../composables/useApiQuery';
import { resolvePlaylistCoverUrl } from '../utils/image';
import AnimatedAppear from './AnimatedAppear.vue';
import HoverPlayButton from './HoverPlayButton.vue';
import PlaylistHighlightSection from './PlaylistHighlightSection.vue';
import DetailShrinkShell from './DetailShrinkShell.vue';
import HeroCoverMedia from './HeroCoverMedia.vue';

/** 将百科语种名映射到歌单分类名 */
const LANGUAGE_TO_CATEGORY: Record<string, string> = {
  '华语': '华语',
  '国语': '华语',
  '粤语': '粤语',
  '欧美': '欧美',
  '英语': '欧美',
  '日语': '日语',
  '日本': '日语',
  '韩语': '韩语',
  '韩国': '韩语',
};

const props = withDefaults(
  defineProps<{
    languageName: string;
    backLabel?: string;
    embedded?: boolean;
  }>(),
  { backLabel: '返回', embedded: false },
);

const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'open-detail', playlistId: number): void;
}>();

const playlists = ref<any[]>([]);
const highQuality = ref<any[]>([]);
const loading = ref(false);
const error = ref('');
const offset = ref(0);
const LIMIT = 30;
const order = ref<'hot' | 'new'>('hot');
const hasMore = ref(false);

let fetchToken = 0;
/** 计算实际要查的歌单分类 */
const playlistCategory = computed(() => {
  return LANGUAGE_TO_CATEGORY[props.languageName] || props.languageName;
});

const dataReady = computed(() => !!(highQuality.value.length || playlists.value.length));

const totalCount = computed(() => playlists.value.length + highQuality.value.length);

/** 取第一个歌单封面作为 hero 背景 */
const heroCoverUrl = computed(() => {
  const first = highQuality.value[0] || playlists.value[0];
  if (!first) return '';
  return resolveCover(first);
});

useDominantColor(heroCoverUrl);

function resolveCover(item: any) {
  return resolvePlaylistCoverUrl(item.coverImgUrl || item.picUrl || '', 800);
}

function openDetail(id: number) {
  emit('open-detail', id);
}

async function fetchPlaylists(reset = false) {
  const token = ++fetchToken;
  if (loading.value) return;
  loading.value = true;
  error.value = '';

  try {
    const cat = playlistCategory.value;
    const reqOffset = reset ? 0 : offset.value;

    // 首次加载由 useApiQuery 缓存处理
    if (reset && reqOffset === 0) {
      // useApiQuery 自动从 apiCache 恢复缓存，无需手动检查
    }

    const [{ data: topData }, { data: hqData }] = await Promise.all([
      getTopPlaylists({ cat, order: order.value, limit: LIMIT, offset: reqOffset }),
      getHighQualityPlaylists({ cat, limit: 6 }),
    ]);
    if (token !== fetchToken) return;

    const nextList = (topData?.playlists || []) as any[];
    if (reset) {
      playlists.value = nextList;
      offset.value = LIMIT;
    } else {
      playlists.value = [...playlists.value, ...nextList];
      offset.value += LIMIT;
    }
    hasMore.value = Boolean(topData?.more);

    // 首次加载时设置精品歌单（缓存由 useApiQuery 自动处理）
    if (reset) {
      highQuality.value = (hqData?.playlists || []).slice(0, 6);
    }
  } catch (e: any) {
    if (token !== fetchToken) return;
    error.value = e?.message || '加载失败';
    if (reset) {
      playlists.value = [];
      highQuality.value = [];
    }
  } finally {
    if (token === fetchToken) {
      loading.value = false;
    }
  }
}

function loadMore() {
  if (!hasMore.value || loading.value) return;
  fetchPlaylists(false);
}

onMounted(() => {
});

watch(() => props.languageName, (name) => {
  if (name) void fetchPlaylists(true);
}, { immediate: true });
</script>

<style>@import '../styles/detail-page.css';</style>
<style scoped>

;

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.playlist-card {
  overflow: hidden;
  cursor: pointer;
  border-radius: 14px;
  background: var(--bg-solid);
  border: 1px solid var(--border);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.playlist-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--text-main) 10%, transparent);
  border-color: color-mix(in srgb, var(--accent) 24%, var(--border));
}

.playlist-card-media-shell {
  --hover-play-button-size: 34px;
  --hover-play-button-offset: 9px;
  position: relative;
  overflow: hidden;
  line-height: 0;
}

.playlist-card-cover-motion-shell {
  display: block;
  line-height: 0;
  transform-origin: center center;
}

.playlist-card-cover-image {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  transform: scale(1);
  transform-origin: center center;
  will-change: transform;
  transition:
    transform var(--image-hover-duration, var(--an-duration-base)) var(--image-hover-ease, var(--an-ease)),
    filter var(--image-hover-duration, var(--an-duration-base)) var(--image-hover-ease, var(--an-ease));
}

@media (hover: hover) and (pointer: fine) {
  .playlist-card-media-shell:hover .playlist-card-cover-image,
  .playlist-card-media-shell:focus-within .playlist-card-cover-image {
    transform: scale(var(--image-hover-scale, 1.04));
    filter: saturate(var(--image-hover-saturate, 1.04));
  }
}

.playlist-card .info {
  padding: var(--space-2);
}

.playlist-card .info .name {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-card .info .sub {
  margin: var(--space-1) 0 0;
  font-size: var(--text-label-sm);
  color: var(--text-soft);
}

.muted {
  padding: var(--space-8) 0;
  text-align: center;
  color: var(--text-sub);
  font-size: var(--text-label-md);
}

.load-more-wrap {
  display: flex;
  justify-content: center;
  padding: var(--space-5) 0 var(--space-8);
}
.load-more-btn {
  padding: 8px 32px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-surface);
  color: var(--text-soft);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.12s ease, color 0.12s ease;
}
.load-more-btn:hover:not(:disabled) {
  background: var(--bg-muted);
  color: var(--text-main);
}
.load-more-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.load-end {
  text-align: center;
  padding: 16px 0 32px;
  color: var(--text-sub);
  font-size: var(--text-label-sm);
}

@media (max-width: 1280px) {
  .playlist-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 980px) {
  .playlist-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 767px) {
  .playlist-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.state {
  padding: 24px 0;
  text-align: center;
  color: var(--text-soft);
  font-size: var(--text-label-md);
}
.state.error {
  color: var(--danger);
}

</style>
