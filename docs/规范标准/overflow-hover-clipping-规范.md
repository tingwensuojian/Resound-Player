# overflow 裁剪 hover 效果规范

## 问题描述

当子元素有 hover 效果（如 `transform: translateY(-1px)` 上浮、`box-shadow` 投影）时，若父容器设置了 `overflow: hidden` 或 `overflow: auto`，这些效果的上沿和阴影会被裁剪，导致交互反馈不完整。

## 典型案例

```css
/* ❌ 问题代码 */
.list-wrap {
  overflow: auto;  /* 滚动容器裁剪了子元素 hover 效果 */
}
.row:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(0,0,0,0.1);  /* 上沿被父容器切掉 */
}
```

## 解决方案

### 方案 A：padding + negative margin（推荐，适合滚动容器）

给容器增加内部 padding 来容纳 hover 效果，再用负 margin 抵消对布局的影响：

```css
/* ✅ 修复代码 */
.list-wrap {
  overflow: auto;
  padding: 8px 2px;       /* 为 hover 效果留出呼吸空间 */
  margin: -8px -2px;      /* 抵消 padding 对布局的影响 */
}
```

**原理：** 容器内部的 padding 区域属于 `overflow: auto` 的可见范围。子元素 hover 时的上浮和阴影在这个 padding 区域内不会被裁剪。负 margin 保证容器在外部布局中的尺寸不变。

**适用场景：** 滚动列表容器（`.list-wrap`、`.card.list`、`.collection-list` 等）。

### 方案 B：增加 padding-top（适合固定高度卡片）

对于不需要滚动的卡片容器，增加顶部 padding：

```css
/* ✅ 修复代码 */
.card {
  padding: var(--card-padding);
  padding-top: calc(var(--card-padding) + 10px);  /* 顶部额外呼吸空间 */
  overflow: hidden;  /* 保持圆角裁剪 */
}
```

**适用场景：** 固定高度卡片（`.card`、`.collection-panel` 等）。

### 方案 C：移除不必要的 overflow:hidden

检查 `overflow: hidden` 是否真的必要。如果只是为了裁剪圆角，可以考虑：
- 给需要裁剪的具体元素添加 `overflow: hidden`，而非整个父容器
- 使用 `border-radius` 配合 `overflow: hidden` 只在图片/媒体元素上

```css
/* ✅ 更好的做法 */
.media-shell {
  border-radius: 16px;
  overflow: hidden;  /* 只裁剪媒体元素 */
}
.card {
  /* 不再 overflow: hidden，hover 效果自由呼吸 */
}
```

## 开发检查清单

在编写包含 hover 效果的组件时，检查以下项目：

- [ ] 是否有父容器设置了 `overflow: hidden`？
- [ ] 子元素 hover 时是否会 `translateY` 上浮或产生超出自身的 `box-shadow`？
- [ ] 滚动列表（`overflow: auto`）的第一行/最后一行 hover 效果是否完整可见？
- [ ] 卡片网格中顶部卡片的 hover 效果是否被上方容器裁剪？

## 已修复的问题记录

| 日期 | 文件 | 问题 | 修复方式 |
|------|------|------|----------|
| 2026-04-29 | `UserSplitView.vue` | `.detail-panel` 和 `.list-wrap` 裁剪 hover | 方案 A |
| 2026-04-29 | `HomePanel.vue` | `.card` 裁剪 `.tag` hover；`.card.list/.albums` 裁剪滚动列表 hover | 方案 B + 方案 A |
| 2026-04-29 | `HistoryPanel.vue` | `.collection-panel` 和 `.collection-list` 裁剪 `.collection-row` hover | 方案 B + 方案 A |

## 设计原则

1. **hover 效果优先可见。** 如果 `overflow: hidden` 和 hover 效果冲突，优先保证交互反馈完整。
2. **精确定位裁剪。** `overflow: hidden` 只加在必需的媒体元素上，不在列表容器上偷懒使用。
3. **先 padding 后 margin。** 使用 padding + negative margin 组合时，padding 值根据 hover 效果尺寸确定（一般 8-12px 足够覆盖 99% 的场景）。
4. **新增组件即检。** 每增加一个带 hover 效果的组件，立即检查其父容器是否可能裁剪该效果。
