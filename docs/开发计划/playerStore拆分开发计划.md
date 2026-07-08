# playerStore 拆分开发计划

> 目标：将 1277 行单体 playerStore 拆分为「核心编排层 + 独立模块」，先做第一阶段（audioEngine + playbackResolver），降低 360 行，保留接口兼容性。

---

## 一、当前结构总览

```
playerStore (1277行)
├── [type/helper] Track, QUALITY_LEVELS, formatTrack 等 (~40行, L1-116)
├── [state] 响应式状态 (audio, playlist, currentIndex, isPlaying, volume 等) (~50行, L117-165)
│   ├── 播放核心: audio, playlist, currentIndex, currentTrack, currentSongId, isPlaying, currentTime, duration
│   ├── 设置: volume, muted, playMode, autoplayNext, crossfadeSec, playbackRate, defaultQuality
│   ├── UI: expanded, themePrimary, themeMode, isDarkMode
│   ├── FM: personalFmTrackIds, personalFmFetcher, personalFmLoadingMore, fmMode
│   └── 音质: currentQualityBr, currentQualityDowngraded, qualityDowngradeInfo, currentSource
├── [eq state] Web Audio 管线状态 (_audioCtx, _sourceNode, _gainNode, _eqFilters, _eqEnabled) (~15行, L141-152)
├── [lifecycle] init / persist / hydrate / _prewarmAudio (~170行, L165-331)
├── ═══ 领域①: Web Audio / EQ 引擎 (~210行, L333-546) ═══  →  **提取为 audioEngine.ts**
├── [playlist] setPlaylist, appendToQueue, playIntelligence (~150行, L548-698)
├── [fm] setPersonalFmPlaylist, appendPersonalFmTracks, ensurePersonalFmQueue 等 (~80行, L624-698)
├── [theme] syncThemeState (~40行, L692-730)
├── ═══ 领域②: 播放 URL 决议链 (~150行, L760-1010, playTrack 内部) ═══  →  **提取为 playbackResolver.ts**
├── [playback] playByIndex, togglePlay, next, prev, playTrack, dislikeCurrentPersonalFm (~350行, L732-1080)
├── [audio] seek, setVolume, toggleMute (~60行, L1081-1122)
├── [settings] setPlayMode, cyclePlayMode, setCrossfadeSec, setPlaybackRate, setDefaultQuality 等 (~70行, L1124-1191)
└── [queue] removeFromPlaylist, clearPlaylist, moveTrack, recordCurrentTrackToHistory (~90行, L1193-1277)
```

### 外部引用总览

| 引用方 | 调用方法 | 改动影响 |
|---|---|---|
| `EqPanel.vue` | `enableEq()`, `setEqGains()` | → 改为 `audioEngine.enableEq()`, `audioEngine.setEqGains()` |
| `PlayerBar.vue` | `playTrack()` | 不改接口 |
| `PlayerBar.vue` | `setVolume()` | `setVolume` 内部 `_gainNode` 引用 → 改为 `audioEngine.syncVolume()` |
| `playerStore.playTrack()` | `this.enableEq()`, `this.setEqGains()`, `this._audioCtx.resume()` | → 改为 `audioEngine.enableEq()`, `audioEngine.setEqGains()`, `audioEngine.resumeIfSuspended()` |
| `playerStore.setVolume()` | `this._gainNode` | → 改为 `audioEngine.syncVolume()` |
| `playerStore.toggleMute()` | `this._gainNode` | → 改为 `audioEngine.syncVolume()` |
| 其他 30+ 组件 | `playByIndex`, `setPlaylist`, `togglePlay` 等 | **不改接口** |

---

## 二、阶段一：提取 audioEngine 模块

### 2.1 新文件

```
src/player/audioEngine.ts  (~210行)
```

### 2.2 职责

封装 Web Audio API 管线（AudioContext → MediaElementSourceNode → 10段 peaking EQ 滤波链 → GainNode → destination）的管理。

### 2.3 接口设计

```ts
// 不依赖 Vue 响应式、不依赖 playerStore、只操作原始 audio 元素
export interface AudioEngine {
  /** 惰性创建 Web Audio 管线，首次调用时初始化 */
  ensureWebAudio(): void

  /** 启用/禁用 EQ，首次启用会惰性初始化管线 */
  enableEq(on: boolean, gains?: number[]): void

  /** 设置 10 段 EQ 增益 */
  setEqGains(gains: number[]): void

  /** 同步音量到 GainNode */
  syncVolume(volume: number, muted: boolean): void

  /** 如果 AudioContext 处于 suspended 状态则 resume */
  resumeIfSuspended(): void

  /** EQ 是否就绪 */
  get isReady(): boolean

  /** EQ 是否启用 */
  get isEnabled(): boolean
}

export function createAudioEngine(audio: HTMLAudioElement): AudioEngine
```

### 2.4 从 playerStore 迁移的内容

**状态迁移**（从 `reactive` 对象上移除）：

| 当前字段 | 迁移目标 |
|---|---|
| `playerStore._audioCtx` | `audioEngine` 内部闭包变量 |
| `playerStore._sourceNode` | `audioEngine` 内部闭包变量 |
| `playerStore._gainNode` | `audioEngine` 内部闭包变量 |
| `playerStore._eqFilters` | `audioEngine` 内部闭包变量 |
| `playerStore._eqEnabled` | `audioEngine` 内部 `enabled: boolean` |

**方法迁移**（从 `playerStore` 对象上移除）：

| 当前方法 | 迁移目标 | 备注 |
|---|---|---|
| `_prewarmAudio()` | → `ensureWebAudio()` | 仅调用了 `_ensureWebAudio()` |
| `_ensureWebAudio()` | → `ensureWebAudio()` | 完整迁移 |
| `enableEq(on)` | → `enableEq(on, gains?)` | 逻辑不变，增加可选 gains 参数 |
| `setEqGains(gains)` | → `setEqGains(gains)` | 逻辑不变 |
| `_rebuildEqChain()` | → 内部方法 | 不导出 |
| `_syncVolumeToGain()` | → 合并到 `syncVolume()` | 计算 volume 逻辑由外部传入 |

### 2.5 playerStore 侧的改动

```ts
// 在 player.ts 顶部
import { createAudioEngine } from '../player/audioEngine';
const audioEngine = createAudioEngine(new Audio());

// 替换 reactive 中的字段声明：
// 删除: _audioCtx, _sourceNode, _gainNode, _eqFilters, _eqEnabled

export const playerStore = reactive({
  audio: new Audio(),  // ← 注意：audioEngine 需要引用同一个 audio 实例
  // ...其他状态不变
  init() {
    // 将 audioEngine 关联到同一个 audio
    // audioEngine 直接在构造时传入 audio 引用即可
    // ...
  },
  // ...
})
```

关键在于 `playerStore.audio` 和 `audioEngine` 内部使用的 `audio` 必须是**同一个引用**。解决方案：

```ts
// 方案：playerStore 先创建 audio，再传入 engine
const audioEl = new Audio();
export const playerStore = reactive({
  audio: audioEl,
  // ... 其他状态
});

// 在模块作用域创建 engine
const audioEngine = createAudioEngine(audioEl); // 传入同一个 audio 引用
```

这样 playerStore 和 audioEngine 操作的是同一个 `<audio>` 元素。

### 2.6 需要修改的调用点

| 文件 | 改动 | 改动类型 |
|---|---|---|
| `playerStore.enableEq()` 内部 → `audioEngine.enableEq()` | 方法名不变但内部实现改为调用 engine | 内部修改 |
| `playerStore.setEqGains()` 内部 | `this._eqFilters` → `audioEngine.setEqGains()` | 内部修改 |
| `playerStore.playTrack()` 内部 | `this.enableEq(true)` → `audioEngine.enableEq(true)` | 内部修改 |
| `playerStore.playTrack()` 内部 | `this._audioCtx.state` → `audio引擎内部处理` | 内部修改 |
| `playerStore.setVolume()` 内部 | `this._gainNode` → `audioEngine.syncVolume()` | 内部修改 |
| `playerStore.toggleMute()` 内部 | `this._gainNode` → `audioEngine.syncVolume()` | 内部修改 |
| `EqPanel.vue` | `playerStore.enableEq(value)` → `playerStore 保留代理方法` | 不改 |
| `EqPanel.vue` | `playerStore.setEqGains(eq.gains)` → 同上 | 不改 |

**方案：playerStore 保留代理方法**

为了保持所有外部组件接口不变，`playerStore` 保留 `enableEq` 和 `setEqGains` 作为薄代理层：

```ts
// playerStore 中 (~3行)
enableEq(on: boolean) {
  audioEngine.enableEq(on, on ? eqSettings.gains : undefined);
  // 监听引擎状态变化
  // 注意：playTrack 中的暂停/恢复逻辑需要保留
}
setEqGains(gains: number[]) {
  audioEngine.setEqGains(gains);
}
```

但 `enableEq` 中包含了暂停→重建→恢复的播放状态管理逻辑（约 80 行），这部分必须保留在 playerStore 中或一起迁移到 audioEngine。因为 `enableEq` 涉及 `this.audio.pause()` / `this.audio.play()` / `this.audio.currentTime` 存取，这些是 playerStore 的播放控制职责。

---

### ⚡ 设计决策：enableEq 的播放状态管理归属

`enableEq` 有一段保存/恢复播放状态的逻辑（约 80 行），它必须与 playerStore 的播放状态交互。有两种方案：

**方案 A：`enableEq` 作为 playerStore 方法，调用 `audioEngine` 的底层 API**

```ts
// playerStore 中
enableEq(on: boolean) {
  // 保存/恢复播放状态 (50行，留在 playerStore)
  const wasPlaying = this.isPlaying;
  const savedTime = this.audio.currentTime;
  if (wasPlaying) this.audio.pause();

  // 交由 audioEngine 处理管线 (1行调用)
  audioEngine.rebuildChain(on, this._gainNode?.gain.value);

  if (wasPlaying) { this.audio.currentTime = savedTime; this.audio.play(); }
}
```

**方案 B：全部交给 audioEngine，把 audio 引用、isPlaying、currentTime 等传参进去**

不推荐。会传递太多参数，audioEngine 不应关心播放状态。

**结论：采用方案 A。** `enableEq` 保留在 playerStore 中，作为编排层，只将对 Web Audio API 的操作委托给 `audioEngine`。

---

### 2.7 迁移步骤（逐行）

#### Step 1: 创建 `src/player/audioEngine.ts`

```ts
// src/player/audioEngine.ts  — 完整伪代码结构

import { EQ_FREQUENCIES } from '../stores/eqSettings';

export interface AudioEngine {
  ensureReady(): void
  rebuildChain(enable: boolean, currentGain?: number): void
  setEqGains(gains: number[]): void
  syncVolume(volume: number, muted: boolean): void
  resumeIfSuspended(): void
  get isReady(): boolean
  get isEnabled(): boolean
}

export function createAudioEngine(audio: HTMLAudioElement): AudioEngine {
  let audioCtx: AudioContext | null = null;
  let sourceNode: MediaElementAudioSourceNode | null = null;
  let gainNode: GainNode | null = null;
  let eqFilters: BiquadFilterNode[] = [];
  let eqEnabled = false;
  let initFailed = false;  // 避免重复重试

  const Q = 1.41;

  return {
    ensureReady() { /* 从 playerStore._ensureWebAudio 完整迁移 */ },
    rebuildChain(enable, currentGain) { /* 从 playerStore._rebuildEqChain 完整迁移，加入 enable/disable 控制 */ },
    setEqGains(gains) { /* 从 playerStore.setEqGains 完整迁移 */ },
    syncVolume(volume, muted) { /* 从 playerStore._syncVolumeToGain 完整迁移 */ },
    resumeIfSuspended() { /* 从 playTrack 末尾的 AudioContext.resume 迁移 */ },
    get isReady() { return !!audioCtx && !!sourceNode && !!gainNode; },
    get isEnabled() { return eqEnabled; },
  };
}
```

#### Step 2: 更新 `playerStore` 状态声明

删除 reactive 对象中的 5 个 _audio/_sourceNode/_gainNode/_eqFilters/_eqEnabled 字段。

#### Step 3: 更新 `playTrack` 中的 Web Audio 调用

```ts
// 之前
if (eqSettings.enabled) {
  this.enableEq(true);       // 内部包含播放状态管理
  this.setEqGains(eqSettings.gains);
}
// 之后 (保持不变，enableEq 留在 playerStore)
if (eqSettings.enabled) {
  this.enableEq(true);
  audioEngine.setEqGains(eqSettings.gains);
}

// 之前
if (this._audioCtx && this._audioCtx.state === 'suspended' && !this._eqEnabled) {
  this._audioCtx.resume().catch(() => {});
}
// 之后
audioEngine.resumeIfSuspended();
```

#### Step 4: 更新 `setVolume` 和 `toggleMute`

```ts
// 之前
if (this._gainNode) { this._gainNode.gain.value = val; this.audio.volume = 1; }
else { this.audio.volume = val; }
// 之后
audioEngine.syncVolume(val, false);
// audioEngine 内部处理 _gainNode 存在/不存在两种路径
```

#### Step 5: 更新 `enableEq` 中的 Web Audio 操作

```ts
// enableEq 保留在 playerStore，但内部对 _audioCtx / _sourceNode / _gainNode 的引用改为调用 audioEngine.ensureReady()
// 音频管线重建逻辑 → audioEngine.rebuildChain(on, ...)
// EQ 滤波链重建逻辑 → audioEngine.rebuildChain(on, ...)
```

#### Step 6: 更新 `EqPanel.vue`（不改，走代理方法）

`EqPanel.vue` 调的是 `playerStore.enableEq()` 和 `playerStore.setEqGains()`，这两个代理方法仍在，不影响。

#### Step 7: 验证清单

1. **[功能]** EQ 开关 — 在 EqPanel 中开关 EQ，确认声音变化
2. **[功能]** EQ 增益 — 调整增益值，确认声音响应
3. **[功能]** 静音切换 — 点击静音/取消静音，确认 GainNode 生效
4. **[功能]** 播放中启用 EQ — 播放中打开 EQ，确认→暂停→重建→恢复流程正常、不卡顿
5. **[功能]** 切歌保持 EQ — 切歌后 EQ 状态保持，覆盖无 audio src 时创建 pipe 的边界
6. **[回退]** AudioContext 创建失败 — mock 异常路径，确认 initFailed 阻止重试
7. **[DevTools]** 控制台 `playerStore._audioCtx` 应不存在（undefined）
8. **[回归]** playByIndex → playTrack → 播放 → 暂停 → next → prev 全流程

---

## 三、阶段二：提取 playbackResolver 模块

### 3.1 新文件

```
src/player/playbackResolver.ts  (~150行)
```

### 3.2 职责

将 `playTrack` 中约 150 行的 URL 决议逻辑（fee 探测 → 音质计算 → 缓存命中 → unblock 匹配 → 代理回退 → 降级检测）封装为纯函数。

### 3.3 接口设计

```ts
// src/player/playbackResolver.ts

export interface ResolveResult {
  url: string
  source: 'official' | 'unblock' | string
  br: number
  isDowngraded: boolean
  downgradeInfo: { from: string; to: string } | null
}

export interface ResolveContext {
  trackId: number
  defaultQuality: string   // '标准' | '较高' | '极高(HQ)' | ...
  isVip: boolean
  loginCookie: string | undefined
  unblockEnabled: boolean
  unblockSources: string[]
  apiBaseUrl: string
  unblockProxyUrl: string | undefined
  getCache: (id: number) => { url: string; source: string; br: number; size: number } | undefined
  setCache: (id: number, entry: any) => void
}

/**
 * 播放 URL 决议：fee 探测 → 音质选择 → 缓存 → unblock → 降级检测
 * 纯异步函数，无副作用（除了 setCache 写入 unblock 缓存）
 */
export async function resolvePlayUrl(ctx: ResolveContext): Promise<ResolveResult>
```

### 3.4 从 playerStore 迁移的内容

`playTrack` 方法中的以下逻辑（当前紧贴在 L730-1010 中）：

1. **音质 level 计算**（~10行）：
   ```ts
   let level = toApiLevel(this.defaultQuality);
   if (!userStore.isVip && VIP_ONLY_API_LEVELS.has(level)) level = 'exhigh';
   ```

2. **Fee 探测请求**（~50行）：
   ```ts
   const feePromise = fetch(`${platform.apiBaseUrl}/song/url/v1?...`);
   // 带 cookie 参数
   // 解析响应：url, br, fee, freeTrialInfo, code
   // 判断 isFreePlayable
   // 检测静默降级：QUALITY_MIN_BR
   ```

3. **Unblock 匹配**（~30行）：
   ```ts
   const matchPromise = tryUnblockMatch(track.id, uiStore.unblockSources);
   // 等 fee 结果后，不可播则等 match
   // 成功则 setCache
   ```

4. **决策树 + 代理回退**（~30行）：
   ```ts
   if (isFreePlayable) { ... }
   else if (cached) { ... }
   else if (matchPromise) { ... }
   else { ... }
   // 非 official 源 + 非代理 → 包装 /dl-proxy?url=
   ```

5. **日志输出**（~20行）：
   ```ts
   console.log('[quality-switch] ...')  // 完整决策链日志
   ```

### 3.5 playerStore 侧的改动

```ts
import { resolvePlayUrl } from '../player/playbackResolver';

// playerStore 中
async playTrack(track: Track, seekTo?: number) {
  // ... 本地歌曲路径 (保持不变)

  // URL 决议 → 一行调用
  const result = await resolvePlayUrl({
    trackId: track.id,
    defaultQuality: this.defaultQuality,
    isVip: userStore.isVip,
    loginCookie: userStore.loginCookie,
    unblockEnabled: uiStore.unblockEnabled,
    unblockSources: uiStore.unblockSources,
    apiBaseUrl: platform.apiBaseUrl,
    unblockProxyUrl: platform.unblockProxyUrl,
    getCache,
    setCache,
  });

  this.currentSource = result.source;
  this.currentQualityBr = result.br;
  this.currentQualityDowngraded = result.isDowngraded;
  this.qualityDowngradeInfo = result.downgradeInfo;
  playUrl = result.url;

  // ... 后续播放逻辑 (保持不变)
}
```

### 3.6 需要修改的调用点

`playTrack` 是 playerStore 内部方法，外部无直接调用 `resolvePlayUrl`。所有变动都在 `playerStore` 内部。

### 3.7 迁移步骤（逐行）

#### Step 1: 创建 `src/player/playbackResolver.ts`

```ts
// src/player/playbackResolver.ts

const VIP_ONLY_API_LEVELS = new Set(['lossless', 'hires', 'jyeffect', 'sky', 'dolby', 'jymaster']);
const QUALITY_MIN_BR = { /* 从 player.ts 移入 */ };
const QUALITY_LEVELS = { /* 从 player.ts 移入 */ };

function toApiLevel(label: string): string { /* 移入 */ }
function formatQualityBr(br: number): string { /* 移入 */ }

export async function resolvePlayUrl(ctx: ResolveContext): Promise<ResolveResult> {
  // ... 完整迁移 fee 探测 + 缓存 + unblock + 决策 + 日志
}
```

#### Step 2: 从 player.ts 中删除迁移的代码

删除 `playTrack` 方法中的 URL 决议段（约 150 行），替换为：

```ts
const result = await resolvePlayUrl({ ... });
```

确保删除：
- `VIP_ONLY_API_LEVELS` 常量（如果其他方法不引用）
- `QUALITY_MIN_BR` 常量（如果其他方法不引用）
- `formatQualityBr` 函数（如果其他方法不引用）
- `toApiLevel` 函数（如果其他方法不引用）

#### Step 3: 验证清单

1. **[功能]** 播放免费歌曲 — 走 official 路径，正常播放
2. **[功能]** 播放 VIP 歌曲且未登录 — 走 unblock/缓存 路径
3. **[功能]** 音质降级 — 请求 HQ 但 API 返回低比特率，`qualityDowngradeInfo` 正确
4. **[功能]** 非 VIP 用户请求无损 — 自动降为 exhigh
5. **[功能]** 缓存命中 — 有缓存时跳过 API 直接使用缓存 URL
6. **[功能]** unblock 匹配 — 付费歌走 unblock 成功返回
7. **[功能]** dl-proxy 代理 — unblock 非官方 URL 包装为 `/dl-proxy?url=...`
8. **[回归]** 纯函数可测 — `resolvePlayUrl` 可用 mock 数据独立测试

---

## 四、阶段三（可选）：拆分后收尾

| 事项 | 说明 |
|---|---|
| 删除组件内多余 import | 检查是否还有 import `playerStore` 但只用了 `enableEq`/`setEqGains` 的组件 → 改为 import `audioEngine` |
| 清理注释 | 删除 player.ts 中标注被拆分区域的注释 |
| 文档更新 | 同步更新 CLAUDE.md 和 development-spec.mdc |

---

## 五、风险审计

### 5.1 已知风险清单

| # | 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|---|
| R1 | `audioEngine` 和 `playerStore.audio` 引用同一个 `<audio>`，但有两处管理它的设置(crossOrigin, volume) | 中 | 音量/跨域设置冲突 | audioEngine 的 `syncVolume` 只在 GainNode 存在时接管音量；`audio.crossOrigin` 由 playTrack 设置，audioEngine 不碰 |
| R2 | `enableEq` 涉及暂停→重建→恢复的逻辑对播放状态敏感 | 中 | 播放中断/卡顿 | enableEq 保留在 playerStore，只是内部 Web Audio API 操作委托给 audioEngine。重建链逻辑分两层：playerStore 控制播放状态，audioEngine 控制节点拓扑 |
| R3 | `resolvePlayUrl` 依赖外部 `uiStore` 的动态 import | 低 | import 时机问题 | 在 playerStore.playTrack 中已提前 `await import("../stores/ui")`，playbackResolver 只接收 resolveContext 参数，不执行 import |
| R4 | `formatQualityBr` / `toApiLevel` 等辅助函数可能被其他模块引用 | 低 | IDE 报红 | 搜索 `formatQualityBr` / `toApiLevel` 在 player.ts 外的引用，如果无外部引用则安全删除；如果有则保留在 player.ts 的公共区域，playbackResolver 中复制一份或共享引用 |
| R5 | playTrack 中 URL 决议和后续播放逻辑之间有隐式状态依赖 | 低 | 播放异常 | 已确认无隐式依赖。`playUrl`, `currentSource`, `currentQualityBr` 等变量在决议后赋值，后续逻辑只读它们 |
| R6 | `setVolume` 中 `this._gainNode` 判断分支可能丢失 | 低 | 音量失效 | 提取为 `audioEngine.syncVolume()` 后，内部需封闭 GainNode 存在/不存在两种路径 |
| R7 | `enableEq` 关闭分支中有 crossOrigin 清除和音频重载 | 中 | 播放中断 | 关闭 EQ 时的 crossOrigin 清除逻辑涉及暂停→设置→重载→恢复，跨域改动由 playTrack 负责，enableEq 只控制节点拓扑 |

### 5.2 回退方案

如果某个步骤出现问题：

```
git diff HEAD > /tmp/player-split-backup.patch
git checkout -- src/stores/player.ts
# 恢复后重新开始
```

或者更细粒度：每个原子改动单独验证后再继续下一步。

### 5.3 CI / 测试校验点

| 阶段 | 校验内容 | 方法 |
|---|---|---|
| audioEngine 创建 | 模块能 import，方法存在 | `node -e "require('./src/player/audioEngine.ts')"` 或 IDE no error |
| playerStore 启动 | 页面加载后播放器初始化正常 | 控制台无 `init()` 报错 |
| 播放一首歌 | 音频正常播放 | 手动点击测试 |
| EQ 开关 | 打开/关闭 EQ 听出差别 | EqPanel 交互测试 |
| 音量调节 | 调节正常 | PlayerBar 拖动条测试 |
| 播放中开 EQ | 不卡顿、不断播 | 播放中打开 EQ 开关 |
| URL 决议 | 各种 fee 场景都能播通 | 免费/付费/VIP 歌曲各测试一次 |

---

## 六、计划执行顺序（总行号以当前 player.ts 为准）

```
Step 1: 创建 src/player/audioEngine.ts              ← 纯创建，不动 player.ts
Step 2: player.ts 删除 5 个 _audio/_eq 状态字段         ← ~15行删除
Step 3: player.ts 顶部创建 audioEngine 实例            ← +3行
Step 4: 替换 _ensureWebAudio / _syncVolumeToGain 引用   ← ~6行改动
Step 5: 替换 _rebuildEqChain / enableEq 中的 Web Audio 调用 ← ~10行改动
Step 6: 替换 playTrack 中的 _audioCtx.resume()           ← ~3行改动
Step 7: 替换 setVolume / toggleMute 中的 _gainNode       ← ~6行改动
──────────────────────────────────────────────────
  checkpoint: 验证 audioEngine 功能 (EQ/音量/静音)
──────────────────────────────────────────────────
Step 8: 创建 src/player/playbackResolver.ts           ← 纯创建
Step 9: player.ts 删除迁移的常量 (VIP_ONLY_API_LEVELS 等) ← 确认无外部引用后删除
Step 10: playTrack 中 URL 决议段替换为 resolvePlayUrl()  ← ~150行删 → ~20行加
Step 11: 决策链日志迁移到 playbackResolver 内部           ← 保持日志
Step 12: 验证全播放流程                                   ← 手动测试
```

### 每次改动后即时检查项

1. **编译无报错** — `npm run dev:web` 或 `npx vue-tsc --noEmit` 确认无 TS 错误
2. **模块可 import** — 确认新文件可被 player.ts import
3. **IDE 无红色波浪线** — 确认 VSCode/Cursor 不提示类型错误
4. **控制台无 warn/error** — F12 确认 player 初始化正常

---

## 七、拆分后文件结构

```
src/
├── stores/
│   ├── player.ts              ← ~900行（精简后）
│   │   ├── 类型/常量/辅助函数
│   │   ├── reactive 状态
│   │   ├── init/persist/hydrate (不变)
│   │   ├── enableEq(代理) + setEqGains(代理)
│   │   ├── playByIndex / playTrack (精简)
│   │   ├── next / prev / togglePlay
│   │   ├── 播放列表管理
│   │   ├── 私人 FM
│   │   └── 简单 setter
│   │
│   └── eqSettings.ts          ← 不变 (audioEngine 引用的配置源)
│
├── player/                    ← 新增目录
│   ├── audioEngine.ts         ← ~210行 (Web Audio 管线)
│   └── playbackResolver.ts    ← ~150行 (播放 URL 决议链)
```

### playerStore 精简后接口完整性检查

| 外部组件调用的方法 | 拆分后 | 说明 |
|---|---|---|
| `playByIndex(index)` | ✅ 保留 | 不在拆分范围内 |
| `setPlaylist(list, startIndex, pid)` | ✅ 保留 | 不在拆分范围内 |
| `togglePlay()` | ✅ 保留 | 不在拆分范围内 |
| `next()` / `prev()` | ✅ 保留 | 不在拆分范围内 |
| `seek(time)` | ✅ 保留 | 不在拆分范围内 |
| `setVolume(v)` | ✅ 保留 | 内部 `_gainNode` 引用改为 `audioEngine.syncVolume()` |
| `toggleMute()` | ✅ 保留 | 同上 |
| `enableEq(on)` | ✅ 保留为代理 | 播放状态管理职责 |
| `setEqGains(gains)` | ✅ 保留为代理 | 调用 `audioEngine.setEqGains()` |
| `playTrack(track, seekTo?)` | ✅ 保留 | 内部 URL 决议改为 `resolvePlayUrl()` 调用 |
| `openExpanded()` / `closeExpanded()` | ✅ 保留 | 不在拆分范围内 |
| `appendToQueue(tracks)` | ✅ 保留 | 不在拆分范围内 |
| `isPersonalFmTrack(track)` | ✅ 保留 | 不在拆分范围内 |
| `persist()` | ✅ 保留 | 不在拆分范围内 |

**结论：所有外部接口不变，30+ 组件和 Store 的 import 行不需要修改。**