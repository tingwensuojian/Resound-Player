<template>
  <AnimatedAppear
    tag="header"
    variant="content"
    rhythm="head"
    class-name="playlist-detail-header-wrap"
    :class="[embedded && 'detail-sticky-header--embedded', { 'has-header-tabs': $slots.tabs }]"
  >
    <template v-if="loading && !ready">
      <div class="state">{{ loadingText }}</div>
    </template>
    <template v-else-if="error">
      <div class="state error">{{ error }}</div>
    </template>
    <template v-else-if="ready">
      <PageHeroHeader
        tag="div"
        layout-class="playlist-detail-header"
        media-class="playlist-detail-header__media"
        content-class="playlist-detail-header__content"
      >
        <template #media>
          <div class="hero-media-col">
            <div class="hero-media-shell">
              <slot name="media" />
            </div>
          </div>
        </template>
        <template #content>
          <div class="hero-main-shell meta">
            <div class="hero-title-shell">
              <slot name="title" />
            </div>
            <div class="hero-meta-shell">
              <slot name="meta" />
            </div>
            <div class="hero-actions-shell hero-actions-shell--under-cover">
              <AnimatedAppear tag="div" variant="content" rhythm="actions" class-name="ops">
                <slot name="actions" />
              </AnimatedAppear>
            </div>
          </div>
        </template>
      </PageHeroHeader>
      <div v-if="$slots.tabs" class="header-tabs-area">
        <slot name="tabs" />
      </div>
    </template>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { onMounted, watch, nextTick } from 'vue';
import AnimatedAppear from './AnimatedAppear.vue';
import PageHeroHeader from './PageHeroHeader.vue';

const props = defineProps<{
  embedded?: boolean;
  loading?: boolean;
  ready?: boolean;
  error?: string;
  loadingText?: string;
}>();

function remeasureHeight(): void {
  const el = document.querySelector('.playlist-detail-header-wrap') as HTMLElement | null;
  if (el) {
    const h = Math.round(el.getBoundingClientRect().height);
    if (h > 50) el.style.setProperty('--header-full-height', h + 'px');
  }
}

/* ready 变为 true 时重新测量，此时 tabs slot 已渲染 */
watch(() => props.ready, (val) => {
  if (val) nextTick(remeasureHeight);
});

onMounted(remeasureHeight);
</script>

<style scoped>
/* =========================================
 * PageHeroHeader 公共间距 — 供所有详情页统一使用
 * ========================================= */
:deep(.playlist-detail-header) {
  gap: var(--space-4);
  padding: var(--space-2) var(--space-3);
  align-items: center;
}

/* =========================================
 * 基础容器 — 所有视觉由 --sticky-progress 连续驱动（无类切换）
 * ========================================= */
.playlist-detail-header-wrap {
  --collapsed-height: 80px;
  position: sticky;
  top: 0;
  z-index: 30;
  overflow: hidden;
  height: calc(var(--header-full-height, 380px) - var(--sticky-progress, 0) * (var(--header-full-height, 380px) - var(--collapsed-height)));
  margin-left: calc(var(--space-4) * -1);
  margin-right: calc(var(--space-4) * -1);
  padding-left: var(--space-4);
  padding-right: var(--space-4);
  padding-bottom: calc(var(--space-2) - var(--sticky-progress, 0) * 8px);
  padding-top: calc(var(--sticky-progress, 0) * 22px);
  transform: translateZ(0);
  backface-visibility: hidden;
  will-change: height, opacity;
  background: color-mix(in srgb, var(--bg-solid) calc(var(--sticky-progress, 0) * 100%), transparent);
  backdrop-filter: blur(calc(var(--sticky-progress, 0) * 10px)) saturate(calc(1 + var(--sticky-progress, 0) * 0.32));
  -webkit-backdrop-filter: blur(calc(var(--sticky-progress, 0) * 10px)) saturate(calc(1 + var(--sticky-progress, 0) * 0.32));
  border-radius: 0 0 calc(var(--sticky-progress, 0) * 16px) calc(var(--sticky-progress, 0) * 16px);
  clip-path: inset(0 round 0 0 calc(var(--sticky-progress, 0) * 16px) calc(var(--sticky-progress, 0) * 16px));
  box-shadow: 0 calc(var(--sticky-progress, 0) * 8px) calc(var(--sticky-progress, 0) * 20px) var(--shadow-sticky);
  transition:
    border-radius 0.3s cubic-bezier(0.33, 0, 0.1, 1),
    box-shadow 0.3s cubic-bezier(0.33, 0, 0.1, 1);
}

/* =========================================
 * 分隔线 — progress 驱动淡出
 * ========================================= */
.playlist-detail-header-wrap::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: var(--space-3);
  right: var(--space-3);
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--border) 54%, transparent) 20%, color-mix(in srgb, var(--border) 54%, transparent) 80%, transparent);
  opacity: calc(1 - var(--sticky-progress, 0) * 2);
  transition: opacity 0.3s cubic-bezier(0.33, 0, 0.1, 1);
}
.playlist-detail-header-wrap.has-header-tabs::after { opacity: 0; }

/* =========================================
 * 有 tabs 时折叠高度为 134px
 * ========================================= */
.playlist-detail-header-wrap.has-header-tabs {
  --collapsed-height: 134px;
}

/* =========================================
 * 媒体列
 * ========================================= */
.hero-media-col {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: stretch;
}
.hero-media-shell {
  overflow: hidden;
  border-radius: calc(18px - var(--sticky-progress, 0) * 12px);
  transform: translateZ(0);
  opacity: calc(1 - var(--sticky-progress, 0) * 0.08);
}

/* =========================================
 * Grid — cover 列宽由 progress 驱动: 308px → 72px
 * ========================================= */
:deep(.page-hero-header) {
  grid-template-columns: calc(308px - var(--sticky-progress, 0) * 236px) minmax(0, 1fr);
  gap: calc(22px - var(--sticky-progress, 0) * 8px);
}
:deep(.page-hero-header__content) {
  display: block !important;
  min-width: 0;
}
:deep(.page-hero-header__media) {
  display: block !important;
  width: calc(308px - var(--sticky-progress, 0) * 236px) !important;
  min-width: 0 !important;
}

/* =========================================
 * 主内容区 — 普通态 flex column（38585db 样式），吸顶态 grid（并排）
 * ========================================= */
:deep(.hero-main-shell) {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}

/* 吸顶态 — grid: title + actions 同行，meta 第二行 */
.playlist-detail-header-wrap.is-sticky-header :deep(.hero-main-shell) {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  grid-template-areas:
    "title actions"
    "meta   meta";
}

/* 标题 */
:deep(.hero-title-shell) {
  min-width: 0;
}
.playlist-detail-header-wrap.is-sticky-header :deep(.hero-title-shell) {
  grid-area: title;
}
:deep(.hero-title-shell .title) {
  display: block;
  width: 100%;
  margin: 0;
  font-size: calc(38px - var(--sticky-progress, 0) * 14px);
  line-height: calc(44px - var(--sticky-progress, 0) * 20px);
  letter-spacing: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 操作按钮 — 普通态：正常流排在 meta 下方 / 吸顶态：grid 与标题同行 */
:deep(.hero-actions-shell--under-cover) {
  display: flex;
  align-items: center;
}
.playlist-detail-header-wrap.is-sticky-header :deep(.hero-actions-shell--under-cover) {
  grid-area: actions;
  align-self: start;
}
.hero-actions-shell--under-cover :deep(.ops) {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  flex-shrink: 0;
  margin-top: 0;
}

/* 元数据 + 描述 — progress 驱动淡出 + 高度坍缩 */
:deep(.hero-meta-shell) {
  max-height: calc(200px - var(--sticky-progress, 0) * 200px);
  overflow: hidden;
  opacity: calc(1 - var(--sticky-progress, 0) * 2);
  pointer-events: none;
  transition:
    opacity 0.3s cubic-bezier(0.33, 0, 0.1, 1);
}
.playlist-detail-header-wrap.is-sticky-header :deep(.hero-meta-shell) {
  grid-area: meta;
}
:deep(.desc) {
  max-height: calc(200px - var(--sticky-progress, 0) * 200px);
  overflow: hidden;
  opacity: calc(1 - var(--sticky-progress, 0) * 2);
  transition:
    opacity 0.3s cubic-bezier(0.33, 0, 0.1, 1);
}

/* =========================================
 * 标签栏容器 — flex 末尾自然吸附
 * ========================================= */
.header-tabs-area {
  flex-shrink: 0;
  padding: 0 var(--space-3) var(--space-2);
  position: relative;
  z-index: 1;
}

/* =========================================
 * 封面 — 滚动驱动缩小 + 圆角过渡
 * ========================================= */
:deep(.cover-motion-shell) {
  display: block;
  line-height: 0;
  transform-origin: center center;
  transform:
    scale(calc(1 - var(--sticky-progress, 0) * 0.2))
    translateY(calc(var(--sticky-progress, 0) * -16px));
  opacity: calc(0.95 + var(--sticky-progress, 0) * 0.05);
  transition:
    opacity 0.3s cubic-bezier(0.33, 0, 0.1, 1);
}
:deep(img.cover) {
  display: block;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  transform-origin: center center;
  will-change: transform;
  border-radius: calc(18px - var(--sticky-progress, 0) * 12px);
  transition:
    transform 0.3s cubic-bezier(0.33, 0, 0.1, 1),
    opacity 0.3s cubic-bezier(0.33, 0, 0.1, 1),
    filter 0.3s cubic-bezier(0.33, 0, 0.1, 1);
}

/* 封面 hover 缩放 — 始终可用（缩小时自然无感知） */
@media (hover: hover) and (pointer: fine) {
  .hero-media-shell:hover :deep(img.cover),
  .hero-media-shell:focus-within :deep(img.cover) {
    transform: scale(var(--image-hover-scale, 1.04));
    filter: saturate(var(--image-hover-saturate, 1.04));
  }
}

/* =========================================
 * tabs 标签 button — transform scale 视觉缩小（免布局触发）
 * ========================================= */
:deep(.artist-tab) {
  height: calc(38px - var(--sticky-progress, 0) * 10px) !important;
  min-height: 0 !important;
}
:deep(.playlist-tab) {
  height: calc(38px - var(--sticky-progress, 0) * 10px) !important;
  min-height: 0 !important;
}

/* 搜索输入框 — height 布局缩小 */
:deep(.tab-search-input) {
  height: calc(34px - var(--sticky-progress, 0) * 8px) !important;
  min-height: 0 !important;
}

/* =========================================
 * 嵌入模式变体 — progress 驱动偏移
 * ========================================= */
.playlist-detail-header-wrap.detail-sticky-header--embedded {
  top: calc(0px - var(--sticky-progress, 0) * 18px);
  margin: 0 -18px 0;
  padding: var(--space-3) 18px;
}

/* 嵌入 + 吸顶态 — 用 width + 负 margin 填满 .detail-panel 的 padding 区域 */
.playlist-detail-header-wrap.detail-sticky-header--embedded.is-sticky-header {
  width: calc(100% + 36px) !important;
  margin: 0 -18px !important;
  box-sizing: border-box;
}

/* =========================================
 * 减少动效降级
 * ========================================= */
@media (prefers-reduced-motion: reduce) {
  .playlist-detail-header-wrap {
    transition: none;
  }
  .playlist-detail-header-wrap::after,
  :deep(.hero-actions-shell--under-cover),
  :deep(.hero-meta-shell),
  :deep(.desc),
  :deep(.hero-title-shell .title),
  :deep(.cover-motion-shell),
  :deep(img.cover) {
    transition: none;
  }
}
</style>