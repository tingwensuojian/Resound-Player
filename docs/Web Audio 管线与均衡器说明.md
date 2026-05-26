# Web Audio 管线与均衡器说明

本文档说明项目内 Web Audio 音频管线架构和 10 段均衡器的实现位置、数据结构与使用方式。

---

## 1. Web Audio 管线

### 1.1 架构总览

```
[EQ 关闭时]
audio 元素 → audio 原生输出（完全不走 Web Audio，音量由 audio.volume 控制）

[EQ 启用时]
audio 元素 → MediaElementAudioSourceNode → BiquadFilterNode × 10 → GainNode → AudioContext.destination
                                                                          ↑
                                                                    音量由 GainNode 控制
                                                                    audio.volume 锁定为 1
```

### 1.2 惰性初始化

Web Audio 管线仅在实际**启用 EQ** 时才创建，默认完全休眠，不占用任何资源。

创建时机：`enableEq(true)` → `_ensureWebAudio()`
- AudioContext 在用户手势中创建（FancySwitch 点击），初始状态为 `running`
- `createMediaElementSource(audio)` 将 audio 元素的输出接入 Web Audio 图
- 此时原生 `audio.volume` 路由失效，音量由 GainNode 接管

### 1.3 关键文件

| 文件 | 职责 |
|------|------|
| `src/stores/player.ts` | 核心播放器 store，包含 Web Audio 管线的全部实现 |
| `src/stores/eqSettings.ts` | EQ 设置持久化 store |
| `vite.config.ts` | 开发期 `/dl-proxy` 下载代理，负责非官方音源的 CORS 与 Range 转发 |

### 1.4 player.ts 中 Web Audio 相关字段

```ts
_audioCtx: AudioContext | null              // AudioContext 单例
_sourceNode: MediaElementAudioSourceNode | null  // 音频源节点
_gainNode: GainNode | null                  // 音量控制节点
_eqFilters: BiquadFilterNode[]              // 10 段 EQ 滤波器
_eqEnabled: boolean                         // EQ 启用状态
```

### 1.5 关键方法

| 方法 | 说明 |
|------|------|
| `_ensureWebAudio()` | 惰性创建 AudioContext + MediaElementSourceNode + GainNode。首次调用在用户手势中，`running` 态。失败后标记 `_sourceNode = undefined` 避免重试 |
| `_syncVolumeToGain()` | 将 `this.volume` + `this.muted` 同步到 GainNode |
| `setVolume(v)` | 有 GainNode 时写入 `gainNode.gain.value`，否则写入 `audio.volume` |
| `toggleMute()` | 同上，通过 GainNode 或 audio.volume 控制静音 |

### 1.6 EQ 数据流总览

```
[用户操作]                [状态层]              [运行态]              [硬件输出]
─────────────────────────────────────────────────────────────────────

点击预设 chip
  → eq.currentPreset = p.name        playerStore.setEqGains(p.gains)
  → eq.gains = [...p.gains]                              ↓
  → eq.save()                     BiquadFilterNode[n].gain.value = gains[n]
                                                              ↓
拖动滑块                                                       ↓
  → eq.gains[i] = val              playerStore.setEqGains(gains)
  → eq.currentPreset='自定义'                                    ↓
  → (debounce 300ms) eq.save()    BiquadFilterNode[n].gain.value = gains[n]
                                                              ↓
开关 EQ                                                     AudioContext
  → eq.enabled = bool              playerStore.enableEq(bool)    ↓
  → eq.save()                        → _ensureWebAudio()     扬声器
                                      → _rebuildEqChain()
                                        → source → filter[10] → gain → dest.

首次播放（刷新后 + EQ 持久化开启）
  playTrack() 中:
  → 设 audio.crossOrigin = 'anonymous'
  → 设 audio.src = playUrl
  → enableEq(true) → _ensureWebAudio() → _rebuildEqChain()
  → setEqGains(eqSettings.gains)

保存自定义预设
  → 面板内输入框 → upsertCustomPreset(name)
    → normalizeGains(gains)
    → 校验名称（非空、不内置重名）
    → customPresets 新增/覆盖
    → currentPreset = name, gains = preset.gains
    → save() → localStorage.setItem(gm_eq_settings_v1, JSON.stringify(...))
```

---

## 2. CORS 处理

网易云音乐音频 URL 来自跨域 CDN（`m*.music.126.net`），`createMediaElementSource()` 需要访问 PCM 裸音频数据，必须设置 `crossOrigin` 属性。

### 2.1 init() 中全局设置

```ts
init() {
    this.audio.crossOrigin = 'anonymous';
    // ...
}
```

### 2.2 enableEq() 中重载

启用 EQ 时，对于已加载的音频重新设置跨域并重载：

```ts
// 在 enableEq(true) 中
this.audio.crossOrigin = 'anonymous';
this.audio.src = savedSrc;   // 重新加载音频，带上 CORS 请求头
this.audio.load();
```

### 2.3 远程音频 URL 的 `/dl-proxy` Range 支持

音源替换命中的非官方 URL 可能缺少可直接用于 Web Audio / `<audio>` 的 CORS 响应头。开启 EQ 后，官方远程 URL 也可能因为 `crossOrigin="anonymous"` 与 CDN 响应头不匹配而被浏览器拒绝。因此播放器在 `src/stores/player.ts` 中会按两层规则处理：

- `resolvePlayUrl()` 对非官方音源统一包装 `/dl-proxy?url=...`
- `playTrack()` 在 EQ 开启且目标是远程 HTTP(S) URL 时，也会包装 `/dl-proxy?url=...`

```ts
if (eqSettings.state.enabled && shouldUseCorsProxy(playUrl)) {
  playUrl = '/dl-proxy?url=' + encodeURIComponent(playUrl);
}
```

`/dl-proxy` 的实现位于 `vite.config.ts`。该代理必须保留音频 seek 所需的 HTTP Range 语义：

- 请求侧透传浏览器发出的 `Range` 头
- 响应侧透传上游的 `Content-Range`、`Accept-Ranges`、`Content-Length`
- 支持 `GET` / `HEAD` / `OPTIONS`
- 暴露 `Content-Length, Content-Range, Accept-Ranges` 给浏览器读取

如果代理只普通 `GET` 全量转发，而不支持 Range/206，浏览器拖动进度条后无法向上游请求目标时间点对应的音频片段，表现会变成“拖动进度条后从头播放”。因此后续修改 `/dl-proxy` 时，不能删除 Range 请求头转发和分段响应头透传。

换源失败时，`switchAudioSource()` 会恢复旧 `audio.src`、播放进度和 `crossOrigin`。这保证音质切换失败不会破坏当前正在播放的音频。

---

## 3. 10 段均衡器（EQ）

### 3.1 频段定义

10 段标准 ISO 频率，类型为 `peaking`，Q = 1.41：

| 索引 | 频率 | 标签 | 用途 |
|:----:|:----:|:----:|------|
| 0 | 31 Hz | 31 | 超低音 |
| 1 | 62 Hz | 62 | 低音 |
| 2 | 125 Hz | 125 | 中低音 |
| 3 | 250 Hz | 250 | 中音 |
| 4 | 500 Hz | 500 | 中高音 |
| 5 | 1 kHz | 1k | 临场 |
| 6 | 2 kHz | 2k | 亮度 |
| 7 | 4 kHz | 4k | 空气感 |
| 8 | 8 kHz | 8k | 高频 |
| 9 | 16 kHz | 16k | 超高 |

- 增益范围：-12 dB ~ +12 dB，步进 0.5 dB

### 3.2 设置 Store：`src/stores/eqSettings.ts`

遵循与 `lyricsSettings.ts` 相同的 reactive singleton 模式。

**类型定义：**

```ts
type EqSettings = {
  enabled: boolean;       // 全局 EQ 开关
  gains: number[];        // 10 段增益值
  currentPreset: string;  // 当前预设名称，滑块调节后自动变为 '自定义'
  customPresets: EqPreset[]; // 用户保存的命名预设
};

type EqSettingsStore = EqSettings & {
  save(): void;
  getAllPresets(): EqPreset[];         // 内置预设 + 自定义预设合并列表
  isCustomPreset(name: string): boolean; // 判断是否为用户保存的自定义预设
  upsertCustomPreset(name: string, gains?: number[]): EqSaveResult;
  removeCustomPreset(name: string): void;
};
```

**持久化：** localStorage key `gm_eq_settings_v1`

存储结构兼容旧数据。旧版本没有 `customPresets` 时会在 `hydrate()` 中补为空数组；`gains` 和自定义预设的每个 `gains` 都会被归一化为 10 段、`-12 ~ +12`、0.5 dB 步进。

**自定义预设：**

- 用户点击“保存预设”后，在面板内输入名称并保存当前 `gains`
- 自定义预设追加在内置预设之后展示
- 自定义预设可覆盖、删除
- 选中已保存的自定义预设后继续调节滑块时，选中态保持在该预设上，不自动跳回普通 `自定义`
- 自定义预设名称不能为空，且不能与内置预设重名
- 删除当前自定义预设时保留当前 `gains`，`currentPreset` 回退为 `自定义`

**数据校验：**

```ts
normalizeGains(input): number[]       // 10 段、-12~12、0.5 步进，非法值补 0
sanitizePresetName(name): string      // 去除首尾空白，最长 24 字符
isBuiltinPresetName(name): boolean    // 禁止用户预设覆盖内置
normalizePreset(input): EqPreset | null  // 整合校验，非法返回 null
normalizeCustomPresets(input): EqPreset[]  // 去重（同名取后），过滤非法
```

**Store API 行为：**

| 方法 | 行为 |
|------|------|
| `save()` | 将当前 `enabled` + `gains` + `currentPreset` + `customPresets` 完整写入 localStorage |
| `getAllPresets()` | 返回 `[...BUILTIN_PRESETS, ...this.customPresets]` |
| `isCustomPreset(name)` | 在 `customPresets` 中查找是否有同名项 |
| `upsertCustomPreset(name, gains?)` | 新建或覆盖自定义预设，自动切换 `currentPreset` 和 `gains`，触发 `save()` |
| `removeCustomPreset(name)` | 删除指定自定义预设，若删除的是当前选中态则回退到 `自定义` |

**内置预设（8 个）：**

| 预设 | 特点 |
|------|------|
| 原声 | 全平直（0 dB），适合还原录音 |
| 流行 | 中高频+，轻微低音增强 |
| 摇滚 | 低音+高频大幅增强 |
| 古典 | 保留中频，两端微升 |
| 爵士 | 暖音色，中低频突出 |
| 舞曲 | 强低音，节奏清晰 |
| 人声 | 突出中频人声，削减低频 |
| 自定义 | 用户手动调节时自动选中 |

### 3.3 滤波器链实现：player.ts `_rebuildEqChain()`

```ts
// EQ 关闭：直连
sourceNode → gainNode → destination

// EQ 启用：串联 10 段 peaking 滤波器
sourceNode → filter[0] → filter[1] → ... → filter[9] → gainNode → destination
```

创建滤波器时**直接使用当前增益值**（从 eqSettings.gains 读快照），不依赖后续异步调用。

播放路径中会在设置音频地址前检查 `eqSettings.enabled`。如果持久化状态为开启，会先设置 `audio.crossOrigin = 'anonymous'`，再调用 `enableEq(true)` 创建 Web Audio 管线并应用当前 `gains`，确保刷新后首次播放也直接走 EQ 链。

### 3.4 UI 组件：`src/components/EqPanel.vue`

**结构：**

```
eq-panel (Teleport to body, 固定定位)
├── eq-head: 标题 + FancySwitch 开关
├── preset-rail (ui-safe-rail): 预设横向滚动选择
│   └── preset-chip: 内置预设 + 自定义预设
├── eq-bands: 10 段竖排滑块
│   └── eq-band-col × 10
│       ├── eq-slider (input[type=range], writing-mode: vertical-lr)
│       ├── eq-db-value (如 +3.0 dB)
│       └── eq-freq-label (如 1k Hz)
├── eq-save-row (v-if="isSaveEditorOpen"): 面板内预览输入、确认/取消按钮、错误提示
└── eq-footer (ui-safe-group): 保存预设 / 覆盖 / 删除 / 重置
```

**交互行为：**

- **保存预设**：点击后展开 `.eq-save-row`，面板内输入名称 → Enter 确认或点击保存/取消。不再使用 `window.prompt()`
- **覆盖预设**：仅在当前选中自定义预设时显示，用当前 `gains` 原地覆盖同名预设
- **删除预设**：仅在当前选中自定义预设时显示，删除后 `currentPreset` 回退为 `自定义`
- **滑块输入（debounce 保存）**：`@input` 触发 `playerStore.setEqGains()` 即时更新听感，但 `eq.save()` 延迟 300ms 执行。拖拽期间只更新最后一次值，避免高频滑块操作重复写入 localStorage
- **选中态保持**：如果 `currentPreset` 是已保存的自定义预设，手动调节滑块时保留选中态，不跳回普通 `自定义`

**样式规范：**
- 面板背景：与播放列表面板一致的磨砂半透明背景
- 预设 chip：`button-surface` 体系
- footer 按钮组：复用 `ui-safe-group` 和 `.button-surface` / `.button-surface--danger`
- 滑块轨道/把手：主题色 `var(--accent)`，与全局 `input[type=range]` 风格一致
- 禁用态：滑块 `opacity: 0.3`，操作按钮 `opacity: 0.4`

### 3.5 入口集成

| 位置 | 组件 | 触发方式 |
|------|------|---------|
| 展开播放器右侧工具栏 | `PlayerExpanded.vue` 的 `.right-actions` | 点击均衡器图标按钮 |
| 底部播放栏右侧区 | `PlayerBar.vue` 的 `.right` | 点击均衡器图标按钮 |

两个入口各自持有一个独立的 `showEqPanel` ref 和独立的 `EqPanel` 实例。

---

## 4. 音量控制逻辑

```ts
setVolume(v) {
    if (this._gainNode) {
        this._gainNode.gain.value = val;  // 有 Web Audio 管线时走 GainNode
        this.audio.volume = 1;
    } else {
        this.audio.volume = val;          // 无 Web Audio 时走原生
    }
}
```

- **EQ 关闭时**：GainNode 不存在，音量走原生 `audio.volume`
- **EQ 启用时**：GainNode 存在，音量走 `gainNode.gain.value`，`audio.volume` 锁定为 1

---

## 5. 预设数据参考

```ts
const BUILTIN_PRESETS = [
  { name: '原声',   gains: [0,  0,  0,  0,  0,  0,  0,  0,  0,  0] },
  { name: '流行',   gains: [3,  4,  2,  1,  0,  1,  2,  3,  4,  3] },
  { name: '摇滚',   gains: [5,  4,  3,  2,  1,  0,  1,  3,  4,  5] },
  { name: '古典',   gains: [4,  3,  1,  0,  0,  0,  0,  1,  3,  4] },
  { name: '爵士',   gains: [3,  4,  3,  2,  1,  2,  3,  2,  1,  0] },
  { name: '舞曲',   gains: [6,  5,  3,  1,  0,  1,  2,  3,  4,  5] },
  { name: '人声',   gains: [0,  1,  2,  4,  5,  5,  4,  2,  1,  0] },
  { name: '自定义', gains: [0,  0,  0,  0,  0,  0,  0,  0,  0,  0] },
];
```

---

## 6. 开发注意事项

### 6.1 `createMediaElementSource` 单次限制

一个 `HTMLAudioElement` 只能创建一次 `MediaElementAudioSourceNode`，重复创建会抛 `InvalidStateError`。`_ensureWebAudio()` 通过 `if (this._audioCtx) return` 保证只创建一次。

### 6.2 暂停→重建→恢复

启用 EQ 时如果音频正在播放，需要先暂停、设置 CORS、重载 src、创建 Web Audio 管线，再恢复播放。详见 `enableEq()` 实现。

### 6.3 优雅降级

如果 `AudioContext` 创建失败或 `createMediaElementSource` 抛出异常：
- `_gainNode` 保持 `null`
- `setVolume()` / `toggleMute()` 自动回退到原生 `audio.volume`
- 音频播放不受影响，仅 EQ 不可用

---

## 7. 历史修复记录

### 7.1 持久化默认预设名称不匹配

**问题：** `defaults.currentPreset` 初始值为 `'默认（平直）'`，但内置预设中不存在该名称。首次加载时没有任何 preset-chip 获得 active 高亮。

**修复：** 改为 `'原声'`，与内置预设名称对齐。

**涉及文件：** `src/stores/eqSettings.ts`

### 7.2 刷新后首次播放 EQ 不生效

**问题：** 页面刷新后持久化 `eqSettings.enabled = true`，但 `playerStore._eqEnabled` 初始为 `false`。播放时没有根据持久化状态创建 Web Audio 管线，音频走原生 `<audio>`。需要手动关闭再打开 EQ 后才生效。

**根因：** `playTrack()` 在设置 `audio.src` 前后没有检查持久化 EQ 状态，导致 `enableEq()` 从未被调用。

**修复：** 在 `playTrack()` 中设置 `audio.src` 前检查 `eqSettings.enabled`，如果为 true 则先设 `crossOrigin = 'anonymous'`，设置 src 后再调 `enableEq(true)` 和 `setEqGains(eqSettings.gains)`。

**涉及文件：** `src/stores/player.ts`

### 7.3 保存预设使用系统弹窗

**问题：** `saveAsPreset()` 使用 `window.prompt()` 和 `window.alert()`，体验不一致且无法撤销。

**修复：** 移除系统弹窗，改为面板内展开 `.eq-save-row`：输入框 + 保存/取消按钮 + 行内错误提示。`keydown.enter` 确认，`keydown.esc` 取消。

**涉及文件：** `src/components/EqPanel.vue`

### 7.4 已保存自定义预设调节滑块时丢失选中态

**问题：** `onBandInput()` 无条件将 `currentPreset` 设为 `'自定义'`（普通状态）。选中已保存的自定义预设后拖拽滑块，选中态跳到 `自定义`，覆盖/删除按钮消失。

**修复：** 在 `onBandInput()` 中先检查 `isSelectedCustomPreset.value`，仅当不是已保存预设时才切换为 `'自定义'`。

**涉及文件：** `src/components/EqPanel.vue`

### 7.5 滑块拖拽时频繁写入 localStorage

**问题：** `onBandInput()` 每次 `@input` 都调 `eq.save()`，连续拖拽 12dB（24 档）产生 24 次 `JSON.stringify + setItem`。

**修复：** `save()` 调用改为 300ms debounce，拖拽停止后才写入。`playerStore.setEqGains()` 仍即时执行，不影响听感。

**涉及文件：** `src/components/EqPanel.vue`
