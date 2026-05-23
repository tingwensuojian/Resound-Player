import { defineStore } from 'pinia';
import { ref } from 'vue';

export type LoginIntent = 'like' | 'playlist' | 'subscribe' | 'none';
export type ToastType = 'warning' | 'success' | 'error';

export const useLoginModalStore = defineStore('loginModal', () => {
  const visible = ref(false);
  const intent = ref<LoginIntent>('none');
  const globalToast = ref('');
  const toastType = ref<ToastType>('warning');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function showLoginModal(modalIntent: LoginIntent = 'none') {
    visible.value = true;
    intent.value = modalIntent;
  }

  function hideLoginModal() {
    visible.value = false;
    intent.value = 'none';
  }

  function showGlobalToast(msg: string, type: ToastType = 'warning', duration = 4000) {
    if (toastTimer) clearTimeout(toastTimer);
    globalToast.value = msg;
    toastType.value = type;
    toastTimer = setTimeout(() => {
      globalToast.value = '';
      toastTimer = undefined;
    }, duration);
  }

  return {
    visible,
    intent,
    globalToast,
    toastType,
    showLoginModal,
    hideLoginModal,
    showGlobalToast,
  };
});