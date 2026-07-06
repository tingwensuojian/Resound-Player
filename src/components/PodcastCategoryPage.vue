<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="podcast-page">
    <div class="podcast-shell">
      <section class="podcast-main">
        <AnimatedAppear tag="section" variant="content" rhythm="body" class-name="main-card hero-card">
          <div class="hero-top">
            <div>
              <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="title">{{ category.name || '分类内容' }}</AnimatedAppear>
            </div>
          </div>

          <div class="card-head card-head--wrap">
            <div class="hero-actions">
              <button class="pill-btn button-surface" type="button" @click="$emit('back')">返回</button>
            </div>
            <div v-if="categoryTabs.length" class="section-switch ui-safe-group" role="tablist" aria-label="分类内容切换">
              <button
                v-for="option in categoryTabs"
                :key="option.key"
                type="button"
                class="section-switch__item"
                :class="{ 'section-switch__item--active': activeTab === option.key }"
                :aria-pressed="activeTab === option.key"
                @click="activeTab = option.key"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div v-if="loading" class="empty-box">加载中…</div>
          <div v-else-if="items.length" class="grouped-sections">
            <div class="content-grid">
              <AnimatedAppear
                v-for="(item, idx) in items"
                :key="item.id || item.voiceListId || item.program?.id || `${titleOf(item)}-${idx}`"
                tag="button"
                variant="media"
                rhythm="list"
                :index="idx"
                class-name="content-card interactive-media-trigger"
                type="button"
                @click="openDetail(item)"
              >
                <InteractiveCoverMedia
                  :src="coverOf(item)"
                  :alt="titleOf(item)"
                  :index="idx"
                  shell-class="content-media-shell"
                  motion-class="content-cover-motion-shell"
                  image-class="content-cover"
                />
                <div class="content-meta">
                  <div class="content-title-row">
                    <strong>{{ titleOf(item) }}</strong>
                  </div>
                  <span v-if="subtitleOf(item)">{{ subtitleOf(item) }}</span>
                </div>
              </AnimatedAppear>
            </div>
            <p v-if="activeTab === 'hot' && hotLoadingMore" class="category-loading-more">加载中…</p>
          </div>
          <p v-else class="empty-box">暂无可展示的分类内容</p>
        </AnimatedAppear>
      </section>
    </div>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { getDjRadioHot, getDjRecommendType } from '../api/music';
import { useApiQuery } from '../composables/useApiQuery';
import AnimatedAppear from './AnimatedAppear.vue';
import InteractiveCoverMedia from './InteractiveCoverMedia.vue';

const props = defineProps<{ category: { id: number; name: string } }>();
const emit = defineEmits<{
  (e: 'back'): void;
  (e: 'open-detail', item: any): void;
}>();

const activeTab = ref<'hot' | 'recommend'>('hot');
const itemsByTab = ref<Record<'hot' | 'recommend', any[]>>({ hot: [], recommend: [] });
const hotPage = ref(1);
const hotHasMore = ref(false);
const hotLoadingMore = ref(false);
const PAGE_SIZE = 30;
const categoryTabs = [
  { key: 'hot', label: '热门' },
  { key: 'recommend', label: '推荐' },
] as const;
const items = computed(() => itemsByTab.value[activeTab.value] || []);
const fallbackCover = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="32" fill="#e2e8f0"/><circle cx="100" cy="84" r="40" fill="#cbd5e1"/><rect x="46" y="136" width="108" height="20" rx="10" fill="#cbd5e1"/></svg>`);

// 数据加载由 useApiQuery 通过 queryKey computed 自动管理
watch(activeTab, () => { requestAutoLoadHot(); });

function findScrollRoot(): Element | null {
  return document.querySelector('main.content') || document.querySelector('.main-area') || null;
}

function isNearBottom(): boolean {
  const root = findScrollRoot();
  if (root) {
    const { scrollTop, scrollHeight, clientHeight } = root;
    return scrollTop + clientHeight >= scrollHeight - 360;
  }

  const doc = document.documentElement;
  return window.scrollY + window.innerHeight >= doc.scrollHeight - 360;
}

let scrollTick = 0;
let lastAutoLoadAt = 0;

function requestAutoLoadHot() {
  cancelAnimationFrame(scrollTick);
  scrollTick = requestAnimationFrame(() => {
    if (activeTab.value !== 'hot') return;
    if (!isNearBottom()) return;
    const now = Date.now();
    if (now - lastAutoLoadAt < 700) return;
    lastAutoLoadAt = now;
    void loadMoreHot();
  });
}

onMounted(() => {
  const root = findScrollRoot();
  root?.addEventListener('scroll', requestAutoLoadHot, { passive: true });
  root?.addEventListener('wheel', requestAutoLoadHot, { passive: true });
  window.addEventListener('scroll', requestAutoLoadHot, { passive: true });
  window.addEventListener('wheel', requestAutoLoadHot, { passive: true });
  window.addEventListener('touchend', requestAutoLoadHot, { passive: true });
});

onUnmounted(() => {
  const root = findScrollRoot();
  root?.removeEventListener('scroll', requestAutoLoadHot);
  root?.removeEventListener('wheel', requestAutoLoadHot);
  window.removeEventListener('scroll', requestAutoLoadHot);
  window.removeEventListener('wheel', requestAutoLoadHot);
  window.removeEventListener('touchend', requestAutoLoadHot);
  cancelAnimationFrame(scrollTick);
});

const {
  data: categoryData,
  isFetching: loading,
  error: queryError,
} = useApiQuery({
  queryKey: computed(() => ['podcast', 'category', props.category?.id]),
  queryFn: async () => {
    const [hotRes, recommendRes] = await Promise.all([
      getDjRadioHot({ cateId: props.category.id, limit: PAGE_SIZE, offset: 0 }),
      getDjRecommendType(props.category.id),
    ]);
    return {
      hot: normalizeVoiceItems(hotRes),
      recommend: normalizeVoiceItems(recommendRes),
      hotHasMore: extractHasMore(hotRes),
    };
  },
  ttl: 'LIST_VOLATILE',
  enabled: computed(() => Boolean(props.category?.id)),
});

watch(categoryData, (val) => {
  if (val) {
    itemsByTab.value = { hot: val.hot, recommend: val.recommend };
    hotHasMore.value = val.hotHasMore;
    hotPage.value = 1;
    hotLoadingMore.value = false;
    requestAutoLoadHot();
  }
}, { immediate: true });

function normalizeVoiceItems(payload: any) {
  const candidates = [
    payload?.data?.djRadios,
    payload?.djRadios,
    payload?.data?.radios,
    payload?.radios,
    payload?.data?.list,
    payload?.data?.voiceList,
    payload?.data?.data?.list,
    payload?.data?.data?.voiceList,
    payload?.list,
    payload?.voiceList,
    payload?.result?.list,
    payload?.result?.voiceList,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function extractHasMore(payload: any): boolean {
  if (typeof payload?.hasMore === 'boolean') return payload.hasMore;
  if (typeof payload?.data?.hasMore === 'boolean') return payload.data.hasMore;
  if (typeof payload?.more === 'boolean') return payload.more;
  if (typeof payload?.data?.more === 'boolean') return payload.data.more;
  if (typeof payload?.result?.hasMore === 'boolean') return payload.result.hasMore;
  if (typeof payload?.result?.more === 'boolean') return payload.result.more;
  return false;
}

async function loadMoreHot() {
  if (!props.category?.id) return;
  if (hotLoadingMore.value) return;
  if (!hotHasMore.value) return;

  hotLoadingMore.value = true;
  try {
    const offset = hotPage.value * PAGE_SIZE;
    const response = await getDjRadioHot({ cateId: props.category.id, limit: PAGE_SIZE, offset });
    const nextItems = normalizeVoiceItems(response);
    itemsByTab.value = {
      ...itemsByTab.value,
      hot: [...itemsByTab.value.hot, ...nextItems],
    };
    hotPage.value += 1;
    hotHasMore.value = extractHasMore(response);
  } finally {
    hotLoadingMore.value = false;
  }
}

function coverOf(item: any) { return item?.coverUrl || item?.picUrl || item?.imgUrl || item?.program?.coverUrl || item?.program?.blurCoverUrl || item?.program?.radio?.picUrl || item?.program?.mainSong?.al?.picUrl || item?.radio?.picUrl || item?.mainSong?.al?.picUrl || fallbackCover; }
function titleOf(item: any) { return item?.name || item?.title || item?.program?.name || item?.programName || '播客节目'; }
function subtitleOf(item: any) { return item?.subtitle || item?.description || item?.briefDesc || item?.creator?.nickname || item?.program?.radio?.name || item?.radio?.name || ''; }
function openDetail(item: any) { if (item) emit('open-detail', item); }
</script>

<style scoped>
.podcast-page,.podcast-main{display:grid;gap:var(--space-4);overflow-anchor:none}
.main-card{display:grid;gap:var(--space-4);padding:var(--space-4);border-radius:var(--radius-xl,24px)}
.hero-top,.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-3)}
.card-head--wrap{flex-wrap:wrap}.content-meta span{color:var(--text-sub)}
.title{margin:0;font-size:24px;font-weight:800}
.hero-actions{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.section-switch{display:inline-flex;align-items:center;gap:var(--space-1);padding:4px 4px 0;border:1px solid color-mix(in srgb, var(--accent) 30%, var(--border));border-radius:16px;background:color-mix(in srgb, var(--bg-surface) 94%, transparent)}
.section-switch__item{height:32px;padding:0 var(--space-4);color:var(--text-sub);font-weight:600;cursor:pointer;transition:background 0.18s ease,color 0.18s ease,transform 0.18s ease}.section-switch__item--active{background:color-mix(in srgb, var(--accent) 14%, var(--bg-solid)) !important;color:var(--accent) !important}


.grouped-sections{display:grid;gap:var(--space-6)}
.pill-btn,.content-card{border:1px solid color-mix(in srgb, var(--border) 78%, transparent);transition:transform 180ms ease-out,border-color 180ms ease-out,box-shadow 180ms ease-out,background 180ms ease-out}
.pill-btn{height:40px;padding:0 var(--space-3);border-radius:999px;background:var(--bg-muted)}
.content-card:hover,.pill-btn:hover{transform:translateY(-1px);border-color:color-mix(in srgb, var(--accent) 24%, var(--border))}
.content-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:var(--space-4);overflow-anchor:none}
.category-loading-more{margin:0;padding:var(--space-3) 0;color:var(--text-sub);font-size:var(--text-body-sm);text-align:center}
.content-card{display:grid;gap:var(--space-3);padding:var(--space-2);border-radius:var(--radius-xl,24px);text-align:left}
:deep(.content-media-shell){width:100%;aspect-ratio:1/1;border-radius:20px}:deep(.content-cover-motion-shell){width:100%;height:100%;border-radius:20px;overflow:hidden}:deep(.content-cover){width:100%;height:100%;object-fit:cover}
.content-meta{display:grid;gap:var(--space-1)}
.content-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-2)}
.content-title-row strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:16px;font-weight:600;line-height:1.5}
.content-meta span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.empty-box{margin:0;padding:var(--space-5);border-radius:var(--radius-lg,18px);background:var(--bg-muted);color:var(--text-sub)}
@media (max-width:767px){.main-card{padding:var(--space-3)}.hero-top,.card-head{flex-direction:column}.content-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
