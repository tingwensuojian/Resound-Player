<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const isDark = ref(false);
const snapStage = ref<'none' | 'confirm'>('none');
const cleanupFns: (() => void)[] = [];

const shadowApi = (window as any).widgetEnv?.shadow;
const widgetApi = (window as any).widgetEnv?.widget;

onMounted(() => {
  shadowApi?.rendererReady?.();
  shadowApi?.debugLog?.('shadowMounted', { hasShadowApi: !!shadowApi });

  if (shadowApi?.onThemeChanged) {
    cleanupFns.push(shadowApi.onThemeChanged((dark: boolean) => {
      isDark.value = dark;
    }));
  }
  if (shadowApi?.onSnapStage) {
    cleanupFns.push(shadowApi.onSnapStage((stage: string) => {
      shadowApi?.debugLog?.('shadowSnapStage', { stage });
      snapStage.value = stage as 'none' | 'confirm';
    }));
  }
});

onUnmounted(() => {
  cleanupFns.forEach(fn => fn());
});
</script>

<template>
  <div
    class="shadow-indicator"
    :data-theme="isDark ? 'dark' : 'light'"
    :data-snap-stage="snapStage"
  >
    <svg v-if="snapStage === 'confirm'" class="outline" viewBox="0 0 100 100" preserveAspectRatio="none">
      <rect x="1" y="1" width="98" height="98" rx="14" ry="14" fill="none" stroke="currentColor" stroke-width="2" />
    </svg>
  </div>
</template>

<style>
html, body, #app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  background: transparent;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  pointer-events: none;
}

.shadow-indicator {
  width: 100%;
  height: 100%;
  border-radius: 14px;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color-scheme: light;
}

.shadow-indicator[data-theme="dark"] {
  color-scheme: dark;
}

.shadow-indicator[data-snap-stage='confirm'] {
  background: light-dark(rgba(0,0,0,0.06), rgba(255,255,255,0.04));
}

.outline {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  color: light-dark(rgba(0,0,0,0.3), rgba(255,255,255,0.3));
}
</style>