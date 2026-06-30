import { computed, ref, watch } from 'vue';
import { usePlayerStore } from '../stores/player'
import { useUserStore } from '../stores/user';
import { useLoginModalStore } from '../stores/loginModal';
import { toggleDjSubscribe, toggleSongLike } from '../api/music';

/**
 * 当前播放曲目的收藏/喜欢切换逻辑
 *
 * PlayerBar 和 PlayerExpanded 共享同一套 like toggle，
 * 支持歌曲喜欢和播客 DJ 订阅两种模式。
 */
export function useCurrentTrackLike() {
  const playerStore = usePlayerStore();
  const userStore = useUserStore();
  const loginModalStore = useLoginModalStore();
  const currentTrackId = computed(() => Number(playerStore.state.currentTrack?.id || 0));
  const currentPodcastRid = computed(() => Number(playerStore.state.currentTrack?.podcast?.rid || 0));
  const isCurrentPodcast = computed(() => playerStore.state.currentTrack?.source === 'podcast' && currentPodcastRid.value > 0);

  const canToggleCurrentLike = computed(() =>
    isCurrentPodcast.value ? currentPodcastRid.value > 0 : currentTrackId.value > 0,
  );

  const isCurrentLiked = computed(() => {
    if (isCurrentPodcast.value) return userStore.state.subscribedDjIds.includes(currentPodcastRid.value);
    // Use likedSongIds when populated (mini window now calls refreshLoginStatus).
    // Fall back to currentTrack.liked from main window snapshot.
    if (currentTrackId.value > 0 && userStore.state.likedSongIds.length > 0) {
      return userStore.state.likedSongIds.includes(currentTrackId.value);
    }
    return playerStore.state.currentTrack?.liked ?? playerStore.state.currentTrack?.isLiked ?? false;
  });

  const likeLoading = ref(false);

  // 切歌时重置 loading 状态
  watch(
    () => `${currentTrackId.value}-${currentPodcastRid.value}-${playerStore.state.currentTrack?.source || 'song'}`,
    () => {
      likeLoading.value = false;
    },
    { immediate: true },
  );

  async function toggleCurrentLike() {
    if (likeLoading.value || !canToggleCurrentLike.value) return;

    if (!userStore.state.isLogin) {
      loginModalStore.showLoginModal('like');
      return;
    }

    if (userStore.state.loginMode !== 'cookie' && userStore.state.loginMode !== 'qr') {
      loginModalStore.showGlobalToast('搜索用户方式登录不支持收藏功能，请使用扫码或 Cookie 登录', 'warning', 5000);
      return;
    }

    const next = !isCurrentLiked.value;
    likeLoading.value = true;
    try {
      const response = isCurrentPodcast.value
        ? await toggleDjSubscribe({ rid: currentPodcastRid.value, subscribe: next, cookie: userStore.state.loginCookie || undefined })
        : await toggleSongLike({ id: currentTrackId.value, like: next, uid: userStore.state.profile?.userId, cookie: userStore.state.loginCookie || undefined });
      const code = response?.data?.code ?? response?.data?.data?.code;
      if (typeof code === 'number' && code !== 200) throw new Error(`收藏失败，接口返回 ${code}`);
      if (isCurrentPodcast.value) {
        const rid = currentPodcastRid.value;
        const exists = userStore.state.subscribedDjIds.includes(rid);
        if (next && !exists) userStore.state.subscribedDjIds = [...userStore.state.subscribedDjIds, rid];
        if (!next && exists) userStore.state.subscribedDjIds = userStore.state.subscribedDjIds.filter((id) => id !== rid);
      } else {
        const id = currentTrackId.value;
        if (next) {
          if (!userStore.state.likedSongIds.includes(id)) userStore.state.likedSongIds = [...userStore.state.likedSongIds, id];
        } else {
          userStore.state.likedSongIds = userStore.state.likedSongIds.filter((songId) => songId !== id);
        }
      }
      // Sync to currentTrack so the mini window immediately reflects the change
      // without waiting for the next snapshot.
      if (playerStore.state.currentTrack) {
        playerStore.state.currentTrack.liked = next;
        playerStore.state.currentTrack.isLiked = next;
      }
      // Sync back to main window so its syncRuntimeState produces a correct snapshot.
      // This prevents the next snapshot from overwriting the mini window's local toggle.
      // The double API call on the main window side is harmless (endpoint is idempotent).
      try {
        window.appEnv?.playback?.sendCommand?.({ type: 'toggleLike' });
      } catch {}
    } catch (error) {
      console.error('[like] toggle like failed', error);
    } finally {
      likeLoading.value = false;
    }
  }

  return {
    currentTrackId,
    currentPodcastRid,
    isCurrentPodcast,
    canToggleCurrentLike,
    isCurrentLiked,
    likeLoading,
    toggleCurrentLike,
  };
}
