<template>
  <div
    v-if="visible"
    class="heartbeat-host"
  >
    <canvas
      ref="canvasRef"
      class="heartbeat-canvas"
      :class="{ 'heartbeat-canvas--fade-out': fadingOut }"
      @animationend="onAnimationEnd"
    />
  </div>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  done: [];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const fadingOut = ref(false);
let disposeApp: (() => void) | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;
let randomMoveId: number | null = null;
let restoredMouseHandler: (() => void) | null = null;

/** 拦截 window.addEventListener 捕获库注册的 mousemove 监听器 */
function blockMouseMove() {
  const originalAdd = window.addEventListener.bind(window);
  const captured: Array<{ type: string; handler: EventListener }> = [];

  // 劫持 addEventListener
  window.addEventListener = ((type: string, handler: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
    if (type === 'mousemove') {
      captured.push({ type, handler: handler as EventListener });
      return;
    }
    return originalAdd(type, handler, options);
  }) as typeof window.addEventListener;

  // 返回恢复函数
  restoredMouseHandler = () => {
    window.addEventListener = originalAdd;
    // 移除已捕获的 mousemove 监听器
    captured.forEach(({ type, handler }) => {
      window.removeEventListener(type, handler);
    });
    captured.length = 0;
  };
}

/** 递归查找 app 中像 Three.js camera 的属性 */
function findCamera(obj: unknown, depth = 0): unknown {
  if (!obj || typeof obj !== 'object' || depth > 5) return null;
  try {
    const dict = obj as Record<string, unknown>;
    // isCamera 是 Three.js Camera 的标志属性
    if ((dict as any).isCamera === true) return obj;
    if ('matrixWorldInverse' in dict && 'projectionMatrixInverse' in dict) return obj;

    for (const key of Object.getOwnPropertyNames(dict)) {
      if (key.startsWith('__') || key === 'constructor') continue;
      const val = dict[key];
      if (val && typeof val === 'object' && val !== obj) {
        const found = findCamera(val, depth + 1);
        if (found) return found;
      }
    }
  } catch { /* skip */ }
  return null;
}

/** 递归查找 app 上的 renderer / scene，设为透明 */
function makeTransparent(obj: unknown, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return;
  try {
    const dict = obj as Record<string, unknown>;

    if (
      typeof (dict as any).setClearColor === 'function' &&
      typeof (dict as any).render === 'function'
    ) {
      (dict as any).setClearColor(0x000000, 0);
      if (dict.scene) (dict.scene as any).background = null;
      return;
    }

    if (
      'background' in dict &&
      Array.isArray(dict.children) &&
      typeof (dict as any).setClearColor !== 'function'
    ) {
      (dict as any).background = null;
      return;
    }

    for (const key of Object.getOwnPropertyNames(dict)) {
      if (key.startsWith('__') || key === 'constructor') continue;
      const val = dict[key];
      if (val && typeof val === 'object' && val !== obj) {
        makeTransparent(val, depth + 1);
      }
    }
  } catch { /* skip */ }
}

/** 随机平滑移动摄像机 */
function startRandomCameraMove(camera: any) {
  if (!camera || typeof camera.position === 'undefined') return;

  let targetX = 0;
  let targetY = 0;
  let startX = 0;
  let startY = 0;
  let progress = 1; // 立即跳转到第一个目标

  function pickTarget() {
    startX = camera.position.x;
    startY = camera.position.y;
    targetX = (Math.random() - 0.5) * 3;
    targetY = (Math.random() - 0.5) * 1.5;
    progress = 0;
  }

  function animate() {
    if (progress < 1) {
      progress += 0.015;
      const t = Math.min(progress, 1);
      // easeInOutQuad
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      camera.position.x = startX + (targetX - startX) * ease;
      camera.position.y = startY + (targetY - startY) * ease;
    } else {
      // 到达目标后随机等待几帧再选新目标
    }

    if (Math.random() < 0.005) pickTarget();
    randomMoveId = requestAnimationFrame(animate);
  }

  pickTarget();
  randomMoveId = requestAnimationFrame(animate);
}

function stopRandomCameraMove() {
  if (randomMoveId !== null) {
    cancelAnimationFrame(randomMoveId);
    randomMoveId = null;
  }
}

function createTubes(canvas: HTMLCanvasElement) {
  destroyTubes();
  fadingOut.value = false;

  // 1. 拦截 mousemove 监听器
  blockMouseMove();

  import('threejs-components/build/cursors/tubes1.min.js')
    .then((mod) => {
      const TubesCursor = mod.default;
      canvas.style.background = 'transparent';
      const app = TubesCursor(canvas, {
        tubes: {
          colors: ['#5e72e4', '#8965e0', '#f5365c'],
          lights: {
            intensity: 200,
            colors: ['#21d4fd', '#b721ff', '#f4d03f', '#11cdef'],
          },
        },
      });

      // 2. 恢复事件监听并移除库注册的 mousemove
      if (restoredMouseHandler) restoredMouseHandler();

      const renderer = (app as any)?.three?.renderer;
      const scene = (app as any)?.three?.scene;
      if (renderer) {
        if (typeof renderer.setClearColor === 'function') renderer.setClearColor(0x000000, 0);
        if (typeof renderer.setClearAlpha === 'function') renderer.setClearAlpha(0);
        if (renderer.domElement) {
          renderer.domElement.style.background = 'transparent';
          renderer.domElement.style.mixBlendMode = 'plus-lighter';
          renderer.domElement.style.filter = 'brightness(1.16) contrast(1.22) saturate(1.08)';
        }
      }
      if (scene && 'background' in scene) {
        scene.background = null;
      }

      // 3. 设置透明背景
      makeTransparent(app);

      // 4. 查找相机，启动随机运动
      const camera = (app as any)?.three?.camera ?? findCamera(app);
      if (camera) startRandomCameraMove(camera);

      disposeApp = () => {
        stopRandomCameraMove();
        if (app && typeof app.dispose === 'function') app.dispose();
      };

      fadeTimer = setTimeout(() => { fadingOut.value = true; }, 2500);
    })
    .catch((error) => {
      console.error('[HeartbeatActivateEffect] failed to initialize tubes effect', error);
      if (restoredMouseHandler) restoredMouseHandler();
      fadeTimer = setTimeout(() => { fadingOut.value = true; }, 500);
    });
}

function destroyTubes() {
  stopRandomCameraMove();
  if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
  if (disposeApp) { disposeApp(); disposeApp = null; }
}

function onAnimationEnd(e: AnimationEvent) {
  if (e.target === e.currentTarget && fadingOut.value) {
    fadingOut.value = false;
    destroyTubes();
    emit('done');
  }
}

watch(() => props.visible, async (val) => {
  if (!val) {
    fadingOut.value = false;
    destroyTubes();
    return;
  }

  await nextTick();
  if (!canvasRef.value) {
    console.warn('[HeartbeatActivateEffect] canvas is not ready when effect becomes visible');
    return;
  }
  createTubes(canvasRef.value);
}, { flush: 'post' });

onUnmounted(() => { destroyTubes(); });
</script>

<style scoped>
.heartbeat-host {
  position: fixed;
  inset: 0;
  z-index: 9999;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  background: transparent !important;
}

.heartbeat-canvas {
  position: absolute;
  inset: 0;
  pointer-events: none;
  width: 100%;
  height: 100%;
  background: transparent !important;
  filter: brightness(1.16) contrast(1.22) saturate(1.08);
  animation: heartbeat-fade-in 0.4s ease-out both;
}

.heartbeat-canvas--fade-out {
  animation: heartbeat-fade-out 0.6s ease-in both;
}

@keyframes heartbeat-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes heartbeat-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
</style>

<style>
.heartbeat-host {
  background: transparent !important;
}

.heartbeat-canvas {
  background: transparent !important;
  mix-blend-mode: plus-lighter;
  filter: brightness(1.16) contrast(1.22) saturate(1.08);
}
</style>
