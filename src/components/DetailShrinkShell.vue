<template>
  <div class="detail-shrink-shell playlist-detail-page" :class="{ small: listScrolling }">
    <!-- 头部容器（固定高度，flex column 布局） -->
    <div class="detail">
      <!-- 主体：封面 + 信息 -->
      <div class="detail-body">
        <div class="hero-media" v-if="$slots.media">
          <slot name="media" />
        </div>
        <div class="hero-info">
          <div class="hero-title" v-if="$slots.title">
            <slot name="title" />
          </div>
          <div v-if="!listScrolling && $slots.meta" class="hero-meta">
            <slot name="meta" />
          </div>
          <div class="hero-actions" v-if="$slots.actions">
            <slot name="actions" />
          </div>
        </div>
      </div>
      <!-- Tabs 行（在 .detail 底部） -->
      <div class="detail-tabs" v-if="$slots.tabs">
        <slot name="tabs" />
      </div>
    </div>
    <!-- 内容区 -->
    <div class="shell-content" :class="{ 'shell-content--shrink': listScrolling }">
      <slot name="content" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  listScrolling: boolean
}>()
</script>

<style scoped>
.detail-shrink-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

/* =========================================
 * 头部容器 — position: absolute 浮动，flex column 布局
 * 高度 290px → 160px（small）
 * ========================================= */
.detail {
  position: absolute;
  display: flex;
  flex-direction: column;
  height: 290px;
  width: 100%;
  padding: 12px 24px 16px 24px;
  z-index: 1;
  /* overflow removed — let hero-actions remain visible */
  box-sizing: border-box;
  transition:
    height 0.3s ease,
    padding 0.3s ease;
}

/* =========================================
 * 主体行（flex: 1，撑满剩余空间）
 * ========================================= */
.detail-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.hero-media {
  flex-shrink: 0;
  width: 200px;
  height: 200px;
  margin-right: 20px;
  border-radius: 16px;
  overflow: hidden;
  transition: margin 0.3s, width 0.3s, height 0.3s;
}

.hero-media :deep(.cover),
.hero-media :deep(img) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover;
}

.hero-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  padding-bottom: 48px;
}

.hero-title :deep(h1),
.hero-title :deep(h2),
.hero-title :deep(.title) {
  font-size: 30px;
  font-weight: bold;
  margin: 0 0 12px 0;
  transition: font-size 0.3s ease, color 0.3s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.hero-meta {
  flex-shrink: 0;
  margin-bottom: 8px;
}

.hero-actions {
  margin-top: auto;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

/* Tabs 行（在 .detail 底部，非 absolute） */
.detail-tabs {
  padding-top: 8px;
  z-index: 1;
  position: relative;
  transition: padding 0.3s ease;
}

/* =========================================
 * .small 状态
 * ========================================= */
.detail-shrink-shell.small .detail {
  height: 160px;
  padding: 8px 16px 8px 16px;
}

.detail-shrink-shell.small .detail-body {
  align-items: center;
}

.detail-shrink-shell.small .hero-media {
  width: 120px;
  height: 120px;
  margin-right: 12px;
}

.detail-shrink-shell.small .hero-title :deep(h1),
.detail-shrink-shell.small .hero-title :deep(h2),
.detail-shrink-shell.small .hero-title :deep(.title) {
  font-size: 22px;
  margin-bottom: 4px;
}

.detail-shrink-shell.small .hero-actions {
  gap: 4px;
}

.detail-shrink-shell.small .hero-info {
  padding-bottom: 0;
}

.detail-shrink-shell.small .detail-tabs {
  padding-top: 4px;
}

/* Small mode — shrink tab child elements */
.detail-shrink-shell.small :deep(.playlist-tab) {
  height: 30px !important;
  min-width: 72px !important;
  padding: 0 12px !important;
  font-size: 12px !important;
}

.detail-shrink-shell.small :deep(.tab-search-input) {
  height: 28px !important;
  width: 140px !important;
  font-size: 12px !important;
  padding: 0 28px 0 12px !important;
}

.detail-shrink-shell.small :deep(.tab-search-clear) {
  width: 18px !important;
  height: 18px !important;
  right: 5px !important;
}

.detail-shrink-shell.small :deep(.playlist-tabs) {
  gap: 8px !important;
}

/* =========================================
 * 内容区 — margin-top 补偿 header 高度
 * ========================================= */
.shell-content {
  flex: 1;
  min-height: 0;
  margin-top: 290px;
  transition: margin-top 0.3s ease;
  overflow-x: hidden;
}

.shell-content--shrink {
  margin-top: 160px;
}

/* 移动端 */
@media (max-width: 768px) {
  .detail {
    height: 220px;
    padding: 8px 16px 12px 16px;
  }

  .hero-media {
    margin-right: 12px;
  }

  .hero-title :deep(h1),
  .hero-title :deep(h2),
  .hero-title :deep(.title) {
    font-size: 22px;
    margin-bottom: 8px;
  }

  .detail-shrink-shell.small .detail {
    height: 136px;
    padding: 6px 12px 6px 12px;
  }

  .detail-shrink-shell.small .hero-title :deep(h1),
  .detail-shrink-shell.small .hero-title :deep(h2),
  .detail-shrink-shell.small .hero-title :deep(.title) {
    font-size: 18px;
    margin-bottom: 2px;
  }

  /* Mobile small mode — shrink tab elements */
  .detail-shrink-shell.small :deep(.playlist-tab) {
    height: 26px !important;
    min-width: 64px !important;
    padding: 0 10px !important;
    font-size: 11px !important;
  }

  .detail-shrink-shell.small :deep(.tab-search-input) {
    height: 24px !important;
    width: 120px !important;
    font-size: 11px !important;
  }

  .detail-shrink-shell.small .detail-tabs {
    padding-top: 2px;
  }

  .shell-content {
    margin-top: 220px;
  }

  .shell-content--shrink {
    margin-top: 136px;
  }
}
</style>

<style>
/* Shared scroll container for DetailsShrinkShell content slots */
.page-content-scroll {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
