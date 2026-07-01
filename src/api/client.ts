import axios from 'axios';
import { platform } from '../utils/platform';

// 运行时由 uiStore.setUnblockEnabled() 设置，控制 apiClient 是否添加 proxy 参数
let _unblockEnabled = true;
export function setUnblockProxyEnabled(enabled: boolean) {
  _unblockEnabled = enabled;
}
export function isUnblockProxyEnabled() {
  return _unblockEnabled;
}

export function getResolvedApiBaseUrl() {
  // 统一走 platform 模块，不再直接引用 window.appEnv
  return platform.apiBaseUrl;
}

export const apiClient = axios.create({
  baseURL: getResolvedApiBaseUrl(),
  withCredentials: true,
  timeout: 15000,
});

// Axios response interceptor: log API errors consistently
// and prevent unhandled rejections from propagating silently.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.config) {
      const { method, url, params, baseURL } = error.config;
      const status = error.response?.status ?? 0;
      const statusText = error.response?.statusText ?? "";
      const errMsg = error.message ?? String(error);
      if (error.code === "ERR_NETWORK" || error.code === "ECONNABORTED") {
        console.warn("[api] " + (method?.toUpperCase() ?? "?") + " " + url + " failed: " + errMsg + " (code=" + (error.code ?? "?") + ")");
      } else if (status >= 500) {
        console.warn("[api] " + (method?.toUpperCase() ?? "?") + " " + url + " server error: " + status + " " + statusText);
      } else if (status >= 400) {
        console.debug("[api] " + (method?.toUpperCase() ?? "?") + " " + url + " client error: " + status + " " + statusText);
      } else if (error.code === "ERR_CANCELED") {
        // Aborted requests are expected (e.g. navigation), skip logging
      } else {
        console.debug("[api] " + (method?.toUpperCase() ?? "?") + " " + url + " unexpected error: " + errMsg);
      }
    }
    return Promise.reject(error);
  }
);


export async function waitForApiReady(options?: {
  maxAttempts?: number;
  intervalMs?: number;
}) {
  const maxAttempts = options?.maxAttempts ?? 20;
  const intervalMs = options?.intervalMs ?? 500;

  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      await apiClient.get('/banner', { params: { timestamp: Date.now() }, timeout: 2500 });
      return true;
    } catch (err: any) {
      // ECONNREFUSED 在启动期属于预期，不打印到控制台刷屏
      if (err?.code && err.code !== 'ERR_NETWORK') {
        // 保留其它类型异常用于排查
        // eslint-disable-next-line no-console
        console.debug('[api-wait]', err.code, err.message);
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return false;
}
