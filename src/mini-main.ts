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
// Mini window is display/control-only. Avoid a second auth refresh competing
// with the main window during startup; like action still validates on click.
void userStore.hydrate().catch(() => {});

app.mount('#app');

async function notifyMiniRendererReady() {
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  window.appEnv?.miniMode?.rendererReady?.();
}

void notifyMiniRendererReady();
