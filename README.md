# Resound-Player

Resound-Player 是一个基于 `Vue 3 + TypeScript + Vite + Electron` 构建的音乐播放器项目，围绕网易云音乐生态、桌面端沉浸式播放体验和本地音乐管理能力持续演进。

当前仓库已经完成 `v1.0.2` 发布，既可以作为桌面应用继续迭代，也保留了 Web 调试与独立部署能力。

## 项目现状

- 当前版本：`1.0.2`
- 主要形态：`Electron` 桌面应用
- 调试形态：支持 `Web` 前端单独运行或前后端联调
- 桌面端状态：开发模式会自动拉起 `Vite + Netease API + Unblock Proxy + Unblock Match`
- 代码库状态：已沉淀较完整的页面体系、播放链路、桌面端桥接能力和工程文档

## 核心能力

### 在线内容与播放

- 首页推荐、搜索、歌单、专辑、歌手、排行榜、MV、播客、有声书、用户中心、历史记录、设置页
- 统一详情页模型与通用 Hero / Sticky 交互
- 底部播放器、展开态播放器、播放队列、评论页
- 官方音源优先、按需解析播放 URL、失败后自动降级或回退
- 音源替换能力，支持 `bodian / kugou / migu / qq / bilibili`
- 下载弹窗、歌词下载、多档音质选择
- Apple Music 风格歌词渲染与自定义歌词渲染双路线共存

### 桌面端专属

- Electron 内嵌 API 启动链路与端口自动探测
- 原生 Unblock 匹配桥，HTTP match 服务作为 fallback
- 迷你模式、系统托盘控制、播放状态同步
- 桌面歌词浮窗（滚动列表 / 单行 / 双行）
- macOS 菜单栏歌词
- 本地音乐扫描、播放、封面缓存、最近播放与统计
- 本地歌单管理
- 本地歌曲歌词匹配、缺失标签补全、写入回滚

### 本地音乐能力边界

本地音乐仅在桌面端启用，扫描器当前支持：

- `mp3`
- `flac`
- `wav`
- `ogg`
- `m4a`
- `aac`
- `wma`
- `ape`
- `dsf`
- `opus`
- `aiff`
- `alac`

## 技术栈

### 前端

- `Vue 3`
- `TypeScript`
- `Vite`
- `@tanstack/vue-query`
- `@tanstack/vue-virtual`
- `lucide-vue-next`
- `axios`

### 桌面端

- `Electron`
- `electron-builder`

### 音乐与歌词相关

- `@neteasecloudmusicapienhanced/api`
- `@unblockneteasemusic/server`
- `@applemusic-like-lyrics/*`
- `sql.js`

## 开发环境

建议使用：

- `Node.js 22+`
- `npm 10+`

安装依赖：

```bash
npm install
```

## 快速开始

### 1. 桌面端开发

最常用的启动方式：

```bash
npm run dev
```

等价于：

```bash
npm run dev:desktop
```

该命令会自动启动：

- `Vite` 开发服务器
- `Netease API`
- `Unblock Proxy`
- `Unblock Match`
- `Electron`

默认涉及端口：

- `5173`：Vite
- `38761`：Netease API
- `38762`：Unblock Proxy
- `38763`：Unblock Match

项目内置端口探测与开发启动编排；端口被占用时会优先尝试清理默认端口，再按实际可用端口启动服务。

### 2. 仅启动 Web 前端

```bash
npm run dev:web
```

适合只调页面和交互，不自动启动 API / 桌面壳。

### 3. Web 全链路联调

```bash
npm run dev:web:full
```

该模式会并行启动：

- `Netease API`
- `Unblock Proxy`
- `Unblock Match`
- `Vite`

### 4. 仅启动 API

```bash
npm run dev:api
```

### 5. 单独启动音源替换服务

```bash
npm run dev:unblock
npm run dev:unblock-match
```

### 6. Headless 桌面调试

```bash
npm run dev:desktop:headless
```

适合 CI、远程图形环境或无桌面交互场景。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动桌面开发环境 |
| `npm run dev:desktop` | 启动桌面开发编排器 |
| `npm run dev:desktop:headless` | Headless 桌面开发模式 |
| `npm run dev:web` | 仅启动前端页面 |
| `npm run dev:web:full` | 启动前端与独立 API / 音源服务 |
| `npm run dev:api` | 单独启动 Netease API |
| `npm run dev:unblock` | 启动音源替换代理 |
| `npm run dev:unblock-match` | 启动音源匹配服务 |
| `npm run build:web` | 构建 Web 前端产物 |
| `npm run pack:desktop` | 打包桌面目录产物 |
| `npm run build:desktop` | 构建 Linux AppImage |
| `npm run dist:linux` | 生成 Linux AppImage |
| `npm run dist:linux:deb` | 生成 Linux deb 包 |
| `npm run dist:win` | 生成 Windows 安装包 |
| `npm run pack:win` | 生成 Windows dir 包 |
| `npm run dist:mac` | 生成 macOS dmg |
| `npm run pack:mac` | 生成 macOS dir 包 |
| `npm run clean:desktop` | 清理桌面构建产物 |
| `npm run check:animated-rhythm` | 检查统一动画节奏配置 |
| `npm run fix:animated-rhythm` | 自动修正动画节奏配置 |
| `npm start` | 直接启动 Electron 应用 |

## 构建与发布

### Web 构建

```bash
npm run build:web
```

如果需要部署到子路径，可指定：

```bash
VITE_BASE_URL=/music/ npm run build:web
```

### 桌面打包

```bash
# Linux
npm run dist:linux
npm run dist:linux:deb

# Windows
npm run dist:win

# macOS
npm run dist:mac
```

Electron 打包配置位于 `package.json` 的 `build` 字段，当前已配置：

- Linux：`AppImage`、`deb`
- Windows：`nsis`
- macOS：`dmg`

## Web 与桌面端差异

### Web 端可用

- 在线内容浏览与播放
- 搜索、歌单、详情页、MV、播客、评论、设置等前端能力
- 独立部署到 Nginx / Docker / PM2 环境

### 仅桌面端可用

- 本地音乐
- 桌面歌词
- macOS 菜单栏歌词
- 系统托盘控制
- 迷你模式
- 本地标签写入 / 回滚
- 文件系统访问与本地封面缓存

## 目录结构

```text
.
├── build/                     # 图标与构建资源
├── deploy/                    # Nginx / Docker / PM2 部署文件
├── docs/                      # 架构、规范、功能说明
├── electron/                  # Electron 主进程、预加载、桌面服务
│   └── services/              # 本地音乐、扫描、IPC、元数据写入
├── scripts/                   # 启动、构建、修复、检查脚本
├── server/                    # Unblock Match 服务
├── src/
│   ├── api/                   # API 访问层
│   ├── components/            # 页面组件与通用组件
│   ├── composables/           # 复用逻辑
│   ├── config/                # 音质、音源等配置
│   ├── player/                # 播放解析与运行时控制
│   ├── stores/                # 全局状态
│   ├── styles/                # 主题、动画、详情页样式
│   ├── utils/                 # 平台、图片、性能、存储工具
│   └── views/                 # 本地音乐等子视图
├── README.md
├── package.json
└── vite.config.ts
```

## 核心架构摘要

### 播放链路

- 用户触发播放后再按需解析歌曲 URL，而不是页面加载时批量请求
- 官方源优先，失败后按音质回退，再视设置走 Unblock
- 当前实际交付音质与用户默认偏好分离展示

### 桌面启动链路

- 开发模式由 `scripts/start-desktop.mjs` 统一编排
- 自动探测服务端口并注入到 Electron preload
- 渲染进程通过 `window.appEnv` 和 `window.localApi` 使用桌面能力

### 本地音乐链路

- 主进程使用 `sql.js` 维护本地曲库
- 通过 IPC 暴露目录扫描、封面读取、歌词匹配、标签写入与歌单 CRUD
- 渲染进程通过 `src/stores/localMusic.ts` 统一消费桌面能力

## 部署说明

生产部署文档见：

- [deploy/README.md](./deploy/README.md)

当前提供：

- `pm2 + Nginx`
- `Docker Compose`
- 仅前端 Docker 部署

## 文档入口

优先阅读：

- [docs/README.md](./docs/README.md)
- [统一架构说明](./docs/统一架构说明.md)
- [播放链路说明](./docs/播放链路说明.md)
- [本地歌曲功能开发实现总结](./docs/本地歌曲功能开发实现总结.md)
- [本地歌词匹配与标签补全复用说明](./docs/本地歌词匹配与标签补全复用说明.md)
- [桌面歌词功能说明](./docs/桌面歌词功能说明.md)
- [macOS 菜单栏歌词功能说明](./docs/macOS%20菜单栏歌词功能说明.md)
- [下载流程说明](./docs/下载流程说明.md)
- [音质体系说明](./docs/音质体系说明.md)
- [跨平台开发规范](./docs/跨平台开发规范.md)

## 相关仓库信息

- GitHub 仓库：<https://github.com/tingwensuojian/Resound-Player>
- Release 页面：<https://github.com/tingwensuojian/Resound-Player/releases>

