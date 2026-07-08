# 私人 FM 模式选择功能说明

## 功能概述

在首页私人 FM 卡片标题栏新增模式选择按钮，点击弹出浮窗，用户可从 5 种模式中选择并切换到对应推荐风格。

## 接口

**`/personal/fm/mode`**

- `mode`（必选）: `aidj` | `DEFAULT` | `FAMILIAR` | `EXPLORE` | `SCENE_RCMD`
- `submode`（可选，仅 `SCENE_RCMD` 时生效）: `EXERCISE` | `FOCUS` | `NIGHT_EMO`

返回新的私人 FM 歌曲列表（与 `/personal_fm` 格式一致）。

## 变更文件

### `src/api/music.ts`

新增 `setPersonalFmMode(params)` 导出函数，封装 `/personal/fm/mode` 的 GET 请求。

### `src/stores/player.ts`

- 新增 `fmMode` 字段（默认 `'DEFAULT'`）
- 新增 `fmSubmode` 字段（默认 `''`）
- 新增 `setFmMode(mode, submode)` 方法
- 两个字段已接入 `persist` / `hydrate` 体系，默认持久化到 localStorage

### `src/components/HomePanel.vue`

**模板**

- `.fm-poster-top` 中标题「私人 FM」右侧新增 `.fm-mode-btn`（齿轮 SVG 图标按钮）
- `.fm-hero.poster` 按钮添加 `@mouseenter="fmHovered = true"` / `@mouseleave="fmHovered = false"` 事件，用于控制模式按钮 hover 显示
- `.fm-hero.poster` 按钮内部新增 `<Teleport to="body">` 浮窗面板，避免打断 `v-else-if` / `v-else` 链

**脚本**

新增响应式状态：
- `fmModePopoverOpen` — 浮窗开关
- `fmHovered` — 光标是否悬停在 FM 卡片上，控制模式按钮可见性
- `selectedFmMode` / `selectedFmSubmode` — 当前选中值
- `fmModeBtnRef` / `fmPopoverRef` — 定位引用
- `fmPopoverStyle` — 浮窗位置

新增函数：
- `toggleFmModePopover()` — 切换浮窗
- `selectFmMode(mode)` — 选择模式，选中 `SCENE_RCMD` 时自动填充默认子模式
- `selectFmSubmode(submode)` — 选择子模式
- `updateFmPopoverPosition()` — 基于按钮位置计算浮窗坐标
- `applyFmMode()` — 保存模式 → 调用 API → 立即停止当前播放 → 替换播放器 playlist → 自动播放第一首

**关键逻辑说明：**

- 调用 API 获取新曲目后，立即执行 `playerStore.audio?.pause()` + `isPlaying = false` 停止当前播放
- 通过 `playerStore.setPersonalFmPlaylist(tracks, 0)` 替换播放器 playlist，否则 `playByIndex(0)` 仍从旧 playlist 播放旧曲目
- 空曲目时调用 `clearPersonalFmContext()` + `setPlaylist([], 0)` 清空 FM 上下文，停止播放并显示错误提示

事件监听注册/注销在 `onMounted` / `onBeforeUnmount` 中。

**样式**

- `.fm-mode-btn` — 28px 圆形半透明白色按钮，hover 放大，深色模式适配
  - 默认隐藏（`opacity: 0; pointer-events: none`）
  - `hover-visible` class 时显示（由 `fmHovered` ref 控制）
  - `.active` class 仅控制视觉样式（背景色、缩放），不影响显示/隐藏
- `.fm-mode-popover` — 固定定位面板，`--bg-solid` + `--border` 不透明背景（Level 3）
  - 默认宽度 `240px`，`max-width: calc(100vw - 16px)`
  - `≤520px` 视口时全宽 `calc(100vw - 32px)`，左右各留 16px 间距
- 模式选项 radio 风格（`.fm-mode-option-radio` + `.fm-mode-option-dot`）
- 子模式区域（`.fm-submode-section`）仅在 `SCENE_RCMD` 时显示
- 确定按钮（`.fm-mode-apply-btn`）accent 绿色填充

**响应式定位**

- `window.innerWidth > 560px`：锚定按钮右下角，自动防溢出左右边界
- `≤560px`：左边缘固定在 16px，宽度由 CSS 全宽规则接管

## 模式说明

| 枚举值 | 显示名 | 说明 |
|---|---|---|
| `DEFAULT` | 默认 | 基于听歌习惯推荐 |
| `FAMILIAR` | 熟悉 | 推荐熟悉的曲风 |
| `EXPLORE` | 探索 | 探索更多新音乐 |
| `SCENE_RCMD` | 场景推荐 | 按场景推荐，可选子模式 |
| `aidj` | AI DJ | AI 驱动个性化推荐 |

子模式（仅 `SCENE_RCMD`）：

| 枚举值 | 显示名 |
|---|---|
| `EXERCISE` | 运动 |
| `FOCUS` | 专注 |
| `NIGHT_EMO` | 深夜 |

## 交互流程

1. 用户点击齿轮按钮 → 浮窗打开，初始化选中当前已保存的模式
2. 选择模式 → radio 样式即时更新；切换非 `SCENE_RCMD` 模式时清除子模式
3. 点击「确定」→ `playerStore.setFmMode()` 保存 → 调 `setPersonalFmMode()` API → 替换 `personalFmTracks` → 更新 `personalFmFetcher` → 自动播放第一首
4. 点击浮窗外区域或按 Escape → 浮窗关闭