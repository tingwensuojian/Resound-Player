# Resound-Player — 生产部署指南

本目录包含 Resound-Player 上线生产所需的所有部署文件。

## 架构图

```
                         ┌─────────────────┐
                         │    Browser       │
                         └────────┬────────┘
                                  │
                         ┌────────▼────────┐
                         │    Nginx :80     │  ← SPA 静态文件 + /dl-proxy
                         │   :443 (HTTPS)  │
                         └───┬──────┬──────┘
                             │      │
              ┌──────────────┘      └────────────────┐
              ▼                                        ▼
   ┌──────────────────┐                   ┌──────────────────────┐
   │ Netease API       │                   │ Unblock Match Server │
   │ :38761            │                   │ :38763               │
   │ scripts/start-api │                   │ server/unblock-match │
   └──────────────────┘                   └──────────────────────┘
                                                  │
                                                  ▼
                                        ┌──────────────────────┐
                                        │ Unblock Proxy Server │
                                        │ :38762               │
                                        └──────────────────────┘
```

## 部署方案

### 方案一：pm2 + Nginx（推荐）

适用于有 root 权限的专用服务器或 VPS。

**前置条件：**
- Node.js 22+
- Nginx
- pm2（`npm i -g pm2`）

**步骤：**

```bash
# 1. 构建前端
npm ci
VITE_BASE_URL=/ npm run build:web

# 2. 复制构建产物到 Nginx 根目录
sudo mkdir -p /var/www/resound-player
sudo cp -r dist/* /var/www/resound-player/dist/

# 3. 安装 Nginx 配置
sudo cp deploy/nginx.conf /etc/nginx/sites-available/resound-player
sudo ln -sf /etc/nginx/sites-available/resound-player /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 4. 启动后端服务
pm2 start deploy/ecosystem.config.cjs
pm2 save

# 5.（可选）一键部署脚本
sudo ./deploy/deploy.sh
```

### 方案二：Docker Compose

适用于容器化环境或需要隔离的场景。

**前置条件：**
- Docker + Docker Compose

**步骤：**

```bash
# 1. 先构建前端（nginx 容器需要）
npm ci
VITE_BASE_URL=/ npm run build:web

# 2. 启动所有服务
docker compose -f deploy/docker-compose.yml up -d

# 3. 查看日志
docker compose -f deploy/docker-compose.yml logs -f
```

**注意：** Docker Compose 方案要求先构建好前端。`dist/` 目录会以卷挂载方式注入 nginx 容器。
如需完全自包含的 Docker 构建，请使用 Dockerfile：

```bash
docker build -f deploy/Dockerfile -t resound-player .
docker run -p 80:80 resound-player
```

### 方案三：Docker 独立部署（仅前端）

```bash
docker build -f deploy/Dockerfile -t resound-player-frontend .
docker run -p 8080:80 resound-player-frontend
```

## Unblock Match Server（Docker Hub）

### CI 自动构建

每当推送 `v*` 标签时，GitHub Actions 自动执行 [build-docker.yml](/.github/workflows/build-docker.yml)：

- 构建 Unblock Match Server 的 Docker 镜像
- 推送到 Docker Hub：`tingwensuojian/resound-player-server`
- 标签：`vX.X.X`（版本号）和 `latest`

### 直接使用

无需本地构建，直接拉取运行：

```bash
docker pull tingwensuojian/resound-player-server:latest

docker run -d \
  --name resound-unblock-match \
  -p 38763:38763 \
  --restart unless-stopped \
  tingwensuojian/resound-player-server:latest
```

### 配合本地开发使用

将本地 Unblock Match 服务替换为 Docker 版本：

```bash
docker run -d \
  --name resound-unblock-match \
  -p 38763:38763 \
  --restart unless-stopped \
  tingwensuojian/resound-player-server:latest
```

然后在 `.env.local` 中设置：

```
VITE_UNBLOCK_MATCH_TARGET=http://127.0.0.1:38763
```

### 健康检查

镜像内置健康检查，每 30 秒检测 `/` 端点：

```bash
docker inspect resound-unblock-match --format='{{.State.Health.Status}}'
```

## HTTPS 配置

**使用 Let's Encrypt：**

```bash
sudo ./deploy/setup-ssl.sh your-domain.com admin@example.com
```

然后编辑 `deploy/nginx.conf`：
1. 取消注释 SSL server block（443 端口）
2. 修改 `server_name` 为你的域名
3. 更新 SSL 证书路径

运行 `./deploy/deploy.sh` 使配置生效。

**使用自有证书：**
将证书和密钥文件放入对应路径，然后更新 `deploy/nginx.conf` 中的路径。

## 文件说明

| 文件 | 用途 |
|------|------|
| `nginx.conf` | Nginx server block（用于系统 Nginx） |
| `docker-nginx.conf` | 完整的 Nginx 配置（用于 Docker） |
| `ecosystem.config.cjs` | PM2 进程管理配置 |
| `docker-compose.yml` | Docker Compose 全栈编排 |
| `Dockerfile` | 仅前端的 Docker 构建 |
| `deploy.sh` | 一键部署脚本 |
| `setup-ssl.sh` | Let's Encrypt SSL 证书配置 |
| `.env.production` | 生产环境变量 |

## 部署验证

部署完成后，执行以下检查：

```bash
# 前端是否正常
curl -s -o /dev/null -w "%{http_code}" http://localhost/

# API 是否可用
curl -s http://localhost/api/banner?timestamp=$(date +%s) | head -c 200

# Unblock 匹配服务是否正常
curl -s http://localhost/unblock-api/health

# dl-proxy（音频代理）是否正常
curl -s -o /dev/null -w "%{http_code}" "http://localhost/dl-proxy?url=http://example.com/test.mp3"

# CORS 头是否正确
curl -s -D - -o /dev/null "http://localhost/dl-proxy?url=http://example.com/test.mp3" 2>&1 | grep -i access-control
```