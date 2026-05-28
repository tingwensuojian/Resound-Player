# 开发计划 —— Unblock 音源替换系统

## 当前状态

| 组件 | 端口 | 状态 |
|------|------|------|
| Netease API | 38761 | ✅ |
| Unblock Proxy | 38762 | ✅ |
| Unblock Match Server | 38763 | ✅ Web 端主路径 / 桌面端 fallback |
| Native Bridge (Electron 主进程) | IPC | ✅ 桌面端首选路径 |
| Vite 前端 | 5173 | ✅ |
| 设置页开关 | - | ✅ |
| 持久化 | - | ✅ |
| PlayerBar 音源标签 | - | ✅ |

## Phase 1 ✅ 已完成

### 1.1 基础设施
- [x] `package.json`：新增 `dev:unblock`、`dev:unblock-match` 脚本
- [x] `dev:web:full` 四服务同时启动
- [x] `server/unblock-match-server.mjs`：`match()` HTTP 封装

### 1.2 前端状态管理
- [x] `stores/ui.ts`：`unblockEnabled` + `unblockSources` 持久化
- [x] `src/api/unblock.ts`：`tryUnblockMatch()` 调用封装
- [x] `stores/player.ts`：`currentSource`、`playTrack` 接入

### 1.3 设置页
- [x] 「音源替换」开关
- [x] 开关状态持久化
- [x] apiClient 动态控制 proxy 参数

### 1.4 PlayerBar
- [x] 当前音源标签显示（紫色 `官方` / `来源名`）

## Phase 2 ✅ 已完成

### 2.1 设置页音源优先级排序
- [x] 可排序列表
- [x] 上移/下移按钮调整顺序
- [x] 持久化到 `uiStore.unblockSources`
- [x] 开关联动显示/隐藏

### 2.2 音源顺序提示
- [x] 调整后行内提示「播放下首歌曲时生效」

## Phase 3 ✅ 已完成

### 3.1 底部栏音源切换弹窗
- [x] 点击音源标签弹出浮动菜单
- [x] 列出所有可用音源
- [x] 当前音源高亮 + ✓ 标记
- [x] 后续移除弹窗，改为自动匹配 + 缓存

### 3.2 切换音源逻辑
- [ ] 选择新音源后重新调用 `tryUnblockMatch(id, [source])`
- [ ] 更新 `playUrl` + `currentSource`
- [ ] 保持当前播放进度
- [ ] 切换失败 Toast 提示

## Phase 4 ✅ 已完成（Electron 深度集成）

### 4.1 Electron 内置 match 能力
- [x] `electron/unblock-native-match.js`：内嵌 match 逻辑，使用 `@unblockneteasemusic/server`
- [x] `electron/main.js`：启动链路中调用 `initNativeUnblockMatch()`，注册 IPC：
  - `unblock:match-song` — 匹配歌曲
  - `unblock:is-native-ready` — 查询就绪状态
- [x] `electron/preload.js`：暴露 `window.appEnv.unblockBridge`（`matchSong` / `isReady`）
- [x] `src/utils/platform.ts`：新增 `hasNativeUnblockBridge` / `unblockBridge` getter

### 4.2 渲染层 match 路由（native bridge 优先 + HTTP fallback）
- [x] `src/api/unblock.ts`：桌面端优先走 native bridge；native bridge 无结果时 **fall through** 到 HTTP match 服务
- [x] `scripts/start-desktop.mjs`：桌面端开发模式仍启动外部 match 服务作为 fallback
- [x] `electron/unblock-native-match.js`：增加 `mod.default` 类型检查 + 诊断日志

### 4.3 IPC Structured Clone 安全加固

Electron `ipcRenderer.send()` / `ipcRenderer.invoke()` 使用 structured clone 算法，无法序列化 Vue 响应式 Proxy、函数、DOM 节点等。项目中多处从 Pinia 响应式状态直接传递数据到 IPC 边界，导致桌面端运行时抛出 `An object could not be cloned`。

| 文件 | 修复 | 说明 |
|------|------|------|
| `electron/preload.js` | `publishState` 增加 try-catch + JSON fallback | 首次 clone 失败后自动切换到 JSON 序列化路径，缓存标记避免重复异常 |
| `electron/preload.js` | `matchSong` 参数 `[...sources]` 展开 | `unblockSources` 来自 Pinia 响应式数组，直接传入 IPC 会 clone 失败 |
| `src/player/runtimeState.ts` | `sanitizeTrackForIPC()` + `toPlaybackSnapshot()` | 每次 snapshot 创建时剥离非可序列化属性；在 IPC snapshot 构造阶段保留原始 `id` 值（本地歌曲通常为 MD5 字符串），避免在这里提前 `Number()` 强转 |

**同类问题防范**：任何从 Vue 响应式状态传入 IPC 的数据（`ipcRenderer.send` / `invoke`），都需要先转为纯对象。可通过 `JSON.parse(JSON.stringify(...))` 或手动展开。

### 4.4 缓存匹配结果
- [ ] `Map<songId, {url, source, br, size}>`
- [ ] 同一切歌不需要重复匹配
- [ ] 缓存过期策略

## Phase 5 ⏳ 待开发

### 5.1 体验优化
- [ ] 异常降级：Unblock 挂了自动回退官方源
- [ ] 批量匹配：播放列表/歌单逐首匹配 + 进度提示
- [ ] 匹配超时控制（当前 15s）
- [ ] 首次匹配成功后缓存，后续秒切

### 5.2 歌词/封面数据
- [ ] 换源后保留官方源数据（标题、封面、歌手）
- [ ] 不影响歌词同步

## Phase 6 ✅ 已完成 — 全局封面放大统一

### 6.1 统一标准
- [x] 全局 `--image-hover-scale: 1.05`，所有封面统一使用此变量
- [x] 移除所有本地独立 scale 值（HomePanel 1.06、detail-page 1.08）
- [x] 移除 `[class*='cover']` 通配符，改为显式列出所有封面类型
- [x] 清理死代码 `hero-cover-trigger/.hero-cover-image`
- [x] 修复 `AnimatedAppear` 的 `anPopUp` 动画 `fill-mode: both` 锁定 transform 的问题
- [x] 大封面从 JS 内联 `transform` 改为 CSS 变量 `--scroll-transform`

### 6.2 交互动画
- [x] 歌单/专辑/歌手搜索：`.song-item:hover img.song-cover` 行级 hover
- [x] 首页热门音乐：`.song:hover .cover` 行级 hover
- [x] 大封面：`.hero-media-shell:hover .cover` 叠加缩放
- [x] 光标移开平滑回弹，不闪白

### 6.3 全局封面链接
| 封面类型 | CSS 类名 | 元素 | hover 联动 |
|---------|----------|------|:---:|
| 歌单/专辑/搜索列表封面 | `.song-cover` | `<img>` | `.song-item:hover` |
| 首页热门音乐封面 | `.cover` | `<div>` bg | `.song:hover` |
| 排名页各种封面 | `.rank/global/featured/...-cover` | `<img>` | 各自 card:hover |
| 搜索/歌单卡片封面 | `.playlist-card-cover-image` | `<img>` | `.playlist-card-media-shell` |
| 详情页大封面 | `.cover` | `<img>` | `.hero-media-shell:hover` |
| 搜索实体卡片 | `.cover-image` | `<img>` | `.entity-card.clickable:hover` |

## 已知限制

| 问题 | 原因 | 状态 |
|------|------|------|
| 酷狗返回 HTML | 服务器 IP 被拦截 / API 变更 | ❌ 环境问题 |
| 咪咕请求超时 | 网络不可达 | ❌ 环境问题 |
| bilibili 匹配失败 | 同上 | ❌ 环境问题 |
| Netease 官方 API 返回拼接 JSON | 直接访问网易非标准格式 | ❌ 环境问题 |
| **以上限制仅限当前服务器** | **本地开发机连接正常** | ✅ 代码正确 |

## 启动方式

```bash
# 桌面端开发（推荐）— 含 native bridge + HTTP fallback
npm run dev:desktop

# Web 全量开发 — 走独立 HTTP match 服务
npm run dev:web:full

# 或单独启动
npm run dev:api            # Netease API :38761
npm run dev:unblock         # Unblock Proxy :38762
npm run dev:unblock-match   # Match Server :38763
npm run dev:web             # Vite :5173
```

## 当前桌面端与 Web 端路由说明

### Electron 桌面端（native bridge 优先 + HTTP fallback）

```
渲染进程 (renderer)
  ├─ tryUnblockMatch(id, sources)
  ├─ 1. 检测 hasNativeUnblockBridge → true
  ├─ 2. IPC → unblock:match-song
  │     └─ Electron 主进程 → nativeUnblockMatchSong()
  │           └─ @unblockneteasemusic/server match()（内嵌）
  │
  ├─ 有 URL → 使用，播放 ✓
  └─ 无 URL → fall through → HTTP fallback
        └─ fetch(http://127.0.0.1:{unblockMatch}/match)
              └─ 独立 match 服务 → match() → 替代 URL
```

关键文件：

| 文件 | 作用 |
|------|------|
| `electron/unblock-native-match.js` | 内置 match 核心：`initNativeUnblockMatch()` / `nativeUnblockMatchSong()` |
| `electron/main.js` | 启动链路初始化 + IPC handler 注册 |
| `electron/preload.js` | 暴露 `window.appEnv.unblockBridge` |
| `src/utils/platform.ts` | `hasNativeUnblockBridge` / `unblockBridge` getter |
| `src/api/unblock.ts` | 渲染层 match 路由（native bridge → HTTP fallback） |
| `scripts/start-desktop.mjs` | 开发模式启动外部 match 服务作为 fallback |

### Web 端（走独立 HTTP 服务）

```
渲染进程
  ├─ tryUnblockMatch(id, sources)
  ├─ hasNativeUnblockBridge → false
  └─ HTTP → :38763/match?id=...&sources=...
        └─ 独立 match 服务 → match() → 替代 URL
```

- Web 端没有 `window.appEnv.unblockBridge`
- `src/api/unblock.ts` 直接走 `platform.unblockMatchUrl` 的 HTTP 接口
- `dev:unblock-match` 给 Web 端使用；桌面端开发模式也会启动此服务作为 fallback

### 两者共同的音频代理路径

无论是 native bridge 还是 HTTP match 返回的替代 URL，播放时都通过 Vite 中间件代理：

```
unblock URL → /dl-proxy?url=... → Vite dev server 中间件（添加 CORS 头）→ 音频流
```
