import { ref, watch, type Ref, type ComputedRef } from 'vue';
import { userStore } from '../stores/user';
import { useLoginModalStore } from '../stores/loginModal';
import {
  togglePlaylistSubscribe,
  toggleAlbumSubscribe,
  toggleArtistSubscribe,
  toggleDjSubscribe,
} from '../api/music';

export type EntityType = 'playlist' | 'album' | 'artist' | 'podcast';

export interface UseEntitySubscribeOptions {
  type: EntityType;
  id: Ref<number | undefined> | ComputedRef<number | undefined>;
  /** 如果页面已加载了详情数据（如 playlist.subscribed），传进来避免闪烁 */
  initialSubscribed?: boolean | Ref<boolean>;
}

export function useEntitySubscribe(options: UseEntitySubscribeOptions) {
  const { type, id, initialSubscribed } = options;

  const isSubscribed = ref(false);
  const isLoading = ref(false);

  // 从 store 获取对应的 ID 数组
  function getStoreArray(): number[] | undefined {
    switch (type) {
      case 'playlist': return userStore.subscribedPlaylistIds;
      case 'album': return userStore.subscribedAlbumIds;
      case 'artist': return userStore.subscribedArtistIds;
      case 'podcast': return userStore.subscribedDjIds;
    }
  }

  // 初始化状态：store 数组（登录时已拉取） > initialSubscribed > false
  function syncState() {
    const rawId = typeof id === 'function'
      ? (id as ComputedRef<number | undefined>).value
      : (id as Ref<number | undefined>).value;

    if (!rawId) {
      isSubscribed.value = false;
      return;
    }

    // 优先从 store 数组判断（登录时已拉取，更可靠）
    const storeArr = getStoreArray();
    if (storeArr && storeArr.length > 0) {
      isSubscribed.value = storeArr.includes(rawId);
      return;
    }

    // 回退到页面传入的 initialSubscribed
    const initialVal = typeof initialSubscribed === 'boolean'
      ? initialSubscribed
      : (initialSubscribed as Ref<boolean> | undefined)?.value;

    if (initialVal !== undefined) {
      isSubscribed.value = initialVal;
      return;
    }

    isSubscribed.value = false;
  }

  // 监听 id 和 initialSubscribed 变化
  watch(
    [() => {
      const rawId = typeof id === 'function'
        ? (id as ComputedRef<number | undefined>).value
        : (id as Ref<number | undefined>).value;
      return rawId;
    }, () => {
      if (typeof initialSubscribed === 'boolean') return initialSubscribed;
      return (initialSubscribed as Ref<boolean> | undefined)?.value;
    }, () => userStore.isLogin],
    syncState,
    { immediate: true },
  );

  async function toggle() {
    const rawId = typeof id === 'function'
      ? (id as ComputedRef<number | undefined>).value
      : (id as Ref<number | undefined>).value;

    if (!rawId || isLoading.value) return;

    // 鉴权检查
    const loginModalStore = useLoginModalStore();
    if (!userStore.isLogin) {
      loginModalStore.showLoginModal('subscribe');
      return;
    }
    if (userStore.loginMode !== 'cookie' && userStore.loginMode !== 'qr') {
      loginModalStore.showGlobalToast('当前登录方式不支持此操作，请使用扫码或 Cookie 登录', 'warning', 5000);
      return;
    }

    const nextState = !isSubscribed.value;
    isLoading.value = true;

    try {
      let response: any;
      const cookie = userStore.loginCookie || undefined;

      switch (type) {
        case 'playlist':
          response = await togglePlaylistSubscribe({ id: rawId, subscribe: nextState, cookie });
          break;
        case 'album':
          response = await toggleAlbumSubscribe({ id: rawId, subscribe: nextState, cookie });
          break;
        case 'artist':
          response = await toggleArtistSubscribe({ id: rawId, subscribe: nextState, cookie });
          break;
        case 'podcast':
          response = await toggleDjSubscribe({ rid: rawId, subscribe: nextState, cookie });
          break;
      }

      const code = response?.data?.code ?? response?.data?.data?.code;
      if (typeof code === 'number' && code !== 200) {
        throw new Error(`操作失败，接口返回 ${code}`);
      }

      // 更新本地状态
      isSubscribed.value = nextState;
      updateStoreArray(rawId, nextState);
    } catch (error) {
      console.error('[useEntitySubscribe] toggle failed', error);
      loginModalStore.showGlobalToast('操作失败，请稍后重试', 'error', 3000);
    } finally {
      isLoading.value = false;
    }
  }

  function updateStoreArray(entityId: number, subscribed: boolean) {
    const arr = getStoreArray();
    if (!arr) return;

    const exists = arr.includes(entityId);
    if (subscribed && !exists) {
      arr.push(entityId);
    } else if (!subscribed && exists) {
      const idx = arr.indexOf(entityId);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }

  return { isSubscribed, isLoading, toggle };
}