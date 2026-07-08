# 任务栏 Widget 歌词水平滚动抖动修复总结

## 问题现象

任务栏 Widget 在播放长歌词时，水平滚动出现抖动。表现为歌词滚动不平滑，在歌词后半段尤其明显，视觉效果类似"齿感"或"微跳变"。

## 排查历程

### 第一阶段：阈值门控模式（失败）

原始实现使用阈值触发模式：

```
1. 当 pw（已播宽度）超过视口 90% 时
2. 计算新目标 _scrollTarget = pw - 视口 10%
3. 指数平滑追赶 _scrollTarget
```

**问题**：产生"静止（等阈值）→ 突发追赶 → 静止 → 再突发"的周期模式，视觉上就是间歇性抖动。

### 第二阶段：连续跟随 + 目标冻结（失败）

将阈值比较基准从 `_scrollDisplay` 改为 `_scrollTarget`，并在平滑动画中冻结 `_scrollTarget`。

**问题**：平滑追赶上目标被冻结的值后立即触发新一轮追赶，本质上仍是突发模式。

### 第三阶段：连续跟随 + 帧率无关速率限制（失败）

每帧跟随 `pw`，用 `MAX_STEP=6px` 限制每帧最大移动量。

**问题**：速率限制创造了另一种突发——当 `pw` 推进速度 > 6px/帧时，`_scrollDisplay` 以恒定 6px/帧追赶，从"平滑微动"到"匀速追赶"的切换本身可见。

### 第四阶段：连续跟随 + 指数平滑（失败）

`_scrollDisplay += diff * (1 - exp(-5 * delta/1000))`。这是汽水音乐用的公式，理论上应该有效。

**问题**：经排查，该公式本身没问题，但在跨进程 IPC 场景下，帧率波动导致 `delta` 不稳定：
- 60fps（delta=16ms）：每帧移动 gap 的 ~8%
- 30fps（delta=33ms）：每帧移动 gap 的 ~15%

当帧率从 60fps 掉到 30fps 时，每帧推进量翻倍，肉眼直接看到"快一下慢一下"。跨进程 IPC 接收快照时频繁的 GC 和序列化开销加剧了帧率不稳定。

### 最终方案：无平滑直接跟随（解决）

去掉所有形式的平滑、速率限制、阈值门控、缓存变量，每帧直接：

```javascript
vp.scrollLeft = Math.round(clamp(pw - vp.clientWidth * 0.1, 0, maxScroll));
```

**为什么有效**：
- `pw` 由 `_time += delta/1000` 驱动，本身就是帧率无关的时间驱动信号——delta 大则推进多，delta 小则推进少，天然平滑
- `Math.round()` 消除子像素舍入差异，防止 Chromium 在子像素值上的不一致表现
- 没有任何累积/中间变量，不存在"追赶"场景

---

## LRC 长歌词滚动策略

### 问题

LRC 歌词没有逐字时间戳（`words` 数组为空），无法像 KRC 行那样用 `pw`（已播宽度）驱动滚动。如果按匀速滚动，每帧移动 scrollLeft 在小字号下步进感明显，感觉"卡顿"。

### 方案：三分段跳转

将唱一句歌词的时间三等分，每段跳转到对应位置，不做平滑动画：

| 进度 | 显示位置 | 效果 |
|------|---------|------|
| `< 33%` | `scrollLeft = 0` | 显示歌词开头 |
| `33% ~ 66%` | `scrollLeft = maxScroll × 0.35` | 跳到中间段 |
| `> 66%` | `scrollLeft = maxScroll` | 跳到末尾 |

**关键设计**：中间段用 `0.35` 而非 `0.5`，因为超宽歌词的后半段比前半段长（歌词靠左对齐），0.35 更接近中点的实际视觉位置。

```typescript
// LRC 行：三分段跳转（无平滑，避免卡顿）
const nextTime = nextIdx < _allLines.length ? _allLines[nextIdx].time : line.time + 3;
const lineDuration = nextTime - line.time;
const progress = Math.max(0, Math.min(1, (time - line.time) / lineDuration));
if (progress < 1 / 3) {
  vp.scrollLeft = 0;
} else if (progress < 2 / 3) {
  vp.scrollLeft = Math.round(maxScroll * 0.35);
} else {
  vp.scrollLeft = Math.round(maxScroll);
}
```

---

## 最终代码结构

```typescript
// Horizontal scroll
const maxScroll = Math.max(0, totalWidth - vp.clientWidth);
const isLrcLine = !line.words || line.words.length === 0;

if (maxScroll <= 0) {
  vp.scrollLeft = 0;                     // 不超宽 → 不滚动
} else if (isLrcLine) {
  // LRC 行：三分段跳转
  ...
} else {
  // KRC 行：基于逐字精度的 pw 跟随
  vp.scrollLeft = Math.round(clamp(pw - vp.clientWidth * 0.1, 0, maxScroll));
}
```

## 核心经验

| 经验 | 说明 |
|------|------|
| **平滑可能比不平滑更糟** | 所有形式的平滑都引入帧率依赖，在小字号/慢速滚动场景下被放大 |
| **`time += delta` 是最佳低通滤波器** | 时间本身就是连续的，用它直接驱动位置是最自然的平滑方式 |
| **跨进程 IPC 的帧率不稳定比同进程严重** | 汽水音乐是单进程 Service Worker 架构，Widget 与主播放器共享 reactive state，无需 IPC；本项目是跨进程 BrowserWindow，IPC 序列化/GC 会引入帧率抖动。同样的公式在汽水音乐平滑，在这里抖动，原因在此 |
| **先试最简方案** | 排查了多轮后才用最简方案尝试，之前一直在"优化"平滑参数，方向错了 |

---

## 相关代码（`src/taskbar-widget/TaskbarWidget.vue`）

关键函数 `startLocalTick()` 中的滚动部分（最终版本）：

```typescript
// Horizontal scroll — LRC 三分段跳转，KRC 直接跟随 pw
const vp = lyricViewport.value;
if (vp) {
  const maxScroll = Math.max(0, totalWidth - vp.clientWidth);
  const isLrcLine = !line.words || line.words.length === 0;

  if (maxScroll <= 0) {
    vp.scrollLeft = 0;
  } else if (isLrcLine) {
    // LRC 行：三分段跳转
    const lineIdx = _allLines.indexOf(line);
    const nextTime = lineIdx >= 0 && lineIdx < _allLines.length - 1
      ? _allLines[lineIdx + 1].time : line.time + 3;
    const lineDuration = nextTime - line.time;
    const progress = Math.max(0, Math.min(1, (tSec - line.time) / lineDuration));
    if (progress < 1 / 3) {
      vp.scrollLeft = 0;
    } else if (progress < 2 / 3) {
      vp.scrollLeft = Math.round(maxScroll * 0.35);
    } else {
      vp.scrollLeft = Math.round(maxScroll);
    }
  } else {
    // KRC 行：基于逐字精度的 pw 跟随
    vp.scrollLeft = Math.round(Math.max(0, Math.min(pw - vp.clientWidth * 0.1, maxScroll)));
  }
}
```

其中 `pw` 是单调递增的 `computePlayedWidth()` 返回值：

```typescript
// 单调递增保护（防止快照时间回退导致 pw 变小）
const rawPw = computePlayedWidth(line, tSec, font);
if (rawPw > _maxPw) _maxPw = rawPw;
const pw = _maxPw;
```

---

## 文件

- `<project>/src/taskbar-widget/TaskbarWidget.vue` — Widget 主体逻辑（滚动 + 歌词 + 状态提示）
- `<project>/src/taskbar-widget/styles/widget.css` — Widget 样式
- `<project>/docs/taskbar-widget-lyrics-scroll-fix.md` — 本文档
