# AGENTS.md — Resound-Player 项目开发规范

本文件由 `.cursor/rules/` 迁移而来，作为 Codex Agent 在本项目中的行为规范。

---

# 一、项目开发规范（development-spec）

本规范用于统一项目内页面、组件、样式、动画与收藏交互的开发方式。后续新增功能、页面、组件时，应优先遵循本文件，而不是在业务代码中临时补充局部约定。

## 1. 总体原则

- 优先复用现有组件、样式和状态管理，不重复造轮子
- 新功能接入前先检查是否已有标准组件、公共样式或统一 API
- 保持页面结构稳定，避免为了局部效果改网格、改尺寸、改布局层级
- 所有改动完成后必须做 lint 自检
- 样式优先使用 token 和公共样式，不在页面内堆叠硬编码数值

### 1.1 发布与 Release 文案规范

- GitHub Releases 的标题、正文、更新说明、安装说明、校验说明必须使用中文
- 禁止在 Release 描述中使用英文说明性文案，如 `Changes`、`Build`、`Checksums`、`Release Notes`
- 文件名、版本号、命令、技术专有名词可保留原始形式，例如 `v1.0.1`、`npm run dist:mac`、`.dmg`、`.blockmap`
- 替换已有 Release 时，必须同步检查 Release 标题、正文和资产说明，确保没有遗留英文说明
- 通过 GitHub Actions 构建并上传 Release 资产时，Release 描述仍必须按上述中文规范维护

## 2. 样式统一规范

### 2.1 spacing 统一

项目已统一 spacing 体系，新增样式优先使用以下 token：

- `--space-1`
- `--space-2`
- `--space-3`
- `--space-4`
- `--space-5`
- `--space-6`
- `--space-8`

要求：

- `gap`、`padding`、`margin` 优先使用 token
- 不在同一类页面中混用多套间距尺度
- 列表项、卡片、操作区尽量保持一致节奏

### 2.2 页面结构统一

页面结构应尽量保持以下一致性：

- 页面根容器使用统一的 shell 结构
- 标题、说明、操作区、内容区的层级清晰
- 卡片与面板的圆角、阴影、边距尽量统一
- 复杂页面优先拆成可复用区块，不要在单页里重复实现多个近似结构

#### 2.2.2 嵌套协调原则（Nested Harmony）

卡片与面板容器的 `border-radius` 与内部 `padding` 应保持相互协调，避免内容从圆角处溢出视觉界线：

- 容器的 `padding` 应接近或等于 `border-radius`，保证内部子元素距离容器边缘至少一个圆角半径
- 当前参考：`--radius-lg: 14px`，卡片 padding 使用 `--space-4: 16px`（padding ≥ radius，符合套嵌安全）
- 新增容器时，检查 padding 与 radius 的关系，避免 `padding < radius` 导致内容压角

#### 2.2.3 卡片无边框变体

部分场景下（侧栏内嵌卡片、列表嵌套卡片、紧凑信息区）可选用无边框卡片变体：

- 移除 `border: 1px solid var(--border)`，仅保留 `background` 和 `box-shadow`
- 适用范围：空间有限的信息密度区、视觉层级已由背景色区分的场景
- 禁止在主要操作区、表单区、需要明确边界感的位置使用无边框变体

### 2.3 原子控件统一

`src/components/ui/` 下的原子控件应保持统一视觉和交互节奏：

- 按钮高度一致
- 下拉、开关、图标按钮等控件复用统一样式基线
- 控件状态至少覆盖 `:hover` / `:active` / `:disabled`
- 新增原子控件先考虑扩展现有组件，而不是新写一套风格

## 3. 全局主题与设计系统

### 3.1 theme.css 的定位

`src/styles/theme.css` 是项目全局设计系统入口之一，主要负责：

- 颜色 token
- 圆角 token
- 玻璃效果 token
- 间距 token
- 布局辅助变量
- 统一交互状态
- 兼容兜底规则

### 3.2 使用原则

- 优先使用 `--bg-*`、`--text-*`、`--border*`、`--accent*`、`--danger*`
- 优先使用 `--radius-*`、`--glass-*`、`--space-*`、`--layout-*`
- 避免在组件中重复定义接近主题能力的硬编码颜色和阴影
- 兼容样式应保留，但不要把临时补丁继续扩展成新的主规范

### 3.3 排版体系

项目已在 `src/styles/theme.css` 中引入统一排版 token，参考 Apple HIG 风格的层级结构，按语义分为四个层级：

| 层级 | Token 前缀 | 典型 fontSize | 用途 |
|------|-----------|--------------|------|
| Display | `--text-display-*` | 48px | 品牌入口、落地大标题 |
| Headline | `--text-headline-*` | 38px / 32px / 24px | 详情页英雄标题、页面标题、区块标题 |
| Body | `--text-body-*` | 18px / 16px / 14px | 正文、描述、元数据、紧凑正文 |
| Label | `--text-label-*` | 14px / 12px / 11px | 导航项、标签、按钮文字、极小标签 |

完整 token 清单：

```css
/* Display — 品牌入口 */
--text-display: 48px / 700 / 56px / -0.02em

/* Headline — 标题 */
--text-headline-xl: 38px / 700 / 44px / -0.015em   /* 详情页英雄标题 */
--text-headline-lg: 32px / 700 / 40px / -0.01em     /* 页面标题 */
--text-headline-md: 24px / 600 / 32px               /* 区块标题 */

/* Body — 正文 */
--text-body-lg: 18px / 400 / 28px                   /* 大号正文 */
--text-body-md: 16px / 400 / 24px                   /* 标准正文 */
--text-body-sm: 14px / 400 / 22px                   /* 紧凑正文 */

/* Label — 标签 / 按钮 / 辅助文字 */
--text-label-md: 14px / 500 / 20px / 0.01em         /* 导航、按钮 */
--text-label-sm: 12px / 600 / 16px / 0.05em         /* 辅助标签 */
--text-label-xs: 11px / 600 / 14px / 0.05em         /* 极小标签（tooltip、角标） */

/* Font stacks */
--font-mono: 'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
```

使用要求：

- 标题使用 `--text-headline-*`，正文使用 `--text-body-*`，标签/按钮文字使用 `--text-label-*`
- 禁止在页面中硬编码 `font-size` / `font-weight` / `line-height` / `letter-spacing` 的组合值，应直接使用 token
- 新增页面时先选择合适的排版层级，不要随意选取字号

### 3.4 圆角与间距规范

新增容器、卡片、面板时，`border-radius` 必须使用 `--radius-*` token，禁止硬编码：

| Token | 值 | 典型用途 |
|-------|-----|---------|
| `--radius-sm` | 6px | 小控件、标签 |
| `--radius-md` | 8px | 按钮、输入框 |
| `--radius-lg` | 14px | 卡片、面板 |
| `--radius-xl` | 18px | 大面板、模态框 |
| `--radius-full` | 9999px | 圆形头像、胶囊按钮 |

间距使用 `--space-*` token，禁止硬编码 `px` 值。`gap`、`padding`、`margin` 统一走 token 体系。

### 3.5 组件级样式规范

- 组件内禁止使用 `!important`，除非覆盖第三方库且有注释说明
- 组件样式优先使用 CSS 变量，而非硬编码颜色值
- scoped 样式中禁止定义全局会影响其他组件的选择器

## 4. 详情页公共样式规范

### 4.1 详情页头部组件

所有详情页（歌单、专辑、歌手、播客、语言、用户等）统一使用 `DetailShrinkShell.vue` 作为头部容器。
详情见 `docs/详情页头部缩小DetailShrinkShell组件说明.md`。

组件结构：

```
.detail-shrink-shell.playlist-detail-page
  .hero-bg              // 高斯模糊背景（360px 高，延伸至列表区）
  .detail               // 头部，flex column，290px 高 → 160px(小模式)
    .hero-media         // 封面区域 200×200 → 120×120
    .hero-info
      .hero-title       // 标题 — 30px → 22px
      .hero-meta        // 元数据（小模式隐藏）
      .hero-actions     // 操作按钮区
    .detail-tabs        // 标签行 + 搜索框
  .shell-content        // 内容区，margin-top 290px → 160px
```

### 4.2 详情页头部尺寸

- 封面尺寸：`200px × 200px`（普通）→ `120px × 120px`（小模式），圆角 16px
- 标题字号：`30px` → `22px`
- 头部高度：`290px` → `160px`（桌面端）

### 4.3 详情页列表区

- 列表项高度统一：`56px`（标准）
- 列表项间距：`--space-1`
- 列表项 hover 状态：`--bg-hover`
- 序号列宽度固定：`40px`
- 时长列宽度固定：`48px`
- 列表滚动驱动小模式：通过 `useListScroll` composable（100ms 节流，scrollTop > 10 触发）

### 4.4 旧背景系统已清理

以下旧 `::before` 背景规则已在 2026-06 重构中被禁用（`display: none`）：

- `.panel::before` — 影响 MV 页、歌单分类页
- `.daily-page::before` — 未使用
- `.user-detail-page::before` — 未使用
- `.hero-bg` 元素 — 已从 DetailShrinkShell 中彻底删除
- `.content--hero-sticky::before` — 无需处理（无背景元素产生冲突）

## 5. 动画规范

### 5.1 全局入场动画

项目已沉淀统一的入场动画体系，位于 `src/styles/animations.css`：

- `.fade-in` — 淡入
- `.fade-in-up` — 从下方淡入
- `.fade-in-scale` — 缩放淡入
- `.slide-in-right` — 从右侧滑入

使用要求：

- 新增页面/组件入场时优先使用上述公共类
- 禁止在 scoped 样式中重复定义 `@keyframes` 入场动画
- 动画时长统一使用 `--duration-normal: 0.3s` 或 `--duration-fast: 0.15s`

### 5.2 过渡动画

- 页面切换过渡：`0.3s ease`
- 弹窗/抽屉过渡：`0.25s ease`
- 按钮状态过渡：`0.15s ease`
- 颜色/背景过渡：`0.2s ease`

### 5.3 动画性能

- 优先使用 `transform` 和 `opacity` 做动画，避免动画 `width`、`height`、`top`、`left`
- 需要 GPU 加速的动画使用 `will-change: transform`（但不要滥用）
- 列表项动画使用 stagger（交错）效果，每项延迟 `0.03s ~ 0.05s`

## 6. 收藏按钮规范

### 6.1 收藏按钮标准

所有收藏/喜欢/书签按钮必须使用统一的心形图标组件，遵循以下规范：

- 图标：使用 `HeartIcon` 组件，支持 filled / outlined 两种状态
- 颜色：未收藏 `--text-secondary`，已收藏 `--accent` 或 `--danger`
- 尺寸：标准 `20px`，紧凑 `16px`
- 动画：收藏时播放心跳动画 `heartBeat 0.3s ease`
- 无障碍：`aria-label` 包含当前状态描述

### 6.2 收藏状态管理

- 收藏状态通过 store 统一管理，禁止组件内自行维护
- 收藏操作调用 `useFavorites().toggle(id)` composable
- 收藏成功后播放微交互动画，失败时回滚状态并提示

## 7. 新增页面 / 组件落地要求

### 7.1 新增页面 Checklist

新增页面时必须确认：

- [ ] 使用统一的页面 shell 结构
- [ ] 标题使用 `--text-headline-*` token
- [ ] 间距使用 `--space-*` token
- [ ] 圆角使用 `--radius-*` token
- [ ] 按钮使用统一组件
- [ ] 入场动画使用公共动画类
- [ ] 收藏按钮使用标准组件
- [ ] lint 通过

### 7.2 新增组件 Checklist

新增组件时必须确认：

- [ ] 检查 `src/components/ui/` 下是否已有类似组件
- [ ] 样式使用 CSS 变量，不硬编码
- [ ] 状态覆盖 hover / active / disabled
- [ ] 无障碍属性齐全（aria-label、role 等）
- [ ] 导出类型声明完整

## 8. 列表与表格规范

### 8.1 列表项高度

- 标准列表项：`56px`
- 紧凑列表项：`44px`
- 大号列表项：`72px`（含封面缩略图）

### 8.2 列表项布局

```
.list-item
  .item-index      // 序号 (40px)
  .item-cover      // 封面（可选）
  .item-info       // 歌曲信息（flex: 1）
    .item-title    // 标题
    .item-artist   // 艺术家
  .item-duration   // 时长 (48px)
  .item-actions    // 操作按钮
```

### 8.3 虚拟列表

长列表（>100 项）必须使用虚拟滚动：

- 使用 `vue-virtual-scroller` 或等效方案
- 每项高度固定，避免动态高度计算
- 滚动容器使用 `ui-safe-rail` 类（详见 UI 防裁切规范）

## 9. 响应式规范

### 9.1 断点

| 断点 | 值 | 用途 |
|------|-----|------|
| mobile | `< 640px` | 手机竖屏 |
| tablet | `640px ~ 1024px` | 平板 / 手机横屏 |
| desktop | `> 1024px` | 桌面 |

### 9.2 布局策略

- 桌面端：侧边栏 + 主内容区
- 平板端：底部导航 + 主内容区
- 手机端：底部导航 + 全屏内容

### 9.3 响应式间距

- 移动端 padding 减少 50%
- 移动端封面尺寸缩小到 `120px × 120px`
- 移动端隐藏次要信息列

## 10. 状态管理规范

### 10.1 Store 结构

- `usePlayerStore` — 播放器状态
- `useUserStore` — 用户状态
- `usePlaylistStore` — 歌单状态
- `useSearchStore` — 搜索状态
- `useSettingsStore` — 设置状态

### 10.2 Composable 规范

- 通用逻辑提取到 `src/composables/`
- composable 命名以 `use` 开头
- composable 内部使用 `ref` / `reactive` 管理状态
- composable 返回值使用 `toRefs` 保持响应性

## 11. 导航与吸顶规范

### 11.1 返回导航

- 详情页必须支持浏览器后退
- Electron 环境使用自定义历史栈
- 返回后滚动位置必须恢复

### 11.2 吸顶行为

项目已沉淀 `useDetailStickyState` composable，用于管理详情页头部吸顶行为。

**架构：RAF 驱动连续 progress + 最小化 calc()**
- `--sticky-progress` 连续 0→1，跟随显示器帧率（RAF 60Hz）
- 滚动时 RAF 循环自动启动，停止滚动 150ms 后自动暂停
- 仅写入 1 个 CSS 变量，calc() 求值精简到 ~8 处
- `setStuck()` class 仅在 progress 跨越 0.998 / 0.002 时触发

```ts
// useDetailStickyState — RAF 驱动连续 progress
let rafId = 0;
function tick(): void {
  const progress = Math.min(1, scrollTop / PROGRESS_DISTANCE);
  root.style.setProperty('--sticky-progress', String(progress));
  rafId = requestAnimationFrame(tick);
}
scrollHost.addEventListener('scroll', () => {
  scrollTop = scrollHost.scrollTop;
  if (!rafActive) startRAF();
  // 停止滚动 150ms 后自动暂停 RAF
}, { passive: true });
```

#### 使用规则

1. **导航切换时调用 `refresh()` 重置吸顶状态**
   - 在路由 watcher 中调用 `refresh()`
   - `refresh()` 内部通过 `nextTick` 确保 DOM 已更新再读取位置
   - 切换时重置

2. **`scrollContentToTop()` 在 watcher 中同步执行，不依赖 RAF**
   - `element.scrollTop = 0` 是同步 DOM 操作，立即生效
   - 不需要额外的 RAF 或 `nextTick` 延迟

#### CSS transition 规范

| 属性 | 可加 transition | 原因 |
|------|---------------|------|
| `opacity` | ✅ 允许 | compositor-only |
| `transform` | ✅ 允许 | compositor-only |
| `filter` | ✅ 允许 | compositor-only |
| `height` | ⚠️ 谨慎 | 唯一可接受的 layout 属性，0.3s |
| `padding-top/bottom` | ⚠️ 谨慎 | 仅关键视觉处，0.25s |
| `background` | ⚠️ 谨慎 | 仅关键视觉处，0.25s |
| `box-shadow` | ⚠️ 谨慎 | 仅关键视觉处，0.25s |
| `clip-path` | ❌ 禁止 | 非 transitionable + 昂贵 paint |
| `width` / `grid-*` / `margin` | ❌ 禁止 | layout 触发 |

#### 强制约束

- 新增详情页时，必须先引入 `useDetailStickyState`，并在 watcher 中绑定 `refresh()`
- 新增共享滚动容器的页面时，必须在 App.vue 的 `scrollContentToTop` watcher 列表中添加对应的 ID ref
- `refresh()` 中禁止在同一次调用内同时修改 `isSticky` 和读取 DOM 位置 —— 必须通过 `nextTick` 分离
- **禁止连续 progress** — `--sticky-progress` 只赋 0 或 1
- **禁止 RAF 循环** — scroll 事件用 `{ passive: true }`
- **禁止使用 `backdrop-filter` 在可滚动 sticky 元素上** — 改用 `generateBlurredBg` 预渲染模糊 + `::before` opacity
- **禁止 `clip-path` 在 sticky 元素上** — 改用 `::before` 的 `border-radius`

### 11.3 复核要求

完成导航或吸顶相关改动后，必须确认：

- 从每个可能入口进入详情页，返回都能回到正确页面
- 多次链式跳转后返回依然正确
- 页面切换后新页面从头部开始显示
- 页面切换后头部普通态正常（不卡死在粘顶态）
- lint 通过

## 12. 封面图片预加载渐入规范

本规范约束项目中所有通过 CSS `background-image` 加载封面/背景图片的元素，防止 JPEG 逐行渲染导致的半图卡顿问题。

### 12.1 公共实现

项目已沉淀两处公共资源：

1. **`src/composables/useBgLoaded.ts`** — 预加载 composable，接收 URL getter，返回 `loaded` ref
2. **`src/styles/animations.css`** — 全局 CSS 类 `.fade-in-bg` + `.bg-loaded`

```css
.fade-in-bg { opacity: 0; transition: opacity 0.25s ease; }
.fade-in-bg.bg-loaded { opacity: 1; }
```

### 12.2 使用方式

任何组件中引入并使用的标准模式：

```ts
import { useBgLoaded } from '../composables/useBgLoaded'

const loaded = useBgLoaded(() => someCoverUrl.value)
```

```html
<span class="fade-in-bg" :class="{ 'bg-loaded': loaded }"
      :style="{ backgroundImage: `url(${someCoverUrl})` }"></span>
```

### 12.3 强制约束

1. **新增 `background-image: url()` 的封面元素时，必须使用 `useBgLoaded` + `.fade-in-bg`**
   - 禁止直接通过 `:style` 或 CSS 设置 `background-image` 而不做预加载渐入
   - 禁止在组件 scoped CSS 中重复定义 `opacity: 0; transition: opacity 0.25s` 等私有渐入规则

2. **`useBgLoaded` 必须接收响应式 getter，而不是静态值**
   - 正确：`useBgLoaded(() => someRef.value)`
   - 错误：`useBgLoaded(someRef.value)`

3. **URL 为空时必须兜底**
   - 当封面 URL 为空或不存在时，`useBgLoaded` 返回 `false` 且不发起网络请求
   - 元素应依赖 CSS 自身 `background-color` 或 fallback 样式展示占位，不依赖 loaded 状态

4. **错误兜底**
   - 图片加载失败时（`onerror`），`useBgLoaded` 仍会标记 `loaded = true`，确保页面不会永久空白

## 13. 跨平台开发规范（Web / Desktop）

本规范约束 Web 版与 Electron 桌面版共享同一代码库时的差异管理方式。

### 13.1 平台检测入口

所有平台检测必须走 `src/utils/platform.ts` 模块，禁止在业务代码中直接访问 `window.appEnv`。

```ts
// ✅ 正确
import { platform } from '../utils/platform'
if (platform.isDesktop) { /* ... */ }

// ❌ 禁止
if ((window as any).appEnv?.isDesktop) { /* ... */ }
```

### 13.2 新增 preload 字段要求

在 `electron/preload.js` 中新增 `contextBridge` 暴露的字段时，必须同步：

1. 更新 `global.d.ts` 中的 `Window.appEnv` 接口
2. 考虑是否需要在 `src/utils/platform.ts` 中新增对应的 getter

### 13.3 功能差异分级

| 差异度 | 策略 | 适用场景 |
|--------|------|---------|
| 小 | 组件内 `v-if="platform.isDesktop"` 条件渲染 | 设置项、额外按钮 |
| 中 | 包装层组件 + Web/Desktop 两个实现 | 设置页、播放页 |
| 大 | Composable 提取 + 平台专用组件 | 托盘、下载、本地文件 |

### 13.4 禁止行为

- 禁止在业务代码中直接引用 `electron` 模块（Web 端会爆炸）
- 禁止在 Web 端打包 Electron 特有代码
- 禁止在业务代码中直接访问 `window.appEnv`

---

# 二、UI 防裁切规范（ui-safe-rail-and-group）

本规范用于约束项目内所有按钮、横向分类、横向滚动列表、紧凑切换器等交互 UI，避免出现：

- 按钮 hover 后上边缘缺一块
- 圆角、边框、阴影被父级裁切
- 横向分类项、标签项或卡片项被父级 `overflow` 挡住

## 1. 问题模式定义

以下组合属于高风险 UI：

1. 父级容器存在裁切行为：`overflow: hidden` / `overflow-y: hidden` / 横向滚动容器默认隐藏纵向溢出
2. 子级交互元素存在外溢行为：`transform: translateY(-1px)` / hover 阴影向外扩散 / 激活态边框或光晕超出原始盒子

只要这两类条件同时出现，就必须检查是否会发生视觉裁切。

## 2. 公共样式基线

### 2.1 `ui-safe-rail`

用于：横向滚动标签栏、chips、卡片 rail、历史记录 chips 区、任何"可横向滚动 + 子项 hover 可能上浮"的容器。

```html
<div class="category-tabs ui-safe-rail">...</div>
```

### 2.2 `ui-safe-group`

用于：section switch、segmented controls、tab 容器、紧凑按钮组、任何"非滚动但内部按钮 hover 会上浮"的紧凑容器。

```html
<div class="section-switch ui-safe-group">...</div>
```

## 3. 强制约束

- 新增横向交互容器时，满足条件（子项 hover 上浮/阴影/active 外扩/横向滚动）应优先挂 `ui-safe-rail`
- 新增按钮组容器时，满足条件（hover 上浮/阴影增强）应优先挂 `ui-safe-group`
- 禁止在页面里重复散写 `overflow-x: auto + overflow-y: visible`、`padding-top: 2px`、`scrollbar-width: none` 等组合

## 4. 开发顺序

遇到"按钮缺一块 / 被父级挡住"的问题时：

1. 先确认是否属于"父级裁切 + 子级外溢"的组合
2. 先尝试接入 `ui-safe-rail` 或 `ui-safe-group`
3. 再检查页面私有样式是否还能删除重复补丁
4. 最后才考虑局部特例覆盖

## 5. Code Review 检查项

- 是否新增了 hover 上浮元素
- 父级是否存在 `overflow` 裁切
- 横向滚动容器是否已优先复用 `ui-safe-rail`
- 紧凑按钮组是否已优先复用 `ui-safe-group`
- 是否存在可以删除的重复局部补丁

---

# 三、CodeGraph 使用规则（codegraph）

本项目已初始化 CodeGraph（`.codegraph/` 目录存在），AI agent 应优先使用 CodeGraph 的 MCP 工具进行代码探索。

## 使用原则

1. **探索类任务**（如"解释 X 如何工作"、"Y 在哪里实现"）必须 spawn Explore agent，使用 `codegraph_explore` 作为主要工具
2. **轻量查表**（如"查找符号定义"、"追踪调用链"、"分析影响范围"）可直接使用：
   - `codegraph_search` — 按名称搜索符号
   - `codegraph_callers` / `codegraph_callees` — 追踪调用流
   - `codegraph_impact` — 分析改动影响半径
   - `codegraph_node` — 获取单个符号详情
   - `codegraph_files` — 获取索引的文件结构
   - `codegraph_status` — 检查索引健康状态
3. 禁止在主会话中调用 `codegraph_explore` 或 `codegraph_context`，它们返回大量源码会撑爆上下文

## 工具选择速查

| 问题 | 工具 |
|------|------|
| "X 定义在哪？" | `codegraph_search` |
| "谁调用了 Y？" | `codegraph_callers` |
| "Y 调用了什么？" | `codegraph_callees` |
| "改 Z 会破坏什么？" | `codegraph_impact` |
| "Y 的签名/源码/文档？" | `codegraph_node` |
| "给定任务的聚焦上下文？" | `codegraph_context` |
| "不熟悉区域的全景？" | `codegraph_explore` |
| "路径下有哪些文件？" | `codegraph_files` |
| "索引是否健康？" | `codegraph_status` |

## 规则

- **信任 codegraph 结果**，它们来自完整 AST 解析，不要用 grep 再验证
- **不要先 grep 再 search**，`codegraph_search` 更快更准
- **不要链式 search + node**，直接用 `codegraph_context`
- **`codegraph_explore` 是重量级工具**，token 开销大，优先用 subagent 隔离
- **索引延迟**：文件监听器有 ~500ms debounce，编辑后不要立即重查

## 索引自动同步

CodeGraph MCP 服务器通过 FSEvents 自动监听文件变更，2 秒 debounce 后增量同步。代码保存后等待 2-3 秒即可查询最新状态。手动同步：`codegraph sync`

---

# 四、项目架构与命令参考（from CLAUDE.md）

## 常用命令

```bash
# Dev server (web only, requires API)
npm run dev:web:full    # Full stack: API + unblock + Vite on port 5173

# Dev server (web only, no API)
npm run dev:web         # Vite dev server only

# Desktop (electron)
npm run dev:desktop     # Vite + Electron
npm run build:desktop   # Build for desktop
npm run build:web       # Build web version only

# Unblock music sources
npm run dev:unblock         # Run unblock server on port 38762
npm run dev:unblock-match   # Run match server on port 38763
```

## 技术栈

- **Frontend**: Vue 3 `<script setup lang="ts">` SFCs, Vite
- **Styling**: Plain CSS (no preprocessor), scoped styles per component, global styles in `src/styles/`
- **State**: Vue `reactive()` singletons (no Pinia)
- **API**: NeteaseCloudMusicApi enhanced backend

## 源码结构

```
src/
  stores/          # Reactive state singletons
    player.ts      # Core player state (currentTrack, isPlaying, playlist, seek, volume)
    lyricsSettings.ts  # Lyrics display settings (persisted to localStorage)
    user.ts        # User/auth state
    ui.ts          # UI state (sidebar, theme)
    unblock-cache.ts  # Unblock source cache (Map + localStorage, 200 max, 10min TTL)
  composables/     # Vue composables
    useLyrics.ts   # Lyric parsing (LRC/YRC), timeline tracking, scroll anchoring
    useAmllAdapter.ts  # AMLL lyric format adapter
    useIridescence.ts / useThreeScene.ts / usePaperShaders.ts / etc. # Background effects
  components/
    PlayerBar.vue          # Bottom mini player bar
    PlayerExpanded.vue     # Full-screen expanded player (cover/record/fullscreen modes)
    LyricsPanel.vue        # Lyrics display (custom + AMLL renderer switching)
    LyricsSettingsPanel.vue # Lyrics settings popover
    ui/                    # Reusable UI components (FancySwitch, StepSliderRow, RadioRow, etc.)
  styles/
    theme.css         # Design tokens, light/dark theme, glass system (~1186 lines)
    animations.css    # Entrance animations, hover-scale system, cover keyframes
    detail-page.css   # Detail page layout
  api/
    music.ts          # Music API calls (lyric, song detail, playlist, etc.)
    auth.ts           # Authentication
    client.ts         # Axios instance with proxy
```

## Store 模式

所有 store 是 module-level `reactive()` 单例，不是 Pinia store，直接 import：

```ts
import { playerStore } from '../stores/player';
import { lyricsSettings } from '../stores/lyricsSettings';
```

## PlayerExpanded 显示模式

三种封面显示模式，由 `lyricsSettings.displayMode` 控制：

- `cover` — 矩形专辑封面在左，歌词在右（2 列 grid）
- `record` — 黑胶唱片 + 旋转盘 + 唱臂在左，歌词在右
- `fullscreen` — 封面作为左侧 60vw 全高背景层，歌词全宽

关键布局设置：
- `showCover` — 显示/隐藏左侧区域
- `showLyrics` — 显示/隐藏歌词面板
- `showMiniBar` — 浮动底栏 vs 左侧控件
- `centerAlign` — 歌词文本对齐切换
- `contentWidth` — 左右列比例 (30-70%)

## 歌词渲染

两个渲染器共存，由 `useAmllRenderer` 切换：

1. **Custom renderer** — DOM-based，可滚动 `.lyric-box`（`overflow-y: auto`）
2. **AMLL renderer** — `@applemusic-like-lyrics/vue` LyricPlayer 组件（canvas/DOM 混合）

两者在 `.renderer-stack` 中通过 `v-show` 叠加保持挂载。

## 歌词滚动行为

- `isHovering` — 鼠标进入歌词区 → 移除所有行的模糊
- `isUserScrolling` — 滚动/滚轮/触摸歌词 → 暂停自动跟随 3s，然后滚到当前行
- `seekToLine` — 点击歌词行跳转播放位置并重置滚动状态

## API Server

需要 `@neteasecloudmusicapienhanced` 运行在端口 38761。开发代理通过 `VITE_API_PROXY_TARGET`。Unblock 服务运行在端口 38762（unblock）和 38763（match）。

## 本地音乐（仅桌面端）

- **Storage**: SQLite 文件 (`local-music.sqlite`)，通过 `sql.js` WASM 引擎 — 零原生依赖
- **Scanner** (`electron/services/scanner/NodeMusicScanner.js`): 递归收集支持的音频文件，支持 mp3/flac/wav/ogg/m4a/aac/wma/ape/dsf/opus/aiff/alac
- **Playback**: 本地文件通过 IPC (`local:read-file`) 读取并转为 blob URL
- **Song List** (`src/components/VirtualSongList.vue`): 自定义虚拟滚动（无外部库），固定行高 68px，15 行 overscan

## 关键模式

### CSS Variables for Covers
所有封面 hover scale 使用 `animations.css` 中的 `--image-hover-scale`。禁止在组件 scoped CSS 中定义封面 hover 值。禁止使用 `[class*='cover']` 通配选择器。

### Persisted Settings
`lyricsSettings` 持久化到 localStorage key `gm_lyrics_settings_v1`。reactive 对象有 `.save()` 方法。首次加载或字段缺失时应用默认值。

### Palette Extraction
`PlayerExpanded.vue` 使用 56x56 canvas 从当前曲目封面提取 4 色调色板，驱动背景渐变（`c1`–`c4`）和强调色（`c3`）。

### Unblock Music Source Matching
- `server/unblock-match-server.mjs` 使用 `Promise.any` 竞争多个源
- `src/stores/unblock-cache.ts` 缓存结果到 Map + localStorage
- `src/config/musicSources.ts` 注册源及元数据
