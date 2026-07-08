# playerStore 拆分总结

> 将 1277 行单体 `playerStore` 拆分为「核心编排层 + 2 个独立模块」，所有外部接口零变更。

---

## 一、动机

`src/stores/player.ts` 原本 1277 行，内部混杂了 6 个逻辑领域：

| 领域 | 行数 | 是否拆分 |
|---|---|---|
| Web Audio / EQ 引擎 | ~210 行 | ✅ 拆为 `audioEngine.ts` |
| 播放 URL 决议链（fee 探测 / 缓存 / unblock / 降级） | ~150 行 | ✅ 拆为 `playbackResolver.ts` |
| 播放控制（playByIndex / playTrack / next / prev） | ~350 行 | 保留 |
| 播放列表管理（setPlaylist / appendToQueue / removeFromPlaylist） | ~230 行 | 保留 |
| 私人 FM（setPersonalFmPlaylist / ensurePersonalFmQueue） | ~80 行 | 保留 |
| 设置/UI（setVolume / setPlayMode / setDefaultQuality / seek） | ~170 行 | 保留 |

### 选择先拆这两块的理由

1. **audioEngine**：Web Audio 管线是纯技术逻辑，不涉及 UI 状态。抽出后 EQ 状态不再属于 Vue 响应式系统，避免不必要的响应式追踪，且可独立测试。
2. **playbackResolver**：URL 决议链是 `playTrack` 中最复杂的段（150 行，涉及 3 个并行请求、多级决策树、音质降级检测），抽为纯函数后可独立单元测试，且 `playTrack` 从 280 行降至 ~130 行。
3. **两者都是纯技术逻辑**，不依赖 playerStore 响应式状态，拆出成本最低。

### 拆后继续保留的理由

剩下的领域（播放控制 / 列表管理 / 私人 FM）之间交叉引用密集（如 `playByIndex` 同时操作 `playlist` / `currentIndex` / `personalFmFetcher` / `persist`），拆分为多个 Store 在当前无 Pinia 的架构下收益有限。

---

## 二、拆分后文件结构

```
src/
├── stores/
│   └── player.ts              ← 985 行（精简编排层）
│
├── player/                    ← 新增目录
│   ├── audioEngine.ts         ← 215 行（Web Audio 管线）
│   └── playbackResolver.ts    ← 208 行（播放 URL 决议链）
```

---

## 三、audioEngine 模块

### 职责

封装 Web Audio API 管线（`AudioContext → MediaElementSourceNode → 10 段 peaking EQ 滤波链 → GainNode → destination`）的全部生命周期管理。

### 接口

```ts
export interface AudioEngine {
  readonly isReady: boolean           // 管线是否就绪
  readonly isEnabled: boolean         // EQ 是否启用
  ensureReady(): void                 // 惰性创建管线
  rebuildChain(enable: boolean, gains?: number[]): void  // 插入/拆除 EQ 链
  setEqGains(gains: number[]): void   // 设置 10 段增益
  syncVolume(volume: number, muted: boolean): void       // 同步音量到 GainNode
  resumeIfSuspended(): void           // 恢复 suspended 的 AudioContext
}

export function createAudioEngine(audio: HTMLAudioElement): AudioEngine
```

### 设计要点

- 不依赖 Vue 响应式系统，不持有 playerStore 引用
- 通过闭包管理内部状态（`audioCtx`, `sourceNode`, `gainNode`, `eqFilters`, `eqEnabled`）
- 通过 `audioEngine.isReady` / `audioEngine.isEnabled` 暴露只读状态
- 与 playerStore 共享同一个 `HTMLAudioElement` 引用

### 从 playerStore 迁移的内容

| 原状态/方法 | 迁移后 |
|---|---|
| `_audioCtx`, `_sourceNode`, `_gainNode` | `audioEngine` 内部闭包 |
| `_eqFilters`, `_eqEnabled` | `audioEngine` 内部闭包 |
| `_prewarmAudio()`, `_ensureWebAudio()` | `audioEngine.ensureReady()` |
| `_syncVolumeToGain()` | `audioEngine.syncVolume()` |
| `_rebuildEqChain()` | `audioEngine.rebuildChain()` |
| `enableEq(on)` | **保留 proxy 方法**（只在内部调用 engine API） |
| `setEqGains(gains)` | **保留 proxy 方法**（委托给 engine） |

### enableEq 保留在 playerStore 的理由

`enableEq` 涉及播放状态管理（暂停→重建→恢复），这些操作必须与 playerStore 的 `this.audio.pause()` / `this.audio.play()` / `this.isPlaying` 交互。拆出会引入过多参数传递，不如保留为编排方法。

---

## 四、playbackResolver 模块

### 职责

将 `playTrack` 中的播放 URL 决议链（fee 探测 → 音质计算 → 缓存命中 → unblock 匹配 → 降级检测 → 代理回退）封装为纯函数。

### 接口

```ts
export interface ResolveResult {
  url: string
  source: string       // 'official' | 'unblock' | ...
  br: number
  isDowngraded: boolean
  downgradeInfo: { from: string; to: string } | null
}

export interface ResolveContext {
  trackId: number
  defaultQuality: string
  isVip: boolean
  loginCookie: string | undefined
  unblockEnabled: boolean
  unblockSources: string[]
  apiBaseUrl: string
  unblockProxyUrl: string | undefined
  getCache: (id: number) => CacheEntry | null | undefined
  setCache: (id: number, entry: any) => void
}

export async function resolvePlayUrl(ctx: ResolveContext): Promise<ResolveResult>
```

### 决策链路

```
resolvePlayUrl()
  ├── 1. 音质 level 计算 + VIP 校验
  ├── 2. 并行发起：fee 探测 + 缓存读取 + unblock 匹配
  ├── 3. 解析 fee 结果（url / br / fee / freeTrialInfo / code）
  ├── 4. 决策树：
  │   ├── isFreePlayable → 官方音源
  │   ├── 缓存命中 → 缓存音源
  │   ├── unblock 匹配 → unblock 音源
  │   └── 全部失败 → 回退官方（可能无音源）
  ├── 5. 非官方音源 → dl-proxy 包装绕过 CORS
  ├── 6. 降级检测（br < quality min threshold）
  └── 7. 输出决策日志
```

### 从 playerStore 迁移的内容

| 原内容 | 迁移后 |
|---|---|
| `QUALITY_LEVELS`, `QUALITY_MIN_BR`, `VIP_ONLY_API_LEVELS` | `playbackResolver.ts` 内部常量 |
| `formatQualityBr()`, `toApiLevel()` | `playbackResolver.ts` 内部函数 |
| `tryUnblockMatch` import | `playbackResolver.ts` 直接 import |
| `playTrack` 中 ~150 行 URL 决议逻辑 | `resolvePlayUrl()` 一行调用 |

---

## 五、playerStore 精简对比

| 指标 | 拆分前 | 拆分后 | 变化 |
|---|---|---|---|
| `player.ts` 行数 | 1277 | **985** | **-292 行** |
| `player/audioEngine.ts` | — | 215 行 | 新增 |
| `player/playbackResolver.ts` | — | 208 行 | 新增 |
| TypeScript 错误 | 若干已有 | **无新增** | ✅ |

### 删除的响应式状态（5 个字段）

```diff
- _audioCtx: null as AudioContext | null
- _sourceNode: null as MediaElementAudioSourceNode | null
- _gainNode: null as GainNode | null
- _eqFilters: [] as BiquadFilterNode[]
- _eqEnabled: false
```

### 删除的内部方法（6 个）

```diff
- _prewarmAudio()
- _ensureWebAudio()
- _syncVolumeToGain()
- _rebuildEqChain()
- setEqGains()     ← 重写为 proxy，不再含核心逻辑
- enableEq()       ← 保留编排逻辑，内联改用 engine API
```

### 删除的常量和辅助函数

```diff
- QUALITY_LEVELS
- QUALITY_MIN_BR
- VIP_ONLY_API_LEVELS
- formatQualityBr()
- toApiLevel()
```

### 删除的 import

```diff
- import { tryUnblockMatch } from '../api/unblock';
```

---

## 六、外部接口完整性

**30+ 组件和 Store 的 import 行全部无需修改。** 所有外部调用的方法签名不变：

| 方法 | 状态 | 调用方数量 |
|---|---|---|
| `playByIndex(index)` | ✅ 保留 | 17 个文件 |
| `setPlaylist(list, startIndex, pid)` | ✅ 保留 | 13 个文件 |
| `togglePlay()` | ✅ 保留 | 11 个文件 |
| `next()` / `prev()` | ✅ 保留 | 5 / 4 个文件 |
| `seek(time)` | ✅ 保留 | 4 个文件 |
| `setVolume(v)` | ✅ 保留（内部实现改为 engine） | 2 个文件 |
| `toggleMute()` | ✅ 保留（内部实现改为 engine） | 2 个文件 |
| `enableEq(on)` | ✅ 保留 proxy | 1 个文件（EqPanel.vue） |
| `setEqGains(gains)` | ✅ 保留 proxy | 1 个文件（EqPanel.vue） |
| `playTrack(track, seekTo?)` | ✅ 保留（URL 决议改为 resolver） | 4 个文件 |
| `openExpanded()` / `closeExpanded()` | ✅ 保留 | 4 个文件 |
| `appendToQueue(tracks)` | ✅ 保留 | 3 个文件 |
| `isPersonalFmTrack(track)` | ✅ 保留 | 3 个文件 |
| `persist()` | ✅ 保留 | 2 个文件 |

---

## 七、风险审计与缓解措施

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| `audioEngine` 和 `playerStore` 操作同一个 `audio` 元素导致冲突 | 低 | 音量/跨域设置不一致 | `syncVolume` 只在 GainNode 存在时接管音量；crossOrigin 由 playTrack 设置，engine 不覆盖 |
| `enableEq` 暂停→重建→恢复流程出错 | 中 | 播放中断 | `enableEq` 保留在 playerStore，只将 Web Audio API 操作委托给 engine；播放状态管理逻辑不变 |
| 移除了 `tryUnblockMatch` import 但缓存未引入解析器 | 低 | unblock 不生效 | `playbackResolver.ts` 直接 import `tryUnblockMatch` |
| `getCache` 返回 `null` vs `undefined` 类型不匹配 | 已修复 | 编译错误 | ResolveContext 中兼容 `null \| undefined` |
| `playbackResolver` 缺少 `songName` 写入缓存 | 低 | 缓存中 songName 缺失 | `songName` 仅用于调试，不影响播放流程 |

---

## 八、未来方向

1. **playbackResolver 可独立编写单元测试** —— 纯函数，mock `fetch` + `getCache`/`setCache` 即可覆盖所有决策路径
2. **audioEngine 可独立验证** —— 构造 `HTMLAudioElement` mock 即可测试 EQ 开关和音量同步
3. **后续如引入 Pinia**，`playerStore` 可先保留现状（985 行），只迁移 `user.ts`、`ui.ts`、`lyricsSettings.ts` 等无跨 Store 依赖的小 Store 作为试点