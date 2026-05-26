# CORS 代理与生产部署说明

## 背景

播放非官方音源（unblock 匹配到的 `kuwo.cn`、`bodian` 等源）时，这些外部 CDN 的响应头不包含 `Access-Control-Allow-Origin`，浏览器会直接拦截音频加载。

另外，均衡器开启后播放器会通过 Web Audio `MediaElementSourceNode` 读取音频数据，`<audio>` 必须带 `crossOrigin="anonymous"`。此时即使是官方远程 URL，如果 CDN 没有返回匹配的 CORS 头，也可能在 `audio.play()` 阶段失败。因此当前播放链路会在 EQ 开启时把远程 HTTP(S) 音频也包装成同源 `/dl-proxy`。

当前方案：通过 Vite dev server 内置的 `/dl-proxy` 中间件转发请求，在响应中注入 `Access-Control-Allow-Origin: *`。

同时，音频拖动进度条依赖 HTTP Range/206 分段请求。`/dl-proxy` 不能只解决 CORS，还必须透传浏览器的 `Range` 请求头，并把上游返回的 `Content-Range`、`Accept-Ranges`、`Content-Length` 暴露给浏览器。否则非官方音源虽然可以开始播放，但 seek 时会退回从头播放。

## 风险

`/dl-proxy` 是 Vite 开发服务器中间件，**仅在 dev 模式（`npm run dev:*`）下可用**。生产构建（`npm run build:web` / `npm run build:desktop`）后，Vite 不再运行，`/dl-proxy` 不存在，跨域音源将再次播放失败。

这里需要区分两类“生产”：

- Web 生产部署：仍然需要你自己提供 `/dl-proxy`
- Electron 桌面打包版：应用会自行拉起本地 API / unblock 服务，但 **`/dl-proxy` 依旧不是内置 HTTP 路由**，因此桌面端如果继续依赖渲染层同源代理，也需要额外在桌面链路提供替代方案，而不能把 Vite dev 中间件当成打包能力

生产环境自行实现 `/dl-proxy` 时必须同时覆盖两类能力：

1. **CORS**：注入 `Access-Control-Allow-Origin: *`
2. **Range/206**：透传 `Range` / `If-Range` 请求头，并透传或暴露 `Content-Range` / `Accept-Ranges` / `Content-Length`

如果只做 CORS，非官方音源可能能播放，但拖动进度条、歌词点击 seek、恢复播放位置等场景会异常。

## 生产解决方案

以下方案按推荐优先级排列：

### 方案 A：Nginx 反代（推荐）

在部署静态文件的前置 Nginx 中，添加一个 `/dl-proxy` 路由：

```nginx
location /dl-proxy {
    resolver 8.8.8.8;
    set $target $arg_url;
    if ($target = "") { return 400; }

    proxy_pass $target;
    proxy_set_header Range $http_range;
    proxy_set_header If-Range $http_if_range;
    proxy_pass_header Content-Length;
    proxy_pass_header Content-Range;
    proxy_pass_header Accept-Ranges;
    proxy_hide_header Access-Control-Allow-Origin;
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Expose-Headers "Content-Length, Content-Range, Accept-Ranges" always;
}
```

- 兼容当前前端代码（URL 格式完全一致）
- 同时覆盖 CORS 与音频 seek 所需的 Range/206
- 无侵入，不改构建逻辑

### 方案 B：后端中转

在 API 服务器（当前是 `NeteaseCloudMusicApiEnhanced`，端口 38761）或 unblock 匹配服务器（端口 38763）上新增一个转发端点：

```
GET /proxy/audio?url=<encoded_url>
```

返回音频流并设置：

- `Access-Control-Allow-Origin: *`
- 透传客户端 `Range` / `If-Range` 请求头
- 透传上游 `Content-Range` / `Accept-Ranges` / `Content-Length` 响应头
- 暴露 `Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges`

- 不依赖特定 Web 服务器
- 需要修改后端代码

### 方案 C：Electron 版直接设置

如果走桌面端构建（`npm run build:desktop`），可在 Electron 主进程或渲染进程配置中关闭 web 安全策略：

```ts
// main.ts
mainWindow = new BrowserWindow({
  webPreferences: {
    webSecurity: false,         // 关闭同源策略
    allowRunningInsecureContent: true,
  }
});
```

或者通过 `app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')` 关闭 CORS。

- 仅限 Electron 打包版
- Web 构建无效

### 方案 D：Service Worker 拦截

在项目中注册一个 Service Worker，拦截音频请求并注入 CORS 头：

```ts
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === '/dl-proxy') {
    const target = url.searchParams.get('url');
    if (target) {
      event.respondWith(fetch(target, { mode: 'cors' }));
    }
  }
});
```

需要确保 Service Worker 的作用域覆盖 `/dl-proxy` 路径。

- 纯前端方案，无需服务端配合
- Service Worker 仅限 HTTPS 或 localhost
- 需要处理跨域请求的 preflight 和 redirect

## 相关文件

- `vite.config.ts` — `/dl-proxy` 中间件定义
- `src/player/playbackResolver.ts` — 非官方音源 URL 代理路由逻辑
- `src/stores/player.ts` — EQ 开启时远程音频代理、换源失败回滚
- `electron/serviceManager.js` — 桌面打包版本地服务拉起逻辑（API / unblock / match）
