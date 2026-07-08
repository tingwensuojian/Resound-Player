# Pinia 接入总结

> 将项目中全部 8 个 `reactive()` 单例 Store 迁移为 Pinia `defineStore()`，并修复迁移过程中出现的运行时错误。

---

## 一、迁移成果

### 已迁移的 Store（8 个）

| Store | 原行数 | 迁移后 | 引用文件数 | 迁移阶段 |
|---|---|---|---|---|
| `loginModal` | 34 | Pinia setup store | 11 | P1 |
| `lyricsSelection` | 48 | Pinia setup store | 1 | P1 |
| `lyricsSettings` | 92 | Pinia setup store | 4 | P2 |
| `eqSettings` | 168 | Pinia setup store | 1 | P2 |
| `ui` | 200 | Pinia setup store | 8 | P3 |
| `localMusic` | 700 | Pinia setup store | 10 | P4 |
| `user` | 561 | Pinia setup store | 22 | P5 |
| `player` | 985 | Pinia setup store | 30+ | P6 |

### 不迁移的模块（4 个）

| 模块 | 理由 |
|---|---|
| `apiCache.ts` | 复杂缓存层（双后端/TTL/LRU/用户隔离），数据不作为响应式状态暴露 |
| `unblock-cache.ts` | 纯函数模块 + Map 存储，不参与 Vue 响应式 |
| `audioEngine.ts` | 纯函数模块，不持有响应式状态 |
| `playbackResolver.ts` | 纯函数模块，不持有响应式状态 |

### 已安装的依赖

```json
{
  "pinia": "^3.0.4",
  "pinia-plugin-persistedstate": "^4.7.1"
}
```

---

## 二、核心模式：Store 访问规范

### 2.1 state 属性必须通过 `.state.` 前缀访问

**迁移前**：
```ts
playerStore.isPlaying
userStore.isLogin
uiStore.themeMode
```

**迁移后**：
```ts
playerStore.state.isPlaying
userStore.state.isLogin
uiStore.state.themeMode
```

所有 Pinia store 的状态字段都封装在 `reactive()` 的 `state` 对象中。组件和 composable 中访问状态属性时必须加 `.state.` 前缀。

### 2.2 方法不需要 `.state.`

```ts
// ✅ 正确 — 方法在 store 顶层
playerStore.togglePlay()
playerStore.seek(30)
userStore.logout()
uiStore.setThemeMode('深色')

// ❌ 错误 — 方法不在 state 上
playerStore.state.togglePlay()
```

### 2.3 Store 完整方法列表

| Store | 方法 |
|---|---|
| `playerStore` | init, hydrate, persist, enableEq, setEqGains, playByIndex, playTrack, togglePlay, next, prev, setPlaylist, appendToQueue, removeFromPlaylist, clearPlaylist, moveTrack, clearPersistedState, setPersonalFmPlaylist, appendPersonalFmTracks, setPersonalFmFetcher, setFmMode, clearPersonalFmContext, ensurePersonalFmQueue, isPersonalFmTrack, dislikeCurrentPersonalFm, playIntelligenceList, setVolume, toggleMute, setAutoplayNext, setPlayMode, cyclePlayMode, setCrossfadeSec, setPlaybackRate, setDefaultPlaybackRate, setCurrentSource, setDefaultQuality, adjustLyricsOffset, resetLyricsOffset, openExpanded, closeExpanded, toggleExpanded, seek, syncThemeState, recordCurrentTrackToHistory |
| `userStore` | hydrate, saveCookie, resetSession, logout, loginWithCookie, loginWithUid, restoreUidLogin, refreshLoginStatus, fetchPlaylists, fetchLikedSongs, fetchSubscribedDjs, fetchSubscribedAlbums, fetchSubscribedArtists, fetchSubscribedPlaylists, fetchSubscribedUsers, fetchVipInfo |
| `uiStore` | init, setThemeMode, setAccentMode, setAccentCustomColor, setUnblockEnabled, setUnblockSources, setResumeAfterMv, setShowIntelligenceIndicator, setAutoHidePlayerUI, togglePlayQueue, loadDefaultSearchKeyword, dispose |
| `localMusicStore` | toggleSort, loadDirectories, saveDirectories, addDirectory, removeDirectory, clearAll, lazyLoadCovers, lazyLoadPlaylistCovers, setSelectedFolder, toggleFolderCollapse, loadPlaylists, savePlaylists, createPlaylist, renamePlaylist, deletePlaylist, updatePlaylist, openPlaylist, addTrackToPlaylist, removeTrackFromPlaylist, loadTracks, scanAll, removeDirectoryPath, getTreePath, expandFolderAncestors |
| `lyricsSettings` | save |
| `eqSettings` | save, getAllPresets, isCustomPreset, upsertCustomPreset, removeCustomPreset |
| `loginModalStore` | showLoginModal, hideLoginModal, showGlobalToast |
| `lyricsSelectionStore` | openSelection, closeSelection, toggleLine, toggleSelectionTranslation, getSelectedLines |

---

## 三、运行时修复记录

### 3.1 循环依赖（Circular Dependency）

**错误**：
```
useMediaSession.ts: Cannot access 'usePlayerStore' before initialization
player.ts: Cannot access 'useUserStore' before initialization
```

**根因**：模块级 `useXxxStore()` 调用在模块导入阶段立即执行，此时 `app.use(createPinia())` 尚未被调用，导致 `getActivePinia()` 找不到活跃的 Pinia 实例。

**依赖链**：
```
main.ts → App.vue → player.ts → user.ts → apiCache.ts
                                    ↓ (循环)
         useMediaSession.ts ← player.ts
```

**修复规则**：所有 `useXxxStore()` 调用必须放在函数内部（`defineStore` 的 setup 函数、composable 函数、或任何被延迟执行的函数中），**永远不在模块顶层执行**。

```ts
// ❌ 错误 — 模块级调用
import { usePlayerStore } from '../stores/player';
const playerStore = usePlayerStore();

// ✅ 正确 — 在函数内部调用
import { usePlayerStore } from '../stores/player';

export function setupMediaSession(): void {
  const playerStore = usePlayerStore();
  // ...
}
```

**修复的文件（10 个）**：

| 文件 | 修复内容 |
|---|---|
| `src/stores/player.ts` | `useUserStore()`、`useEqSettingsStore()` 从模块级移入 `defineStore()` |
| `src/stores/user.ts` | `usePlayerStore()` 从模块级移入 `defineStore()` |
| `src/composables/useMediaSession.ts` | `usePlayerStore()` 移入 `setupMediaSession()` |
| `src/composables/useApiData.ts` | `useUserStore()` 移入 `useApiData()` |
| `src/composables/useSongRowConfig.ts` | `usePlayerStore()` 移入 `useSongRowConfig()` |
| `src/composables/useLyrics.ts` | `usePlayerStore()` + `useLyricsSettingsStore()` 移入 `useLyrics()` |
| `src/composables/useCurrentTrackLike.ts` | 2 个 store 移入 `useCurrentTrackLike()` |
| `src/composables/useEntitySubscribe.ts` | 2 个 store 移入 `useEntitySubscribe()` |
| `src/composables/useUserFollow.ts` | 2 个 store 移入 `useUserFollow()` + `checkMutual()` |
| `src/composables/useAuthAction.ts` | `useUserStore()` 移入 `useAuthAction()` |
| `src/stores/apiCache.ts` | `useUserStore()` 改为在 `buildCacheKey()` 和 `clearUserScoped()` 内延迟调用 |

### 3.2 缺失 `.state.` 前缀

**错误**：
```
BookmarkIconButton.vue: Cannot read properties of undefined (reading 'includes')
```

**根因**：部分组件仍在使用旧的 `userStore.likedSongIds` 直接访问方式，但在 Pinia 中状态属性被封装在 `state` 对象下。

**修复**：批量扫描并修复了 9 个文件中 68 处缺失的 `.state.` 前缀：

| 文件 | 修复数量 |
|---|---|
| `App.vue` | 8 |
| `TopBar.vue` | 21 |
| `SongActions.vue` | 21 |
| `SettingsPage.vue` | 6 |
| `LocalSongsPage.vue` | 4 |
| `LocalFoldersPage.vue` | 4 |
| `HomePanel.vue` | 2 |
| `AlbumDetailPage.vue` | 1 |
| `SongEncyclopediaModal.vue` | 1 |

---

## 四、组件中使用规范

### 4.1 基本模式

```vue
<script setup lang="ts">
import { usePlayerStore } from '../stores/player';
const playerStore = usePlayerStore();

// 读取状态 — 必须加 .state.
const isPlaying = computed(() => playerStore.state.isPlaying);

// 调用方法 — 不加 .state.
function play() { playerStore.togglePlay(); }
</script>

<template>
  <!-- 模板中自动解包 -->
  <div>{{ playerStore.state.isPlaying }}</div>
  <button @click="playerStore.togglePlay()">播放</button>
</template>
```

### 4.2 解构规则

```ts
// ❌ 错误 — 解构失去响应性
const { isPlaying, togglePlay } = usePlayerStore();

// ✅ 正确 — 使用 storeToRefs 解构状态
import { storeToRefs } from 'pinia';
const playerStore = usePlayerStore();
const { isPlaying } = storeToRefs(playerStore);
const { togglePlay } = playerStore;  // 方法直接解构
```

### 4.3 Composables 中的使用

所有 composable 中必须将 `useXxxStore()` 放在函数体内部：

```ts
// ✅ 正确
export function useMyComposable() {
  const playerStore = usePlayerStore();
  return {
    isPlaying: computed(() => playerStore.state.isPlaying),
  };
}
```

---

## 五、TypeScript 状态类型

当前所有 Pinia store 使用 `defineStore` 的 setup 语法，状态通过 `reactive()` 对象托管。TypeScript 类型自动从 `reactive({...})` 推断。

```ts
export const usePlayerStore = defineStore('player', () => {
  const state = reactive({
    isPlaying: false,
    volume: 0.7,
    // ...
  });

  return { state, togglePlay, /* ... */ };
});
```

组件中通过 `playerStore.state.xxx` 访问时，TypeScript 能正确推断类型。未发现 `.state.` 的类型推断问题。

---

## 六、后续开发注意事项

1. **新增 Store**：必须使用 `defineStore` 语法，不可创建新的 `reactive()` 单例
2. **新增 Composable**：`useXxxStore()` 调用必须放在函数内部，不可在模块顶层
3. **访问状态**：始终使用 `store.state.propertyName`（方法不需要 `.state.`）
4. **跨 Store 引用**：在 `defineStore` 的 setup 函数内直接 `const otherStore = useOtherStore()`
5. **持久化**：使用 `pinia-plugin-persistedstate` 的 `persist` 配置，不再使用手工 `localStorage.setItem`
6. **组件模板**：`store.state.xxx` 写法不变，Vue 模板自动解包