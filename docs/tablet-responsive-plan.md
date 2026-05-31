# 平板端响应式适配开发计划

> 依据：`.cursor/skills/frontend-design`（responsive-design / spatial-design / interaction-design）、`.cursor/rules/development-spec.mdc`、`.cursor/rules/ui-safe-rail-and-group.mdc`

---

## 0. 设计原则

| 原则 | 来源 | 说明 |
|------|------|------|
| **内容驱动断点** | responsive-design.md | 不追设备尺寸，让内容告诉我们在哪里断开 |
| **检测输入方式，不只是屏幕尺寸** | responsive-design.md | 用 `@media (pointer: coarse)` 和 `@media (hover: none)` 检测触摸 |
| **适配而非截断** | frontend-design SKILL.md | 禁止在平板端隐藏核心功能，应重新组织布局 |
| **Container Queries 优先** | spatial-design.md | 组件级响应用 `@container`，页面级用 `@media` |
| **44px 最小触摸目标** | spatial-design.md | `@media (pointer: coarse)` 下所有交互元素 ≥ 44×44px |
| **Token 化间距** | development-spec.mdc | 使用 `--space-*` token，禁止硬编码数值 |
| **复用 ui-safe-rail / ui-safe-group** | ui-safe-rail-and-group.mdc | 横向滚动 + hover 上浮 → `ui-safe-rail`；紧凑按钮组 → `ui-safe-group` |

---

## 1. 断点体系

### 1.1 现状

| 断点 | 用途 | 文件 |
|------|------|------|
| `≤1919px` | 缩小 sidebar 宽度 | `App.vue` |
| `≤767px` | 移动端抽屉逻辑 | `App.vue`（JS `syncViewport` + CSS） |
| `≤980px` / `≤1280px` | 部分页面网格列数调整 | 各页面组件 |

### 1.2 新增平板断点

遵循 responsive-design.md 的"内容驱动"原则，在项目现有基础上增加一个平板专用断点：

```
桌面端：≥ 1024px   （当前默认）
平板端：768px ~ 1023px  （新增）
移动端：≤ 767px    （现有）
```

**具体做法**：

在 `App.vue` 的 `syncViewport()` 中增加平板态判断：

```ts
const isTablet = ref(false);   // 新增
const isNarrow = ref(false);   // 现有

function syncViewport() {
  const w = window.innerWidth;
  isTablet.value = w >= 768 && w <= 1023;
  isNarrow.value = w <= 767;
  if (isNarrow.value && sidebarOpen.value) {
    sidebarOpen.value = false;
  }
}
```

在 `layoutVars` computed 中为平板返回专用 CSS 变量值。

---

## 2. 全局基础设施改动

### 2.1 viewport meta 标签

**文件**：`index.html`

**改动**：添加 `viewport-fit=cover` 以支持 `env(safe-area-inset-*)`：

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

### 2.2 100vh → 100dvh

**文件**：`App.vue` scoped style

**问题**：移动浏览器地址栏收缩时 `100vh` 大于实际可视区域，底部播放器被遮挡。

**改动**：

```css
.layout {
  height: 100dvh; /* 替代 100vh，回退由 @supports 处理 */
}

@supports not (height: 100dvh) {
  .layout { height: 100vh; }
}
```

### 2.3 安全区适配

**文件**：`PlayerBar.vue` style

```css
.bar {
  padding-bottom: max(var(--space-2), env(safe-area-inset-bottom));
}
```

### 2.4 全局触摸优化

**文件**：`src/styles/theme.css`

在现有 `@media (hover: hover)` 基础上补充：

```css
/* 触摸设备：增大交互目标、移除无意义 hover 动画 */
@media (hover: none) and (pointer: coarse) {
  button,
  [role='button'],
  .menu-item,
  .icon-btn,
  .ctrl {
    min-height: 44px;
    min-width: 44px;
  }

  /* 禁用触摸设备上的 translateY hover 动画 */
  button:hover,
  [role='button']:hover {
    transform: none;
  }
}
```

### 2.5 流动排版

**文件**：`src/styles/theme.css`

用 `clamp()` 替代硬编码字号（遵循 responsive-design.md "Use `clamp()` for fluid values"），标题在平板端自然缩小：

```css
:root {
  --text-display: clamp(36px, 4vw, 48px);
  --text-headline-xl: clamp(28px, 3.5vw, 38px);
  --text-headline-lg: clamp(24px, 3vw, 32px);
  --text-headline-md: clamp(20px, 2.5vw, 24px);
}
```

---

## 3. 布局层改动

### 3.1 Sidebar — 平板折叠态 + Overlay 抽屉

**文件**：`App.vue`、`Sidebar.vue`

**现状问题**：
- 768~1023px 区间沿用桌面布局，sidebar 始终 220px / 76px，主内容区被挤压
- 移动端（≤767px）sidebar 为抽屉但无遮罩层

**方案**：

| 宽度 | Sidebar 行为 |
|------|-------------|
| ≥ 1024px | 正常/折叠（现有逻辑） |
| 768~1023px | **默认折叠为图标栏（76px）**，点击展开为 overlay 抽屉（220px）+ 半透明遮罩 |
| ≤ 767px | 隐藏，汉堡菜单触发 overlay 抽屉 + 遮罩（现有逻辑增强） |

**App.vue 改动**：

```ts
const layoutVars = computed(() => {
  if (isNarrow.value) {
    return {
      '--sidebar-width': sidebarOpen.value ? '220px' : '0px',
      '--layout-gap': sidebarOpen.value ? '8px' : '0px',
    };
  }
  if (isTablet.value) {
    return {
      '--sidebar-width': sidebarOpen.value ? '220px' : '76px',
      '--layout-gap': '8px',
    };
  }
  return {
    '--sidebar-width': sidebarCollapsed.value ? '76px' : '220px',
    '--layout-gap': '8px',
  };
});
```

**Sidebar.vue 新增**：
- overlay 遮罩层（`v-if="showOverlay"`，点击关闭 sidebar）
- 滑入过渡动画（`transform: translateX`）
- overlay fade 过渡

```html
<!-- 遮罩层 -->
<transition name="overlay-fade">
  <div v-if="showOverlay" class="sidebar-overlay" @click="emit('close')" />
</transition>
```

```css
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  z-index: 9;
}

/* 平板端展开时的滑入动画 */
@media (min-width: 768px) and (max-width: 1023px) {
  .sidebar.overlay-open {
    z-index: 11;
    animation: sidebar-slide-in 0.28s cubic-bezier(0.34, 1, 0.64, 1);
  }
}

@keyframes sidebar-slide-in {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
```

### 3.2 TopBar — 平板紧凑模式

**文件**：`TopBar.vue`

**现状**：水平排列 返回/前进 → spacer → 搜索 → 心动模式 → 用户头像，无任何 `@media` 查询。

**改动**：≤1023px 时缩小间距和按钮尺寸：

```css
@media (max-width: 1023px) {
  .topbar {
    padding: 0 var(--space-2);
    gap: var(--space-1);
  }
  .topbar-left { gap: var(--space-1); }
  .search-wrap.expanded {
    /* 搜索框限制最大宽度，不超出视口 */
    max-width: calc(100vw - 200px);
  }
}
```

### 3.3 PlayerBar — 平板自适应

**文件**：`PlayerBar.vue`

**现状**：三栏布局（左：封面+信息 | 中：控件+进度条 | 右：操作按钮），完全没有任何 `@media` 查询。

**平板方案（768~1023px）**：

保持三栏但压缩空间：
- 封面缩小到 48px
- 歌曲标题/歌手区域减少 max-width
- 右侧按钮间距缩小
- 进度条 slider 增大触摸区域（`height: 44px` 透明 hit area）

```css
@media (max-width: 1023px) {
  .bar {
    padding: var(--space-2) var(--space-3);
    gap: var(--space-3);
  }
  .cover {
    width: 48px;
    height: 48px;
    border-radius: 10px;
  }
  .meta { max-width: 180px; }
  .title { font-size: 13px; }
  .artist { font-size: 11px; }
}

/* 触摸设备：进度条增大触摸区域 */
@media (pointer: coarse) {
  .progress {
    height: 44px; /* 透明触摸区域 */
    margin: -18px 0;
    position: relative;
    z-index: 1;
  }
}
```

### 3.4 PlayerExpanded — 平板纵向布局

**文件**：`PlayerExpanded.vue`

**现状**：横向并排（封面 + 歌词），无宽度媒体查询。

**平板方案（≤1023px）**：改为纵向堆叠 — 封面上方，歌词/控件下方。

---

## 4. 页面层改动

### 4.1 HomePanel — 网格列数调整

**文件**：`HomePanel.vue`

**现状**：已有 980px / 767px / 520px 断点。

**补充**：1023px 断点，将首页推荐卡片网格从 4 列调整为 3 列：

```css
@media (max-width: 1023px) and (min-width: 768px) {
  .home-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .latest-column { width: 260px; flex-basis: 260px; }
}
```

### 4.2 PlaylistPanel / RankPanel — 网格自适应

**文件**：`PlaylistPanel.vue`、`RankPanel.vue`

**现状**：已有 1280px / 980px / 767px 断点。

**补充**：在 1024px 断点处微调列数（当前 1280px → 980px 跨度过大）。

### 4.3 SettingsPage — 单列适配

**文件**：`SettingsPage.vue`

**现状**：完全没有 `@media` 查询。

**改动**：≤1023px 时设置卡片改为单列布局。

### 4.4 StatsPage — 单列适配

**文件**：`StatsPage.vue`

**现状**：完全没有 `@media` 查询。

**改动**：统计图表/网格在 ≤1023px 时缩小或改为纵向排列。

### 4.5 SongCommentPage — 适配

**文件**：`SongCommentPage.vue`

**现状**：完全没有 `@media` 查询。

**改动**：评论列表在平板端适配宽度和间距。

### 4.6 CommentPanel — 适配

**文件**：`CommentPanel.vue`

**现状**：完全没有 `@media` 查询。

### 4.7 UserPanel — 适配

**文件**：`UserPanel.vue`

**现状**：完全没有 `@media` 查询。

### 4.8 PlayQueuePanel — 适配

**文件**：`PlayQueuePanel.vue`

**现状**：没有宽度媒体查询。

---

## 5. 触摸交互增强

### 5.1 触摸目标尺寸

**来源**：spatial-design.md "Touch Targets vs Visual Size"，interaction-design.md "Touch targets <44x44px"

所有 `@media (pointer: coarse)` 下的交互元素确保 ≥ 44×44px：

| 元素 | 当前尺寸 | 改动 |
|------|---------|------|
| PlayerBar 播放/暂停 `.ctrl.main` | 36×36 | 触摸下 44×44 |
| PlayerBar 上/下一首 `.ctrl` | 36×36 | 触摸下 44×44 |
| TopBar 搜索/心动/头像 `.msg` `.avatar` | 36×36 | 触摸下 44×44 |
| Sidebar 菜单项 `.menu-item` | min-height: 40px | 触摸下 min-height: 44px |
| 进度条 `input[type=range]` | 默认高度 | 触摸下增大 hit area |
| 音量 slider | 默认高度 | 触摸下增大 hit area |

**实现方式**（spatial-design.md 推荐的伪元素扩展法）：

```css
@media (pointer: coarse) {
  .ctrl::before {
    content: '';
    position: absolute;
    inset: -4px; /* 将 36px 视觉区域扩展到 44px 触摸区域 */
  }
}
```

### 5.2 hover 降级

**来源**：responsive-design.md "Don't rely on hover for functionality"

在 `@media (hover: none)` 下：
- 封面 hover 改为 `:active` 态
- 卡片 hover 上浮改为 `:active` 短暂反馈
- tooltip 改为长按触发或直接显示

### 5.3 手势支持（可选增强）

- Sidebar overlay 滑动手势关闭（touch event 监听，非必须）
- 播放队列/列表触摸惯性滚动（已有 `useVirtualScroll`，确认触摸体验）

---

## 6. Container Queries（组件级响应）

**来源**：responsive-design.md "Use container queries for component-level responsiveness"，spatial-design.md

对在多处复用的组件使用 `@container` 替代 `@media`，使同一组件在不同容器宽度下自动适配：

### 6.1 歌曲列表项

```css
.song-item-wrapper {
  container-type: inline-size;
}

@container (max-width: 400px) {
  .song-meta { flex-direction: column; }
  .song-duration { display: none; }
}
```

### 6.2 卡片网格

对内容卡片使用 `auto-fit` 自适应网格（spatial-design.md "The Self-Adjusting Grid"）：

```css
.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3);
}
```

---

## 7. 实施阶段

### Phase 1：基础设施（预计 1 天）

| 任务 | 文件 | 优先级 |
|------|------|--------|
| viewport-fit=cover | `index.html` | P0 |
| 100dvh + fallback | `App.vue` | P0 |
| isTablet 状态 + layoutVars | `App.vue` | P0 |
| 安全区 padding | `PlayerBar.vue` | P0 |
| 全局触摸目标 min-height/width | `theme.css` | P0 |
| 流动排版 clamp() | `theme.css` | P1 |

### Phase 2：Sidebar 平板模式（预计 1 天）

| 任务 | 文件 | 优先级 |
|------|------|--------|
| 平板端折叠为 76px 图标栏 | `App.vue` + `Sidebar.vue` | P0 |
| overlay 遮罩层 | `Sidebar.vue` | P0 |
| 滑入过渡动画 | `Sidebar.vue` | P1 |
| 遮罩 fade 动画 | `Sidebar.vue` | P1 |

### Phase 3：PlayerBar + TopBar（预计 1 天）

| 任务 | 文件 | 优先级 |
|------|------|--------|
| PlayerBar 平板间距压缩 | `PlayerBar.vue` | P0 |
| PlayerBar 触摸目标扩展 | `PlayerBar.vue` | P0 |
| 进度条触摸区域增大 | `PlayerBar.vue` | P0 |
| TopBar 平板紧凑间距 | `TopBar.vue` | P1 |
| PlayerExpanded 纵向布局 | `PlayerExpanded.vue` | P1 |

### Phase 4：页面级适配（预计 2 天）

| 任务 | 文件 | 优先级 |
|------|------|--------|
| SettingsPage 单列 | `SettingsPage.vue` | P0 |
| StatsPage 单列 | `StatsPage.vue` | P1 |
| SongCommentPage 适配 | `SongCommentPage.vue` | P1 |
| CommentPanel 适配 | `CommentPanel.vue` | P2 |
| UserPanel 适配 | `UserPanel.vue` | P2 |
| PlayQueuePanel 适配 | `PlayQueuePanel.vue` | P2 |
| 各详情页断点微调 | 多个文件 | P1 |

### Phase 5：触摸交互增强（预计 1 天）

| 任务 | 文件 | 优先级 |
|------|------|--------|
| hover → active 降级 | `theme.css` + 各组件 | P1 |
| container queries 接入 | 歌曲列表、卡片组件 | P2 |
| auto-fit 网格改造 | 各 Panel 组件 | P2 |
| 实机触摸测试 | - | P0 |

---

## 8. 验收标准

- [ ] iPad（1024×768）横屏：sidebar 折叠为图标栏，主内容区占满剩余空间
- [ ] iPad（768×1024）竖屏：sidebar 折叠为图标栏，内容区自适应
- [ ] iPad mini（810×1080）竖屏：同上
- [ ] 所有可点击元素在触摸屏上 ≥ 44×44px
- [ ] PlayerBar 进度条可顺畅拖拽
- [ ] 侧栏展开时有遮罩层，点击遮罩可关闭
- [ ] 底部播放器不被浏览器地址栏遮挡（100dvh）
- [ ] 流动排版在 768px~1024px 区间无文字溢出或截断
- [ ] 所有弹窗/浮层在平板视口内不溢出
- [ ] `npm run build:web` 构建无报错
- [ ] lint 通过

---

## 9. 不在本次范围

- 移动端（≤767px）的 PlayerBar 两行布局重构（需单独计划）
- 手势操作（swipe to close sidebar）
- PWA / Service Worker 平板优化
- 横屏/竖屏切换动画
- Electron 桌面端响应式（桌面端固定窗口大小，不涉及）
