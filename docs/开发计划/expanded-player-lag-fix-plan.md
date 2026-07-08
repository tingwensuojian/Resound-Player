# 全屏播放页（PlayerExpanded）卡顿修复计划

> 基于上次 Large WAV 播放优化之后的**下一阶段优化**。
> 目标：消除打开全屏播放页时，本地歌曲 data URL 封面导致的 UI 卡顿。

---

## 问题根因

打开全屏播放页时，以下操作在 mount 瞬间叠加执行，对本地歌曲（data: URL 封面）影响最大：

| # | 操作 | 位置 | 影响 |
|---|------|------|------|
| 1 | extractPaletteFromCover + immediate watch | PlayerExpanded.vue:708 | 同步 Image 解码 + Canvas getImageData，阻塞 10-50ms |
| 2 | useProgressiveCover 三次分辨率加载 | PlayerExpanded.vue:379 | data URL 被 Image 解码 3 次 |
| 3 | 7 个背景特效 composable 无条件初始化 | PlayerExpanded.vue:557-611 | WebGL/Canvas setup 代码始终执行 |
| 4 | coverStyle computed 含大 base64 字符串 | PlayerExpanded.vue:378 | CSS background-image 大字符串重复处理 |

---

## 改动清单

### A - extractPaletteFromCover 延后执行 ✅ 已落地

| 编号 | 文件 | 改动 | 效果 |
|------|------|------|------|
| A1 | PlayerExpanded.vue | 去掉 immediate: true | mount 时不触发 palette 提取 |
| A2 | PlayerExpanded.vue | onMounted 中用 setTimeout 延后 500ms 触发 palette 提取 | 渲染优先，palette 后处理 |

### B - useProgressiveCover 对本地歌曲走轻量路径 ✅ 已落地

| 编号 | 文件 | 改动 | 效果 |
|------|------|------|------|
| B1 | useProgressiveCover.ts | lqip/thumb 遇到 data: URL 立即跳过 | 减少 2/3 的 Image 解码 |
| B2 | useProgressiveCover.ts | target 遇到 data: URL 仅解码一次 | 不重复解码 |

### C - 背景特效 composable 按需初始化 ✅ 已落地

| 编号 | 文件 | 改动 | 效果 |
|------|------|------|------|
| C1 | PlayerExpanded.vue | 7 个 use* 调用包裹在 if (bgMode === 'custom') 中 | 默认不初始化任何 WebGL/Canvas |

### D - coverStyle 大字符串优化（待评估）

| 编号 | 文件 | 改动 | 效果 |
|------|------|------|------|
| D1 | PlayerExpanded.vue | coverStyle computed 增加 deps 缓存 | 减少 Vue reactivity 开销 |

---

## 实施状态

### Phase 1 - extractPaletteFromCover 延后 ✅

改动文件: src/components/PlayerExpanded.vue

- 移除 { immediate: true } 参数
- 新增 onMounted + setTimeout 500ms 延后执行
- 覆盖首次 mount 和后续切歌的场景

### Phase 2 - useProgressiveCover data URL 优化 ✅

改动文件: src/composables/useProgressiveCover.ts

- lqip watch: 检测 url.startsWith('data:') → 立即标记 loaded，跳过 Image 解码
- thumb watch: 同上
- target watch: 检测 url.startsWith('data:') → 标记 loaded + showFinal，跳过渐进式

### Phase 3 - 背景特效按需初始化 ✅

改动文件: src/components/PlayerExpanded.vue

- 7 个 use* 调用全部包裹在 if (lyricsSettings.state.bgMode === 'custom') 条件中
- 覆盖 composable: useThreeScene、usePaperShaders、useMistBackground、useDigitalLoom、useSilkBackground、useAuroraShader、useIridescence

---

## 影响评估

### 正向影响

| 场景 | 当前行为 | 优化后行为 |
|------|---------|-----------|
| 打开播放页（本地歌曲） | mount 瞬间阻塞 50-100ms，UI 掉帧 | mount 瞬间几乎无阻塞，渲染优先 |
| extractPaletteFromCover | 立即执行，抢渲染时间 | 延后 500ms，不影响首帧 |
| useProgressiveCover | data URL 解码 3 次 | 只解码 1 次（跳过 lqip/thumb）|
| 背景特效 composable | 7 个全部初始化 | 默认不初始化 |

### 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| 背景特效按需初始化后，切换 bgMode 时可能不生效 | 中 | 切换 bgMode 后关闭再打开播放页即可生效 |
| extractPaletteFromCover 延后 500ms 导致颜色主题闪烁 | 低 | palette 只用于背景色调，异步更新不影响核心 UI |

---

## 验证方法

1. 播放本地歌曲
2. 点击封面打开全屏播放页
3. 确认：
   - [ ] 打开瞬间无卡顿
   - [ ] 封面正常显示
   - [ ] palette 颜色在 0.5s 后正常出现
   - [ ] 背景特效在切换到 custom 模式后正常显示