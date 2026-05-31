# DetailShrinkShell 组件 — 详情页头部缩小/放大实现

## 1. 概述

`DetailShrinkShell.vue` 是项目统一的详情页头部容器组件，管理以下行为：

- **头部缩小/放大**：滚动时头部从 290px 平滑过渡到 160px（桌面端）
- **Tabs + Search 行**：歌曲/评论标签和模糊搜索在封面下方
- **内容区偏移**：`margin-top` 自动补偿头部高度

目前所有详情页（PlaylistDetailPage、AlbumDetailPage、ArtistDetailPage、PodcastDetailPage、LanguageDetailPage、UserDetailPage）均已接入。

## 2. 架构

### 2.1 DOM 结构

```
.detail-shrink-shell.playlist-detail-page   ← flex column, 相对定位, 负 margin 撑满父级
  .detail                                    ← 头部容器, 绝对定位, flex column
    .detail-body                             ← 封面 + 信息, flex: 1
      .hero-media                            ← 封面区域 (slot name="media")
      .hero-info                             ← 标题/元数据/操作区
        .hero-title                          ← 标题 (slot name="title")
        .hero-meta                           ← 元数据 (slot name="meta", 小模式隐藏)
        .hero-actions                        ← 操作按钮 (slot name="actions")
    .detail-tabs                             ← Tabs 行 (slot name="tabs")
  .shell-content                             ← 内容区, flex: 1, margin-top 补偿头部
```

### 2.2 插槽

| 插槽名 | 用途 | 小模式行为 |
|--------|------|-----------|
| `media` | 封面图片（通常传入 HeroCoverMedia） | 缩小至 120×120 |
| `title` | 标题文字 | 字号 22px，margin-bottom 减小 |
| `meta` | 元数据（创建者、描述等） | `v-if="!listScrolling"` 隐藏 |
| `actions` | 操作按钮（播放全部、收藏等） | gap 缩小 |
| `tabs` | 标签栏 + 搜索框（通常传入 DetailTabBar） | 按钮/输入框缩小 |
| `content` | 列表内容区 | margin-top 从 290px 减至 160px |

### 2.3 Props

| Prop | 类型 | 说明 |
|------|------|------|
| `listScrolling` | `boolean` | 是否处于小模式（由 `useListScroll` 驱动） |

## 3. 关键尺寸

### 3.1 桌面端

| 状态 | `.detail` 高度 | `.shell-content` margin-top | `.hero-media` 尺寸 |
|------|---------------|----------------------------|-------------------|
| 普通 | 290px | 290px | 200×200 |
| 小模式 | 160px | 160px | 120×120 |

### 3.2 移动端 (≤768px)

| 状态 | `.detail` 高度 | `.shell-content` margin-top |
|------|---------------|----------------------------|
| 普通 | 220px | 220px |
| 小模式 | 136px | 136px |

## 4. Tabs 缩小

小模式下，Tabs 及搜索框同步缩小：

```css
/* 桌面端小模式 */
.playlist-tab        → 30px 高, 72px min-width, 12px 字号
.tab-search-input    → 28px 高, 140px 宽, 12px 字号
.tab-search-clear    → 18×18px

/* 移动端小模式 */
.playlist-tab        → 26px 高, 64px min-width, 11px 字号
.tab-search-input    → 24px 高, 120px 宽, 11px 字号
```

## 5. 滚动 Composables

### 5.1 `useListScroll`

文件: `src/composables/useScrollShrink.ts`

提供 `listScrolling` ref、`handleListScroll` 和 `resetScroll`。100ms leading-edge 节流，`scrollTop > 10` 触发小模式。

```ts
const { listScrolling, handleListScroll, resetScroll } = useListScroll()
```

### 5.2 使用流程

1. 页面组件调用 `useListScroll()`
2. 将 `listScrolling` 传给 `<DetailShrinkShell :list-scrolling="listScrolling">`
3. 内容区的滚动容器绑定额外的 `@scroll="handleListScroll"`
4. 页面切换时调用 `resetScroll()` 重置状态

## 6. 旧背景系统清理

2026-06 重构中，移除了所有头部背景 CSS（高斯模糊 + 渐变覆盖层），包括：

- `.hero-bg` 元素 — 已从组件中删除
- `coverUrl` prop — 已移除
- `.content--hero-sticky::before` 的 `:has()` 隐藏规则 — 已删除
- `.panel::before` / `.daily-page::before` / `.user-detail-page::before` — 已设为 `display: none`

## 7. 接入示例

```vue
<template>
  <DetailShrinkShell
    :list-scrolling="listScrolling"
  >
    <template #media>
      <HeroCoverMedia :src="coverUrl" :alt="title" />
    </template>
    <template #title>
      <h2 class="title">{{ title }}</h2>
    </template>
    <template #meta>
      <!-- 元数据：仅在普通模式显示 -->
    </template>
    <template #actions>
      <!-- 操作按钮 -->
    </template>
    <template #tabs>
      <DetailTabBar v-model="activeTab" :tabs="tabs" ... />
    </template>
    <template #content>
      <div class="page-content-scroll" @scroll="handleListScroll">
        <!-- 列表内容 -->
      </div>
    </template>
  </DetailShrinkShell>
</template>

<script setup lang="ts">
import { useListScroll } from '../composables/useScrollShrink'
const { listScrolling, handleListScroll, resetScroll } = useListScroll()
</script>

<style>@import '../styles/detail-page.css';</style>
```

## 8. 注意事项

1. **页面根容器无需额外负 margin** — `.detail-shrink-shell` 已带 `.playlist-detail-page` class 自动处理
2. **内容区必须绑定 `handleListScroll`** — 否则小模式不会触发
3. **页面切换必须调用 `resetScroll()`** — 避免新页面从中间显示
4. **`page-content-scroll` 类** — 内容区的滚动容器使用此 class 获得正确高度（已内置 `overflow-x: hidden`，无需重复定义）
