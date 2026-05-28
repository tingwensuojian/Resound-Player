import { defineStore } from 'pinia';
import { reactive } from 'vue';
import { getLoginStatus, getUserAccount, getUserDetail, getUserLikeList, getUserPlaylist, getVipInfo, logout as logoutRequest } from '../api/auth';
import { getDjSublist, getAlbumSublist, getArtistSublist, getUserFollows } from '../api/music';
import { clearCache } from './unblock-cache';
import { apiCache } from './apiCache';
import { usePlayerStore } from './player'
import { storageSetItem, storageGetItem, storageRemoveItem } from '../utils/storage';
import { LOCAL_HISTORY_KEY } from '../utils/localHistory';

const LOGIN_COOKIE_KEY = 'ncm_login_cookie';
const LOGIN_MODE_KEY = 'ncm_login_mode';
const UID_LOGIN_PREFIX = 'uid=';

type LoginMode = 'none' | 'cookie' | 'qr' | 'uid';

type UserProfile = {
  userId: number;
  nickname: string;
  avatarUrl?: string;
};

type UserPlaylist = {
  id: number;
  name: string;
  trackCount?: number;
};

type VipSubItem = {
  vipCode: number;
  expireTime: number;
  iconUrl: string;
  dynamicIconUrl: string | null;
  vipLevel: number;
  isSignDeduct: boolean;
  isSignIap: boolean;
  isSignIapDeduct: boolean;
  isSign: boolean;
};

type VipInfo = {
  associator: VipSubItem;
  musicPackage: VipSubItem;
  redplus: VipSubItem;
  redVipLevelIcon: string;
};

function maskCookie(cookie: string) {
  const normalized = String(cookie || '').trim();
  if (!normalized) return '(empty)';
  if (normalized.length <= 16) return normalized;
  return `${normalized.slice(0, 8)}...${normalized.slice(-8)}`;
}

function logAuthDebug(event: string, payload?: Record<string, unknown>) {
  console.debug('[auth-debug]', event, payload || {});
}

export const useUserStore = defineStore('user', () => {
  const state = reactive({
    isLogin: false,
    profile: null as UserProfile | null,
    playlists: [] as UserPlaylist[],
    likedSongIds: [] as number[],
    subscribedDjIds: [] as number[],
    subscribedPlaylistIds: [] as number[],
    subscribedAlbumIds: [] as number[],
    subscribedArtistIds: [] as number[],
    subscribedUserIds: [] as number[],
    isVip: false,
    vipInfo: null as VipInfo | null,
    level: 0,
    loading: false,
    loginCookie: '',
    loginMode: 'none' as LoginMode,
    loginVerified: false,
    authRequestSeq: 0,
  });

  const playerStore = usePlayerStore();

  async function hydrate() {
    state.loginCookie = localStorage.getItem(LOGIN_COOKIE_KEY) || '';
    if (!state.loginCookie) {
      state.loginCookie = (await storageGetItem(LOGIN_COOKIE_KEY)) || '';
    }
    const savedMode = localStorage.getItem(LOGIN_MODE_KEY) as LoginMode | null;
    state.loginMode = savedMode === 'uid' || savedMode === 'cookie' || savedMode === 'qr' ? savedMode : 'none';
    if (state.loginCookie.startsWith(UID_LOGIN_PREFIX)) {
      state.loginMode = 'uid';
    }
    logAuthDebug('hydrate', { hasCookie: Boolean(state.loginCookie), loginMode: state.loginMode, cookiePreview: maskCookie(state.loginCookie) });
  }

  async function saveCookie(cookie: string) {
    state.loginCookie = cookie;
    logAuthDebug('saveCookie', { hasCookie: Boolean(cookie), loginMode: state.loginMode, cookiePreview: maskCookie(cookie) });
    if (cookie) {
      try { await storageSetItem(LOGIN_COOKIE_KEY, cookie); } catch (e: unknown) {
        logAuthDebug('saveCookie:fallbackError', { name: (e as Error)?.name, message: (e as Error)?.message || String(e), cookieSize: cookie.length });
        throw new Error('Cookie 存储失败，请检查浏览器存储设置或清理后再试。');
      }
      localStorage.setItem(LOGIN_MODE_KEY, state.loginMode);
    } else {
      await storageRemoveItem(LOGIN_COOKIE_KEY);
      localStorage.removeItem(LOGIN_MODE_KEY);
    }
  }

  async function resetSession() {
    state.authRequestSeq += 1;
    state.isLogin = false;
    state.profile = null;
    state.playlists = [];
    state.likedSongIds = [];
    state.subscribedDjIds = [];
    state.subscribedPlaylistIds = [];
    state.subscribedAlbumIds = [];
    state.subscribedArtistIds = [];
    state.subscribedUserIds = [];
    state.isVip = false;
    state.vipInfo = null;
    state.level = 0;
    state.loginMode = 'none';
    state.loginVerified = false;
    await saveCookie('');
  }

  async function logout() {
    const cookie = state.loginCookie || undefined;
    try { await logoutRequest(cookie); } catch { /* ignore */ }
    finally {
      playerStore.clearPersistedState();
      clearCache();
      apiCache.clearUserScoped();
      try { localStorage.removeItem(LOCAL_HISTORY_KEY); } catch {}
      try { localStorage.removeItem('music_search_history'); } catch {}
      try { localStorage.removeItem('tm_search_history'); } catch {}
      await resetSession();
    }
  }

  async function loginWithCookie(cookie: string) {
    const normalizedCookie = String(cookie || '').trim();
    if (!normalizedCookie) throw new Error('请输入 Cookie');
    const requestId = ++state.authRequestSeq;
    await saveCookie(normalizedCookie);
    try {
      await refreshLoginStatus(requestId);
      if (!state.isLogin && requestId === state.authRequestSeq) {
        const accountRes = await getUserAccount();
        const profile = accountRes?.data?.profile || accountRes?.data?.data?.profile || null;
        if (profile?.userId && requestId === state.authRequestSeq) {
          state.profile = profile;
          state.isLogin = true;
          apiCache.clearUserScoped();
          state.loginMode = 'cookie';
          await Promise.allSettled([fetchPlaylists(profile.userId), fetchLikedSongs(profile.userId), fetchSubscribedDjs()]);
          fetchVipInfo();
        }
      }
      if (!state.isLogin && requestId === state.authRequestSeq) throw new Error('Cookie 无效、缺少必要字段，或当前接口未返回登录态');
    } catch (error: any) {
      if (requestId === state.authRequestSeq) await resetSession();
      throw error;
    }
  }

  async function loginWithUid(uid: number | string) {
    const normalizedUid = Number(uid);
    if (!Number.isFinite(normalizedUid) || normalizedUid <= 0) throw new Error('请输入有效 UID');
    const requestId = ++state.authRequestSeq;
    const { data } = await getUserDetail(normalizedUid);
    const profile = data?.profile || data?.data?.profile || null;
    if (!profile?.userId) throw new Error('未找到该 UID 对应用户');
    if (requestId !== state.authRequestSeq) return;
    state.profile = profile;
    state.isLogin = true;
    apiCache.clearUserScoped();
    state.playlists = [];
    state.likedSongIds = [];
    state.subscribedDjIds = [];
    state.subscribedPlaylistIds = [];
    state.subscribedAlbumIds = [];
    state.subscribedArtistIds = [];
    state.subscribedUserIds = [];
    state.level = data?.level ?? data?.data?.level ?? 0;
    state.isVip = false;
    state.vipInfo = null;
    state.loginMode = 'uid';
    await saveCookie('uid=' + String(profile.userId));
  }

  async function restoreUidLogin(uid: number, requestId = ++state.authRequestSeq) {
    try {
      const { data } = await getUserDetail(uid);
      const profile = data?.profile || data?.data?.profile || null;
      if (!profile?.userId) throw new Error('未找到已保存 UID 对应用户');
      if (requestId !== state.authRequestSeq) return;
      state.profile = profile;
      state.isLogin = true;
      apiCache.clearUserScoped();
      state.loginMode = 'uid';
      state.playlists = [];
      state.likedSongIds = [];
      state.subscribedDjIds = [];
      state.subscribedPlaylistIds = [];
      state.subscribedAlbumIds = [];
      state.subscribedArtistIds = [];
      state.subscribedUserIds = [];
      state.level = data?.level ?? data?.data?.level ?? 0;
      state.isVip = false;
      state.vipInfo = null;
      await saveCookie(UID_LOGIN_PREFIX + String(profile.userId));
    } catch (error: any) {
      if (requestId === state.authRequestSeq) await resetSession();
    }
  }

  async function refreshLoginStatus(requestId = ++state.authRequestSeq) {
    if (state.loginCookie.startsWith(UID_LOGIN_PREFIX)) {
      const uid = Number(state.loginCookie.slice(UID_LOGIN_PREFIX.length));
      if (Number.isFinite(uid) && uid > 0) {
        await restoreUidLogin(uid, requestId);
        if (requestId === state.authRequestSeq) state.loginVerified = true;
        return;
      }
    }
    const cookie = state.loginCookie || undefined;
    const { data } = await getLoginStatus(cookie);
    const profile = data?.data?.profile || null;
    if (requestId !== state.authRequestSeq) return;
    state.profile = profile;
    state.isLogin = Boolean(profile?.userId);
    state.loginMode = state.isLogin ? 'cookie' : 'none';
    if (state.isLogin && profile?.userId) {
      const results = await Promise.allSettled([fetchPlaylists(profile.userId), fetchLikedSongs(profile.userId), fetchSubscribedDjs(), fetchSubscribedAlbums(), fetchSubscribedArtists(), fetchSubscribedPlaylists(), fetchSubscribedUsers(profile.userId)]);
      fetchVipInfo();
    } else {
      state.playlists = []; state.likedSongIds = []; state.subscribedDjIds = [];
      state.subscribedPlaylistIds = []; state.subscribedAlbumIds = []; state.subscribedArtistIds = []; state.subscribedUserIds = [];
    }
    state.loginVerified = true;
  }

  async function fetchPlaylists(uid: number) {
    const { data } = await getUserPlaylist(uid, state.loginCookie || undefined);
    const playlists = data?.playlist || [];
    state.playlists = playlists;
    state.subscribedPlaylistIds = (Array.isArray(playlists) ? playlists : [])
      .filter((p: any) => p?.subscribed)
      .map((p: any) => Number(p?.id || 0))
      .filter((id: number) => Number.isFinite(id) && id > 0);
  }

  async function fetchLikedSongs(uid: number) {
    const { data } = await getUserLikeList(uid, state.loginCookie || undefined);
    const ids = data?.ids || data?.data?.ids || data?.songs?.map((song: any) => song?.id) || data?.data?.songs?.map((song: any) => song?.id) || [];
    state.likedSongIds = (Array.isArray(ids) ? ids : []).map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id) && id > 0);
  }

  async function fetchSubscribedDjs() {
    const { data } = await getDjSublist(state.loginCookie || undefined);
    const candidates = [data?.djRadios, data?.data?.djRadios, data?.list, data?.data?.list, data?.data, data?.data?.data];
    const items = candidates.find((candidate) => Array.isArray(candidate)) || [];
    state.subscribedDjIds = items.map((item: any) => Number(item?.id || item?.radio?.id || item?.program?.radio?.id || item?.rid || 0)).filter((id: number) => Number.isFinite(id) && id > 0);
  }

  async function fetchSubscribedAlbums() {
    try {
      const { data } = await getAlbumSublist({ cookie: state.loginCookie || undefined });
      const candidates = [data?.data, data?.albums, data?.list];
      const items = candidates.find((c) => Array.isArray(c)) || [];
      state.subscribedAlbumIds = items.map((item: any) => Number(item?.id || 0)).filter((id: number) => Number.isFinite(id) && id > 0);
    } catch { state.subscribedAlbumIds = []; }
  }

  async function fetchSubscribedArtists() {
    try {
      const { data } = await getArtistSublist({ cookie: state.loginCookie || undefined });
      const candidates = [data?.data, data?.artists, data?.list];
      const items = candidates.find((c) => Array.isArray(c)) || [];
      state.subscribedArtistIds = items.map((item: any) => Number(item?.id || 0)).filter((id: number) => Number.isFinite(id) && id > 0);
    } catch { state.subscribedArtistIds = []; }
  }

  async function fetchSubscribedPlaylists() {
    try {
      const uid = state.profile?.userId;
      if (!uid) { state.subscribedPlaylistIds = []; return; }
      const { data } = await getUserPlaylist(uid, state.loginCookie || undefined);
      const playlists = data?.playlist || [];
      state.subscribedPlaylistIds = (Array.isArray(playlists) ? playlists : []).filter((p: any) => p?.subscribed).map((p: any) => Number(p?.id || 0)).filter((id: number) => Number.isFinite(id) && id > 0);
    } catch { state.subscribedPlaylistIds = []; }
  }

  async function fetchSubscribedUsers(uid: number) {
    try {
      const { data } = await getUserFollows(uid, { cookie: state.loginCookie || undefined });
      const candidates = [data?.data?.follows, data?.data, data?.follow, data?.follows, data?.list];
      const items = candidates.find((c: any) => Array.isArray(c)) || [];
      state.subscribedUserIds = items.map((item: any) => Number(item?.userId || item?.id || 0)).filter((id: number) => Number.isFinite(id) && id > 0);
    } catch { state.subscribedUserIds = []; }
  }

  async function fetchVipInfo() {
    try {
      const uid = state.profile?.userId;
      const cookie = state.loginCookie || undefined;
      const isRealLogin = state.loginMode === 'cookie' || state.loginMode === 'qr';

      if (uid) {
        try {
          const detailRes = await getUserDetail(uid);
          state.level = detailRes?.data?.level ?? detailRes?.data?.data?.level ?? 0;
        } catch { /* ignore */ }
      }

      let vipData: Record<string, any>;

      if (isRealLogin && cookie) {
        const { data: authData } = await getVipInfo(undefined, cookie);
        vipData = authData?.data || {};

        const hasNestedVip = vipData.associator || vipData.musicPackage || vipData.redplus;
        const hasVipCode = hasNestedVip && (
          Number(vipData.associator?.vipCode ?? 0) > 0
          || Number(vipData.musicPackage?.vipCode ?? 0) > 0
          || Number(vipData.redplus?.vipCode ?? 0) > 0
        );

        if (hasNestedVip && hasVipCode) {
          state.vipInfo = {
            associator: vipData.associator ?? { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
            musicPackage: vipData.musicPackage ?? { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
            redplus: vipData.redplus ?? { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
            redVipLevelIcon: vipData.redVipLevelIcon ?? '',
          };
          const now = Date.now();
          state.isVip
            = (state.vipInfo.associator.vipCode > 0 && (state.vipInfo.associator.expireTime === -1 || state.vipInfo.associator.expireTime > now))
            || (state.vipInfo.musicPackage.vipCode > 0 && (state.vipInfo.musicPackage.expireTime === -1 || state.vipInfo.musicPackage.expireTime > now))
            || (state.vipInfo.redplus.vipCode > 0 && (state.vipInfo.redplus.expireTime === -1 || state.vipInfo.redplus.expireTime > now));
          return;
        }
      }

      if (uid) {
        const { data: uidData } = await getVipInfo(uid);
        vipData = uidData?.data || {};
      } else {
        vipData = {};
      }

      if (vipData.associator || vipData.musicPackage || vipData.redplus) {
        state.vipInfo = {
          associator: vipData.associator ?? { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
          musicPackage: vipData.musicPackage ?? { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
          redplus: vipData.redplus ?? { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
          redVipLevelIcon: vipData.redVipLevelIcon ?? '',
        };
        state.isVip = state.vipInfo.associator.vipCode > 0 || state.vipInfo.musicPackage.vipCode > 0 || state.vipInfo.redplus.vipCode > 0;
      } else {
        const redVipLevel = vipData.redVipLevel ?? 0;
        state.vipInfo = {
          associator: { vipCode: redVipLevel, expireTime: 0, iconUrl: vipData.redVipLevelIcon ?? '', dynamicIconUrl: vipData.redVipDynamicIconUrl ?? null, vipLevel: redVipLevel, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
          musicPackage: { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
          redplus: { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
          redVipLevelIcon: vipData.redVipLevelIcon ?? '',
        };
        state.isVip = false;
      }
    } catch (e: any) {
      state.isVip = false;
      state.vipInfo = null;
    }
  }

  return {
    state, hydrate, saveCookie, resetSession, logout,
    loginWithCookie, loginWithUid, restoreUidLogin, refreshLoginStatus,
    fetchPlaylists, fetchLikedSongs, fetchSubscribedDjs, fetchSubscribedAlbums,
    fetchSubscribedArtists, fetchSubscribedPlaylists, fetchSubscribedUsers, fetchVipInfo,
  };
});
