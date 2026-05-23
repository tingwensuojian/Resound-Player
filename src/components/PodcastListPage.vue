<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="podcast-page">
    <div class="podcast-shell">
      <section class="podcast-main">
        <AnimatedAppear tag="section" variant="content" rhythm="body" class-name="main-card hero-card">
          <div class="hero-top">
            <div>
              <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="title">播客有声书</AnimatedAppear>
            </div>
          </div>

          <div class="card-head card-head--wrap">
            <div class="section-switch" role="tablist" aria-label="播客分类内容切换">
              <button
                v-for="option in sectionModes"
                :key="option.key"
                type="button"
                class="section-switch__item"
                :class="{ 'section-switch__item--active': activeSectionMode === option.key }"
                :aria-pressed="activeSectionMode === option.key"
                @click="activeSectionMode = option.key"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div v-if="categoryTabs.length" class="category-tabs ui-safe-rail" aria-label="电台分类标签栏">
            <button
              v-for="category in categoryTabs"
              :key="category.id"
              type="button"
              class="category-tabs__item"
              @click="openCategory(category)"
            >
              {{ category.name }}
            </button>
          </div>

          <div v-if="loading" class="empty-box">加载中…</div>
          <div v-else-if="groupedSections.length" class="grouped-sections">
            <AnimatedAppear
              v-for="(section, sectionIndex) in groupedSections"
              :key="section.key"
              tag="section"
              variant="content"
              rhythm="list"
              :index="sectionIndex"
              class-name="category-section"
            >
              <div class="category-head">
                <h4 class="category-title">{{ section.label }}</h4>
                <span v-if="section.items.length > 4" class="category-scroll-tip">左右滑动查看更多</span>
              </div>
              <HorizontalScrollRail
                v-if="section.items.length"
                :aria-label="section.label"
                content-class="content-grid"
              >
                <AnimatedAppear
                  v-for="(item, idx) in section.items"
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
              </HorizontalScrollRail>
              <p v-else class="category-empty">暂无推荐内容</p>
            </AnimatedAppear>
            <p v-if="anyLoadingMore" class="category-loading-more">加载中…</p>
          </div>
          <p v-else class="empty-box">暂无可展示的播客与有声书内容</p>
        </AnimatedAppear>
      </section>
    </div>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { getDjCatelist, getDjRadioHot, getDjRecommendType } from '../api/music';
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import AnimatedAppear from './AnimatedAppear.vue';
import InteractiveCoverMedia from './InteractiveCoverMedia.vue';
import HorizontalScrollRail from './ui/HorizontalScrollRail.vue';
const props = defineProps<{ items: any[]; recentItems?: any[]; subscribedItems?: any[]; categoryOptions?: Array<{ id: number; name: string }>; activeCategory?: number | null; loading?: boolean }>();
const emit = defineEmits<{ (e: 'back'): void; (e: 'open-detail', item: any): void; (e: 'change-category', categoryId: number): void; (e: 'open-category', category: { id: number; name: string }): void }>();
const activeSectionMode = ref<'recommend' | 'hot'>('recommend');
const sectionModes = [
  { key: 'recommend', label: '推荐' },
  { key: 'hot', label: '热门' },
] as const;
const categoryRecommendations = ref<Record<number, any[]>>({});
const categoryTabs = ref<Array<{ id: number; name: string }>>([]);
const categoryLoading = ref(false);
const categoryOffsets = ref<Record<number, number>>({});
const categoryHasMore = ref<Record<number, boolean>>({});
const categoryLoadingMore = ref<Record<number, boolean>>({});
const PAGE_SIZE = 30;
const anyLoadingMore = computed(() => Object.values(categoryLoadingMore.value).some(Boolean));
const fallbackCover = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="32" fill="#e2e8f0"/><circle cx="100" cy="84" r="40" fill="#cbd5e1"/><rect x="46" y="136" width="108" height="20" rx="10" fill="#cbd5e1"/></svg>`);
const loginState = computed(() => userStore.state.loginMode === 'cookie' || userStore.state.loginMode === 'qr' ? { kind: 'full', badge: '完整登录', notice: '当前展示推荐电台与真实分类。' } : userStore.state.loginMode === 'uid' ? { kind: 'public', badge: '搜索用户模式', notice: '当前展示公开可访问的播客和有声书内容。' } : { kind: 'guest', badge: '游客模式', notice: '当前未登录，也可直接浏览播客和有声书内容。' });
const curatedItems = computed(() => props.items.slice(0, 40));
const groupedSections = computed(() => {
  const categories = props.categoryOptions || [];
  const sections = categories.map((category) => ({
    key: `cat-${category.id}`,
    label: category.name,
    items: categoryRecommendations.value[category.id] || [],
  }));

  if (sections.length) return sections;
  return [{ key: 'all', label: '推荐内容', items: curatedItems.value }].filter((section) => section.items.length);
});
const sectionSummary = computed(() => loginState.value.kind === 'full' ? `共 ${props.categoryOptions?.length || 0} 个分类` : '探索内容');
const pageSubtitle = computed(() => loginState.value.kind === 'full' ? '' : loginState.value.kind === 'public' ? '' : '');
watch(() => userStore.state.loginMode, () => { void loadCategoryRecommendations(); }, { immediate: true });
watch(() => props.categoryOptions, () => { void loadCategoryRecommendations(); }, { immediate: true });
watch(activeSectionMode, () => { void loadCategoryRecommendations(); });

void loadCategoryTabs();

async function loadCategoryTabs() {
  try {
    const response = await getDjCatelist();
    const tabs = normalizeCategoryTabs(response);
    categoryTabs.value = tabs;
  } catch {
    categoryTabs.value = props.categoryOptions || [];
  }
}

async function loadCategoryRecommendations() {
  const categories = props.categoryOptions || [];
  if (!categories.length) {
    categoryRecommendations.value = {};
    return;
  }

  categoryLoading.value = true;
  categoryRecommendations.value = {};
  categoryOffsets.value = {};
  categoryHasMore.value = {};
  try {
    // 串行请求避免触发 Netease API 频率限制
    for (const category of categories) {
      try {
        const response = activeSectionMode.value === 'hot'
          ? await getDjRadioHot({ cateId: category.id, limit: PAGE_SIZE, offset: 0 })
          : await getDjRecommendType(category.id);
        const items = normalizeVoiceItems(response);
        const hasMore = activeSectionMode.value === 'hot' ? extractHasMore(response) : false;
        categoryRecommendations.value = {
          ...categoryRecommendations.value,
          [category.id]: items,
        };
        if (activeSectionMode.value === 'hot') {
          categoryOffsets.value = { ...categoryOffsets.value, [category.id]: 0 };
          categoryHasMore.value = { ...categoryHasMore.value, [category.id]: hasMore };
        }
      } catch {
        categoryRecommendations.value = {
          ...categoryRecommendations.value,
          [category.id]: [],
        };
      }
      // 串行间隔，避免触发频率限制
      if (activeSectionMode.value !== 'hot') {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  } finally {
    categoryLoading.value = false;
  }
}

function normalizeVoiceItems(payload: any) {
  const candidates = [
    payload?.data?.djRadios,
    payload?.djRadios,
    payload?.data?.list,
    payload?.data?.voiceList,
    payload?.data?.data?.list,
    payload?.data?.data?.voiceList,
    payload?.data?.radios,
    payload?.radios,
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

function findScrollRoot(): Element | null {
  return (
    document.querySelector('main.content') ||
    document.querySelector('[class*="content"]') ||
    document.querySelector('.main-area') ||
    null
  );
}

let scrollTick = 0;

function handleScroll() {
  if (activeSectionMode.value !== 'hot') return;
  const root = findScrollRoot();
  if (!root) return;
  const { scrollTop, scrollHeight, clientHeight } = root;
  if (scrollTop + clientHeight >= scrollHeight - 400) {
    cancelAnimationFrame(scrollTick);
    scrollTick = requestAnimationFrame(() => {
      const categories = props.categoryOptions || [];
      for (const cat of categories) {
        void loadMoreItems(cat.id);
      }
    });
  }
}

onMounted(() => {
  const root = findScrollRoot();
  if (root) root.addEventListener('scroll', handleScroll, { passive: true });
});

onUnmounted(() => {
  const root = findScrollRoot();
  if (root) root.removeEventListener('scroll', handleScroll);
  cancelAnimationFrame(scrollTick);
});

async function loadMoreItems(categoryId: number) {
  if (activeSectionMode.value !== 'hot') return;
  if (categoryLoadingMore.value[categoryId]) return;
  if (!categoryHasMore.value[categoryId]) return;

  categoryLoadingMore.value = { ...categoryLoadingMore.value, [categoryId]: true };
  try {
    const currentOffset = categoryOffsets.value[categoryId] || 0;
    const response = await getDjRadioHot({
      cateId: categoryId,
      limit: PAGE_SIZE,
      offset: currentOffset + PAGE_SIZE,
    });
    const items = normalizeVoiceItems(response);
    const hasMore = extractHasMore(response);
    const existing = categoryRecommendations.value[categoryId] || [];
    categoryRecommendations.value = {
      ...categoryRecommendations.value,
      [categoryId]: [...existing, ...items],
    };
    categoryOffsets.value = {
      ...categoryOffsets.value,
      [categoryId]: (categoryOffsets.value[categoryId] || 0) + PAGE_SIZE,
    };
    categoryHasMore.value = { ...categoryHasMore.value, [categoryId]: hasMore };
  } catch {
    // silently fail
  } finally {
    categoryLoadingMore.value = { ...categoryLoadingMore.value, [categoryId]: false };
  }
}

function normalizeCategoryTabs(payload: any) {
  const candidates = [payload?.data?.categories, payload?.categories, payload?.data, payload?.result?.categories];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item: any) => ({ id: Number(item?.id), name: item?.name || '' }))
        .filter((item: { id: number; name: string }) => Number.isFinite(item.id) && item.name);
    }
  }
  return [];
}

function coverOf(item: any) { return item?.coverUrl || item?.picUrl || item?.imgUrl || item?.program?.coverUrl || item?.program?.blurCoverUrl || item?.program?.radio?.picUrl || item?.program?.mainSong?.al?.picUrl || item?.radio?.picUrl || item?.mainSong?.al?.picUrl || fallbackCover; }
function titleOf(item: any) { return item?.name || item?.title || item?.program?.name || item?.programName || '播客节目'; }
function subtitleOf(item: any) {
  return item?.subtitle || item?.description || item?.briefDesc || item?.creator?.nickname || item?.program?.radio?.name || item?.radio?.name || '';
}
function openCategory(category: { id: number; name: string }) { if (category?.id) emit('open-category', category); }
function openCuratedPage() {
  if (featuredCategory.value?.id) emit('open-curated-page', featuredCategory.value);
}
function openDetail(item: any) { if (item) emit('open-detail', item); }
</script>

<style scoped>
.podcast-page,.podcast-main{display:grid;gap:var(--space-4)}
.main-card{display:grid;gap:var(--space-4);padding:var(--space-4);border-radius:var(--radius-xl,24px)}
.hero-top,.card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-3)}
.card-head--wrap{flex-wrap:wrap}.content-meta span{color:var(--text-sub)}
.title,.card-title{margin:0;font-size:24px;font-weight:800}
.hero-actions{display:flex;flex-wrap:wrap;gap:var(--space-2)}
.section-switch{display:inline-flex;align-items:center;gap:var(--space-1);padding:4px;border:1px solid color-mix(in srgb, var(--accent) 30%, var(--border));border-radius:16px;background:color-mix(in srgb, var(--bg-surface) 94%, transparent)}
.section-switch__item{height:32px;padding:0 var(--space-4);border:0;border-radius:12px;background:transparent;color:var(--text-sub);font-weight:600;cursor:pointer;transition:background 0.18s ease,color 0.18s ease,transform 0.18s ease}
.section-switch__item--active{background:color-mix(in srgb, var(--accent) 14%, var(--bg-surface));color:var(--accent)}
.section-switch__item:hover{transform:translateY(-1px)}
.category-tabs{display:grid;grid-auto-flow:column;grid-auto-columns:max-content;gap:var(--space-2);padding-bottom:var(--space-1);-webkit-overflow-scrolling:touch}
.category-tabs::-webkit-scrollbar{display:none}
.category-tabs__item{display:inline-flex;align-items:center;height:36px;padding:0 var(--space-3);border:1px solid color-mix(in srgb, var(--border) 78%, transparent);border-radius:999px;background:color-mix(in srgb, var(--bg-surface) 94%, transparent);color:var(--text-sub);font-size:14px;white-space:nowrap;cursor:pointer;transition:transform 0.18s ease,border-color 0.18s ease,color 0.18s ease,background 0.18s ease}
.category-tabs__item:hover{transform:translateY(-1px);border-color:color-mix(in srgb, var(--accent) 24%, var(--border));color:var(--accent)}
.grouped-sections{display:grid;gap:var(--space-6)}
.category-section{display:grid;gap:var(--space-3)}
.category-head{display:flex;align-items:center;justify-content:space-between;gap:var(--space-2)}
.category-title{margin:0;font-size:24px;font-weight:700;line-height:1.2;position:relative;padding-left:var(--space-3)}
.category-title::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:4px;height:28px;border-radius:999px;background:var(--text-main)}
.category-scroll-tip{color:var(--text-sub);font-size:13px;white-space:nowrap}
.category-empty{margin:0;padding:var(--space-3) 0;color:var(--text-sub);font-size:14px}
.category-loading-more{margin:0;padding:var(--space-2) 0;color:var(--text-sub);font-size:13px;text-align:center}
.pill-btn,.content-card{border:1px solid color-mix(in srgb, var(--border) 78%, transparent);transition:transform 180ms ease-out,border-color 180ms ease-out,box-shadow 180ms ease-out,background 180ms ease-out}
.pill-btn{height:40px;padding:0 var(--space-3);border-radius:999px;background:var(--bg-muted)}
.content-card:hover,.pill-btn:hover{transform:translateY(-1px);border-color:color-mix(in srgb, var(--accent) 24%, var(--border));box-shadow:0 12px 24px rgba(15,23,42,.08)}
:deep(.content-grid){--horizontal-scroll-item-width:180px}
.content-card{display:grid;gap:var(--space-3);padding:var(--space-2);border-radius:var(--radius-xl,24px);text-align:left;scroll-snap-align:start}
:deep(.content-media-shell){width:100%;aspect-ratio:1/1;border-radius:20px}:deep(.content-cover-motion-shell){width:100%;height:100%;border-radius:20px;overflow:hidden}:deep(.content-cover){width:100%;height:100%;object-fit:cover}
.content-meta{display:grid;gap:var(--space-1)}
.content-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-2)}
.content-title-row strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:16px;font-weight:600;line-height:1.5}
.content-meta span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.empty-box{margin:0;padding:var(--space-5);border-radius:var(--radius-lg,18px);background:var(--bg-muted);color:var(--text-sub)}
@media (max-width:1100px){:deep(.content-grid){--horizontal-scroll-item-width:164px}}
@media (max-width:767px){.main-card{padding:var(--space-3)}.hero-stats{grid-template-columns:1fr}.hero-top,.card-head{flex-direction:column}.category-tabs{padding-bottom:0}.category-head{align-items:flex-start;flex-wrap:wrap}.category-title{font-size:22px}:deep(.content-grid){--horizontal-scroll-item-width:148px}}
</style>
