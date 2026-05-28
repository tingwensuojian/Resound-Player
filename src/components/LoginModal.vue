<template>
  <Teleport to="body">
    <transition name="modal-fade">
      <div v-if="loginModalStore.visible" class="lm-mask" @click.self="close" @keydown.esc="close" tabindex="-1" ref="backdropRef">
        <div class="lm-wrapper">
          <button class="lm-close" type="button" aria-label="关闭" @click="close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <LoginPanel />
        </div>
      </div>
    </transition>
    <transition name="toast-fade">
      <div v-if="loginModalStore.globalToast" class="lm-toast" :class="loginModalStore.toastType">{{ loginModalStore.globalToast }}</div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import { useLoginModalStore } from '../stores/loginModal';
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import LoginPanel from './LoginPanel.vue';
const loginModalStore = useLoginModalStore();

const backdropRef = ref<HTMLElement | null>(null);

function close() {
  loginModalStore.hideLoginModal();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && loginModalStore.visible) close();
}

watch(() => loginModalStore.visible, (open) => {
  if (open) nextTick(() => backdropRef.value?.focus());
});

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.lm-mask {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.5);
  display: grid; place-items: center;
  overflow-y: auto; padding: var(--space-5);
}
.lm-wrapper {
  position: relative;
  width: min(560px, calc(100vw - 40px));
  max-height: 85vh;
  border-radius: 24px;
  display: flex;
  flex-direction: column;
}
.lm-wrapper :deep(.login-panel) {
  max-height: 85vh;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}
.lm-close {
  position: absolute; top: 12px; right: 12px; z-index: 10;
  width: 32px; height: 32px; border: none; border-radius: 50%;
  background: rgba(0,0,0,0.3); color: #fff; cursor: pointer;
  display: grid; place-items: center;
  transition: background 0.12s ease;
}
.lm-close:hover { background: rgba(0,0,0,0.5); }
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; transform: translateY(8px); }
.lm-toast {
  position: fixed; bottom: 12%; left: 50%; transform: translateX(-50%);
  padding: 10px 20px; border-radius: 999px; max-width: 400px; text-align: center;
  background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);
  color: #fbbf24; font-size: 13px; font-weight: 500; line-height: 1.4;
  pointer-events: none; z-index: 310;
}
.lm-toast.success { color: #4ade80; }
.lm-toast.error { color: #f87171; }
</style>
