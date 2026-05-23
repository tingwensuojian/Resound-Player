import { ref, watch, type Ref, type ComputedRef } from 'vue';
import { userStore } from '../stores/user';
import { useLoginModalStore } from '../stores/loginModal';
import { toggleUserFollow, getUserMutualFollow } from '../api/music';

export type FollowStatus = 'none' | 'following' | 'mutual';

async function checkMutual(rawId: number): Promise<'mutual' | 'following' | 'none'> {
  // 1. 先查是否已关注（store 数组）
  if (!userStore.subscribedUserIds.includes(rawId)) {
    return 'none';
  }
  // 2. 已关注，查是否互关
  try {
    const { data } = await getUserMutualFollow(rawId, userStore.loginCookie || undefined);
    // 兼容多种响应格式: { data: { mutual: true } } / { data: true } / { mutual: true }
    const resp = data?.data;
    const mutual = typeof resp === 'boolean' ? resp : Boolean(resp?.mutual ?? data?.mutual ?? false);
    return mutual ? 'mutual' : 'following';
  } catch {
    return 'following';
  }
}

export function useUserFollow(options: {
  id: Ref<number | undefined> | ComputedRef<number | undefined>;
}) {
  const { id } = options;

  const status = ref<FollowStatus>('none');
  const isLoading = ref(false);
  let syncToken = 0;

  function resolveUserId(): number | undefined {
    return typeof id === 'function'
      ? (id as ComputedRef<number | undefined>).value
      : (id as Ref<number | undefined>).value;
  }

  async function syncState() {
    const token = ++syncToken;
    const rawId = resolveUserId();
    if (!rawId) {
      status.value = 'none';
      return;
    }
    const result = await checkMutual(rawId);
    if (token !== syncToken) return; // stale
    status.value = result;
  }

  // 监听 id、登录态、store 数组变化（数组异步填充后重查互关）
  watch(
    [() => resolveUserId(), () => userStore.isLogin, () => userStore.subscribedUserIds.join(',')],
    syncState,
    { immediate: true },
  );

  async function toggle() {
    const rawId = resolveUserId();
    if (!rawId || isLoading.value) return;

    const loginModalStore = useLoginModalStore();
    if (!userStore.isLogin) {
      loginModalStore.showLoginModal('subscribe');
      return;
    }
    if (userStore.loginMode !== 'cookie' && userStore.loginMode !== 'qr') {
      loginModalStore.showGlobalToast('当前登录方式不支持此操作，请使用扫码或 Cookie 登录', 'warning', 5000);
      return;
    }

    const willFollow = status.value === 'none';
    isLoading.value = true;

    try {
      const response = await toggleUserFollow({
        id: rawId,
        follow: willFollow,
        cookie: userStore.loginCookie || undefined,
      });

      const code = response?.data?.code ?? response?.data?.data?.code;
      if (typeof code === 'number' && code !== 200) {
        throw new Error(`操作失败，接口返回 ${code}`);
      }

      // 更新 store 数组
      const exists = userStore.subscribedUserIds.includes(rawId);
      if (willFollow && !exists) {
        userStore.subscribedUserIds.push(rawId);
      } else if (!willFollow && exists) {
        const idx = userStore.subscribedUserIds.indexOf(rawId);
        if (idx >= 0) userStore.subscribedUserIds.splice(idx, 1);
      }

      // 关注后查是否互关（直接查，不用等 watcher）
      if (willFollow) {
        const token = ++syncToken;
        const result = await checkMutual(rawId);
        if (token === syncToken) {
          status.value = result;
        }
      } else {
        status.value = 'none';
      }
    } catch (error) {
      console.error('[useUserFollow] toggle failed', error);
      loginModalStore.showGlobalToast('操作失败，请稍后重试', 'error', 3000);
    } finally {
      isLoading.value = false;
    }
  }

  return { status, isLoading, toggle };
}