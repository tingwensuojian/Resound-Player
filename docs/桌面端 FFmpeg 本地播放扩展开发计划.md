# 桌面端 FFmpeg 本地播放扩展开发计划

## 概述

当前项目本地音乐播放在桌面端仍然依赖：

- `HTMLAudioElement`
- `Blob URL`
- Chromium / Electron 原生解码能力

这条链路对常见格式已经足够稳定，但天然受 Chromium 可解码容器与编解码范围限制。

已知现象：

- `wma` 当前应先停止扫描入本地曲库
- 即使勉强入库，也无法稳定原生播放
- 修正 MIME 后也不能从根本上解决 `ASF/WMA` 解码能力缺失问题

因此，后续桌面端本地音乐如果要支持更多格式，必须引入“**独立解码后端**”。

本计划的目标不是立刻重写整个播放器，而是在保留当前播放主链路的前提下，先新增一条 **FFmpeg fallback** 路线，用来兜底 Chromium 不支持或明显不稳定支持的本地格式。

---

## 计划目标

本计划聚焦桌面端本地音乐扩展播放能力。

要达到的目标：

- 保留现有原生播放链路
- 先完成 `wma` 的 FFmpeg fallback 播放链路
- 在播放链路稳定前，`wma` 先不扫描入库
- 为 `ape / dsf / 其他冷门格式` 预留同一路径
- 保证用户点击播放时有明确反馈，而不是静默失败
- 支持在设置中配置本地音频解码模式
- 为后续“常驻解码后端”预留接口，但本期不开发

---

## 当前现状

当前本地播放实现方式：

1. Renderer 请求主进程读取本地文件
2. 主进程通过 `readFile(path)` 返回 `ArrayBuffer`
3. Renderer 生成 `Blob URL`
4. `HTMLAudioElement` 播放该 `Blob URL`

现状判断：

- 这是一个“浏览器式音频播放链路”
- 播放能力上限取决于 Chromium 原生解码能力
- 不是一个“桌面原生音频引擎”

这意味着：

- `mp3 / flac / m4a / aac / wav / ogg / opus` 可继续沿用
- `wma` 当前既不能继续依赖 Chromium，也不应继续默认扫描入库

---

## 核心判断

### 1. `wma` 当前不适合原生播放

对样本文件实测结果：

- 容器可识别为 `ASF/audio`
- 编码可识别为 `Windows Media Audio V8`
- 但 Chromium 播放链路不具备稳定支持能力

因此：

- `wma` 不应继续尝试作为“正常原生格式”去播放
- 后续必须进入“回退播放”路径
- 在回退播放链路完成前，扫描层应先移除 `.wma`

### 2. 不能依赖“先播放失败再回退”

本地格式播放失败并不总会快速抛错。

实际风险：

- 可能只是卡住
- 可能无声失败
- 可能让用户感知为“点了没反应”

所以：

- 必须先根据扩展名和已知能力做前置决策
- 对已知不支持格式直接走 fallback
- 不把“原生失败后再决定”作为第一阶段默认策略

### 3. FFmpeg 是阶段 A 最现实的桌面扩展方案

FFmpeg 的作用不是替换整个播放器，而是补一层“格式兼容解码”：

- 原生可播格式：继续原生
- 原生不可播格式：先用 FFmpeg 解码，再回到当前安全播放链路

---

## 总体方案

## 阶段 A：FFmpeg fallback playback

阶段 A 只做一件事：

- 对不支持原生播放的本地文件，使用 FFmpeg 解码为“当前播放器可播放的临时产物”，再继续由 `HTMLAudioElement` 播放

关键点：

- 保留当前播放器主链路
- 不进入常驻音频后端
- 不做实时 PCM 推流
- 不重写 MediaSession / EQ / 播放进度体系

## 阶段 B：FFmpeg 常驻音频后端

阶段 B 本次只预留，不开发。

未来若进入阶段 B，方向应是：

- 不再依赖 `HTMLAudioElement` 作为所有本地格式的唯一播放后端
- 建立真正的桌面音频引擎
- 由原生侧或独立后端直接控制解码、播放、seek、暂停、恢复

本计划只要求在阶段 A 的设计中留出这条升级路径。

---

## 审计后锁定的关键决策

### 1. 采用双播放后端

后续桌面端本地播放分为：

- `native`
- `ffmpeg-fallback`

### 2. `wma` 第一阶段先不入库，完成 fallback 后再开放

第一阶段先做：

- 扫描层移除 `.wma`
- 避免继续出现“能进库但不能稳定播放”的体验错位

待以下条件都满足后，再恢复 `.wma` 入库：

- `FFmpeg fallback playback` 打通
- 首播、暂停、恢复、seek、切歌验证通过
- 缓存与任务取消机制稳定

恢复入库后：

- `wma` 不继续尝试原生播放
- 默认直接走 fallback

### 3. 不把“临时 wav 文件”作为默认长期输出

虽然 `wav` 最容易验证链路，但问题明显：

- 文件太大
- 首播等待更长
- 长音频缓存体积失控

因此第一阶段建议：

- 默认输出 `opus` 或 `aac`
- 仅保留 `wav` 作为调试或兜底模式

### 4. FFmpeg 输出物不能直接给前端文件路径

必须重新接回现有安全链路：

1. 主进程生成缓存文件
2. Renderer 再通过 `readFile(cachePath)` 读取
3. 生成 `Blob URL`
4. `HTMLAudioElement` 播放

### 5. 第一阶段不开放 `仅 FFmpeg`

本期只开放保守设置项：

- `自动`
- `优先原生`

不开放：

- `优先 FFmpeg`
- `仅 FFmpeg`

这些只保留为内部实验位。

### 6. 单次只允许一个有效解码任务

必须限制并发，避免：

- 快速切歌时 CPU 打满
- 磁盘缓存污染
- 旧任务结果覆盖新播放

---

## 详细设计

## 一、播放后端抽象

建议新增目录：

- `electron/services/playback/`

建议新增模块：

- `PlaybackCapabilityService`
- `FfmpegPlaybackService`
- `TempAudioCacheService`

建议新增前端内部类型：

- `LocalPlaybackMode`
- `LocalPlaybackBackendType`
- `PlaybackResolveResult`

### `PlaybackCapabilityService`

职责：

- 判断扩展名
- 判断当前设置模式
- 判断文件走哪条播放后端

输出结果：

- `native`
- `ffmpeg-fallback`
- `unsupported`

### `FfmpegPlaybackService`

职责：

- 检测 FFmpeg 是否可用
- 校验 FFmpeg 路径
- 管理解码任务
- 触发格式解码
- 返回缓存产物路径

### `TempAudioCacheService`

职责：

- 生成缓存键
- 复用已生成结果
- 文件变化时自动失效
- 清理旧缓存

---

## 二、播放决策规则

### 直接原生播放

继续使用原生播放的格式：

- `mp3`
- `flac`
- `m4a`
- `aac`
- `wav`
- `ogg`
- `opus`

### 第一阶段直接 fallback

- 无

说明：

- `wma` 在第一阶段先不扫描入库
- 因此第一阶段还不会进入前端播放决策链

### 第二阶段候选

优先恢复：

- `wma`

待真实样本验证后考虑加入：

- `ape`
- `dsf`

### 第一阶段禁止行为

- 禁止继续扫描 `.wma` 入库后让用户点击失败
- 禁止让 `wma` 先尝试原生，再慢回退

---

## 三、FFmpeg 输出格式策略

### 默认输出格式

优先建议：

- `opus`
  或
- `aac`

原因：

- 缓存文件体积小于 `wav`
- 更适合长期 fallback 缓存
- 首播等待与磁盘占用更可控

### 调试兜底

保留：

- `wav`

用途：

- 调试
- 某些平台编码链路失败时的技术兜底

说明：

- `wav` 不作为公开默认策略

---

## 四、FFmpeg 接入方式

本期目标不是“下载完 FFmpeg 就自动原生播所有格式”，而是为项目新增桌面端兼容解码层。

### 接入方式建议

优先考虑：

- 桌面端内置 FFmpeg

原因：

- 用户无感知
- 行为可控
- 易复现问题

### 在线下载的风险

如果选择运行时下载 FFmpeg，会带来：

- 首次使用必须联网
- 下载失败和重试逻辑
- 路径配置与权限问题
- 版本一致性问题
- Windows / macOS 安全策略差异

因此第一期更建议：

- 平台内置 FFmpeg
- 设置中再允许切换到系统路径或自定义路径

---

## 五、设置页设计

建议新增设置项：

### 本地音频解码模式

第一阶段只公开：

- `自动（推荐）`
- `优先原生`

说明：

- `自动`
  - 原生支持格式走原生
  - 明确不支持格式走 FFmpeg fallback

- `优先原生`
  - 当前与 `自动` 行为接近
  - 主要为后续策略升级预留

### FFmpeg 来源

第一阶段建议支持：

- `内置 FFmpeg`
- `系统环境`
- `自定义路径`

### FFmpeg 状态展示

设置页应展示：

- 是否检测到 FFmpeg
- 当前使用来源
- 当前版本
- 最近一次检测结果

### 缓存管理

建议设置页支持：

- 清理本地解码缓存

第一阶段可以不做更复杂的缓存策略 UI。

---

## 六、IPC 设计

建议新增 IPC：

- `local:playback-resolve({ filePath })`
- `local:ffmpeg-check()`
- `local:ffmpeg-set-path({ path })`
- `local:playback-cache-clear()`

### `local:playback-resolve`

建议返回：

```ts
{
  success: boolean
  mode: 'native' | 'ffmpeg-fallback' | 'unsupported'
  cachePath?: string
  originalPath: string
  generated: boolean
  cached: boolean
  outputFormat?: 'opus' | 'aac' | 'wav'
  message?: string
}
```

注意：

- 只返回缓存产物路径
- Renderer 仍需自己再次走 `readFile(cachePath)`
- 不直接返回可播放 URL

---

## 七、前端播放接入方式

修改 [player.ts](/Users/sangxuesheng/Downloads/gemini音乐/src/stores/player.ts) 的本地播放逻辑。

### 原生模式

继续：

- `readFile(originalPath)`
- `Blob URL`
- `HTMLAudioElement`

### fallback 模式

改为：

1. `local:playback-resolve`
2. 得到 `cachePath`
3. `readFile(cachePath)`
4. 生成 `Blob URL`
5. 继续走现有 `switchAudioSource()`

### unsupported

直接提示：

- `当前格式暂不支持播放`

---

## 八、任务并发与取消模型

### 单活动任务

前台播放同一时刻最多允许一个有效解码任务。

### 同参数任务复用

同一文件、同一输出格式、同一文件状态：

- 若已有进行中的解码任务
- 直接复用 Promise

### 切歌取消

切歌后：

- 旧任务应尽量取消
- 即使取消失败，结果返回时也必须丢弃

### 过期结果拦截

必须结合 `requestSeq` 或等价机制：

- 旧任务结果不允许污染新播放状态

---

## 九、缓存策略

### 缓存键

基于：

- `filePath`
- `mtime`
- `fileSize`
- `decodeProfileVersion`
- `outputFormat`

### 缓存目录

建议：

- `userData/local-audio-cache/`

### 缓存清理

第一阶段先实现：

- 启动时清理超期缓存
- 超大小时按 LRU 删除
- 用户手动清理缓存

### 第一阶段不做

- 不做全库预热
- 不做后台批量转码

---

## 十、阶段 A 的播放语义边界

为了避免实现偏离，本期明确限制：

- 阶段 A 只支持“整首解码完成后播放”
- 不做边解码边播
- 不做分段解码
- 不做实时 PCM 推流

这样可以最大限度复用当前：

- 播放时长
- seek
- 暂停恢复
- 进度条行为

---

## 十一、实施里程碑

## Milestone 1：播放能力抽象与设置接入

- 新增本地播放模式类型
- 新增播放能力判断服务
- 设置页新增“本地音频解码模式”
- 设置页新增 FFmpeg 检测与路径配置
- 扫描层移除 `.wma`
- 让 `wma` 从“误入库后静默失败”变为“当前先不入库，待 fallback 完成后再开放”

## Milestone 2：FFmpeg fallback V1（先打通 `wma`）

- 新增 `FfmpegPlaybackService`
- 新增 `TempAudioCacheService`
- 新增 `local:playback-resolve`
- 输入：
  - `.wma`
- 输出：
  - 默认 `opus / aac`
  - 必要时 `wav` 兜底
- 前端重新通过 `readFile(cachePath)` 接回播放器
- 完成后再恢复 `.wma` 扫描入库

## Milestone 3：任务取消与缓存复用

- 单活动任务
- 同参数任务复用
- 切歌取消
- 过期结果丢弃
- 缓存命中复用
- 缓存清理

## Milestone 4：真实样本验证

目标样本：

- `/Users/sangxuesheng/Downloads/合并/富士山下 wma - 陈奕迅.wma`
- `/Users/sangxuesheng/Downloads/合并/最佳损友 wma - 陈奕迅.wma`

验证内容：

- 首播
- 暂停/恢复
- 拖动进度
- 切歌
- 缓存复用
- 文件变化后缓存失效

## Milestone 5：为阶段 B 预留抽象

- 抽象 `PlaybackBackend`
- 允许未来共存：
  - `NativePlaybackBackend`
  - `FfmpegFallbackBackend`
  - `FfmpegStreamingBackend`

本次只保留接口位，不实现常驻解码后端。

---

## 十二、风险与限制

### 包体积

若内置 FFmpeg：

- 应用包体会显著增大

### 首播等待

fallback 模式下：

- 首次播放需要等待解码完成

### 缓存管理

若输出产物过大：

- 会增加磁盘占用

### 编码链路差异

不同平台上：

- `opus / aac` 输出方案可能存在细节差异

因此需要保留 `wav` 调试兜底位。

---

## 十三、后续不立即开发的部分

当前先不做：

- 常驻 FFmpeg 实时播放引擎
- 在线下载 FFmpeg
- `wma` 恢复扫描入库
- `ape / dsf` 正式接入
- 强制 FFmpeg 全量播放模式
- 全库预解码

这些内容后续如要继续推进，再基于阶段 A 的真实运行结果决定。

---

## 十四、当前结论

后续桌面端如果要扩展更多本地音频格式播放能力，最稳妥的路线是：

- 保留现有原生播放链路
- 新增 FFmpeg fallback 兼容层
- 第一阶段先让 `wma` 暂停入库
- 再用 FFmpeg fallback 打通 `wma` 播放
- 验证稳定后恢复 `.wma` 扫描入库
- 先确保回退路径稳定，再扩更多格式

本文件为后续开发基线，当前先整理归档，不在本轮继续实现。
