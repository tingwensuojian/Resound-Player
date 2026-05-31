# 详情页头部 — 移动端优先方案设计

> 本文档完全摒弃现有 `useDetailStickyState`（RAF 连续 progress + calc()）和 git 历史中的二进制 sticky + CSS transition 方案，以**移动端兼容性为第一优先**重新设计。

---

## 移动端核心约束

| 约束 | 影响 |
|------|------|
| 触摸滚动有动量惯性 | scroll 事件会持续触发数百毫秒，JS 回调阻塞主线程 → 掉帧 |
| 低端手机 GPU/CPU 弱 | `backdrop-filter`、大区域 `blur`、`color-mix` 每帧重绘 → 卡顿 |
| 电池敏感 | RAF 60fps 持续写 DOM → 额外功耗 |
| 垂直空间宝贵 | 380px 的 header 在手机竖屏占 50%+ 可视区，不实用 |
| 无 hover | hover 触发的视觉反馈不适用于触摸 |
| Safari 动态工具栏 | `100vh` 不可靠，`dvh` 兼容性有限 |

**核心策略**：零 scroll 事件 JS 执行、零 RAF、零 layout/paint 动画属性。

---

## 方案一：IntersectionObserver 驱动 + 纯 CSS transition（零滚动 JS）

### 核心思想

用 **IntersectionObserver** 取代所有 scroll 事件和 RAF。IO 在浏览器层面监测交叉状态，不消耗 JS 主线程。仅在 crossing threshold 时触发一次回调。

### 架构

```
[detail-scroll-host]
  ├── [sentinel-top]       ← 1×1px 锚点，定位在阈值位置
  ├── [sticky-header]      ← position: sticky; top: 0
  │   ├── [hero-content]   ← 封面 + 标题 + 元数据 + 操作
  │   └── (transition: height, padding, etc.)
  ├── [sentinel-bottom]    ← 1×1px，用于探测脱离吸顶
  └── [content-body]       ← 歌曲列表
```

### 核心代码

```ts
// useStickySentinel — 替换 useDetailStickyState
const sentinelTop = document.createElement('div')
sentinelTop.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none'
scrollHost.prepend(sentinelTop)

const observer = new IntersectionObserver(
  ([entry]) => {
    const stuck = !entry.isIntersecting  // sentinel 被滚出视野 = header 卡住
    if (stuck === lastStickyState) return
    lastStickyState = stuck
    headerWrap.classList.toggle('is-sticky-header', stuck)
  },
  {
    root: scrollHost,
    rootMargin: '-1px 0px 0px 0px',
    threshold: 0,
  }
)
observer.observe(sentinelTop)
```

| 维度 | 说明 |
|------|------|
| JS 开销 | **归零**（滚动期间 IO 不执行任何 JS） |
| 回调频率 | 仅在 crossing 时触发（通常 1-2 次/次操作） |
| 移动端兼容性 | **Chrome/Safari/Firefox/Samsung Internet 全支持** |
| 电池影响 | 零（浏览器原生处理） |

### 视觉方案

Header 固定高度，不用 `height: calc(...)` 驱动收缩。改用 **transform** 缩放内部元素：

```css
/* 普通态：完整 hero */
.playlist-detail-header-wrap {
  position: sticky;
  top: 0;
  z-index: 30;
  overflow: hidden;
  background: transparent;
  transition:
    background 0.3s cubic-bezier(0.33, 0, 0.1, 1),
    box-shadow 0.3s cubic-bezier(0.33, 0, 0.1, 1);
}

/* 吸顶态：背景变实 + 阴影浮现 */
.playlist-detail-header-wrap.is-sticky-header {
  background: var(--bg-solid);
  box-shadow: 0 8px 20px var(--shadow-sticky);
}

/* 封面：transform scale 缩小 + 位移 to top-left */
.is-sticky-header .hero-media-shell {
  transform: scale(0.55) translate(-30%, -20%);
  transform-origin: top left;
  transition: transform 0.3s cubic-bezier(0.33, 0, 0.1, 1);
}

/* 标题：缩小并与封面同行 */
.is-sticky-header .hero-title-shell .title {
  font-size: 18px;
  line-height: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: font-size 0.25s ease, line-height 0.25s ease;
}

/* 元数据/描述：淡出 */
.is-sticky-header .hero-meta-shell,
.is-sticky-header .desc-wrap {
  opacity: 0;
  max-height: 0;
  overflow: hidden;
  transition: opacity 0.2s ease, max-height 0.25s ease;
}
```

### 移动端适配

```css
/* 移动端：封面的 sticky 态缩小比例不同 */
@media (max-width: 640px) {
  .is-sticky-header .hero-media-shell {
    transform: scale(0.5) translate(-25%, -15%);
  }
  
  .is-sticky-header .hero-title-shell .title {
    font-size: 16px;
  }
}
```

### 优点
- ✅ **零 JS 滚动开销** — 最适合移动端
- ✅ 完全不依赖 scroll 事件
- ✅ 浏览器原生管理的交叉检测
- ✅ 架构极简，代码量是现有 1/3
- ✅ 所有过渡由 CSS transition 驱动
- ✅ 与 `prefers-reduced-motion` 天然兼容

### 缺点
- ❌ 不连续跟随（只有 stuck/unstuck 两个状态）
- ❌ 要配合 `position: sticky` 使用
- ❌ 需要两层 sentinel（进入 + 离开）

### 兼容性基线

| 平台 | IntersectionObserver |
|------|:---:|
| iOS Safari | ✅ 12.2+ (2019) |
| Android Chrome | ✅ 51+ (2016) |
| Samsung Internet | ✅ 6+ (2018) |
| Firefox Mobile | ✅ 52+ (2017) |
| 桌面 Electron | ✅ Chromium 内核 |

---

## 方案二：Mobile-Native 双布局（手机端完全摒弃 sticky）

### 核心思想

移动端和桌面端采用**完全不同的布局模式**，不再试图用同一套 sticky 机制适配两端。移动端用「滚动穿透 + 浮层 mini-bar」替代 sticky header。

### 移动端交互模型

```
滚动前：
┌──────────────────────┐
│                      │  ← hero-splash (100dvh)
│       [封面]         │
│                      │
│   歌单标题 + 作者     │
│   [播放全部] [收藏]   │
│                      │
│  ┌─ 底部渐变 ───────┐│  ← 提示下方有内容
│  │  ░░░░░░░░░░░░░░  ││
│  └──────────────────┘│
├──────────────────────┤
│  歌曲1               │
│  歌曲2               │
│  ...                 │
└──────────────────────┘

滚动中（越过 hero）：
                    ┌──────────────────┐
                    │ ♫ 歌单名称    [▸] │ ← fixed mini-bar
                    │                  │   (top: 0, z-index: 50)
                    └──────────────────┘
┌──────────────────────┐
│  歌曲1               │
│  歌曲2               │
│  ...                 │
└──────────────────────┘
```

### 关键技术：Sentinel + fixed mini-bar

```ts
// useMobileHeroScroll — 完全为触摸设计
export function useMobileHeroScroll(options: {
  heroSelector: string
  miniBarSelector: string
  title: Ref<string>
}) {
  const showMiniBar = ref(false)

  // 1. 监测 hero 区域是否在视口内
  const heroObserver = new IntersectionObserver(
    ([entry]) => {
      showMiniBar.value = !entry.isIntersecting
    },
    { threshold: 0 }
  )

  onMounted(() => {
    const hero = document.querySelector(options.heroSelector)
    if (hero) heroObserver.observe(hero)
  })

  onBeforeUnmount(() => heroObserver.disconnect())

  return { showMiniBar }
}
```

### CSS 结构

```css
/* 移动端 hero */
.mobile-hero-splash {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  background: var(--bg-gradient);  /* 从封面提取 */
}

.mobile-hero-cover {
  width: 200px;
  height: 200px;
  border-radius: var(--radius-lg);
  object-fit: cover;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}

/* 底部渐变提示 */
.mobile-hero-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 80px;
  background: linear-gradient(transparent, var(--bg-app));
  pointer-events: none;
}

/* 浮层 mini-bar */
.mobile-mini-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  display: flex;
  align-items: center;
  padding: 0 var(--space-3);
  background: var(--bg-solid);
  border-bottom: 1px solid var(--border);
  transform: translateY(-100%);
  transition: transform 0.3s ease;
  z-index: 50;
}

.mobile-mini-bar.visible {
  transform: translateY(0);
}
```

### 桌面端保留简化 sticky

桌面端继续使用 sticky header，但独立为单独组件，不共享任何 scroll 逻辑：

```ts
// useDesktopSticky — 仅桌面端，但依然用 IO 而非 scroll
// 与 useMobileHeroScroll 完全分离
```

### 优点
- ✅ **完美移动端体验** — 没有 sticky 高度变化，没有动画卡顿
- ✅ Hero 可以展示最大信息量（全屏封面）
- ✅ Mini-bar 使用 `transform: translateY` 动画（compositor-only）
- ✅ 两端互不影响，代码清晰
- ✅ 零 scroll 事件 JS 执行

### 缺点
- ❌ 两套布局 → 双倍维护成本
- ❌ 需要在 media query 之间切换组件
- ❌ 移动端需要检测 `dvh` 兼容性
- ❌ 状态同步（如果桌面端和移动端共享 store data）

### 组件结构

```
DetailHeroPage.vue
├── DetailHeroDesktop.vue    ← 桌面 sticky 版
│   └── DetailStickyHeroHeader.vue (简化版)
└── DetailHeroMobile.vue     ← 移动端 splash + mini-bar
    └── MobileHeroSplash.vue
    └── MobileMiniBar.vue
```

切换逻辑：

```vue
<template>
  <DetailHeroDesktop v-if="!isMobile" />
  <DetailHeroMobile v-else />
</template>
```

---

## 方案三：CSS `position: sticky` + `@container` 风格查询（纯 CSS，零 JS 行为逻辑）

### 核心思想

利用 **CSS Container Style Queries**（`@container style()`）让 header 根据自身的 `--stuck` 样式变量自动切换视觉状态。JS 只负责设置 1 个变量，CSS 自己管理所有状态派生。

### 架构

```
[scroll-host (container-type: inline-size)]
  ├── [sticky-header]
  │     ├── 当自身含有 style(--stuck: 1) 时 → 吸顶态
  │     └── 否则 → 普通态
  └── [content]
```

### 核心代码

```ts
// useStyleSticky — 最精简的 sticky 管理
// 只写 1 个 CSS 变量，不操作任何 class
const observer = new IntersectionObserver(
  ([entry]) => {
    const stuck = !entry.isIntersecting
    headerWrap.style.setProperty('--stuck', stuck ? '1' : '0')
  },
  { root: scrollHost, rootMargin: '-1px 0px', threshold: 0 }
)
```

CSS 侧用 `@container style()` 响应：

```css
/* ⚠️ 注意：@container style() 目前仅 Chrome 111+ 支持 */

/* 普通态 */
.sticky-header {
  position: sticky;
  top: 0;
  z-index: 30;
  container-type: inline-size;
  container-name: header;
}

/* 吸顶态 — 当 --stuck 为 1 时 */
@container header style(--stuck: 1) {
  .header-inner {
    background: var(--bg-solid);
    box-shadow: 0 8px 20px var(--shadow-sticky);
    padding: 4px 12px;
  }

  .hero-cover {
    width: 40px;
    height: 40px;
    border-radius: 8px;
  }

  .hero-title {
    font-size: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hero-meta,
  .hero-desc,
  .hero-actions {
    display: none;
  }
}
```

### 优点
- ✅ JS 只写 1 个 CSS 变量
- ✅ CSS 自行管理全部分支样式
- ✅ 不需要 toggle class
- ✅ 未来标准发展方向

### 缺点
- ❌ **`@container style()` 兼容性差** — Chrome 111+ only，Safari 不支持（截至 2025 年尾）
- ❌ 需要 polyfill 或 fallback
- ❌ 对移动端来说存在兼容性风险

### 兼容 Fallback

```css
/* 主方案：style queries */
@container header style(--stuck: 1) { /* ... */ }

/* Fallback：class-based（所有浏览器） */
.sticky-header.is-stuck .hero-cover { /* ... */ }
```

---

## 方案对比总表

| 维度 | 方案一：IO + transition | 方案二：双布局 | 方案三：style queries |
|------|:-----:|:-----:|:-----:|
| **移动端兼容性** | ★★★★★ | ★★★★★ | ★★★ (Safari 不支持) |
| **scroll 事件 JS 开销** | 0 | 0 | 0 |
| **RAF / 定时器** | 0 | 0 | 0 |
| **DOM 写/次操作** | 1 (class) | 1 (class) | 1 (CSS 变量) |
| **layout/paint 触发** | 仅 transition 期间 | 仅 mini-bar enter | 仅 transition 期间 |
| **双端统一代码** | ✅ 同一套组件 | ❌ 两套组件 | ✅ 同一套组件 |
| **代码量（估算）** | ~150 lines | ~350 lines (×2) | ~100 lines |
| **维护复杂度** | 低 | 中 | 低 |
| **CSS 新特性依赖** | 无 | 无 | `@container style()` |
| **Figma 级精细控制** | ⚠️ 仅两个状态 | ✅ 可精细设计 | ⚠️ 仅两个状态 |
| **视觉连续性** | 阶梯式（stuck/unstuck） | 阶梯式（mini-bar 滑入） | 阶梯式（stuck/unstuck） |
| **电子书般的零卡顿** | ✅ | ✅ | ✅ |

---

## 推荐

### 首选：方案一（IntersectionObserver + pure CSS transition）

**理由**：兼容性最广（所有移动浏览器 2019 年后均支持）、零 JS 滚动开销、代码量最小、易于维护。相比现有 RAF 连续 progress 方案，这是一个彻底的重构，但仍然是基于现有组件结构的合理演进。

### 次选：方案二（Mobile-Native 双布局）

如果产品上认为移动端需要完全不同的视觉设计（而不是简单缩小桌面版），方案二才是正确选择。它不是在"适配"移动端，而是为移动端设计了独立的体验。

### 方案三暂不推荐

`@container style()` 在 iOS Safari 上不支持，作为移动端优先方案有根本性缺陷。

---

## 下一步

确定方案后，需要：

1. 删除 `useDetailStickyState.ts` 全部内容
2. 删除 `DetailStickyHeroHeader.vue` 中所有 `--sticky-progress` calc() 布局
3. 按选定方案重写 composable 和组件样式
4. 更新 `detail-page.css` 中相关引用
5. 删除 `docs/吸顶动画流畅度优化方案.md`（已废弃）
6. 更新 `AGENTS.md` 中的吸顶规范部分
