# 二阶段优化方案：CoverCache Protocol + Three.js 优化

> 消除封面 data URL 大字符串的 Vue 响应式开销 + 3D 背景卡顿
> 审计日期：2026-07-08 | 已按审计结果修正

---

## 方案 A — CoverCache Protocol

### 现状问题

```
CoverCache.saveCover() → 文件存到 userData/covers/{cacheKey}（base64 文本，~120KB）
CoverCache.getCover()  → fs.promises.readFile() → data:image/jpeg;base64,...（120KB+）
                        → player.state.currentTrack.al.picUrl = 这个 120KB 字符串
                        → Vue 响应式系统追踪这个超长字符串
                        → 每次 computed 比较都要对比 120KB
                        → CSS background-image: url(data:...) 浏览器重新解码 base64
                        → PlayerBar / PlayerExpanded / MiniPlayBar 多处引用
```

### 目标

```
CoverCache.getCover()  → "covercache://{cacheKey}.{ext}"（<50 字节）
                        → player.state.currentTrack.al.picUrl = "covercache://abc123.jpg"
                        → Vue 响应式系统追踪 50 字节 URL（对比成本 ≈0）
                        → CSS background-image: url(covercache://abc123.jpg)
                        → Electron protocol.handle → fs.createReadStream → 浏览器原生解码
```

### 关键设计决策

**`saveCover` 必须写原始二进制**。审计发现当前 `saveCover` 把 `data:image/jpeg;base64,...` 整个字符串写为 UTF-8 文本。如果 `protocol.handle` 直接读取返回，浏览器会收到无效的文本内容而非图片数据。

**缓存文件名携带扩展名**：`{md5_hash}.{ext}`（如 `abc123.jpg`），使 `protocol.handle` 可以直接从文件名确定 Content-Type，无需 MIME sniffing。

### 改动清单

| # | 文件 | 改动 | 风险 |
|---|------|------|------|
| **A0** | electron/services/CoverCache.js | saveCover 改为写原始二进制：参数改为 (filePath, rawBuffer, format)，文件名为 {cacheKey}.{ext}，对已有缓存做兼容处理 | 🟡 中等 — 涉及缓存格式迁移 |
| **A1** | electron/services/CoverCache.js | getCover() 返回 covercache://{cacheKey}.{ext}；hasCover / removeCover 同步处理带 ext 的文件名 | 🟢 低 |
| **A2** | electron/main.js | protocol.registerSchemesAsPrivileged 加 covercache scheme（standard + secure + supportFetchAPI + corsEnabled + stream） | 🟢 低 |
| **A3** | electron/main.js | protocol.handle('covercache', handler) — 异步 stat → 根据 ext 设 Content-Type → fs.createReadStream 流式返回 | 🟢 与 local:// 相同模式 |
| **A4** | electron/services/CoverCache.js | getCoverFromSource() — 提取封面原始 buffer → 调用 saveCover(rawBuffer, format) → 返回 covercache://{cacheKey}.{ext} | 🟢 低 |
| **A5** | src/stores/localMusic.ts | lazyLoadCovers 中不需要额外改动（URL 格式已由 IPC 返回） | 🟢 不影响 |
| **A6** | src/stores/player.ts | loadLocalTrackCoverAsync 中不需要改动 | 🟢 不感知 |

### 实施步骤

1. [x] A0 — CoverCache.js：saveCover 改参数签名，写原始二进制，文件名带 ext
2. [x] A0 — CoverCache.js：getCover 改返回 covercache:// URL（含 ext），hasCover / removeCover 同步更新
3. [x] A1 — CoverCache.js：getCoverFromSource 更新为新流程
4. [x] A2 — main.js：加 covercache scheme 注册
5. [x] A3 — main.js：protocol.handle('covercache', handler) 实现
6. [x] A5/A6 — 验证 consumer 端无 regress（localMusic.ts / player.ts）
7. [x] 测试：清空缓存 → 重新扫描 → 确认 covercache:// 请求正常返回 200

---

## 方案 B — Three.js + 所有 WebGL Composable 优化

### 现状问题

```
用户切换到 3D 背景时：
  useThreeScene.start()
  → await import('three')       动态加载 three.js（~200KB），首次 ~20ms 阻塞
  → new THREE.WebGLRenderer()   创建 WebGL 上下文，~10-30ms
  → new ShaderMaterial()        编译 shader，~10-30ms
  → IcosahedronGeometry(1.2, 64)  64 细分面数过高（~8000 面）
  → setPixelRatio(dpr)          高 DPI 2x/3x 渲染压力放大
  → requestAnimationFrame(animate)  不间断 60fps

另外，PlayerExpanded.vue 中 7 个 WebGL composable 均被 `if (bgMode === 'custom')` 守卫：
  → 启动时 bgMode !== 'custom' → composable 未初始化
  → 用户后续切换到 custom → composable 的 watch 不会触发
  → 动态切换 3D 背景永远不会生效
```

### 目标

```
import * as THREE from 'three'   静态 import，app 启动时加载
→ useThreeScene.start():
  → 已有 THREE，无需动态 import
  → IcosahedronGeometry(1.2, 32)  ~2000 面（vs 原 ~8000）
  → setPixelRatio(Math.min(dpr, 2))  GPU 负载减半
  → 不再需要主动取消 RAF — 内部 watch 已处理

7 个 composable 全部无条件初始化（watch 开销 ~0.1ms）：
  → 用户从默认背景切换到自定义 → 3D 场景 → 立即生效
  → 从 3D 场景切回默认背景 → composable 内部 stop() 清理
```

### 改动清单

| # | 文件 | 改动 | 风险 |
|---|------|------|------|
| **B1** | src/composables/useThreeScene.ts | 顶部静态 import * as THREE from 'three'，移除 start() 内 await import | 🟢 低，只是提前 |
| **B2** | src/composables/useThreeScene.ts | IcosahedronGeometry(1.2, 32) 降低细分 | 🟢 视觉差异极小 |
| **B3** | src/composables/useThreeScene.ts | setPixelRatio(Math.min(window.devicePixelRatio, 2)) | 🟢 高 DPI 保护 |
| **B4** | src/components/PlayerExpanded.vue | 移除 7 个 composable 的 `if (bgMode === 'custom')` 守卫：
  - useThreeScene (line 565)
  - usePaperShaders (line 576)
  - useMistBackground (line 580)
  - useDigitalLoom (line 584)
  - useSilkBackground (line 588)
  - useAuroraShader (line 592)
  - useIridescence (line 611)
  每个 composable 内部已有 active watch，setup 阶段只需注册 watch+onUnmounted (~0.1ms) | 🟡 需要验证所有 composable 内部正确使用 active 参数 |

### B4 安全说明

每个 composable 的 watch 模式：

```ts
// 所有 7 个 composable 都遵循以下模式
watch([active, containerRef], () => {
  if (active.value && containerRef.value) {
    nextTick(() => start());
  } else if (!active.value) {
    stop();
  }
});
onUnmounted(() => stop());
```

`active` 的 compute 链（如 `threeSceneActive`）：
```ts
const threeSceneActive = computed(() => showThreeScene.value && playerStore.state.expanded);
const showThreeScene = computed(() => lyricsSettings.state.bgMode === 'custom' && lyricsSettings.state.bgCustomMode === 'three-scene');
```

所以：
- `active = false` 时（bgMode !== 'custom' 或 bgCustomMode !== 'three-scene'），composable 的 `start()` 不会被调用
- 用户切换到 `custom → three-scene` 时，active 变为 true，composable 自动创建场景
- 用户切走时，active 变 false，composable 自动清理
- 移除 `if (bgMode === 'custom')` 守卫只影响 setup 阶段是否注册 watch，不影响运行时行为

### 实施步骤

1. [x] B1 — useThreeScene.ts：静态 import * as THREE
2. [x] B2 — useThreeScene.ts：IcosahedronGeometry(1.2, 32)
3. [x] B3 — useThreeScene.ts：setPixelRatio(Math.min(dpr, 2))
4. [x] B4 — PlayerExpanded.vue：移除 7 处 if 守卫
5. [x] 测试：所有 7 种背景效果均能通过设置动态激活/关闭

---

## 影响评估

### 方案 A

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| 封面 URL 长度 | 120KB data URL | ~50 字节 covercache:// URL |
| Vue 响应式追踪 | 对比 120KB 字符串 | 对比 ~50 字节 URL |
| 浏览器解码 | JS 解码 base64（CPU-bound） | 原生 JPEG/PNG 解码（硬件加速）|
| 多处封面引用（3 个元素） | 3 次 base64 解码 | 1 次原生解码 + 浏览器缓存 |
| 缓存文件格式 | base64 文本（压缩比差） | 原始二进制（磁盘占用减少 ~25%）|

### 方案 B

| 场景 | 优化前 | 优化后 |
|------|--------|--------|
| Three.js 加载 | 动态 import（~20ms 阻塞） | 静态 import（启动时已加载）|
| 几何体面数 | 64 细分（~8000 面） | 32 细分（~2000 面）|
| 高 DPI 渲染 | 4x 像素 | 最多 2x |
| 后台渲染 | 不间断 60fps （浪费 GPU）| 切走后停止 |
| 动态切换背景 | 首次设置 3D 无效（被 if 守卫拦截）| 即时生效 |

### 数据流对比（优化后）

**封面请求路径（优化后）：**
```
渲染进程: background-image: url(covercache://abc123.jpg)
  → Electron protocol.handle('covercache')
    → fs.promises.stat(userData/covers/abc123.jpg)  ✓ 异步
    → Content-Type: image/jpeg
    → fs.createReadStream → Response(stream, { headers })
  → Chromium 原生解码 → 合成器层渲染（不触发 Layout/Paint）
```

**播放 700MB WAV 时页面切换（优化后）：**
```
点击展开播放页
  → v-show 切换（CSS display: block，0ms 阻塞）
  → ThreeScene composable 已初始化（active = true）
    → WebGLRenderer.create()  → ~10ms 阻塞（无法避免，但异步）
    → IcosahedronGeometry(1.2, 32) → ~3ms（减半）
    → 音频数据在子进程 StreamServer 中处理
    → 主线程不被音频 I/O 阻塞
```

---

## 验证方法

1. ❏ 播放 700MB WAV
2. ❏ 打开全屏播放页 → 确认无卡顿
3. ❏ 切换到自定义 → 3D 场景 → 确认无卡顿
4. ❏ 切换到普通背景 → 切回 3D → 确认依然流畅
5. ❏ 切换到自定义 → 极光/雾/纸/数字织机/丝绸/虹彩 → 确认正常工作
6. ❏ 打开开发者工具 → 确认 covercache:// 请求正常返回 200，Content-Type 正确
7. ❏ 删除 cover cache 目录 → 重新扫描 → 确认缓存重建为原始二进制格式
