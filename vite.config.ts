import { defineConfig, loadEnv } from 'vite';
import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import http from 'http';
import https from 'https';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:38761';
  const unblockMatchTarget = env.VITE_UNBLOCK_MATCH_TARGET || 'http://127.0.0.1:38763';

  return {
    base: env.VITE_BASE_URL || './',
    plugins: [
      vue(),
      {
        name: 'download-proxy',
        configureServer(server) {
          server.middlewares.use('/dl-proxy', (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
            res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

            if (req.method === 'OPTIONS') {
              res.statusCode = 204;
              res.end();
              return;
            }

            const params = new URL(req.url || '', 'http://localhost').searchParams;
            const targetUrl = params.get('url');
            const cookie = params.get('cookie');
            if (!targetUrl) { res.statusCode = 400; res.end('Missing url'); return; }
            try {
              const u = new URL(targetUrl);
              const mod = u.protocol === 'https:' ? https : http;
              const headers: http.OutgoingHttpHeaders = {};
              if (cookie) headers.Cookie = cookie;
              if (req.headers.range) headers.Range = req.headers.range;
              const opts: http.RequestOptions = {
                hostname: u.hostname,
                port: u.port,
                path: u.pathname + u.search,
                method: req.method === 'HEAD' ? 'HEAD' : 'GET',
                headers,
              };
              mod.request(opts, (proxyRes) => {
                const responseHeaders: Record<string, string> = {};
                const passthroughHeaders = [
                  'content-type',
                  'content-length',
                  'content-range',
                  'accept-ranges',
                  'cache-control',
                  'etag',
                  'last-modified',
                ];
                for (const key of passthroughHeaders) {
                  const value = proxyRes.headers[key];
                  if (typeof value === 'string') responseHeaders[key] = value;
                }
                responseHeaders['Access-Control-Allow-Origin'] = '*';
                responseHeaders['Access-Control-Expose-Headers'] = 'Content-Length, Content-Range, Accept-Ranges';
                res.writeHead(proxyRes.statusCode || 200, responseHeaders);
                if (req.method === 'HEAD') {
                  res.end();
                  proxyRes.resume();
                } else {
                  proxyRes.pipe(res);
                }
              }).on('error', (err) => { res.statusCode = 500; res.end(err.message); }).end();
            } catch { res.statusCode = 400; res.end('Invalid URL'); }
          });
        },
      },
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: ['192.168.2.2'],
      watch: {
        ignored: ['**/播放页相关/**'],
      },
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
        '/unblock-api': {
          target: unblockMatchTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/unblock-api/, ''),
        },
      },
    },
    optimizeDeps: {
      entries: ['index.html', 'mini.html'],
    },
    build: {
      // `three` / `tubes1` are intentionally lazy-loaded visual effect chunks.
      // Keep the warning threshold above those optional assets so the build output
      // focuses on actionable regressions in eagerly loaded code.
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        input: {
          main: path.resolve(process.cwd(), 'index.html'),
          mini: path.resolve(process.cwd(), 'mini.html'),
        },
        output: {
          manualChunks: {
            'vendor-vue': ['vue'],
            'vendor-axios': ['axios'],
            'vendor-icons': ['lucide-vue-next'],
          },
        },
      },
    },
  };
});
