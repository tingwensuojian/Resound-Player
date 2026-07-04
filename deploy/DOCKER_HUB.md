# Resound-Player — Docker 镜像使用指南

## 镜像信息

| 字段 | 值 |
|------|-----|
| 镜像名 | `tingwensuojian/resound-player-server` |
| 版本 | `{{VERSION}}` |
| 架构 | All-in-One（Nginx + Netease API + Unblock Proxy + Unblock Match） |

## 快速开始

### 前置条件

- Docker 24+

### 一键部署

```bash
docker run -d \
  --name resound-player \
  -p 38760:80 \
  tingwensuojian/resound-player-server:{{VERSION}}
```

打开浏览器访问 `http://localhost:38760`。

## 架构

单容器内包含全部服务：

```
┌─────────────────────────────────────┐
│         resound-player-server       │
│                                     │
│  Nginx:80 ──→ /api/* → API:38761   │
│              /unblock/* → Match:38763 → Proxy:38762
│              /dl-proxy?url=... → Match:38763
│              /* → SPA index.html    │
└─────────────────────────────────────┘
```

- **Nginx** — SPA 静态文件服务、API 反向代理、`/dl-proxy` 音频代理
- **Netease API** — 网易云音乐数据接口（端口 38761）
- **Unblock Match Server** — 匹配替代音源（端口 38763）
- **Unblock Proxy** — 转发并替换音频源（端口 38762）

## 环境变量

镜像支持以下环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `38761` | Netease API 服务端口 |
| `NODE_ENV` | `production` | 运行环境 |
| `ENABLE_FLAC` | `true` | 启用 FLAC 无损音源匹配 |
| `UNBLOCK_SOURCES` | `bodian,kugou,migu,qq,bilibili` | 音源优先级列表 |

### 自定义配置示例

```bash
docker run -d \
  --name resound-player \
  -p 38760:80 \
  -e UNBLOCK_SOURCES="kugou,qq,migu" \
  -e ENABLE_FLAC=false \
  tingwensuojian/resound-player-server:latest
```

## 数据持久化

镜像设计为无状态运行，所有配置通过环境变量注入。会话认证依赖浏览器 Cookie，无需额外持久化。

## HTTPS 配置

建议在容器前使用反向代理（如 Nginx Proxy Manager、Caddy、Traefik）终止 SSL，或参考项目 `deploy/` 目录下的 Let's Encrypt 配置示例。

## 已知限制

- Unblock 音源匹配依赖外部 CDN（kuwo.cn、migu 等），部分环境可能无法访问
- 前端 JS 包约 1.6MB（未做代码拆分），首次加载可能较慢
- 当前为单机部署设计，高可用场景需自行扩展

## 项目信息

- 技术栈：Vue 3 + Vite + Nginx + Node.js
- 源码：[GitHub 仓库](https://github.com/tingwensuojian/Resound-Player)

## Tags

- `latest` — 最新稳定版本
- `v*` — 语义化版本标签
