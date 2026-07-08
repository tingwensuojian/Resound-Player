# 全屏播放页 UI 自动显隐 — 开发计划（修正版）

## 需求

全屏播放页中，顶部栏、右侧操作列、底部控制台在无鼠标活动时**仅视觉隐藏**（opacity: 0），仍**保留布局占位**，不影响封面和歌词的位置。

| 元素 | CSS 类 | 位置 | 布局方式 |
|---|---|---|---|
| 顶部栏（返回+全屏按钮） | `.panel-head` | 屏幕顶部 | grid row |
| 右侧操作列 | `.right-actions` | 右侧固定 | `position: fixed` |
| 底部控制台 | `.bottom-console` | 屏幕底部 | grid row, `v-if` 控制存在 |

## 核心原则

- **隐藏时不改变布局** — 只用 `opacity: 0` + `pointer-events: none`，不用 `display: none`
- **不使用 Vue `<Transition>`** — 转为纯 CSS 过渡，避免 `v-show` 的 `display: none` 问题
- **`v-if` 保留** — `bottom-console` 仍用 `v-if="lyricsSettings.showMiniBar"` 控制是否在 DOM 中，`ui-hidden` 只控制自动显隐

## 实现方案

### 1. Composable（与之前一致）

`src/composables/useAutoHideUI.ts`

- 暴露 `uiRevealed` ref
- 暴露 `onActivity` / `onLeave` / `freeze` / `unfreeze` 方法
- 3s 空闲超时 + 300ms mousemove 节流
- `@mouseleave` 立即隐藏
- 零依赖

### 2. 模板绑定

```html
<!-- 根 section：绑定事件 + 光标控制 -->
<section
  class="expanded-panel"
  :style="{ cursor: uiRevealed ? 'auto' : 'none' }"
  @mousemove="onActivity"
  @click="onActivity"
  @mouseleave="onLeave"
>

  <!-- 顶部栏：:class + freeze/unfreeze -->
  <AnimatedAppear
    tag="header"
    variant="content"
    rhythm="head"
    class-name="panel-head"
    :class="{ 'ui-hidden': !uiRevealed }"
    @mouseenter="freeze"
    @mouseleave="unfreeze"
  >
    ...
  </AnimatedAppear>

  <!-- 中间内容（始终显示） -->
  <div class="panel-body">...</div>

  <!-- 右侧操作列：:class，无 Transition -->
  <div
    class="right-actions"
    :class="{ 'ui-hidden': !uiRevealed }"
  >
    ...
  </div>

  <!-- 底部控制台：v-if 控制存在 + :class 控制显隐 -->
  <AnimatedAppear
    v-if="lyricsSettings.showMiniBar"
    tag="div"
    variant="content"
    rhythm="overlay"
    class-name="bottom-console"
    :class="{ 'ui-hidden': !uiRevealed }"
    @mouseenter="freeze"
    @mouseleave="unfreeze"
  >
    ...
  </AnimatedAppear>

</section>
```

### 3. CSS 规则

```css
/* 过渡：400ms ease-in-out 淡入淡出 */
.panel-head,
.right-actions,
.bottom-console {
  transition: opacity 0.4s ease-in-out;
}

/* 隐藏态：仅透明 + 不可点击，保留布局 */
.ui-hidden {
  opacity: 0 !important;
  pointer-events: none !important;
}
```

### 4. 关键差异（与 SPlayer 方案对比）

| | SPlayer | 本方案 |
|---|---|---|
| 隐藏方式 | `<Transition>` + `v-show` → `display: none` | `ui-hidden` class → `opacity: 0`（保留占位） |
| 布局影响 | 元素消失，布局收缩 | 元素仅透明，布局不变 |
| 过渡 | Vue `<Transition>` 100-150ms | 纯 CSS transition 400ms ease-in-out |
| 冻结计时器 | 子组件 `@mouseenter.stop` | 同级别 `@mouseenter` / `@mouseleave` |

## 文件变更清单

| 操作 | 文件 |
|---|---|
| 新增 | `src/composables/useAutoHideUI.ts` |
| 修改 | `src/components/PlayerExpanded.vue` |

## 验证清单

- [x] panel-head 隐藏后，panel-body 位置不变
- [x] bottom-console 隐藏后，不占用 grid 行高（已由 v-if 保证）
- [x] right-actions 隐藏后，仍处于 right: 16px 位置
- [x] 鼠标移入面板区域 → UI 显示
- [x] 鼠标离开面板区域 → UI 立即隐藏
- [x] 鼠标悬停顶部栏/底部控制台 → 计时器冻结
- [x] 鼠标离开控制区 → 3s 后隐藏
- [x] lint 无报错