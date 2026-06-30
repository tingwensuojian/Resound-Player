import { createApp, nextTick } from 'vue';
import { createPinia } from 'pinia';
import MiniPlayBar from './components/MiniPlayBar.vue';
import { usePlayerStore } from './stores/player';
import { useUiStore } from './stores/ui';
import { useUserStore } from './stores/user';
import './styles/animations.css';
import './styles/interactive-media.css';
import './styles/theme.css';

const app = createApp(MiniPlayBar);
const pinia = createPinia();

app.use(pinia);

const uiStore = useUiStore(pinia);
const playerStore = usePlayerStore(pinia);
const userStore = useUserStore(pinia);

uiStore.init();
playerStore.init();

// Mount app immediately, then verify auth before signaling the main process
// to show the window. This ensures isLogin is true by the time the user
// can interact with the like/favorite button.
// refreshLoginStatus is the project's standard auth verification pattern.
app.mount('#app');
void (async () => {
  try {
    await userStore.hydrate();
    await userStore.refreshLoginStatus();
    console.log('[mini] auth ok — isLogin:', userStore.state.isLogin, 'loginMode:', userStore.state.loginMode);
  } catch (err) {
    console.warn('[mini] auth failed — like/fav will show login modal:', err);
  }
  // Wait for stable first paint frames, then signal ready
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  window.appEnv?.miniMode?.rendererReady?.();
})();
