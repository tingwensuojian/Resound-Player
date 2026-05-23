# Pinia 接入开发计划

> 目标：将 8 个 `reactive()` 单例 Store 逐步迁移为 Pinia `defineStore()`，保持 2 个纯函数模块不变。

---

## 一、安装与基础配置

### 1.1 安装依赖

```bash
npm install pinia @pinia-plugin-persistedstate
```

### 1.2 入口注册

`src/main.ts` — 两行改动：

```diff
import { createApp } from 'vue';
+ import { createPinia } from 'pinia';
import App from './App.vue';

+ createApp(App).use(createPinia()).mount('#app');
- createApp(App).mount('#app');
```

### 1.3 清理 App.vue 中的手工初始化

`src/App.vue` onMounted 中当前有 4 个手工 init 调用，迁移完成后全部删除：

```diff
onMounted(async () => {
  await userStore.hydrate();    // → Pinia 自动 hydrate
- playerStore.init();           // → 仅保留 hydrateCache + setupMediaSession + audio 事件绑定
  uiStore.init();               // → Pinia 自动 hydrate
  apiCache.init();              // → 保持（apiCache 不迁移）
})
```

`playerStore.init()` 不能全部删除：其中的 `hydrateCache()`、`setupMediaSession()`、`audio` 事件绑定不属于 Pinia 范畴。迁移后 playerStore 会有一个独立的 `init()` 方法只做这些事。

---

## 二、Store 迁移模式

### 2.1 迁移前后对比

**迁移前（当前模式）**：

```ts
// stores/xx.ts — reactive 单例
export const store = reactive({
  field: 'value',
  method() { /* 直接通过 this 访问其他 store */ },
})
```

```vue
<!-- Component.vue -->
<script setup>
import { store } from '../stores/xx'
// 模板直接使用 store.field
</script>
<template>
  <div>{{ store.field }}</div>
</template>
```

**迁移后（Pinia 模式）**：

```ts
// stores/xx.ts — Pinia setup store
export const useXxxStore = defineStore('xxx', () => {
  const field = ref('value')
  function method() {
    const otherStore = useOtherStore()  // 标准跨 Store 访问
  }
  return { field, method }
})
```

```vue
<!-- Component.vue -->
<script setup>
import { useXxxStore } from '../stores/xx'
const store = useXxxStore()
// 模板直接使用 store.field — 自动 unwrap
</script>
<template>
  <div>{{ store.field }}</div>
</template>
```

### 2.2 模板引用处理规则

**高频规则**：模板中 `store.field` 的引用方式**完全不变**。Pinia store 在模板中自动 unwrap，`store.field` 和 `store.field.value` 行为一致。

**解构规则**：如果组件使用解构：

```ts
// ❌ 错误 — 失去响应性
const { field, method } = useXxxStore()

// ✅ 正确
const store = useXxxStore()
const field = computed(() => store.field)
// 或使用 storeToRefs
const { field } = storeToRefs(useXxxStore())
```

### 2.3 持久化迁移

**简单持久化**（单 key，无异常处理）：

```ts
// 迁移前
localStorage.setItem('key', JSON.stringify(data))

// 迁移后
export const useStore = defineStore('x', () => {
  const field = ref('default')
  return { field }
}, {
  persist: { key: 'key', storage: localStorage }
})
```

**复杂持久化**（QuotaExceeded 降级、自定义序列化）：

playerStore 的持久化保留自定义逻辑，Pinia 的 `persist` 配置中使用 `serialize`/`deserialize` 钩子。

---

## 三、Store 分阶段迁移

### 阶段 P1 — 零持久化、零模板引用

**包含**：`loginModal.ts` (34行)、`lyricsSelection.ts` (48行)

**涉及组件**：11 个 .vue + 1 个 .vue

**改动量**：最小，不涉及模板访问

**执行步骤**：

#### P1a: `loginModal.ts`

```ts
// 迁移后 — src/stores/loginModal.ts
import { defineStore } from 'pinia'

export const useLoginModalStore = defineStore('loginModal', () => {
  const visible = ref(false)
  const toastMessage = ref('')
  const toastType = ref<'success' | 'warning' | 'error' | 'info'>('info')
  const toastDuration = ref(3000)
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function showLoginModal() { visible.value = true }
  function hideLoginModal() { visible.value = false }

  function showGlobalToast(msg: string, type = 'info' as any, duration = 3000) {
    toastMessage.value = msg
    toastType.value = type
    toastDuration.value = duration
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastMessage.value = '' }, duration)
  }

  return { visible, toastMessage, toastType, showLoginModal, hideLoginModal, showGlobalToast }
})
```

**组件改动**：
```diff
- import { loginModalState, showGlobalToast, showLoginModal, hideLoginModal } from '../stores/loginModal'
+ import { useLoginModalStore } from '../stores/loginModal'
+ const loginModalStore = useLoginModalStore()
```

#### P1b: `lyricsSelection.ts`

类似模式，48 行转换为 `defineStore`。

**P1 验证 checkpoint**：
```
- 控制台无 "loginModal" / "lyricsSelection" 相关报错
- 登录弹窗能正常打开/关闭
- Toast 消息正常显示
```

---

### 阶段 P2 — 有持久化、极少组件引用

**包含**：`lyricsSettings.ts` (92行)、`eqSettings.ts` (168行)

**涉及组件**：4 个 .vue + 0 个 .vue

#### P2a: `lyricsSettings.ts` — 利用 persistedstate

```ts
export const useLyricsSettingsStore = defineStore('lyricsSettings', () => {
  const displayMode = ref<'cover' | 'record' | 'fullscreen'>('cover')
  const showCover = ref(true)
  // ... 其他字段

  return { displayMode, showCover, ... }
}, {
  persist: {
    key: 'gm_lyrics_settings_v1',
    storage: localStorage,
  }
})
```

**组件改动**（4 个 .vue）：
```diff
- import { lyricsSettings } from '../stores/lyricsSettings'
+ import { useLyricsSettingsStore } from '../stores/lyricsSettings'
+ const lyricsSettings = useLyricsSettingsStore()
```

**注意**：`lyricsSettings.save()` 手动调用不再需要 — `persistedstate` 会自动持久化。

#### P2b: `eqSettings.ts` — 同上模式

同样从 `reactive` + 手动 `persist()` 改为 `defineStore` + `persistedstate`。

`playerStore.enableEq()` 和 `audioEngine.setEqGains()` 中引用的 `eqSettings.gains` 改为通过 `useEqSettingsStore()` 获取。

**P2 验证 checkpoint**：
```
- 调整歌词设置后刷新，设置保留
- 调整 EQ 增益后刷新，增益保留
- 歌词面板/设置页正常
```

---

### 阶段 P3 — 多 key 持久化、中等引用

**包含**：`ui.ts` (200行)

**涉及组件**：8 个 .vue

**关键点**：9 个独立的 localStorage key → persistedstate 的 `paths` 配置：

```ts
export const useUiStore = defineStore('ui', () => {
  const themeMode = ref('跟随系统')
  const unblockEnabled = ref(true)
  // ... 其他字段

  return { themeMode, unblockEnabled, ... }
}, {
  persist: {
    key: 'tm_ui_state',  // 合并为单个 key
    storage: localStorage,
    paths: ['themeMode', 'unblockEnabled', 'unblockSources', /* ... */],
  }
})
```

**组件改动**：8 个 .vue 修改 import。

**P3 验证 checkpoint**：
```
- 切换主题模式后刷新，主题保持
- 切换 unblock 开关后刷新，开关状态保持
- 无 "uiStore" 引用报错
```

---

### 阶段 P4 — 大文件、桌面端独有

**包含**：`localMusic.ts` (700行)

**涉及组件**：10 个 .vue

**注意**：仅 Electron 桌面端使用，Web 端不涉及。可在迁移时保持向后兼容：

```ts
export const useLocalMusicStore = defineStore('localMusic', () => {
  // 仅限 Electron 环境
  if (!platform.isDesktop) return {}

  const directories = ref<DirEntry[]>([])
  // ...

  return { directories, ... }
}, { persist: { key: 'local_music_dirs' } })
```

**组件改动**：10 个 .vue 修改 import + store 初始化。

**P4 验证 checkpoint**：
```
- 桌面端本地歌曲扫描正常
- 本地歌单列表正常
```

---

### 阶段 P5 — 高扩散、跨 Store 依赖

**包含**：`user.ts` (561行)

**涉及组件**：22 个 .vue

**跨 Store 引用**：

```ts
export const useUserStore = defineStore('user', () => {
  // ...
  function logout() {
    const playerStore = usePlayerStore()
    playerStore.clearPersistedState()
    clearCache()
    apiCache.clearUserScoped()
  }
  return { ... }
})
```

**持久化**：cookie 存入 IndexedDB（通过 `storage.ts` 工具），`loginMode` 存入 localStorage。这部分保留自研逻辑，Pinia 配置中使用 `persist: false` 并保持手工 `saveCookie()`。

**组件改动**：22 个 .vue 修改 import。这里开始风险升高，因为涉及面广。

**P5 验证 checkpoint**：
```
- 登录/登出流程正常
- 刷新后登录态保持
- 登出后播放器状态清理
- 所有 22 个组件用户信息显示正常
```

---

### 阶段 P6 — 核心 Store、最大风险

**包含**：`player.ts` (985行)

**涉及组件**：30+ 个 .vue

**跨 Store 引用**：

```ts
export const usePlayerStore = defineStore('player', () => {
  const userStore = useUserStore()       // loginCookie, isVip
  const uiStore = useUiStore()           // unblockEnabled (动态 import)
  const eqSettingsStore = useEqSettingsStore()  // gains

  // audioEngine — 纯函数，不参与响应式
  // playbackResolver — 纯函数，不参与响应式
})
```

**关键设计**：当前 playerStore 中 `audioEngine` 和 `playbackResolver` 是模块级闭包对象。迁移到 Pinia 后，它们**仍然是模块级闭包**，不放入 Pinia store：

```ts
// 模块作用域 — 与 Pinia 无关
const audioEngine = createAudioEngine(audioEl)

export const usePlayerStore = defineStore('player', () => {
  // Pinia store 中引用模块作用域的 engine
  function enableEq(on: boolean) {
    audioEngine.ensureReady()
    audioEngine.rebuildChain(true, eqSettingsStore.gains)
  }
})
```

**持久化**：`persist()` 的 QuotaExceeded 降级逻辑需要保留。Pinia 的 `persistedstate` 支持自定义 `serialize`/`deserialize`：

```ts
export const usePlayerStore = defineStore('player', () => {
  // ...
}, {
  persist: {
    key: 'gm_player_state_v1',
    serializer: {
      serialize: (value) => {
        try {
          return JSON.stringify(value)
        } catch (e) {
          if (e instanceof DOMException && e.name === 'QuotaExceededError') {
            // 降级逻辑...
          }
        }
      },
      deserialize: JSON.parse,
    }
  }
})
```

**模板改动量统计**：

| 组件 | 模板引用次数 | 风险 |
|---|---|---|
| PlayerExpanded.vue | ~51 次 | 高 — 需全部测试每个交互 |
| PlayerBar.vue | ~26 次 | 高 |
| HomePanel.vue | ~3 次 | 低 |
| PlayQueuePanel.vue | ~5 次 | 低 |

PlayerExpanded 是测试重点。由于 Pinia store 在模板中自动 unwrap，`playerStore.xxx` 的调用方式不变。

**P6 验证 checkpoint**（核心播放流程全覆盖）：
```
1. 播放一首免费歌曲 → 正常出声
2. 播放一首 VIP 歌曲（未登录）→ unblock/缓存替代
3. 切歌 → 下一首/上一首
4. 播放模式切换 → 循环/单曲/随机
5. 音量调节 + 静音 → 正常工作
6. EQ 开关 + 增益调节 → 声音变化
7. 播放进度拖动 → seek 正常
8. 展开/收起播放器 → UI 正常
9. 播放列表添加/删除 → 列表操作正常
10. 刷新页面 → 音量/播放模式等设置保持
```

---

## 四、组件改动量化

| 阶段 | 需要改动的 .vue 文件 | 需要改动的 .ts 文件 | 预计工具修改量 |
|---|---|---|---|
| P1 | 12 | 2 | 约 24 行 import 替换 |
| P2 | 4 | 2 | 约 10 行 import 替换 |
| P3 | 8 | 1 | 约 16 行 import 替换 |
| P4 | 10 | 1 | 约 20 行 import 替换 |
| P5 | 22 | 1 | 约 44 行 import 替换 |
| P6 | 30+ | 1 | 约 60+ 行 import 替换 |
| **合计** | **~42 个文件** (有重叠) | **8** | **~170 处 import 改动 + store 内部重构** |

---

## 五、风险审计

### 5.1 风险分级表

| ID | 风险 | 概率 | 影响 | 阶段 | 缓解措施 |
|---|---|---|---|---|---|
| R1 | 模板中 `.value` 泄漏 — Pinia store 在模板中自动 unwrap，但 `reactive` 的嵌套对象可能 `.value` 穿透 | 中 | 渲染异常 | P6 时重点检查 PlayerExpanded/PlayerBar 模板，确认 `playerStore.xxx` 全部不加 `.value` |
| R2 | 跨 Store 循环依赖 — 两个 Pinia store 在 setup 函数中互调 `useOtherStore()` | 低 | 运行时死循环 | 用户手册明确：`useOtherStore()` 只在 action 函数内调用，不在 setup 顶层调用；当前无循环依赖 |
| R3 | 动态 import 失效 — `playerStore.playTrack` 中 `import("../stores/ui")` 需要改为 `useUiStore()` | 低 | unblock 不启用 | 改为 Pinia 后不再需要动态 import（uiStore 在 setup 阶段即可注册） |
| R4 | 持久化兼容性 — 迁移到 persistedstate 后 localStorage key 变化导致用户配置丢失 | 中 | 用户设置丢失 | 新 Pinia persist `key` 保持与原 localStorage key 完全一致；如 gm_lyrics_settings_v1 → 仍用同一 key |
| R5 | `eqSettings` 被 audioEngine 引用 — audioEngine 是模块级闭包，不在 Pinia store 内 | 低 | EQ 增益失效 | `audioEngine.setEqGains()` 被 playerStore 的 proxy 方法（仍在 Pinia 内）调用，实际读取的是 `eqSettingsStore.gains` |
| R6 | `hydrateCache()` 调用时机 — 当前在 `playerStore.init()` 中调用，改为 Pinia 后 init 消失 | 低 | unblock 缓存未加载 | 将 `hydrateCache()` 作为 playerStore 的一个 setup 顶层调用，或 App.vue onMounted 中保留单次调用 |
| R7 | 批量改动 `loginModal` 和 `lyricsSelection` 后测试覆盖不足 | 中 | Toast/歌词选择异常 | 每个阶段独立 commit，P1 完成后 run dev 验证后再继续 |

### 5.2 模板改动风险详细分析

Pinia store 在 Vue 模板中自动 `.value` unwrap，但这与当前 `reactive()` 的行为一致：

```vue
<!-- 当前 — reactive 模式 -->
<template>
  <div>{{ playerStore.isPlaying }}</div>         <!-- ✅ 响应式 -->
  <button @click="playerStore.togglePlay()">     <!-- ✅ 方法 -->
</template>

<!-- 迁移后 — Pinia 模式 — 完全相同的写法 -->
<template>
  <div>{{ playerStore.isPlaying }}</div>         <!-- ✅ 自动 unwrap -->
  <button @click="playerStore.togglePlay()">     <!-- ✅ 方法 -->
</template>
```

**风险点**：如果组件中解构了 store：

```vue
<script setup>
// ❌ 错误：解构后失去响应性
const { isPlaying, togglePlay } = usePlayerStore()

// ✅ 正确
const playerStore = usePlayerStore()
const { isPlaying } = storeToRefs(playerStore)  // ref 包装
const { togglePlay } = playerStore              // action 直接解构
</script>
```

Check：当前组件中是否有对 `playerStore` 的解构？需 grep 检查：

```bash
grep -rn "const {.*playerStore\|const {.*usePlayerStore" src/
```

### 5.3 回退方案

每次 commit 后保留一个已知好的 tag：

```bash
git tag pinia-before-<phase>
```

如果某个阶段出现问题：

```bash
git checkout pinia-before-<phase> -- src/stores/
# 仅回退 stores 目录，其他文件保持
```

### 5.4 提交策略

```
P1: feat: migrate loginModal and lyricsSelection to Pinia
P2: feat: migrate lyricsSettings and eqSettings to Pinia
P3: feat: migrate uiStore to Pinia
P4: feat: migrate localMusicStore to Pinia
P5: feat: migrate userStore to Pinia
P6: refactor: migrate playerStore to Pinia
```

每个阶段完成后运行 dev server 验证核心功能再提交下一阶段。

---

## 六、迁移前后对比

| 维度 | 迁移前 | 迁移后 |
|---|---|---|
| 状态管理 | `reactive()` 模块级单例 | Pinia `defineStore()`, setup store |
| 持久化 | 7 套手工 persist/hydrate | `pinia-plugin-persistedstate` 声明式 |
| 初始化 | App.vue onMounted 显式调用 | 自动 |
| DevTools | ❌ | ✅ 时间旅行、action 追踪 |
| 跨 Store 访问 | import 其他 Store | `useOtherStore()` 标准 API |
| 模板访问 | `store.field` | `store.field`（不变） |
| 非响应式模块 | `audioEngine.ts` / `playbackResolver.ts` / `apiCache.ts` / `unblock-cache.ts` | 保持纯函数模块，不迁移 |

---

## 七、执行顺序建议

```
Step 0: npm install pinia @pinia-plugin-persistedstate   [~2 min]
Step 1: main.ts 注册 createPinia                          [~2 min]
──────────────────────────────────────────
P1: loginModal + lyricsSelection → commit                 [~15 min]
P2: lyricsSettings + eqSettings → commit                  [~20 min]
P3: ui → commit                                          [~15 min]
P4: localMusic → commit                                   [~20 min]
P5: user → commit + 重点测试登录登出                       [~30 min]
P6: player → commit + 全播放流程测试                       [~45 min]
──────────────────────────────────────────
总计：约 2.5 小时（含测试）
```