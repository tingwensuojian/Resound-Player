# 遗留 TypeScript 错误 — 待处理清单

生成于 2026-03-14，累计 ~87 个错误。

## 低风险批次（已修复 ✅）

已完成修复（跨 16 个文件，约 40+ 处）：
- TS7016 声明缺失（three, threejs-components, LocalMusicDB）
- global.d.ts `appEnv` 重复声明冲突
- App.vue computed CSS 变量类型收窄（layoutVars, contentStyle）
- App.vue openPodcastDetail `sourcePage` 类型扩展
- App.vue 模板内 `activePage.value` 多余 `.value`
- AlbumDetailPage.vue `aria-label` → `:ariaLabel`
- HorizontalScrollRail.vue `controlsTimer` 类型
- SongActions.vue: 补全 `handleCoverError` / `artistName` computed / `url` 非空断言
- VirtualSongList.vue: `showIdx` 参数补 `index`
- UserPanel.vue: `djRes.value` as any 兜底
- AnimatedAppear.vue: `rhythm` 类型补 `'media'`
- NodeMusicScanner.ts: `hasLyrics` 从 `1|0` 改为 `boolean`
- LocalStatsPage.vue: `platform.localApi` 用局部变量收窄
- 给 LocalMusicDB 补了完整类型声明（.d.ts）

---

## 中等风险（需逐行确认后改）

### 1. `string | number` → `number` 类型收紧（~16 处）

涉及文件：`CommentPanel.vue`(4)、`LocalPlaylistDetailPage.vue`(7)、`ArtistDetailPage.vue`(1)、`SongCommentPage.vue`(1)、`localMusicIpc.ts`(3)

```
TS2345: Argument of type 'string | number' is not assignable to parameter of type 'number'
TS2322: Type 'string | number' is not assignable to type 'number | undefined'
```

**风险**：API 响应的 id 字段可能是字符串。直接 `Number()` 强转可能导致 NaN。建议逐个确认来源类型，必要时加 `Number()` 或 `String()` 转换。

### 2. 实参个数不匹配（~6 处）

涉及文件：
- `SettingsPage.vue` lines 1160, 1165 — 调用了期望 1 个参数的函数但传了 0 个
- `LocalStatsPage.vue` lines 93, 98 — 同上
- `LocalSongsPage.vue` line 430 — 同上
- `HeartbeatActivateEffect.vue` line 161 — 期望 0-1 参数但传了 2 个

```
TS2554: Expected 1 arguments, but got 0
TS2554: Expected 0-1 arguments, but got 2
```

**风险**：**运行时可能抛异常**。函数签名改了但调用方没同步。需要逐行确认函数签名变化。

### 3. `string` 不能赋值给联合字面量类型（~6 处）

```
TS2322: Type 'string' is not assignable to type '"scroll" | "double" | "single" | undefined'
TS2345: Argument of type 'string' is not assignable to parameter of type '"较高" | "标准" | ...'
TS2322: Type 'string' is not assignable to type 'BgMode'
```

涉及文件：`PlayerBar.vue`(4)、`PlayerExpanded.vue`(2)、`SearchPage.vue`(2)、`LocalSongsPage.vue`(1)

**风险**：运行时字符串值可能是有效的，但类型定义未包含该值。需要确认是否需要扩展联合类型。

### 4. 对象字面量含未知属性（~6 处）

```
TS2353: 'showTranslation' does not exist in type '{ lrcArray: ...; currentTime: ...; ... }'
TS2353: 'type' does not exist in type '{ id: number; t: number; content: string; ... }'
TS2353: 'alwaysShowBg' does not exist in type '{ enabled?: boolean; ... }'
```

涉及文件：`CommentPanel.vue`(2)、`SettingsPage.vue`(4)、`PlayerBar.vue`(1)

**风险**：API 调用多传了字段，服务端可能忽略也可能报错。`alwaysShowBg` 可能是新增配置项未同步到类型。

### 5. 属性不存在于类型上（~8 处）

```
TS2339: Property 'creator' does not exist on type '{ id: number; name: string; picUrl?: string }'
TS2339: Property 'id'/'artistId' does not exist on type '{ name: string; }'
TS2339: Property 'syncState' does not exist on type trayLyric
```

涉及文件：`HomePanel.vue`、`SearchPage.vue`、`PlayerBar.vue`(3)、`PlayerExpanded.vue`(3)

**风险**：部分可能是 API 响应结构变化导致的类型未更新；`syncState` 是 trayLyric 新增方法但 `global.d.ts` 类型声明中遗漏了（已在 `src/types/global.d.ts` 旧版中定义但被清理掉了）。

### 6. `string[]` → `string`（~4 处）

```
TS2345: Argument of type 'string[]' is not assignable to parameter of type 'string'
```

涉及文件：`LocalPlaylistDetailPage.vue`(2)、`LocalSongsPage.vue`(2)

**风险**：传了数组但函数期望单字符串。需要确认是应该传 join 后的字符串还是函数签名变了。

---

## 需要你决策的设计层问题

### D1. 本地曲目 `id: string` vs 网络曲目 `id: number`

**文件**：`LocalPlaylistDetailPage.vue:344`

```ts
error TS2345: Argument of type '{ id: string; ... }' is not assignable
  to parameter of type '{ id: number; ... }'
```

**本质**：本地文件的 `id` 是字符串（文件路径哈希），网络曲目 `id` 是数字。传给 `playTrack()` 时类型不兼容。

**选项**：
1. 在 Track 类型中支持 `id: string | number`
2. 传之前 Number(id) 转换（可能丢掉精度）
3. 区分本地/网络两个 play 方法

### D2. `PodcastDetailPage` / `PlaylistDetailPage` 的 `aria-label` 驼峰转换

与 AlbumDetailPage 已修复问题相同 — 模板中用了 `aria-label="xxx"` 但组件期望 `ariaLabel` 为 required prop。

**文件**：
- `src/components/PodcastDetailPage.vue`
- `src/components/PlaylistDetailPage.vue`

**修复**：改为 `:ariaLabel="'xxx'"`（同已修复的 AlbumDetailPage）。

### D3. `trayLyric.syncState` 等方法在类型声明中缺失

`PlayerBar.vue` 和 `PlayerExpanded.vue` 调用了 `trayLyric.syncState()`、`trayLyric.syncTick()`、`trayLyric.notifyLikeStatus()`，但这些方法在根 `global.d.ts` 的 `trayLyric` 类型中没有定义。之前这些方法定义在 `src/types/global.d.ts` 的旧版类型中。

**修复**：需要决定是统一补到根 `global.d.ts`，还是让根 `global.d.ts` 以最新 preload 脚本为准。

### D4. `HomePanel.vue` ref 类型非 assignable

```
error: Type '((item: any) => void) | null' is not assignable to type 'VNodeRef | undefined'
```

**文件**：`src/components/HomePanel.vue`

### D5. `LyricsPanel.vue` computed style 类型收窄

与 App.vue 已修复的 `layoutVars` / `contentStyle` 相同模式 — computed 返回的 style 对象某些分支缺少属性导致类型 union 中可选值 undefined。

### D6. HistoryPanel.vue 本地 track 类型不完整

```
error: Type '{ id: number; name: any; ar: any; al: any; liked: true; isLiked: true; }[]'
  is not assignable to type '{ id: number; name: string; ar?: { name: string; }[]; ... }[]'
```

**文件**：`src/components/HistoryPanel.vue:478`

---

**总计**：中等风险 ~55 处（需逐行确认）+ 设计决策 ~6 项