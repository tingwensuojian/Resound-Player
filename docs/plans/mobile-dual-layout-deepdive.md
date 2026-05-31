# 方案二深化的 — Mobile-Native 双布局完整实现设计

> 本文档在方案二基础上深度展开，包括组件树、数据流、CSS 架构、动画细节、边缘情况、迁移路径。

---

## 一、总体架构

### 组件树

```
App.vue (detects isNarrow → provides isMobileLayout)
│
├── [Desktop Branch]  DetailHeroDesktop.vue       ← 桌面/平板端
│   └── StickyHeroHeader.vue (全新 IO 版本)
│       ├── HeroCoverMedia.vue (复用现有)
│       ├── HeroTitle.vue
│       ├── HeroMeta.vue
│       ├── HeroActions.vue
│       └── HeroTabs.vue
│
└── [Mobile Branch]   DetailHeroMobile.vue        ← 移动端
    ├── MobileHeroSplash.vue                      ← 全屏 splash
    ├── MobileMiniBar.vue                         ← 浮层 top bar
    └── (scroll-host + 歌曲列表)
```

### 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `src/components/DetailHeroRouter.vue` | 新增 | 根据平台 + 屏幕宽度选择 desktop/mobile |
| `src/components/DetailHeroDesktop.vue` | 新增 | 桌面端 header 包装器 |
| `src/components/DetailHeroMobile.vue` | 新增 | 移动端 header 包装器 |
| `src/components/MobileHeroSplash.vue` | 新增 | 移动端全屏 hero 区域 |
| `src/components/MobileMiniBar.vue` | 新增 | 移动端浮层 mini-bar |
| `src/composables/useMobileHeroScroll.ts` | 新增 | 移动端 scroll composable |
| `src/composables/useDesktopStickySentinel.ts` | 新增 | 桌面端 IO sticky composable |
| `src/styles/hero-mobile.css` | 新增 | 移动端 hero 样式 |
| `src/styles/hero-desktop.css` | 新增（或复用 detail-page.css） | 桌面端 hero 样式 |
| `src/components/DetailStickyHeroHeader.vue` | **删除** | 旧组件 |
| `src/composables/useDetailStickyState.ts` | **删除** | 旧 composable |
| `src/styles/detail-page.css` | **大幅精简** | 移除 header 相关样式 |

### 数据流

```
Detail Page (PlaylistDetailPage / AlbumDetailPage / etc.)
  │
  │ 通过 props 传递：coverUrl, title, meta[], actions[], tabs[]
  ▼
DetailHeroRouter
  │
  ├── isMobileLayout=false → DetailHeroDesktop
  │     ├── useDesktopStickySentinel(coverUrl)  ← IO-based
  │     └── 输出：sticky header with cover + title + meta + actions + tabs
  │
  └── isMobileLayout=true → DetailHeroMobile
        ├── useMobileHeroScroll()  ← IO-based
        └── 输出：MobileHeroSplash + MobileMiniBar
```

---

## 二、响应式切换策略

### 核心思路：CSS media query 驱动 + Vue 动态组件

不使用 `isNarrow` ref（现有 App.vue 的方式），改用 **CSS `display: none` + 纯 CSS 断点**。理由：

1. CSS 断点不需要 JS 参与，更省资源
2. 窗口 resize 时由浏览器自行处理，不需要 `resize` event listener
3. 两套 DOM 共存，切换时无组件 mount/unmount 延迟

```vue
<!-- DetailHeroRouter.vue -->
<template>
  <!-- 桌面版：> 640px 显示 -->
  <DetailHeroDesktop class="desktop-only" v-bind="$attrs" />
  <!-- 移动版：≤ 640px 显示 -->
  <DetailHeroMobile class="mobile-only" v-bind="$attrs" />
</template>

<style scoped>
.desktop-only { display: none; }
.mobile-only { display: contents; }

@media (min-width: 641px) {
  .desktop-only { display: contents; }
  .mobile-only { display: none; }
}
</style>
```

但是这样两套 DOM 会增加内存占用。更好的方式是用 **`<component :is>` + 响应式计算**，只在断点穿越时切换一次。

```ts
// DetailHeroRouter.vue <script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'

const isMobile = ref(window.innerWidth <= 640)

let mql: MediaQueryList
function onMqChange(e: MediaQueryListEvent) {
  isMobile.value = e.matches
}

onMounted(() => {
  mql = window.matchMedia('(max-width: 640px)')
  isMobile.value = mql.matches
  mql.addEventListener('change', onMqChange)
})

onBeforeUnmount(() => {
  mql?.removeEventListener('change', onMqChange)
})
```

```vue
<template>
  <component :is="isMobile ? DetailHeroMobile : DetailHeroDesktop" v-bind="$attrs" />
</template>
```

这种方式：
- 只有**一个组件被挂载**
- 穿越断点时 **Vue 自动 unmount/mount**（触发 onMounted/onBeforeUnmount → composable 自动清理）
- `matchMedia` 的 `change` 事件在浏览器层面处理，无 resize thrashing

### 警告

- 穿越断点时当前页面会重新渲染，封面图重新加载 → 需要配合 `<KeepAlive>` 保留状态
- 或者限制用户只能在固定方向上使用（移动端锁定 portrait）

---

## 三、移动端布局详细设计

### 3.1 MobileHeroSplash — 全屏英雄区

#### 布局结构

```html
<section class="mobile-hero-splash">
  <!-- 动态渐变背景（从封面提取 color palette） -->
  <div class="mobile-hero-bg" :style="bgStyle"></div>

  <!-- 封面 -->
  <div class="mobile-hero-cover-wrap">
    <ProgressiveCover
      class="mobile-hero-cover"
      :src="coverUrl"
      :alt="title"
      size="large"
    />
  </div>

  <!-- 标题 -->
  <h1 class="mobile-hero-title">{{ title }}</h1>

  <!-- 元数据 -->
  <div class="mobile-hero-meta">
    <slot name="meta" />
  </div>

  <!-- 操作按钮 -->
  <div class="mobile-hero-actions">
    <slot name="actions" />
  </div>

  <!-- 底部渐变 fade -->
  <div class="mobile-hero-fade"></div>
</section>
```

#### CSS 详细设计

```css
.mobile-hero-splash {
  position: relative;
  min-height: 100dvh;           /* ← 使用 dvh，避免 mobile Safari 工具栏问题 */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-5) calc(var(--space-8) + 40px);
  overflow: hidden;
  box-sizing: border-box;

  /* 渐变背景 — 由 composable 提取封面 color palette 驱动 */
  background: var(--splash-bg, var(--bg-app));
}

/* 动态背景层 — 封面 blur + gradient overlay */
.mobile-hero-bg {
  position: absolute;
  inset: -40px;                 /* 延伸防裁边 */
  background-image: var(--splash-blur-url);
  background-size: cover;
  background-position: center;
  filter: blur(48px) saturate(1.4) contrast(1.1);
  opacity: 0.85;
  pointer-events: none;
  z-index: 0;

  /* 额外渐变叠加 — 降低干扰 */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      180deg,
      rgba(0,0,0,0.02) 0%,
      rgba(0,0,0,0.18) 100%
    );
  }
}

/* 封面 */
.mobile-hero-cover-wrap {
  position: relative;
  z-index: 1;
  width: 200px;
  height: 200px;
  margin-bottom: var(--space-6);
}

.mobile-hero-cover {
  width: 100%;
  height: 100%;
  border-radius: var(--radius-lg);
  object-fit: cover;
  box-shadow:
    0 8px 32px rgba(0,0,0,0.12),
    0 24px 48px rgba(0,0,0,0.08);
}

/* 标题 */
.mobile-hero-title {
  position: relative;
  z-index: 1;
  text-align: center;
  font-size: var(--text-headline-md);     /* 24px — 移动端适中 */
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 var(--space-2);
  padding: 0 var(--space-4);
  max-width: 100%;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
}

/* 元数据 */
.mobile-hero-meta {
  position: relative;
  z-index: 1;
  text-align: center;
  margin-bottom: var(--space-4);
}

/* 操作按钮 — 水平居中排列 */
.mobile-hero-actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

/* 底部渐变提示 */
.mobile-hero-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: linear-gradient(to top, var(--bg-app) 0%, transparent 100%);
  pointer-events: none;
  z-index: 1;
}
```

#### 按钮视觉

移动端操作按钮使用**大触控区域**（至少 44pt）：

```css
.mobile-hero-actions :deep(.play-all),
.mobile-hero-actions :deep(.add-to-queue) {
  height: 40px;
  padding: 0 var(--space-5);
  font-size: var(--text-label-md);
  min-width: 100px;
  border-radius: var(--radius-full);
  -webkit-tap-highlight-color: transparent;
  /* 触控反馈 */
  transition: transform 0.1s ease, opacity 0.1s ease;
}
.mobile-hero-actions :deep(.play-all:active),
.mobile-hero-actions :deep(.add-to-queue:active) {
  transform: scale(0.96);
  opacity: 0.85;
}
```

---

### 3.2 MobileMiniBar — 浮层迷你条

#### 布局结构

```html
<header class="mobile-mini-bar" :class="{ visible: showMiniBar }" :style="safeAreaStyle">
  <!-- 封面缩略图（极小） -->
  <img v-if="coverUrl" class="mini-bar-cover" :src="coverThumbUrl" alt="" />

  <!-- 标题（单行截断） -->
  <h2 class="mini-bar-title">{{ title }}</h2>

  <!-- 右侧操作区：slot 中最重要的按钮（例如播放全部） -->
  <div class="mini-bar-actions">
    <slot name="primary-action" />
  </div>
</header>
```

#### CSS 详细设计

```css
.mobile-mini-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  padding-left: calc(var(--space-3) + env(safe-area-inset-left, 0px));
  padding-right: calc(var(--space-3) + env(safe-area-inset-right, 0px));
  background: var(--bg-solid);
  border-bottom: 1px solid var(--border);
  z-index: 50;

  /* ⭐ 仅用 transform — compositor-only，不触 layout/paint */
  transform: translateY(-100%);
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;

  /* 微弱的顶部阴影 — 显示时浮现 */
  box-shadow: 0 4px 12px rgba(0,0,0,0.04);
  transition:
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.28s ease;
}

.mobile-mini-bar.visible {
  transform: translateY(0);
  box-shadow: 0 4px 20px rgba(0,0,0,0.08);
}

/* 封面缩略图 — 极小圆形 */
.mini-bar-cover {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-muted);
}

/* 标题 — 单行截断 */
.mini-bar-title {
  flex: 1;
  min-width: 0;
  font-size: var(--text-label-md);
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

/* 右侧按钮 */
.mini-bar-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
```

---

### 3.3 动画时序

```
触发条件：用户滚动，hero-splash 底部与视口 top 交叉

0ms         → IO fires → showMiniBar = true → mini-bar 获得 .visible
frame 0-1   → style recalc: mini-bar 开始 transition
frame 1-17  → transform: translateY(-100%) → translateY(0)
              (0.28s @ 60fps = ~17 frames)
              合成线程独立处理，主线程空闲

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
期间 hero-splash 自然上滚 -> 被 content 推离视口
全程无其他 JS 执行、无 layout、无 paint
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

反向滚动（向上回滚到 hero）：
0ms         → IO fires → showMiniBar = false
frame 0-1   → style recalc: mini-bar 移除 .visible
frame 1-17  → transform: translateY(0) → translateY(-100%)
              mini-bar 从顶部分消失
```

---

## 四、Composable 详细设计

### 4.1 useMobileHeroScroll

```ts
// src/composables/useMobileHeroScroll.ts
import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue'

export interface UseMobileHeroScrollOptions {
  /** hero splash 区域的选择器或 ref */
  heroRef?: Ref<HTMLElement | null>
  heroSelector?: string
}

export function useMobileHeroScroll(options: UseMobileHeroScrollOptions = {}) {
  const showMiniBar = ref(false)
  let heroEl: HTMLElement | null = null
  let observer: IntersectionObserver | null = null
  let lastShowState: boolean | null = null

  function onIntersect([entry]: IntersectionObserverEntry[]) {
    const visible = entry.isIntersecting
    // showMiniBar = hero NOT in view
    const state = !visible
    if (state === lastShowState) return
    lastShowState = state
    showMiniBar.value = state
  }

  onMounted(() => {
    heroEl = options.heroRef?.value
      ?? (options.heroSelector ? document.querySelector(options.heroSelector) as HTMLElement : null)
      ?? document.querySelector('.mobile-hero-splash') as HTMLElement

    if (!heroEl) return

    // rootMargin: hero 顶部触及视口 top 时触发
    // 即 hero 刚好完全滚出视口时 sentinel 触发
    observer = new IntersectionObserver(onIntersect, {
      root: null,           // 相对于视口
      rootMargin: '0px',
      threshold: 0,         // 任何交叉比例变化都触发
    })
    observer.observe(heroEl)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
    heroEl = null
  })

  return { showMiniBar }
}
```

### 4.2 useDesktopStickySentinel

```ts
// src/composables/useDesktopStickySentinel.ts
// 桌面端 IO 驱动的 sticky header（替换 useDetailStickyState）
import { ref, onMounted, onBeforeUnmount, nextTick, type Ref } from 'vue'
import { generateBlurredBg } from '../utils/image'

export function useDesktopStickySentinel(
  coverUrl?: Ref<string>,
  scrollHostSelector = '.detail-scroll-host',
) {
  const isStuck = ref(false)
  let scrollHost: HTMLElement | null = null
  let sentinel: HTMLElement | null = null
  let observer: IntersectionObserver | null = null

  function onIntersect([entry]: IntersectionObserverEntry[]) {
    const stuck = !entry.isIntersecting
    if (stuck === isStuck.value) return
    isStuck.value = stuck

    const header = document.querySelector('.playlist-detail-header-wrap') as HTMLElement | null
    header?.classList.toggle('is-sticky-header', stuck)
  }

  function refresh() {
    nextTick(() => {
      scrollHost = document.querySelector(scrollHostSelector) as HTMLElement | null
      if (scrollHost) scrollHost.scrollTop = 0
      isStuck.value = false
      const header = document.querySelector('.playlist-detail-header-wrap') as HTMLElement | null
      header?.classList.remove('is-sticky-header')
    })
  }

  // Blur background generation
  if (coverUrl) {
    import { watch } from 'vue'
    watch(coverUrl, (url) => {
      const header = document.querySelector('.playlist-detail-header-wrap') as HTMLElement | null
      if (url?.trim() && header) {
        generateBlurredBg(url.trim(), { blurRadius: 10, saturation: 1.32, maxWidth: 200 })
          .then(dataUrl => header.style.setProperty('--sticky-blur-bg', `url("${dataUrl}")`))
          .catch(() => header?.style.removeProperty('--sticky-blur-bg'))
      } else {
        header?.style.removeProperty('--sticky-blur-bg')
      }
    }, { immediate: true })
  }

  onMounted(() => {
    requestAnimationFrame(() => {
      scrollHost = document.querySelector(scrollHostSelector) as HTMLElement | null
      if (!scrollHost) return

      sentinel = document.createElement('div')
      sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none'
      // Insert at the top of scroll host
      scrollHost.prepend(sentinel)

      observer = new IntersectionObserver(onIntersect, {
        root: scrollHost,
        rootMargin: '-1px 0px',
        threshold: 0,
      })
      observer.observe(sentinel)
    })
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    sentinel?.remove()
    observer = null
    sentinel = null
    scrollHost = null
  })

  return { isStuck, refresh }
}
```

### 差异对比：新旧 composable

| 维度 | useDetailStickyState (旧) | useMobileHeroScroll / useDesktopStickySentinel (新) |
|------|:-----------------------:|:------------------------------------------------:|
| 驱动方式 | RAF 60fps + scroll event | IntersectionObserver（零滚动开销） |
| CSS 变量写 | `--sticky-progress` 60次/秒 | 仅 crossing 时 1 次 class toggle |
| 代码行数 | ~180 行 | ~45 行（mobile）/ ~90 行（desktop） |
| layout 触发 | 每次 progress 更新触发 | 仅 transition 期间 |
| 移动端适配 | 与桌面端共用同一套 | 完全分离，零移动端开销 |

---

## 五、Palette 提取与背景渐变

移动端 splash 的背景色彩从封面提取，复用现有 PlayerExpanded 的 palette 逻辑，但精简以降低移动端开销。

### 方案

1. 从封面 URL 提取 4 色 palette（同现有 `PlayerExpanded.vue` 的 56×56 canvas 方式）
2. 生成 2 个 CSS 变量：
   - `--splash-bg`: `linear-gradient(160deg, c1, c3)` — 背景主色调
   - `--splash-blur-url`: `url(封面小尺寸模糊图)` — 背景模糊层
3. 仅在移动端执行（桌面端不需要 splash 背景）

```ts
// useMobileHeroPalette.ts
import { ref, watch, type Ref } from 'vue'

const PALETTE_CANVAS_SIZE = 32  // 32×32 足够提取主色调

export function useMobileHeroPalette(coverUrl: Ref<string>) {
  const bgStyle = ref('')
  const paletteColors = ref<string[]>([])

  watch(coverUrl, (url) => {
    if (!url?.trim()) {
      bgStyle.value = ''
      paletteColors.value = []
      return
    }

    // 从封面提取 4 色
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = PALETTE_CANVAS_SIZE
      canvas.height = PALETTE_CANVAS_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.drawImage(img, 0, 0, PALETTE_CANVAS_SIZE, PALETTE_CANVAS_SIZE)
      const data = ctx.getImageData(0, 0, PALETTE_CANVAS_SIZE, PALETTE_CANVAS_SIZE).data

      // 取 4 个角 + 中心的平均色 → 简化为取顶部色 + 底部色
      const topColor = averageColorInRect(data, PALETTE_CANVAS_SIZE, 0, 0, PALETTE_CANVAS_SIZE, 4)
      const bottomColor = averageColorInRect(data, PALETTE_CANVAS_SIZE, 0, PALETTE_CANVAS_SIZE - 4, PALETTE_CANVAS_SIZE, PALETTE_CANVAS_SIZE)

      paletteColors.value = [topColor, bottomColor]
      bgStyle.value = `linear-gradient(160deg, ${topColor}, ${bottomColor})`
    }
    img.src = url
  }, { immediate: true })

  return { bgStyle, paletteColors }
}

function averageColorInRect(
  data: Uint8ClampedArray,
  stride: number,
  x1: number, y1: number,
  x2: number, y2: number
): string {
  let r = 0, g = 0, b = 0, count = 0
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      const i = (y * stride + x) * 4
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      count++
    }
  }
  if (count === 0) return 'rgba(0,0,0,0)'
  return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`
}
```

---

## 六、6 个详情页的集成模式

### 6.1 统一变更模式

每个 DetailPage 的变更模式相同：

```
Before:                         After:
┌──────────────────┐           ┌──────────────────┐
│DetailStickyHero  │           │DetailHeroRouter  │
│Header (slots)    │    →      │  (slots)         │
│  #media          │           │  ├─ Desktop: ... │
│  #title          │           │  └─ Mobile: ...  │
│  #meta           │           │                  │
│  #actions        │           │  （slot 内容不变） │
│  #tabs           │           │                  │
│scroll-host       │           │scroll-host       │
└──────────────────┘           └──────────────────┘
```

**具体来说每个页面需要**：

| 步骤 | 变更 |
|------|------|
| 1 | `<DetailStickyHeroHeader>` → `<DetailHeroRouter>` |
| 2 | 删除 `useDetailStickyState(...)` 的导入和调用 |
| 3 | DetailHeroRouter 内部根据平台自动分发 |
| 4 | 移动端：splash 不包含 tabs（tabs 在下方 content 区显示） |
| 5 | slot 内容完全不变 |

### 6.2 Tabs 在移动端的位置

在移动端，`tabs` slot 不会被渲染在 splash 内，而是出现在 **splash 下方、歌曲列表上方**：

```
[mobile-hero-splash]       ← scrolls away naturally
[ .detail-scroll-host ]    ← scroll container
  [header-tabs]            ← tabs 移到滚动区内
  [song-list / content]
```

DetailHeroMobile 处理：

```vue
<template>
  <MobileHeroSplash
    :cover-url="coverUrl"
    :title="title"
  >
    <template #meta><slot name="meta" /></template>
    <template #actions><slot name="actions" /></template>
  </MobileHeroSplash>

  <MobileMiniBar
    :cover-url="coverUrl"
    :title="title"
    :show="showMiniBar"
  >
    <template #primary-action>
      <!-- 只显示最重要的 1 个按钮 -->
      <slot name="primary-action" />
    </template>
  </MobileMiniBar>

  <!-- Tabs + content 在滚动区内 -->
  <div v-if="$slots.tabs" class="mobile-tabs-area">
    <slot name="tabs" />
  </div>
</template>
```

### 6.3 各页面的 slot 映射

| 页面 | media | title | meta | actions | tabs |
|------|-------|-------|------|---------|------|
| PlaylistDetailPage | HeroCoverMedia(coverImgUrl) | h2(playlist.name) | creator + trackCount | subscribe + playAll + addToQueue | DetailTabBar(songs/comments) |
| AlbumDetailPage | HeroCoverMedia(picUrl) | h2(album.name) | artist + trackCount + desc | subscribe + playAll | DetailTabBar(songs/comments) |
| ArtistDetailPage | HeroCoverMedia(coverUrl) | h2(artist.name) | meta-pills × 4 + desc | subscribe + playTopSongs | artist-tabs × N |
| UserDetailPage | HeroCoverMedia(avatar) | h2(name) | bio + stats | subscribe + ... | ... |
| PodcastDetailPage | HeroCoverMedia(cover) | h2(title) | author + desc | subscribe + play | DetailTabBar |
| LanguageDetailPage | HeroCoverMedia(cover) | h2(name) | desc + stats | playAll | ... |

---

## 七、边缘情况处理

### 7.1 Mobile Safari 安全区域

```css
.mobile-mini-bar {
  /* top safe area — 适配刘海屏 */
  padding-top: env(safe-area-inset-top, 0px);
  height: calc(48px + env(safe-area-inset-top, 0px));
}

.mobile-hero-splash {
  /* 底部 safe area — 适配 Home Indicator */
  padding-bottom: calc(var(--space-8) + 40px + env(safe-area-inset-bottom, 0px));
}
```

### 7.2 `100dvh` fallback

`100dvh` 在部分旧浏览器上不支持。使用 `@supports` 降级：

```css
.mobile-hero-splash {
  min-height: 100vh;  /* fallback */
  min-height: 100dvh; /* modern */
}
```

### 7.3 方向变化（landscape ↔ portrait）

当手机从竖屏旋转到横屏时：
- `MobileHeroSplash` 的 `min-height: 100dvh` 重新计算
- `matchMedia` 的 change 事件不会触发（宽度可能没穿越 640px 断点）
- 但 splash 内部的封面尺寸可能需要调整

横屏优化：

```css
@media (orientation: landscape) and (max-height: 500px) {
  .mobile-hero-splash {
    min-height: auto;
    flex-direction: row;
    padding: var(--space-4);
  }

  .mobile-hero-cover-wrap {
    width: 120px;
    height: 120px;
    margin-bottom: 0;
    margin-right: var(--space-4);
    flex-shrink: 0;
  }

  .mobile-hero-title {
    text-align: left;
    font-size: var(--text-body-lg);
  }

  .mobile-hero-meta {
    text-align: left;
  }

  .mobile-hero-actions {
    justify-content: flex-start;
  }
}
```

### 7.4 返回导航 + 滚动位置恢复

```ts
// 当从其他页面返回到详情页时：
// 如果之前已经滚动过（mini-bar 已显示），滚动位置恢复
// → IO 自动重新计算，不需要额外处理
// → 因为 IO 监测的是实时 DOM 位置

// 如果是从 header 内的返回按钮返回（浏览器后退）：
// → 页面重新 mount → composable 重新初始化 → IO 重新 attach
```

### 7.5 嵌入模式（UserDetailPage 内的子详情页）

嵌入模式下，如果宿主是移动端：
- 嵌入的子详情页也不使用 sticky，使用与独立页面相同的 mobile hero + mini-bar 模式
- mini-bar 需要嵌入到宿主滚动容器内？不，mini-bar 仍是 `position: fixed` 相对于视口
- 如果宿主滚动容器不是视口本身，mini-bar 需要改为 `position: sticky; top: 0`

为了简化，**嵌入模式在移动端不使用 mini-bar**，直接全部自然滚动：

```ts
function useMobileHeroScroll(options) {
  if (options.embedded) {
    return { showMiniBar: ref(false) }  // 嵌入模式不启用 mini-bar
  }
  // ... 正常逻辑
}
```

### 7.6 减少动画（prefers-reduced-motion）

```css
@media (prefers-reduced-motion: reduce) {
  .mobile-mini-bar {
    transition: none !important;
    transform: none !important;
  }

  .mobile-mini-bar:not(.visible) {
    display: none;
  }
}
```

### 7.7 极高 FPS（120Hz ProMotion）

mini-bar 的 0.28s transition 在 120Hz 下为 33.6 帧，丝滑度翻倍。无需额外调整——`transform` 自动跟随显示器刷新率。

---

## 八、迁移路径

### 第一阶段：并行开发（不破坏现有功能）

1. 创建所有新文件（空壳或最小实现）
2. 在其中一个详情页（推荐 ArtistDetailPage——相对简单）接入 `DetailHeroRouter`
3. 移动端和桌面端同时在 if/else 分支运行

### 第二阶段：渐次替换

4. 接通用 `useDesktopStickySentinel` 替换 `useDetailStickyState`
5. 逐一迁移 6 个详情页
6. 每个页面迁移后对比 FPS 和视觉表现

### 第三阶段：清理

7. 删除 `DetailStickyHeroHeader.vue`
8. 删除 `useDetailStickyState.ts`
9. 精简要 `detail-page.css`（移除 header 相关样式）
10. 删除旧文档

### 回滚策略

- `DetailHeroRouter` 在 `<script setup>` 中用 `isMobile` ref + `<component :is>` 分发
- 如果某端出现严重 bug，可以快速硬编码为只渲染 desktop 版本
- 新旧 composable 通过文件名隔离，不会冲突

---

## 九、性能指标预测

| 指标 | 当前 (RAF 连续 progress) | 方案二 (Mobile) | 方案二 (Desktop) |
|------|:---------------------:|:--------------:|:---------------:|
| 滚动中 JS 主线程开销 | 12-16ms/帧 (RAF) | **0ms** | **0ms** |
| 穿越阈值时 JS 开销 | ~3ms (style recalc) | **~1ms** (1 element) | **~2ms** (class toggle) |
| CSS calc() 求值 | 8处/帧 | 0 | 0 |
| Layout 触发 | height, padding, font-size, etc | 0 | 0 |
| Paint 触发 | background, box-shadow, blur | 0 | box-shadow (仅 transition 期间) |
| 持续 Composite 约束 | sticky 层 | 仅 mini-bar（固定 1 层） | sticky 层 |
| 移动端低端设备 FPS | ~45-55 | **60 🔒** | N/A |

---

## 十、移动端体验流程图

```
用户打开歌单详情页
  │
  ▼
┌──────────────────────────────────┐
│  MobileHeroSplash 展示：          │
│  - 200px 封面（居中）+ 阴影       │
│  - 标题（2 行截断）               │
│  - 创建者/歌曲数元数据             │
│  - 播放全部 + 收藏按钮             │
│  - 底部渐变 fade                  │
│  - 背景：封面 blur（暗色叠加）      │
└──────────────┬───────────────────┘
               │
      用户向下滑动
               │
               ▼
┌──────────────────────────────────┐
│  Splash 自然上滚                  │
│  → IO fires → showMiniBar=true   │
│  → MiniBar 从顶部滑入 (0.28s)    │
└──────────────┬───────────────────┘
               │
      继续滑动，浏览歌曲列表
               │
               ▼
┌──────────────────────────────────┐
│  MiniBar 常驻顶部                 │
│  左侧：28px 封面缩略图             │
│  中间：标题（单行截断）            │
│  右侧：播放按钮                   │
│  背景：半透明纯色（无 blur）        │
└──────────────┬───────────────────┘
               │
      用户快速上滑到底 / 下滑回顶
               │
               ▼
┌──────────────────────────────────┐
│  回顶 → Splash 重新进入视口       │
│  → IO fires → showMiniBar=false  │
│  → MiniBar 滑出 (0.28s)         │
│  → 回到初始状态                   │
└──────────────────────────────────┘
```

整个过程：
- **零 JS 执行**（除首次 IO callback）
- **零 layout/paint**（仅一次 class 切换 + compositor-only transform）
- **极低功耗**（无 RAF、无定时器、无 scroll 事件）

---

## 附录：文件变更清单

```
新增:
  src/components/DetailHeroRouter.vue
  src/components/DetailHeroDesktop.vue
  src/components/DetailHeroMobile.vue
  src/components/MobileHeroSplash.vue
  src/components/MobileMiniBar.vue
  src/composables/useMobileHeroScroll.ts
  src/composables/useDesktopStickySentinel.ts
  src/composables/useMobileHeroPalette.ts
  src/styles/hero-mobile.css

修改:
  src/components/PlaylistDetailPage.vue   (替换 DetailStickyHeroHeader → DetailHeroRouter)
  src/components/AlbumDetailPage.vue      (同上)
  src/components/ArtistDetailPage.vue     (同上)
  src/components/UserDetailPage.vue       (同上)
  src/components/PodcastDetailPage.vue    (同上)
  src/components/LanguageDetailPage.vue   (同上)
  src/styles/detail-page.css             (移除 header 相关样式)
  docs/AGENTS.md                         (更新吸顶规范章节)

删除:
  src/components/DetailStickyHeroHeader.vue
  src/composables/useDetailStickyState.ts
  docs/吸顶动画流畅度优化方案.md
  docs/导航与吸顶状态修复说明.md
```
