import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import App from './App.vue';
import './styles/animations.css';
import './styles/interactive-media.css';
import './styles/theme.css';

const allowNativeSelection = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]'));

const blockGlobalCopyActions = (event: Event) => {
  if (
    (event.type === 'selectstart' || event.type === 'contextmenu') &&
    event.target instanceof HTMLElement &&
    event.target.closest('[data-allow-dblclick-gesture="true"]')
  ) {
    return;
  }

  if (allowNativeSelection(event.target)) {
    return;
  }

  event.preventDefault();
};

const blockShortcutCopyActions = (event: KeyboardEvent) => {
  if (allowNativeSelection(event.target)) {
    return;
  }

  const isModifierPressed = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if (isModifierPressed && ['a', 'c', 'x'].includes(key)) {
    event.preventDefault();
  }
};

document.addEventListener('copy', blockGlobalCopyActions);
document.addEventListener('cut', blockGlobalCopyActions);
document.addEventListener('selectstart', blockGlobalCopyActions);
document.addEventListener('contextmenu', blockGlobalCopyActions);
document.addEventListener('keydown', blockShortcutCopyActions);

// 全局捕获 Unhandled Promise Rejection，避免未处理错误导致项目瘱痪
window.addEventListener('unhandledrejection', (event) => {
  const err = event.reason;
  if (!err) return;

  // API 网络错误：已由 axios interceptor 记录，这里只防止播放断链
  if (err.__CANCEL__ || err?.code === "ERR_CANCELED") {
    event.preventDefault();
    return;
  }

  // URL 构造错误（现有逻辑）
  if (err.message && err.message.includes("Failed to construct 'URL'")) {
    console.warn('[global] Unhandled URL rejection:', err.message, err.stack);
    event.preventDefault();
    return;
  }

  // 其他未处理的 rejection，输出警告
  const errMsg = err?.message ?? String(err);
  if (errMsg.includes("Network") || errMsg.includes("timeout") || errMsg.includes("status")) {
    console.warn('[global] Unhandled rejection (network/api):', errMsg);
  } else {
    console.debug('[global] Unhandled rejection:', errMsg);
  }
  // 保留 event.preventDefault() 避免 Node.js 终止进程
  event.preventDefault();
});
import { registerCoverCacheSW } from './utils/swRegister';

// 注册 Service Worker 封面缓存
if ('serviceWorker' in navigator) {
  registerCoverCacheSW().catch(() => {});
}

// ── TanStack Query ──
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      refetchOnWindowFocus: false,
    },
  },
});

const app = createApp(App);
app.use(createPinia());
app.use(VueQueryPlugin, { queryClient });
app.mount('#app');
