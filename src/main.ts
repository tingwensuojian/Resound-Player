import { createApp } from 'vue';
import App from './App.vue';
import './styles/animations.css';
import './styles/interactive-media.css';
import './styles/theme.css';

const allowNativeSelection = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]'));

const blockGlobalCopyActions = (event: Event) => {
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

// 全局捕获 Unhandled Promise Rejection，辅助排查 URL 错误
window.addEventListener('unhandledrejection', (event) => {
  const err = event.reason;
  if (err && err.message && err.message.includes("Failed to construct 'URL'")) {
    console.warn('[global] Unhandled URL rejection:', err.message, err.stack);
  }
});
import { registerCoverCacheSW } from './utils/swRegister';

// 注册 Service Worker 封面缓存
if ('serviceWorker' in navigator) {
  registerCoverCacheSW().catch(() => {});
}

createApp(App).mount('#app');
