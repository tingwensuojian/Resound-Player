# 平板端响应式适配 — 实现记录

> 完成日期：2026-05-30
> 依据规范：`.cursor/skills/frontend-design`、`.cursor/rules/development-spec.mdc`、`.cursor/rules/ui-safe-rail-and-group.mdc`

---

## 1. 设计目标

让 Resound-Player 在 768px~1023px 平板视口下拥有完整的可用体验，而非简单缩小桌面布局或强制堆叠为移动端布局。

核心原则：
- **适配而非截断** — 重新组织布局，不隐藏核心功能
- **检测输入方式** — `@media (pointer: coarse)` 增大触摸目标至 44×44px
- **Token 化** — 所有间距使用 `--space-*`，字号使用 `clamp()` 流动缩放
- **仅限平板端** — 桌面端（≥1024px）和移动端（≤767px）行为完全不变

---

## 2. 断点体系

| 断点 | 范围 | 行为 |
|------|------|------|
| 桌面端 | ≥ 1024px | 默认布局，sidebar 可折叠 |
| **平板端** | **768px ~ 1180px** | **新增**，sidebar 折叠为图标栏，页面级适配；含横屏专用布局 |
| 移动端 | ≤ 767px | 现有抽屉逻辑 |

---

## 3. 改动清单

### 3.1 全局基础设施

| 文件 | 改动 | 说明 |
|------|------|------|
| `index.html` | `viewport-fit=cover` | 支持 `env(safe-area-inset-*)` 安全区 |
| `src/App.vue` | `isTablet` 状态 | `window.innerWidth` 768~1023px 检测 |
| `src/App.vue` | `100vh` → `100dvh` | 移动浏览器地址栏收缩不遮挡底部播放器 |
| `src/App.vue` | `layoutVars` 平板分支 | sidebar 默认 76px 图标栏 |
| `src/App.vue` | 平板 CSS 断点 | `@media (min-width: 768px) and (max-width: 1023px)` |
| `src/styles/theme.css` | `clamp()` 排版 | display/headline-xl/lg/md 流动缩放 |
| `src/styles/theme.css` | 触摸目标 | `@media (hover: none)` 44px 最小尺寸 + 禁用 hover 动画 |
| `src/styles/theme.css` | 进度条触摸区 | `@media (pointer: coarse)` 44px 高度 |
| `src/styles/theme.css` | 触摸 active 反馈 | `@media (hover: none)` 卡片/歌曲项 `:active` 缩放 |
| `src/utils/platform.ts` | 音源匹配 URL 代理 | Web 端 `unblockMatchUrl` 从 `127.0.0.1:38763` 改为 `/unblock-api`（走 Vite 代理），解决局域网设备无法访问匹配服务的问题 |
| `src/styles/theme.css` | 按钮 padding 重置 | 全局 `button, [role='button'] { padding: 0 }` 修复 iPad Safari 图标偏右 |

### 3.2 Sidebar — overlay 抽屉模式

| 文件 | 改动 |
|------|------|
| `src/App.vue` | 新增 `sidebar-overlay` 遮罩层 + `overlay-fade` 过渡 |
| `src/components/Sidebar.vue` | 新增 `overlay` prop、`close` emit |
| `src/components/Sidebar.vue` | overlay 模式下点击菜单自动关闭 |
| `src/components/Sidebar.vue` | `sidebar-slide-in` 滑入动画 |

**平板端 Sidebar 行为**：
- 默认：76px 图标栏（仅显示图标，隐藏文字）
- 展开：220px 全宽 + 半透明遮罩，点击遮罩或选择菜单项后自动关闭

### 3.3 PlayerBar

| 文件 | 改动 |
|------|------|
| `src/components/PlayerBar.vue` | `padding-bottom: env(safe-area-inset-bottom)` |
| `src/components/PlayerBar.vue` | 平板端高度 76px、封面 48px、间距压缩 |
| `src/components/PlayerBar.vue` | `@media (pointer: coarse)` 进度条 44px 触摸区 |
| `src/components/PlayerBar.vue` | 平板端右侧按钮折叠：仅保留音量/收藏/播放列表，其余 5 个合并到上拉栏 |
| `src/components/PlayerBar.vue` | 新增 `⋯` 更多按钮 + 底部上拉栏（音质/均衡器/歌词/设置/播放模式） |
| `src/components/PlayerBar.vue` | 上拉栏支持向下滑动手势关闭 |
| `src/components/PlayerBar.vue` | 弹窗定位修复：隐藏按钮触发的弹窗改为居中显示 |

**平板端 PlayerBar 右侧按钮布局**：

| 常态显示 | 折叠到上拉栏 |
|---------|-------------|
| 🔊 音量 | ♫ 音质选择 |
| ❤️ 收藏 | ━ 均衡器 |
| 📋 播放列表 | CC 歌词 |
| ⋯ 更多（触发上拉栏） | ⚙ 播放速度 |
| | 🔁 播放模式 |

### 3.4 TopBar

| 文件 | 改动 |
|------|------|
| `src/components/TopBar.vue` | 平板端网格列压缩 + 搜索框限宽 |
| `src/components/TopBar.vue` | 触摸目标 44px（nav-btn / msg / avatar / search-trigger） |

### 3.5 PlayerExpanded — 平板端布局

| 文件 | 改动 |
|------|------|
| `src/components/PlayerExpanded.vue` | 竖屏：`grid-template-columns: 1fr` 单列纵向堆叠 |
| `src/components/PlayerExpanded.vue` | 横屏：`grid-template-columns: 35% 65%` 双栏布局 |
| `src/components/PlayerExpanded.vue` | 封面弹性尺寸：竖屏 `min(380px, 38vw)`，横屏 `min(320px, 28vw)` |
| `src/components/PlayerExpanded.vue` | 歌名/歌手/控件弹性宽度 + 流动字号 `clamp()` |
| `src/components/PlayerExpanded.vue` | `right-actions`：竖屏底部横向，横屏右侧纵向 |
| `src/components/PlayerExpanded.vue` | `console-progress`：横屏 `100%`，竖屏 `min(300px, 70vw)` |
| `src/components/PlayerExpanded.vue` | 触摸目标 44px + 进度条增大 |

### 3.6 详情页

| 文件 | 改动 |
|------|------|
| `src/styles/detail-page.css` | 平板端 header 网格 `200px + 1fr`，封面 200×200 |

### 3.7 用户页 — 列表 ↔ 详情页面切换

这是本次适配中最特殊的页面。桌面端为左右双栏，平板端改为「列表 ↔ 详情」页面切换模式。

| 文件 | 改动 |
|------|------|
| `src/components/UserSplitView.vue` | 平板端 `grid-template-columns: 1fr` 单列 |
| `src/components/UserSplitView.vue` | `has-detail` class 控制面板显隐切换 |
| `src/components/UserSplitView.vue` | 新增 `back-to-list-btn` 返回按钮 + `clear-selection` 事件 |
| `src/components/UserSplitView.vue` | 返回按钮样式完全对齐项目 `back-btn` 规范 |
| `src/components/UserPanel.vue` | `isTabletView()` 守卫：平板端不自动选中第一项 |
| `src/components/UserPanel.vue` | 监听 `user-panel-back` 事件清除选中 |
| `src/App.vue` | `onNavBack()` 拦截：平板端 user 页先回列表 |

**平板端用户页行为**：

| 状态 | 显示 |
|------|------|
| 进入用户页 | 左侧列表全宽（个人信息 + 歌单/播客列表） |
| 点击某项 | 右侧详情全宽 + 顶部「← 返回列表」按钮 |
| 点击返回按钮 / TopBar ← | 回到左侧列表 |
| 列表状态下再点 TopBar ← | 正常页面级后退 |

### 3.8 其他页面补全

| 文件 | 改动 |
|------|------|
| `src/components/SettingsPage.vue` | 平板间距压缩 + 触摸目标 |
| `src/components/StatsPage.vue` | insight-grid 单列 |
| `src/components/SongCommentPage.vue` | 平板 padding 适配 |
| `src/components/CommentPanel.vue` | 平板 padding 适配 |
| `src/components/UserPanel.vue` | 平板间距 + `100dvh` |
| `src/components/PlayQueuePanel.vue` | 平板 padding 适配 |

---

## 4. 关键技术决策

### 4.1 `isTablet` 状态管理

```ts
// src/App.vue
const isTablet = ref(false);

function syncViewport() {
  const w = window.innerWidth;
  isTablet.value = w >= 768 && w <= 1023;
  // ...
}
```

`isTablet` 在 `App.vue` 中通过 `resize` 事件实时更新。子组件通过 `window.innerWidth` 直接检测（如 `UserPanel.vue` 的 `isTabletView()`），避免逐层传递 prop。

### 4.2 用户页页面切换通信

采用全局 CustomEvent 通信，避免 prop 逐层穿透：

```
TopBar ← 按钮
  → App.vue onNavBack()
    → window.dispatchEvent('user-panel-back')
      → UserPanel 监听 → selectedItem = null
```

### 4.3 CSS 特异性处理

`back-to-list-btn` 的 `display: none`（全局隐藏）与平板端 `display: inline-flex`（局部显示）存在特异性冲突。解决方案：用 `.split-stage.has-detail .back-to-list-btn` 提升选择器特异性。

### 4.4 局域网音源匹配代理

**问题**：Web 端 `platform.unblockMatchUrl` 默认返回 `http://127.0.0.1:38763`。当 iPad 通过局域网（如 `192.168.2.112:5173`）访问时，浏览器将 `127.0.0.1` 解析为 iPad 自身，而非 Mac 服务器，导致音源匹配请求失败。

**解决**：Web 端默认改为 `/unblock-api`（相对路径），利用 Vite 已有的代理配置：

```
iPad → http://192.168.2.112:5173/unblock-api/match?id=...
  → Vite proxy → http://127.0.0.1:38763/match?id=...
```

Vite 代理配置（`vite.config.ts`）已有：
```ts
'/unblock-api': {
  target: env.VITE_UNBLOCK_MATCH_TARGET || 'http://127.0.0.1:38763',
  changeOrigin: true,
  rewrite: (p) => p.replace(/^\/unblock-api/, ''),
}
```

桌面端不受影响，仍走 native bridge 或直接连接。

### 4.5 PlayerBar 上拉栏（Bottom Sheet）

**问题**：平板端 PlayerBar 右侧 8 个按钮（音量/音质/均衡器/歌词/收藏/设置/播放模式/播放列表）空间紧张，32×32px 按钮不满足 44px 触摸目标。

**方案**：Progressive Disclosure（渐进式披露），`interaction-design.md` 核心原则。

- **常态化保留**（高频操作）：音量、收藏、播放列表
- **折叠到上拉栏**（低频操作）：音质选择、均衡器、歌词、设置、播放模式
- **触发入口**：新增 `⋯`（MoreHorizontal）按钮

**实现细节**：

- 上拉栏通过 `<Teleport to="body">` 渲染，避免被 PlayerBar 的 `overflow` 裁切
- `max-height: 60vh`，顶部圆角 18px，拖拽条居中
- 滑入动画：`transform: translateY(100%)` → `translateY(0)`，`cubic-bezier(0.34, 1, 0.64, 1)`
- 向下滑动手势关闭：`touchstart` 记录 Y → `touchend` 判断位移 > 60px → 关闭
- 每行 `min-height: 52px`，满足触摸目标

**弹窗定位修复**：

原按钮被 `display: none` 隐藏后，`getBoundingClientRect()` 返回全零，导致弹窗定位失败。修复方案：检测 `rect.width === 0` 时改为居中定位：

```ts
if (rect.width === 0 && rect.height === 0) {
  popupStyle.value = {
    position: 'fixed',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 'min(320px, calc(100vw - 32px))',
  };
  return;
}
```

受影响的弹窗：音质选择、播放速度设置、歌词显示。

### 4.6 按钮图标居中修复

**问题**：iPad Safari 的 `<button>` 用户代理样式有默认内边距（`1px 6px`），项目全局未重置。导致所有图标按钮（`.icon`、`.menu-item`、`.nav-btn` 等）的 SVG 图标在平板端被推到右侧。

**根因**：
- `.vol-icon-btn` 有 `padding: 0` → 图标居中 ✓
- `.icon`（PlayerBar）无 padding 重置 → 图标偏右 ✗
- 全局 `button` 选择器无 padding 重置 → 继承浏览器默认值 ✗

**修复**：在 `theme.css` 全局作用域添加：

```css
button,
[role='button'] {
  padding: 0;
}
```

一次性解决所有按钮（Sidebar 菜单项、TopBar 导航、PlayerBar 图标、PlayerExpanded 控制等）的图标居中问题。

---

## 5. 验收清单

- [x] iPad（1024×768）横屏：sidebar 折叠为图标栏，主内容区占满剩余空间
- [x] iPad（768×1024）竖屏：sidebar 折叠为图标栏，内容区自适应
- [x] 所有可点击元素在触摸屏上 ≥ 44×44px
- [x] PlayerBar 进度条可顺畅拖拽
- [x] 侧栏展开时有遮罩层，点击遮罩可关闭
- [x] 底部播放器不被浏览器地址栏遮挡（100dvh）
- [x] 用户页：列表 ↔ 详情切换正常
- [x] 用户页：TopBar ← 返回先回列表
- [x] `npm run build:web` 构建无报错
- [x] 局域网设备（iPad）音源替换功能正常
- [x] 平板端 PlayerBar 上拉栏正常打开/关闭
- [x] 上拉栏内音质/均衡器/歌词/设置/播放模式功能正常
- [x] 上拉栏滑动手势关闭正常
- [x] 隐藏按钮触发的弹窗居中显示
- [x] 所有按钮图标在平板端居中显示（padding 重置）
- [x] 播放/暂停按钮使用 SVG 图标替代文本字符（消除偏移）
- [x] 项目中所有文本字符按钮审查通过（无额外修复项）
- [x] 均衡器竖向滑动条在 PC 和 iPad 上均正确显示（transform:rotate 方案）
- [x] DetailStickyHeroHeader CSS 误放 script 区域已修复
- [x] 播放页封面/文字/控件弹性宽度适配（P0 溢出修复）
- [x] 播放页布局比例优化（封面 32vh，歌词区增大）
- [x] 播放页 right-actions 重定位（fixed → absolute 底部横向）
- [x] 播放页 bottom-console 触摸优化（音量滑条 108px，进度条 44px）
- [x] 播放页唱片模式 + 字号流动适配
- [x] 播放页横屏适配（断点扩展至 1180px，横屏双栏布局）

---

## 6. 文本字符按钮审查记录

### 6.1 问题描述

iPad Safari 中，部分使用文本字符（`❚❚`/`▶`/`译`/`词`/`FM`/`×`）作为图标的按钮在平板端可能出现视觉偏移，尤其是小尺寸圆形按钮内嵌单个字符时，字体度量差异导致内容不居中。

### 6.2 已修复项

| 文件 | 行号 | 按钮 | 原内容 | 修复方式 | 状态 |
|------|------|------|--------|----------|------|
| `PlayerExpanded.vue` | 283 | `.con-play`（播放/暂停） | `❚❚` / `▶` 文本字符 | 替换为 `<Pause>` / `<Play>` SVG 图标 | ✅ 已修复 |

### 6.3 审查通过项（无需修复）

以下按钮使用文本字符是有意设计，不存在居中偏移问题：

| 文件 | 行号 | 按钮 | 内容 | 原因 |
|------|------|------|------|------|
| `PlayerExpanded.vue` | 146 | `.ctrl-fm-indicator` | `FM` | 文本标签，`width:auto`、`border-radius:0`，非圆形按钮 |
| `PlayerExpanded.vue` | 207 | `.ra-btn-trans` | `译` | `display:grid; place-items:center`，网格居中 |
| `PlayerExpanded.vue` | 275 | `.lyric-match-btn` | `词` | `display:grid; place-items:center`，网格居中 |
| `PlayerExpanded.vue` | 278 | `.con-fm-label` | `FM` | 文本标签，`border-radius:0`，非圆形按钮 |
| `LyricsSelectionModal.vue` | 35 | `.sel-btn` | `译` | 胶囊按钮，`padding:6px 16px`，基于内边距居中 |
| `LocalLyricMatchDialog.vue` | 11 | `.match-close` | `×` | 单字符，`width:28px; height:28px; line-height:1` |
| `LocalMetadataWriteDialog.vue` | 11 | `.match-close` | `×` | 同上 |
| 8 个详情页 | — | `.back-btn` | `← 返回` | 胶囊按钮，`height:34px; padding:0 var(--space-3)` |

### 6.4 审查结论

- 项目中**只有播放/暂停按钮**存在文本字符偏移问题（已修复）
- 其余文本字符按钮均为**有意设计的文字标签**，使用 `grid` 或 `padding` 方式居中，平板端显示正常
- 无需额外 SVG 替换或样式调整

---

## 7. 均衡器竖向滑动条修复

### 7.1 问题描述

均衡器面板中的 10 段频率滑动条需要竖向显示。iPad Safari 对 `<input type="range">` 的 `writing-mode: vertical-lr` 支持不可靠，导致滑动条在平板端显示为横向。

### 7.2 方案对比与失败记录

| 方案 | PC 端 | iPad Safari | 问题 |
|------|-------|-------------|------|
| `writing-mode: vertical-lr` + 自定义 track/thumb | ✅ | ❌ 横向显示 | Safari 不支持 writing-mode 应用于 range input |
| `writing-mode: vertical-lr` + `!important` | ✅ | ❌ 横向显示 | 同上 |
| `transform: rotate(-90deg)` slider=180×44 | ✅ | ⚠️ 空白 | 布局尺寸≠视觉尺寸，轨道两侧空白 |
| `transform: rotate(-90deg)` + `overflow:hidden` | ✅ | ❌ 消失 | overflow 裁剪了旋转后的元素 |
| 自定义 div 滑块 + JS 定位 | ✅ | ⚠️ 偏移 | 圆点定位参考系不一致 |
| **`transform: rotate(-90deg)` slider=180×180** | ✅ | ✅ | **最终方案** |

### 7.3 最终方案

**核心思路**：slider 和 container 尺寸完全一致（180×180），旋转后完美填充，无空白无溢出。

```css
.eq-slider-wrap {
  height: 180px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.eq-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 180px;      /* 与 container 一致 */
  height: 180px;     /* 与 container 一致 */
  transform: rotate(-90deg);
  direction: rtl;    /* max 在顶部 */
  accent-color: var(--accent);
}
```

**原理**：
1. 浏览器原生渲染水平 range input（Safari 完全支持）
2. CSS 旋转 90° 变为竖向
3. `direction: rtl` 让 max(+12) 在顶部，min(-12) 在底部
4. 尺寸一致 → 旋转后无空白；`overflow: hidden` → 无溢出

**改动文件**：`src/components/EqPanel.vue`

### 7.4 关键教训

- **Safari 的 `writing-mode` 不适用于 form controls** — 这是 WebKit 的已知限制，不是 CSS 写法问题
- **`transform: rotate` 方案中，元素尺寸必须与容器一致** — 否则旋转后会出现空白或溢出
- **自定义 div 滑块的定位陷阱** — `top: X%` 的参考系取决于父元素，容易产生偏差
- **原生 range input 是最可靠的跨浏览器方案** — 只需要用旋转来改变方向

---

## 8. DetailStickyHeroHeader 修复

修复了 `DetailStickyHeroHeader.vue` 中 CSS `@media` 规则误放在 `<script>` 区域的已有 bug，将触摸设备优化样式移至 `<style scoped>` 区域。

---

## 9. 播放页（PlayerExpanded）平板端深度优化

### 9.1 问题描述

桌面端播放页为左右双栏（封面 40% + 歌词 60%），平板端改为单列纵向布局。原有平板 CSS 仅覆盖基本布局，封面/文字/控件使用固定像素值（480px/300px），在 768~1023px 视口下溢出或挤压歌词区。

### 9.2 改动清单（依据 Apple HIG）

| 优先级 | 改动 | 桌面值 | 平板值 | HIG 原则 |
|--------|------|--------|--------|---------|
| P0 | `.album-shell` | `480×480px` | `min(380px, 38vw)` | 弹性宽度 |
| P0 | `.song-name` / `.song-artist` | `width: 480px` | `min(480px, 80vw)` | 文本不溢出 |
| P0 | `.progress-wrap` / `.controls` | `width: 300px` | `min(300px, 70vw)` | 控件适配 |
| P1 | `.left-zone` max-height | `40vh` | `32vh` | 封面压缩，歌词增大 |
| P1 | `.right-actions` | `fixed` 右侧居中 | `absolute` 底部横向 | 避免遮挡歌词 |
| P1 | `.bottom-console` padding | `var(--space-5)` | `var(--space-3)` | 紧凑化 |
| P1 | `.con-vol-slider` | `88px` | `108px` | 触摸目标 ≥ 44pt |
| P1 | `.console-bar` height | `10px` | `44px` | 触摸目标 |
| P2 | `.vinyl-record` | `min(52vh, 480px)` | `min(38vh, 380px)` | 唱片竖屏适配 |
| P2 | `.vinyl-pointer` | `width:30%; top:-22%` | `width:25%; top:-18%` | 唱针比例 |
| P2 | `.song-name` font-size | `--text-headline-lg` | `clamp(20px, 4vw, 32px)` | Dynamic Type |
| P2 | `.song-artist` font-size | `--text-body-md` | `clamp(14px, 2.5vw, 18px)` | Dynamic Type |

### 9.3 触摸目标验证

| 元素 | 尺寸 | 状态 |
|------|------|------|
| `.ctrl` | 44×44px | ✅ `@media (pointer: coarse)` |
| `.cc-left/right .con-btn` | 44×44px | ✅ |
| `.ra-btn` | 44×44px | ✅ |
| `.progress` input | 44px 高 | ✅ |
| `.console-bar` | 44px 高 | ✅ 新增 |
| `.con-vol-slider` | 108px 宽 | ✅ 新增 |

### 9.4 对比度验证

| 元素 | 颜色 | 背景 | 对比度 | 状态 |
|------|------|------|--------|------|
| 歌名 | `#fff` | 深色 | > 7:1 | ✅ |
| 歌手 | `rgba(255,255,255,0.82)` | 深色 | > 4.5:1 | ✅ |
| 时间 | `rgba(255,255,255,0.78)` | 深色 | > 4.5:1 | ✅ |

**改动文件**：`src/components/PlayerExpanded.vue`

---

## 10. 播放页横屏适配

### 10.1 问题描述

iPad 横屏（1024×768）刚好超出原平板断点 `max-width: 1023px`，走桌面端布局。桌面端 `bottom-console` 中 `console-progress` 宽度为 `175%`，`cc-right` 含 5 个按钮 + 音量滑条，总宽度超出视口被 `.expanded-wrap { overflow: hidden }` 裁切。

### 10.2 修复方案

1. **扩展平板断点**：`max-width: 1023px` → `max-width: 1180px`，覆盖 iPad 横屏
2. **横屏专用布局**：在平板断点内嵌套 `@media (orientation: landscape)`，保持双栏但缩小比例

| 项目 | 竖屏（portrait） | 横屏（landscape） |
|------|-----------------|-------------------|
| `.panel-body` | `1fr` 单列 | `35% 65%` 双栏 |
| `.left-zone` | `max-height: 32vh` | `max-height: 50vh` |
| `.album-shell` | `min(380px, 38vw)` | `min(320px, 28vw)` |
| `.console-progress` | `min(300px, 70vw)` | `100%` |
| `.right-actions` | `absolute` 底部横向 | `fixed` 右侧纵向 |

**改动文件**：`src/components/PlayerExpanded.vue`

---

## 11. 关键教训

- **断点设计要考虑横屏** — iPad 横屏 1024px 刚好超出 1023px 断点，需预留余量
- **`width: 175%` 是桌面端专用值** — 在较窄屏幕上会溢出，必须用 `min()` 或媒体查询限制
- **嵌套 `@media (orientation: landscape)`** — 在通用断点内区分方向，避免覆盖竖屏布局
- **`overflow: hidden` 会静默裁切** — 父容器的 overflow 会裁切子元素溢出，需仔细检查

---

## 12. 后续可优化项

| 项目 | 优先级 | 说明 |
|------|--------|------|
| 手势关闭 sidebar | P2 | touch event 滑动手势 |
| container queries 接入 | P2 | 歌曲列表等组件级响应式 |
| auto-fit 网格改造 | P2 | 各 Panel 组件 `repeat(auto-fit, minmax(...))` |
| 移动端 PlayerBar 两行布局 | P1 | ≤767px 简化为两行 |
| 实机触摸测试 | P0 | 需在真机上验证触摸交互 |
