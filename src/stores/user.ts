import { reactive } from 'vue';
import { getLoginStatus, getUserAccount, getUserDetail, getUserLikeList, getUserPlaylist, getVipInfo, logout as logoutRequest } from '../api/auth';
import { getDjSublist, getAlbumSublist, getArtistSublist, getUserFollows } from '../api/music';
import { playerStore } from './player';
import { clearCache } from './unblock-cache';
import { apiCache } from './apiCache';
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
  // eslint-disable-next-line no-console
  console.debug('[auth-debug]', event, payload || {});
}

export const userStore = reactive({
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
  async hydrate() {
    this.loginCookie = localStorage.getItem(LOGIN_COOKIE_KEY) || '';
    if (!this.loginCookie) {
      this.loginCookie = (await storageGetItem(LOGIN_COOKIE_KEY)) || '';
    }
    const savedMode = localStorage.getItem(LOGIN_MODE_KEY) as LoginMode | null;
    this.loginMode = savedMode === 'uid' || savedMode === 'cookie' || savedMode === 'qr' ? savedMode : 'none';

    if (this.loginCookie.startsWith(UID_LOGIN_PREFIX)) {
      this.loginMode = 'uid';
    }

    logAuthDebug('hydrate', {
      hasCookie: Boolean(this.loginCookie),
      loginMode: this.loginMode,
      cookiePreview: maskCookie(this.loginCookie),
    });
  },
  async saveCookie(cookie: string) {
    this.loginCookie = cookie;
    logAuthDebug('saveCookie', {
      hasCookie: Boolean(cookie),
      loginMode: this.loginMode,
      cookiePreview: maskCookie(cookie),
    });
    if (cookie) {
      try {
        await storageSetItem(LOGIN_COOKIE_KEY, cookie);
      } catch (e: unknown) {
        logAuthDebug('saveCookie:fallbackError', {
          name: (e as Error)?.name,
          message: (e as Error)?.message || String(e),
          cookieSize: cookie.length,
        });
        // 极端情况：IndexedDB 也不可用时抛给上层处理
        throw new Error('Cookie 存储失败，请检查浏览器存储设置或清理后再试。');
      }
      localStorage.setItem(LOGIN_MODE_KEY, this.loginMode);
    } else {
      await storageRemoveItem(LOGIN_COOKIE_KEY);
      localStorage.removeItem(LOGIN_MODE_KEY);
    }
  },
  async resetSession() {
    this.authRequestSeq += 1;
    logAuthDebug('resetSession', {
      nextAuthRequestSeq: this.authRequestSeq,
    });
    this.isLogin = false;
    this.profile = null;
    this.playlists = [];
    this.likedSongIds = [];
    this.subscribedDjIds = [];
    this.subscribedPlaylistIds = [];
    this.subscribedAlbumIds = [];
    this.subscribedArtistIds = [];
    this.subscribedUserIds = [];
    this.isVip = false;
    this.vipInfo = null;
    this.level = 0;
    this.loginMode = 'none';
    await this.saveCookie('');
  },
  async logout() {
    const cookie = this.loginCookie || undefined;

    try {
      await logoutRequest(cookie);
    } catch {
      // 即使服务端退出失败，也要清理本地登录态，避免界面残留已登录状态
    } finally {
      playerStore.clearPersistedState();
      clearCache();
      apiCache.clearUserScoped();
      try { localStorage.removeItem(LOCAL_HISTORY_KEY); } catch {}
      try { localStorage.removeItem('music_search_history'); } catch {}
      try { localStorage.removeItem('tm_search_history'); } catch {}
      await this.resetSession();
    }
  },
  async loginWithCookie(cookie: string) {
    const normalizedCookie = String(cookie || '').trim();
    if (!normalizedCookie) {
      throw new Error('请输入 Cookie');
    }

    const requestId = ++this.authRequestSeq;
    logAuthDebug('loginWithCookie:start', {
      requestId,
      cookiePreview: maskCookie(normalizedCookie),
    });
    await this.saveCookie(normalizedCookie);

    try {
      await this.refreshLoginStatus(requestId);
      logAuthDebug('loginWithCookie:afterRefresh', {
        requestId,
        activeRequestSeq: this.authRequestSeq,
        isLogin: this.isLogin,
        profileUserId: this.profile?.userId || null,
      });

      if (!this.isLogin && requestId === this.authRequestSeq) {
        const accountRes = await getUserAccount();
        const profile = accountRes?.data?.profile || accountRes?.data?.data?.profile || null;
        logAuthDebug('loginWithCookie:getUserAccount', {
          requestId,
          activeRequestSeq: this.authRequestSeq,
          accountUserId: profile?.userId || null,
        });

        if (profile?.userId && requestId === this.authRequestSeq) {
          this.profile = profile;
          this.isLogin = true;
          apiCache.clearUserScoped();
          this.loginMode = 'cookie';
          await Promise.allSettled([this.fetchPlaylists(profile.userId), this.fetchLikedSongs(profile.userId), this.fetchSubscribedDjs()]);
          this.fetchVipInfo();
          logAuthDebug('loginWithCookie:accountFallbackApplied', {
            requestId,
            profileUserId: profile.userId,
          });
        }
      }

      if (!this.isLogin && requestId === this.authRequestSeq) {
        logAuthDebug('loginWithCookie:failedNoLoginState', {
          requestId,
          activeRequestSeq: this.authRequestSeq,
        });
        throw new Error('Cookie 无效、缺少必要字段，或当前接口未返回登录态');
      }

      logAuthDebug('loginWithCookie:success', {
        requestId,
        activeRequestSeq: this.authRequestSeq,
        isLogin: this.isLogin,
        profileUserId: this.profile?.userId || null,
      });
    } catch (error: any) {
      logAuthDebug('loginWithCookie:error', {
        requestId,
        activeRequestSeq: this.authRequestSeq,
        message: error?.message || String(error),
      });
      if (requestId === this.authRequestSeq) {
        await this.resetSession();
      }
      throw error;
    }
  },
  async loginWithUid(uid: number | string) {
    const normalizedUid = Number(uid);
    if (!Number.isFinite(normalizedUid) || normalizedUid <= 0) {
      throw new Error('请输入有效 UID');
    }

    const requestId = ++this.authRequestSeq;
    logAuthDebug('loginWithUid:start', {
      requestId,
      uid: normalizedUid,
    });
    const { data } = await getUserDetail(normalizedUid);
    const profile = data?.profile || data?.data?.profile || null;

    if (!profile?.userId) {
      logAuthDebug('loginWithUid:notFound', {
        requestId,
        uid: normalizedUid,
      });
      throw new Error('未找到该 UID 对应用户');
    }

    if (requestId !== this.authRequestSeq) {
      logAuthDebug('loginWithUid:staleResponseIgnored', {
        requestId,
        activeRequestSeq: this.authRequestSeq,
      });
      return;
    }

    this.profile = profile;
    this.isLogin = true;
    apiCache.clearUserScoped();
    this.playlists = [];
    this.likedSongIds = [];
    this.subscribedDjIds = [];
    this.subscribedPlaylistIds = [];
    this.subscribedAlbumIds = [];
    this.subscribedArtistIds = [];
    this.subscribedUserIds = [];
    this.loginMode = 'uid';
    await this.saveCookie('uid=' + String(profile.userId));

    await Promise.allSettled([this.fetchPlaylists(profile.userId), this.fetchLikedSongs(profile.userId), this.fetchSubscribedDjs(), this.fetchSubscribedAlbums(), this.fetchSubscribedArtists(), this.fetchSubscribedPlaylists(), this.fetchSubscribedUsers(profile.userId)]);
    this.fetchVipInfo();
    logAuthDebug('loginWithUid:success', {
      requestId,
      profileUserId: profile.userId,
    });
  },
  async restoreUidLogin(uid: number, requestId = ++this.authRequestSeq) {
    logAuthDebug('restoreUidLogin:start', {
      requestId,
      uid,
    });

    try {
      const { data } = await getUserDetail(uid);
      const profile = data?.profile || data?.data?.profile || null;

      if (!profile?.userId) {
        throw new Error('未找到已保存 UID 对应用户');
      }

      if (requestId !== this.authRequestSeq) {
        logAuthDebug('restoreUidLogin:staleResponseIgnored', {
          requestId,
          activeRequestSeq: this.authRequestSeq,
        });
        return;
      }

      this.profile = profile;
      this.isLogin = true;
      apiCache.clearUserScoped();
      this.loginMode = 'uid';
      this.playlists = [];
      this.likedSongIds = [];
      this.subscribedDjIds = [];
      this.subscribedPlaylistIds = [];
      this.subscribedAlbumIds = [];
      this.subscribedArtistIds = [];
      this.subscribedUserIds = [];
      await this.saveCookie(UID_LOGIN_PREFIX + String(profile.userId));

      await Promise.allSettled([this.fetchPlaylists(profile.userId), this.fetchLikedSongs(profile.userId), this.fetchSubscribedDjs(), this.fetchSubscribedAlbums(), this.fetchSubscribedArtists(), this.fetchSubscribedPlaylists(), this.fetchSubscribedUsers(profile.userId)]);
      this.fetchVipInfo();
      logAuthDebug('restoreUidLogin:success', {
        requestId,
        profileUserId: profile.userId,
      });
    } catch (error: any) {
      logAuthDebug('restoreUidLogin:error', {
        requestId,
        message: error?.message || String(error),
      });
      if (requestId === this.authRequestSeq) {
        await this.resetSession();
      }
    }
  },
  async refreshLoginStatus(requestId = ++this.authRequestSeq) {
    if (this.loginCookie.startsWith(UID_LOGIN_PREFIX)) {
      const uid = Number(this.loginCookie.slice(UID_LOGIN_PREFIX.length));
      if (Number.isFinite(uid) && uid > 0) {
        await this.restoreUidLogin(uid, requestId);
        return;
      }
    }

    const cookie = this.loginCookie || undefined;
    logAuthDebug('refreshLoginStatus:start', {
      requestId,
      activeRequestSeq: this.authRequestSeq,
      hasCookie: Boolean(cookie),
      cookiePreview: maskCookie(cookie || ''),
    });
    const { data } = await getLoginStatus(cookie);
    const profile = data?.data?.profile || null;

    logAuthDebug('refreshLoginStatus:response', {
      requestId,
      activeRequestSeq: this.authRequestSeq,
      profileUserId: profile?.userId || null,
      dataCode: data?.code ?? null,
    });

    if (requestId !== this.authRequestSeq) {
      logAuthDebug('refreshLoginStatus:staleResponseIgnored', {
        requestId,
        activeRequestSeq: this.authRequestSeq,
      });
      return;
    }

    this.profile = profile;
    this.isLogin = Boolean(profile?.userId);
    this.loginMode = this.isLogin ? 'cookie' : 'none';

    logAuthDebug('refreshLoginStatus:stateApplied', {
      requestId,
      isLogin: this.isLogin,
      profileUserId: this.profile?.userId || null,
    });

    if (this.isLogin && profile?.userId) {
      const results = await Promise.allSettled([this.fetchPlaylists(profile.userId), this.fetchLikedSongs(profile.userId), this.fetchSubscribedDjs(), this.fetchSubscribedAlbums(), this.fetchSubscribedArtists(), this.fetchSubscribedPlaylists(), this.fetchSubscribedUsers(profile.userId)]);
      this.fetchVipInfo();
      const rejected = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => (result.reason as any)?.message || String(result.reason));

      logAuthDebug('refreshLoginStatus:userDataLoaded', {
        requestId,
        profileUserId: profile.userId,
        playlistCount: this.playlists.length,
        likedSongCount: this.likedSongIds.length,
        subscribedDjCount: this.subscribedDjIds.length,
        rejected,
      });
    } else {
      this.playlists = [];
      this.likedSongIds = [];
      this.subscribedDjIds = [];
      this.subscribedPlaylistIds = [];
      this.subscribedAlbumIds = [];
      this.subscribedArtistIds = [];
      this.subscribedUserIds = [];
      logAuthDebug('refreshLoginStatus:clearedUserData', {
        requestId,
      });
    }
    this.loginVerified = true;
  },
  async fetchPlaylists(uid: number) {
    const { data } = await getUserPlaylist(uid, this.loginCookie || undefined);
    const playlists = data?.playlist || [];
    this.playlists = playlists;
    // 从 /user/playlist 响应中提取已订阅歌单 ID（每条歌单包含 subscribed 字段）
    this.subscribedPlaylistIds = (Array.isArray(playlists) ? playlists : [])
      .filter((p: any) => p?.subscribed)
      .map((p: any) => Number(p?.id || 0))
      .filter((id: number) => Number.isFinite(id) && id > 0);
  },
  async fetchLikedSongs(uid: number) {
    const { data } = await getUserLikeList(uid, this.loginCookie || undefined);
    const ids = data?.ids || data?.data?.ids || data?.songs?.map((song: any) => song?.id) || data?.data?.songs?.map((song: any) => song?.id) || [];
    this.likedSongIds = (Array.isArray(ids) ? ids : [])
      .map((id: any) => Number(id))
      .filter((id: number) => Number.isFinite(id) && id > 0);
  },
  async fetchSubscribedDjs() {
    const { data } = await getDjSublist(this.loginCookie || undefined);
    const candidates = [data?.djRadios, data?.data?.djRadios, data?.list, data?.data?.list, data?.data, data?.data?.data];
    const items = candidates.find((candidate) => Array.isArray(candidate)) || [];
    this.subscribedDjIds = items
      .map((item: any) => Number(item?.id || item?.radio?.id || item?.program?.radio?.id || item?.rid || 0))
      .filter((id: number) => Number.isFinite(id) && id > 0);
  },
  async fetchSubscribedAlbums() {
    try {
      const { data } = await getAlbumSublist({ cookie: this.loginCookie || undefined });
      // 尝试多种可能的响应路径
      const candidates = [data?.data, data?.albums, data?.list];
      const items = candidates.find((c) => Array.isArray(c)) || [];
      this.subscribedAlbumIds = items
        .map((item: any) => Number(item?.id || 0))
        .filter((id: number) => Number.isFinite(id) && id > 0);
    } catch {
      this.subscribedAlbumIds = [];
    }
  },
  async fetchSubscribedArtists() {
    try {
      const { data } = await getArtistSublist({ cookie: this.loginCookie || undefined });
      const candidates = [data?.data, data?.artists, data?.list];
      const items = candidates.find((c) => Array.isArray(c)) || [];
      this.subscribedArtistIds = items
        .map((item: any) => Number(item?.id || 0))
        .filter((id: number) => Number.isFinite(id) && id > 0);
    } catch {
      this.subscribedArtistIds = [];
    }
  },
  async fetchSubscribedPlaylists() {
    // 从 /user/playlist 响应中提取已订阅的歌单 ID
    try {
      const uid = this.profile?.userId;
      if (!uid) { this.subscribedPlaylistIds = []; return; }
      const { data } = await getUserPlaylist(uid, this.loginCookie || undefined);
      const playlists = data?.playlist || [];
      this.subscribedPlaylistIds = (Array.isArray(playlists) ? playlists : [])
        .filter((p: any) => p?.subscribed)
        .map((p: any) => Number(p?.id || 0))
        .filter((id: number) => Number.isFinite(id) && id > 0);
    } catch {
      this.subscribedPlaylistIds = [];
    }
  },
  async fetchSubscribedUsers(uid: number) {
    try {
      const { data } = await getUserFollows(uid, { cookie: this.loginCookie || undefined });
      // /user/follows 响应格式: { code: 200, data: { follows: [ { userId, ... }, ... ] } }
      const candidates = [data?.data?.follows, data?.data, data?.follow, data?.follows, data?.list];
      const items = candidates.find((c: any) => Array.isArray(c)) || [];
      this.subscribedUserIds = items
        .map((item: any) => Number(item?.userId || item?.id || 0))
        .filter((id: number) => Number.isFinite(id) && id > 0);
    } catch {
      this.subscribedUserIds = [];
    }
  },
  async fetchVipInfo() {
    try {
      const uid = this.profile?.userId;
      const cookie = this.loginCookie || undefined;
      const isRealLogin = this.loginMode === 'cookie' || this.loginMode === 'qr';

      // 拉取用户等级（来自 /user/detail）
      if (uid) {
        try {
          const detailRes = await getUserDetail(uid);
          this.level = detailRes?.data?.level ?? detailRes?.data?.data?.level ?? 0;
        } catch {
          // 等级拉取失败不影响 VIP 信息
        }
      }

      // 策略：仅真实登录（cookie/qr）时尝试走 cookie 认证路径（返回嵌套格式含 expireTime）
      // UID 模式的 cookie 只是 'uid=用户ID'，不是真实凭据，直接跳过
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

        // 如果 cookie 认证返回了真实 VIP 数据，直接走嵌套格式
        if (hasNestedVip && hasVipCode) {
          this.vipInfo = {
            associator: vipData.associator ?? { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
            musicPackage: vipData.musicPackage ?? { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
            redplus: vipData.redplus ?? { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
            redVipLevelIcon: vipData.redVipLevelIcon ?? '',
          };
          const now = Date.now();
          this.isVip
            = (this.vipInfo.associator.vipCode > 0 && (this.vipInfo.associator.expireTime === -1 || this.vipInfo.associator.expireTime > now))
            || (this.vipInfo.musicPackage.vipCode > 0 && (this.vipInfo.musicPackage.expireTime === -1 || this.vipInfo.musicPackage.expireTime > now))
            || (this.vipInfo.redplus.vipCode > 0 && (this.vipInfo.redplus.expireTime === -1 || this.vipInfo.redplus.expireTime > now));
          return;
        }
      }

      // 回退：带 uid 调用（扁平格式，无 expireTime）
      if (uid) {
        const { data: uidData } = await getVipInfo(uid);
        vipData = uidData?.data || {};
      } else {
        vipData = {};
      }

      if (vipData.associator || vipData.musicPackage || vipData.redplus) {
        this.vipInfo = {
          associator: vipData.associator ?? { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
          musicPackage: vipData.musicPackage ?? { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
          redplus: vipData.redplus ?? { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
          redVipLevelIcon: vipData.redVipLevelIcon ?? '',
        };
        this.isVip = this.vipInfo.associator.vipCode > 0 || this.vipInfo.musicPackage.vipCode > 0 || this.vipInfo.redplus.vipCode > 0;
      } else {
        // 扁平格式（仅有等级，不能严格证明会员身份）
        const redVipLevel = vipData.redVipLevel ?? 0;
        this.vipInfo = {
          associator: { vipCode: redVipLevel, expireTime: 0, iconUrl: vipData.redVipLevelIcon ?? '', dynamicIconUrl: vipData.redVipDynamicIconUrl ?? null, vipLevel: redVipLevel, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
          musicPackage: { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
          redplus: { vipCode: 0, expireTime: 0, iconUrl: '', dynamicIconUrl: null, vipLevel: 0, isSignDeduct: false, isSignIap: false, isSignIapDeduct: false, isSign: false },
          redVipLevelIcon: vipData.redVipLevelIcon ?? '',
        };
        this.isVip = false;
      }
    } catch (e: any) {
      this.isVip = false;
      this.vipInfo = null;
    }
  },
});
