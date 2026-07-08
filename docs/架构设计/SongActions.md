# SongActions 组件

## 概述

歌单/专辑/歌手等歌曲列表行内的操作按钮组。

**行内按钮**（始终可见）：收藏 + 下一首播放 + 收藏至歌单 + 查看评论 + 更多操作

**下拉菜单**（点击/悬停省略号按钮展开）：查看专辑 + 下载 + 上传至云盘 + 百科

所有按钮统一 34×34 方型玻璃风格。收藏按钮复用 `BookmarkIconButton`，样式通过 `:deep()` 覆盖为与其余按钮一致。

## 文件位置

`src/components/ui/SongActions.vue`

## Props

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `song` | `any` | 是 | 歌曲对象，至少包含 `id` |

## Emits

| 事件 | 参数 | 说明 |
|------|------|------|
| `play-next` | `song: any` | 下一首播放 |
| `add-to-playlist` | `song: any` | 弹出收藏至歌单选择器 |
| `open-comment` | `songId: number` | 打开歌曲评论页 |
| `open-album` | `albumId: number` | 跳转专辑详情页 |
| `open-mv-player` | `{ id, name, cover, artistName }` | 打开 MV 播放器 |
| `open-artist` | `artist: any` | 打开歌手详情页 |
| `open-language` | `language: string` | 按语言筛选 |

## 更多操作下拉菜单

省略号（三个点）按钮触发，支持两种交互方式：

- **点击**：点击省略号按钮展开/收起
- **悬停**：鼠标移入展开，移出后 150ms 延迟关闭（留时间移入菜单）

菜单面板使用 `Teleport to="body"` + `position: fixed` 定位，自适应展开方向：

- 下方空间充足 → 向下展开
- 下方空间不足 → 自动向上展开
- 右侧溢出 → 自动左对齐

菜单项（4 个）：

| 菜单项 | 点击触发 |
|--------|----------|
| 查看专辑 | `openAlbum()` → emit `open-album` |
| 下载 | `openDownloadPopup()` → 弹出下载音质选择弹窗 |
| 上传至云盘 | `uploadToCloud()` → 调用云盘导入 API |
| 百科 | `openEncyclopedia()` → 弹出百科弹窗 |

### 入口动画

`transform-origin` 根据展开方向动态设置（向下 → `top`，向上 → `bottom`），入场缩放动画自然从触发器一侧生长。

## 使用示例

```vue
<template>
  <li v-for="song in tracks" :key="song.id" class="song-item">
    <div class="song-meta">
      <span>{{ song.name }}</span>
    </div>
    <SongActions
      :song="song"
      @play-next="handlePlayNext"
      @add-to-playlist="handleAddToPlaylist"
      @open-comment="handleOpenComment"
      @open-album="handleOpenAlbum"
      @open-mv-player="handleOpenMv"
    />
  </li>
</template>

<script setup lang="ts">
import SongActions from './ui/SongActions.vue';

function handlePlayNext(song: any) {
  playerStore.playlist.splice(playerStore.currentIndex + 1, 0, { ...song });
}

function handleAddToPlaylist(song: any) { /* 打开歌单选择弹窗 */ }
function handleOpenComment(songId: number) { /* 跳转评论页 */ }
function handleOpenAlbum(albumId: number) { /* 跳转专辑详情页 */ }
function handleOpenMv(mv: any) { /* 打开 MV 播放器 */ }
</script>
```

## 依赖

- `BookmarkIconButton` — 收藏按钮（标准收藏入口组件），传入 `liked` prop 同步 store 状态
- `TooltipWrapper` — 按钮悬停提示
- `SongEncyclopediaModal` — 百科弹窗
- `userStore` — 登录态与收藏列表

## 定位与显隐

组件内置全局样式块，自行处理定位和悬停显隐，父容器只需确保 `.song-item` 设置了 `position: relative`（已在 `detail-page.css` 中统一提供）：

- **默认隐藏**：`opacity: 0; visibility: hidden`
- **悬停显示**：`.song-item:hover .song-actions` → `opacity: 1; visibility: visible`
- **定位**：`position: absolute; right: 8px; top: 50%; transform: translateY(-50%)`
- **过渡**：`opacity 0.2s ease, visibility 0.2s ease`

父容器不再需要各自重复编写 hover 显隐 CSS。组件内部通过非 scoped `<style>` 块以全局选择器 `.song-item:hover .song-actions` 实现，确保在任何引入该组件的详情页中自动生效。

## 视觉规范

- 所有按钮统一 `34px × 34px`，`border-radius: 10px`
- 默认态：`var(--bg-surface)` 背景，`var(--text-soft)` 图标色
- Hover：背景变 `var(--bg-muted)`，图标变 `var(--text-main)`，上浮 `1px`
- 收藏态：图标色 `#ff6b8a`
- `BookmarkIconButton` 原有的 glow / pulse / sparkles 装饰在此上下文中被禁用

## 菜单样式规范

遵循项目 3.6 弹窗规范（背景不透明）：

- 面板背景：`var(--bg-solid)`（不透明）
- 菜单项 hover 背景：`color-mix(in srgb, var(--accent) 6%, var(--bg-solid))`（不透明）
- 面板圆角：`10px`，菜单项圆角：`8px`
- 面板阴影：`0 8px 32px rgba(0,0,0,0.2)` + `var(--glass-highlight)`