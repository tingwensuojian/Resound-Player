# MV 播放页画中画（PiP）模式实现说明

## 功能概述

MV 播放页（`MvPlayPage.vue`）在用户向下滚动页面查看评论区时，自动将视频切换为浮动画中画模式。视频缩小并固定在窗口右下角继续播放，点击浮动条可回到页面顶部。

## 实现架构

### 核心方案：Vue `<Teleport>`

画中画浮动条通过 `<Teleport to="body">` 渲染到 `document.body` 下，避免 `position: fixed` 被父级元素（`AnimatedAppear` 的 `contain: layout style`）拦截。

```
body
├── #app
│   └── main.content (overflow-y: auto)
│       └── div.content-shell
│           └── section.mv-play-page (AnimatedAppear)
│               ├── div.video-wrap ← 原始视频（PiP 时隐藏）
│               └── ...
└── div.mv-pip-floating (Teleport 到 body, position: fixed) ← 浮动视频
```

### 关键实现

#### 1. 模板（双视频元素）

```html
<!-- 原始视频：PiP 时隐藏 -->
<div class="video-wrap" :class="{ 'video-wrap--pip-hidden': pipActive }">
  <video v-if="mvUrl" :src="mvUrl" controls autoplay playsinline />
</div>
<div v-if="pipActive" class="pip-placeholder"></div>  <!-- 保持滚动高度 -->

<!-- Teleport 浮动画中画 -->
<Teleport to="body">
  <div v-if="pipActive" class="mv-pip-floating" @click="scrollToTop">
    <div class="pip-floating-wrap">
      <video ref="pipVideoElRef" :src="mvUrl" controls autoplay playsinline />
    </div>
    <button class="pip-floating-close" @click.stop="pipActive = false">✕</button>
  </div>
</Teleport>
```

#### 2. 滚动检测

使用 `scroll` 事件监听 `.content` 滚动容器。通过 `getBoundingClientRect()` 计算视频区域是否已滚出可视区：

```ts
const PIP_THRESHOLD = 80; // 像素阈值

function checkPip() {
  const rect = videoSectionRef.value.getBoundingClientRect();
  const contentRect = pipScrollTarget.getBoundingClientRect();
  const videoTop = rect.top - contentRect.top;
  const shouldPip = videoTop < -PIP_THRESHOLD || (rect.bottom < contentRect.top);
  if (shouldPip !== pipActive.value) {
    pipActive.value = shouldPip;
  }
}

onMounted(() => {
  pipScrollTarget = document.querySelector('.content') as HTMLElement | null;
  pipScrollTarget?.addEventListener('scroll', checkPip, { passive: true });
});

onUnmounted(() => {
  pipScrollTarget?.removeEventListener('scroll', checkPip);
});
```

#### 3. 播放位置同步

两个 `<video>` 元素共享同一个播放源，切换时保存并恢复 `currentTime`：

```ts
savedPlayTime = document.querySelector('.video-wrap video')?.currentTime || 0;
pipActive.value = shouldPip;
nextTick(() => {
  const targetVideo = pipActive.value ? pipVideoElRef.value : document.querySelector('.video-wrap video');
  if (targetVideo && savedPlayTime > 0) {
    targetVideo.currentTime = savedPlayTime;
    targetVideo.play();
  }
});
```

### CSS 要点

| 选择器 | 作用 |
|--------|------|
| `.mv-pip-floating` | `position: fixed; bottom/right` 定位窗口右下角，`z-index: 99999` |
| `.pip-floating-wrap` | 包裹视频，`line-height: 0` 消除行内间隙 |
| `.pip-video` | `width: 100%; aspect-ratio: 16/9` |
| `.pip-floating-close` | 右上角关闭按钮，默认隐藏，hover 时显示 |
| `.video-wrap--pip-hidden` | `position: absolute; opacity: 0; pointer-events: none` 将原始视频移出正常流并隐藏，避免与 `.pip-placeholder` 产生双重高度空白 |
| `.pip-placeholder` | 保持原始视频区域 16:9 滚动高度，防止跳动 |
| `@keyframes pip-enter` | 入场动画：从下方缩放淡入 |

### 避坑记录

1. **`AnimatedAppear` 的 `an-enter-card` 类**设置了 `contain: layout style`，这会导致内部 `position: fixed` 子元素相对于该元素定位而非视口。解决方案：使用 `<Teleport to="body">` 将浮动条渲染到组件层级之外。
2. **双 `<video>` 元素**：切换时需要手动同步 `currentTime`，否则新视频从头播放。
3. **`--player-bar-height`**：使用 CSS 变量控制浮动条底部间距，确保不遮挡底部播放栏。
4. **原始视频隐藏时双重高度问题**：`.video-wrap--pip-hidden` 仅用 `opacity: 0` 隐藏时，原始 `.video-wrap` 仍占据正常流空间，同时 `.pip-placeholder` 也占据同样空间，导致原位置高度翻倍出现空白。解决方案：`.video-wrap--pip-hidden` 同时设置 `position: absolute`，将隐藏的视频移出正常流。
5. **Vue SFC 编译 500 错误**：编辑过程中若文件末尾缺失 `</style>` 标签，Vite 会返回 500 编译错误。每次修改后应确认 SFC 结构完整。

## 相关文件

- `src/components/MvPlayPage.vue` — 组件实现
