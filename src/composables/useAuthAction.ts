import { userStore } from '../stores/user';
import { useLoginModalStore } from '../stores/loginModal';

/**
 * 需要完整登录态的操作（收藏、收藏至歌单等）的鉴权检查。
 *
 * 返回值：
 * - true  → 已通过扫码或 Cookie 方式登录，可继续执行操作
 * - false → 未登录或仅搜索用户登录，已触发登录弹窗或 toast 提示
 *
 * @param toastMsg  搜索用户登录时显示的 toast 文案
 * @param loginIntent  未登录时弹窗的 intent 标识
 */
export function useAuthAction(toastMsg: string, loginIntent: 'like' | 'playlist' = 'like') {
  const loginModalStore = useLoginModalStore();

  function showToast(msg: string, type: 'warning' | 'success' | 'error' = 'warning', duration = 3000) {
    loginModalStore.showGlobalToast(msg, type, duration);
  }

  function checkAuth(): boolean {
    if (!userStore.isLogin) {
      loginModalStore.showLoginModal(loginIntent);
      return false;
    }
    if (userStore.loginMode !== 'cookie' && userStore.loginMode !== 'qr') {
      loginModalStore.showGlobalToast(toastMsg, 'warning', 5000);
      return false;
    }
    return true;
  }

  return { checkAuth, showToast };
}
