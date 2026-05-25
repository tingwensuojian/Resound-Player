import { defineStore } from 'pinia';
import { reactive, toRaw } from 'vue';
import { getIntelligenceList, getPlaylistTrackAll, getSongDetail, trashPersonalFm } from '../api/music';
import { useUserStore } from './user';
import { useLoginModalStore } from '../stores/loginModal';
import { hydrateCache, getCache, setCache } from './unblock-cache';
import { recordLocalHistoryEntry } from '../utils/localHistory';
import { platform } from '../utils/platform';
import { useEqSettingsStore } from './eqSettings';
import { resolvePlayUrl } from '../player/playbackResolver';
import { useUiStore } from './ui';
import { getPlayerRuntime, initPlayerRuntime } from '../player/runtime';
import { getPlaybackSnapshot, subscribePlaybackSnapshot } from '../player/bridge';
import type { PlaybackCommand } from '../player/contracts';

type Artist = { name: string };
type Album = { name?: string; picUrl?: string };
type TrackSource = 'song' | 'podcast' | 'cloud' | 'local';
type PodcastMeta = { rid?: number; programId?: number; createTime?: number; feeBadge?: string; feeTone?: string };
type ThemeMode = '浅色' | '深色' | '跟随系统';
type PersonalFmFetcher = () => Promise<any[]>;

export type Track = {
  id: number;
  name: string;
  ar?: Artist[];
  al?: Album;
  url?: string;
  source?: TrackSource;
  podcast?: PodcastMeta;
  liked?: boolean;
  isLiked?: boolean;
  // 播客单集简介
  description?: string;
  // 云盘歌曲专用
  cloudSid?: number;
  cloudOwnerId?: number;
  uid?: number;
  // 本地歌曲
  path?: string;
};

const PLAYER_STORAGE_KEY = 'gm_player_state_v1';
let _persistTimer: ReturnType<typeof setTimeout> | null = null;

function formatTrack(raw: any): Track {
  return {
    id: raw.id,
    name: raw.name,
    ar: raw.ar || raw.artists || [],
    al: raw.al || raw.album || {},
    url: raw.url,
    source: raw.source === 'podcast' ? 'podcast' : raw.source === 'cloud' ? 'cloud' : raw.source === 'local' ? 'local' : 'song',
    podcast: raw.podcast,
    liked: Boolean(raw.liked || raw.isLiked),
    isLiked: Boolean(raw.isLiked || raw.liked),
    description: raw.description,
    cloudSid: raw.cloudSid,
    cloudOwnerId: raw.cloudOwnerId,
    uid: raw.uid,
    path: raw.path,
  };
}

function cloneTrack(track: Track | null) {
  if (!track) return null;
  const raw = toRaw(track) as Track;
  return {
    ...raw,
    ar: Array.isArray(raw.ar) ? raw.ar.map((artist) => ({ ...toRaw(artist) })) : [],
    al: raw.al ? { ...toRaw(raw.al) } : {},
    podcast: raw.podcast ? { ...toRaw(raw.podcast) } : undefined,
  } as Track;
}


const VALID_QUALITIES = new Set(['标准', '较高', '极高(HQ)', '无损(SQ)', 'Hi-Res', '高清臻音', '高清环绕声', '沉浸环绕声', '杜比全景声', '超清母带']);

function getWindowRole(): 'main' | 'mini' {
  return window.appEnv?.windowRole === 'mini' ? 'mini' : 'main';
}

function getRuntime() {
  return getPlayerRuntime();
}

export const usePlayerStore = defineStore('player', () => {
  const userStore = useUserStore();
  const loginModalStore = useLoginModalStore();
  const eqSettings = useEqSettingsStore();

  const state = reactive({

  audio: null as HTMLAudioElement | null,
  playlist: [] as Track[],
  currentIndex: -1,
  currentTrack: null as Track | null,
  currentSongId: 0,
  miniLyricText: '',
  currentQualityBr: 0,
  currentQualityDowngraded: false,
  qualityDowngradeInfo: null as { from: string; to: string } | null,
  currentSource: 'official' as string,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.7,
  muted: false,
  volumeBeforeMute: 0.7,
  loading: false,
  defaultPlaylist: [] as any[],
  expanded: false,
  themePrimary: 'var(--theme-primary)',
  themeMode: '跟随系统' as ThemeMode,
  isDarkMode: false,
  personalFmTrackIds: [] as number[],
  personalFmFetcher: null as PersonalFmFetcher | null,
  personalFmLoadingMore: false,
  personalFmHasMore: true,
  personalFmPrefetchThreshold: 2,
  fmMode: 'DEFAULT',
  fmSubmode: '',
  autoplayNext: true,
  playMode: 'loop' as 'loop' | 'single' | 'shuffle',
  crossfadeSec: 0,
  playbackRate: 1,
  defaultPlaybackRate: 1,
  paidContentSkip: true,
  defaultQuality: '较高' as '标准' | '较高' | '极高(HQ)' | '无损(SQ)' | 'Hi-Res' | '高清臻音' | '高清环绕声' | '沉浸环绕声' | '杜比全景声' | '超清母带',
  lyricsOffset: 0,
  currentPlaylistId: 0,
  currentIntelligenceLoading: false,
  isIntelligenceActive: false,

  });

  let stopRuntimeSubscription: (() => void) | null = null;
  let stopPlaybackStateSubscription: (() => void) | null = null;
  let stopPlaybackCommandSubscription: (() => void) | null = null;

  function applyPlaybackSnapshot(snapshot: ReturnType<typeof getPlaybackSnapshot>) {
    state.currentTrack = snapshot.currentTrack as Track | null;
    state.playlist = snapshot.playlist as Track[];
    state.currentIndex = snapshot.currentIndex;
    state.currentSongId = Number(snapshot.currentTrack?.id || 0);
    state.miniLyricText = snapshot.miniLyricText || '';
    state.isPlaying = snapshot.isPlaying;
    state.currentTime = snapshot.currentTime;
    state.duration = snapshot.duration;
    state.volume = snapshot.volume;
    state.muted = snapshot.muted;
    state.loading = snapshot.loading;
    state.currentSource = snapshot.currentSource;
    state.currentQualityBr = snapshot.currentQualityBr;
    state.currentQualityDowngraded = snapshot.currentQualityDowngraded;
    state.qualityDowngradeInfo = snapshot.qualityDowngradeInfo;
    state.playMode = snapshot.playMode;
    state.playbackRate = snapshot.playbackRate;
  }

  function isMiniWindow() {
    return getWindowRole() === 'mini';
  }

  function sendPlaybackCommand(command: PlaybackCommand) {
    window.appEnv?.playback?.sendCommand?.(command);
  }

  function syncRuntimeState() {
    if (isMiniWindow()) return;
    const runtime = getRuntime();
    runtime.state.currentTrack = cloneTrack(state.currentTrack) as any;
    runtime.state.playlist = state.playlist.map((track) => cloneTrack(track) as any);
    runtime.state.currentIndex = state.currentIndex;
    runtime.state.miniLyricText = state.miniLyricText;
    runtime.state.isPlaying = state.isPlaying;
    runtime.state.currentTime = state.currentTime;
    runtime.state.duration = state.duration;
    runtime.state.volume = state.volume;
    runtime.state.muted = state.muted;
    runtime.state.playMode = state.playMode;
    runtime.state.playbackRate = state.playbackRate;
    runtime.state.loading = state.loading;
    runtime.state.currentSource = state.currentSource;
    runtime.state.currentQualityBr = state.currentQualityBr;
    runtime.state.currentQualityDowngraded = state.currentQualityDowngraded;
    runtime.state.qualityDowngradeInfo = state.qualityDowngradeInfo;
    runtime.notify();
  }

  function setMiniLyricText(text: string) {
    if (isMiniWindow()) return;
    const nextText = text.trim();
    if (state.miniLyricText === nextText) return;
    state.miniLyricText = nextText;
    syncRuntimeState();
  }

  async function executeHostCommand(command: PlaybackCommand) {
    switch (command.type) {
      case 'togglePlay':
        await togglePlay({ fromRemote: true });
        return;
      case 'next':
        await next({ fromRemote: true });
        return;
      case 'prev':
        await prev({ fromRemote: true });
        return;
      case 'seek':
        seek(command.time, { fromRemote: true });
        return;
      case 'setVolume':
        setVolume(command.volume, { fromRemote: true });
        return;
      case 'toggleMute':
        toggleMute({ fromRemote: true });
        return;
      case 'playByIndex':
        await playByIndex(command.index, { fromRemote: true });
        return;
      case 'removeFromPlaylist':
        removeFromPlaylist(command.index, { fromRemote: true });
        return;
      case 'openExpanded':
        openExpanded({ fromRemote: true });
        return;
      case 'closeExpanded':
        closeExpanded({ fromRemote: true });
        return;
      default:
        return;
    }
  }


  function init() {
    const runtime = initPlayerRuntime(getWindowRole());
    if (!runtime) {
      hydrateCache();
      hydrate();
      window.appEnv?.playback?.getInitialSnapshot?.().then((snapshot) => {
        if (snapshot) applyPlaybackSnapshot(snapshot);
      }).catch(() => {});
      stopPlaybackStateSubscription?.();
      stopPlaybackStateSubscription = window.appEnv?.playback?.onState?.((snapshot) => {
        if (snapshot) applyPlaybackSnapshot(snapshot);
      }) || null;
      stopPlaybackCommandSubscription?.();
      return;
    }
    hydrateCache();
    state.audio = runtime.audio;
    state.audio.volume = state.volume;

    stopRuntimeSubscription?.();
    stopRuntimeSubscription = subscribePlaybackSnapshot((snapshot) => {
      applyPlaybackSnapshot(snapshot);
      window.appEnv?.playback?.publishState?.(snapshot);
    });
    stopPlaybackCommandSubscription?.();
    stopPlaybackCommandSubscription = window.appEnv?.playback?.onCommand?.((command) => {
      void executeHostCommand(command);
    }) || null;

    hydrate();
  }

  function persist() {
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
      _persistTimer = null;
      const playlist = trimPlaylistForStorage();
    const defaultPlaylist = Array.isArray(state.defaultPlaylist) ? state.defaultPlaylist.slice(0, 50).map((t: any) =>
      t ? { id: t.id, name: t.name, ar: t.ar?.slice(0, 3) || [], al: t.al ? { name: t.al.name } : undefined } : t
    ) : [];
    const personalFmTrackIds = state.personalFmTrackIds.slice(0, 200);
    const payload = {
      playlist,
      currentIndex: state.currentIndex,
      volume: state.volume,
      muted: state.muted,
      volumeBeforeMute: state.volumeBeforeMute,
      autoplayNext: state.autoplayNext,
      playMode: state.playMode,
      crossfadeSec: state.crossfadeSec,
      defaultPlaybackRate: state.defaultPlaybackRate,
      paidContentSkip: state.paidContentSkip,
      defaultQuality: state.defaultQuality,
      themePrimary: state.themePrimary,
      themeMode: state.themeMode,
      isDarkMode: state.isDarkMode,
      personalFmTrackIds,
      personalFmHasMore: state.personalFmHasMore,
      fmMode: state.fmMode,
      fmSubmode: state.fmSubmode,
      defaultPlaylist,
      currentPlaylistId: state.currentPlaylistId,
    };
    try {
      const json = JSON.stringify(payload);
      localStorage.setItem(PLAYER_STORAGE_KEY, json);
      console.debug('[player] persist saved, defaultQuality:', payload.defaultQuality);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn('[player] quota exceeded, trimming to 10 tracks');
        payload.playlist = trimPlaylistForStorage(10);
        payload.defaultPlaylist = [];
        payload.personalFmTrackIds = [];
        try {
          const json = JSON.stringify(payload);
          localStorage.setItem(PLAYER_STORAGE_KEY, json);
          console.debug('[player] persist saved (trimmed), defaultQuality:', payload.defaultQuality);
        } catch {
          console.warn('[player] quota still exceeded, removing key and retrying with empty data');
          try {
            localStorage.removeItem(PLAYER_STORAGE_KEY);
            localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ ...payload, playlist: [], defaultPlaylist: [] }));
            console.debug('[player] persist saved (empty fallback)');
          } catch (e2) {
            if (e2 instanceof DOMException && e2.name === 'QuotaExceededError') {
              console.warn('[player] localStorage full — other data consuming all quota, skipping persist');
            }
          }
        }
      }
    }
    }, 0);
  }

  function trimPlaylistForStorage(maxEntries = 50) {
    if (state.playlist.length <= maxEntries) {
      return state.playlist.map((t) => ({
        id: t.id,
        name: t.name,
        ar: t.ar?.slice(0, 3) || [],
        al: t.al ? { name: t.al.name } : undefined,
        source: t.source,
        podcast: t.podcast,
      }));
    }
    const start = Math.max(0, state.currentIndex - 10);
    const trimmed = state.playlist.slice(start, start + maxEntries);
    return trimmed.map((t) => ({
      id: t.id,
      name: t.name,
      ar: t.ar?.slice(0, 3) || [],
      al: t.al ? { name: t.al.name } : undefined,
      source: t.source,
      podcast: t.podcast,
    }));
  }

  function hydrate() {
    try {
      const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
      if (!raw) {
        syncThemeState();
        return;
      }
      const parsed = JSON.parse(raw);
      // 不恢复播放列表和播放状态，用户需要主动点击歌单或播放时才加载内容
      state.playlist = [];
      state.currentIndex = -1;
      state.currentTrack = null;
      state.currentSongId = 0;
      state.volume = typeof parsed.volume === 'number' ? parsed.volume : 0.7;
      state.muted = typeof parsed.muted === 'boolean' ? parsed.muted : false;
      state.volumeBeforeMute = typeof parsed.volumeBeforeMute === 'number' ? parsed.volumeBeforeMute : state.volume;
      if (state.audio) {
        state.audio.volume = state.muted ? 0 : state.volume;
      }

      state.autoplayNext = typeof parsed.autoplayNext === 'boolean' ? parsed.autoplayNext : true;
      state.playMode = parsed.playMode === 'single' || parsed.playMode === 'shuffle' ? parsed.playMode : 'loop';
      state.crossfadeSec = typeof parsed.crossfadeSec === 'number' ? parsed.crossfadeSec : 0;
      state.playbackRate = 1;
      state.defaultPlaybackRate = typeof parsed.defaultPlaybackRate === 'number' ? parsed.defaultPlaybackRate : 1;
      state.paidContentSkip = typeof parsed.paidContentSkip === 'boolean' ? parsed.paidContentSkip : true;
      const savedQuality = localStorage.getItem('gm_quality_v1');
      const persistedQuality = typeof parsed.defaultQuality === 'string' ? parsed.defaultQuality : '';
      const VALID_QUALITIES = new Set(['标准', '较高', '极高(HQ)', '无损(SQ)', 'Hi-Res', '高清臻音', '高清环绕声', '沉浸环绕声', '杜比全景声', '超清母带']);
      state.defaultQuality = savedQuality && VALID_QUALITIES.has(savedQuality)
        ? savedQuality
        : (VALID_QUALITIES.has(persistedQuality) ? persistedQuality : '较高');
      console.debug('[player] hydrate defaultQuality:', parsed.defaultQuality, '→', state.defaultQuality);
      state.themePrimary = typeof parsed.themePrimary === 'string' && parsed.themePrimary ? parsed.themePrimary : 'var(--theme-primary)';
      state.themeMode = parsed.themeMode === '浅色' || parsed.themeMode === '深色' || parsed.themeMode === '跟随系统' ? parsed.themeMode : '跟随系统';
      state.isDarkMode = typeof parsed.isDarkMode === 'boolean' ? parsed.isDarkMode : false;
      state.personalFmTrackIds = Array.isArray(parsed.personalFmTrackIds) ? parsed.personalFmTrackIds.map((id: unknown) => Number(id || 0)).filter((id: number) => id > 0) : [];
      state.personalFmHasMore = typeof parsed.personalFmHasMore === 'boolean' ? parsed.personalFmHasMore : true;
      state.fmMode = typeof parsed.fmMode === 'string' ? parsed.fmMode : 'DEFAULT';
      state.fmSubmode = typeof parsed.fmSubmode === 'string' ? parsed.fmSubmode : '';
      state.defaultPlaylist = Array.isArray(parsed.defaultPlaylist) ? parsed.defaultPlaylist : [];
      state.currentPlaylistId = typeof parsed.currentPlaylistId === 'number' ? parsed.currentPlaylistId : 0;
      if (state.audio) state.audio.playbackRate = state.playbackRate;
      syncThemeState();
      syncRuntimeState();
    } catch {
      syncThemeState();
      syncRuntimeState();
    }
  }

  function enableEq(on: boolean) {
    const { audioEngine } = getRuntime();
    const audio = state.audio;
    if (!audio || audioEngine.isEnabled === on) return;

    if (on) {
      const wasPlaying = state.isPlaying;
      const savedTime = audio.currentTime;
      if (wasPlaying) audio.pause();

      audioEngine.ensureReady();
      if (!audioEngine.isReady) {
        console.warn('[EQ] pipeline init failed, fallback to native');
        if (wasPlaying) {
          audio.currentTime = savedTime;
          audio.play().catch(() => {});
        }
        return;
      }

      audioEngine.rebuildChain(true, eqSettings.state.gains);

      if (wasPlaying) {
        audio.currentTime = savedTime;
        audio.play().catch((err) => {
          console.warn('[EQ] resume playback failed:', err);
        });
      }

      audioEngine.syncVolume(state.volume, state.muted);
    } else {
      const wasPlaying = state.isPlaying;
      const savedTime = audio.currentTime;
      if (wasPlaying) audio.pause();

      audioEngine.rebuildChain(false);

      if (audio.crossOrigin === 'anonymous' && audio.src) {
        audio.crossOrigin = '';
        const savedSrc = audio.currentSrc || audio.src;
        audio.src = savedSrc;
        audio.load();
      }

      if (wasPlaying) {
        audio.currentTime = savedTime;
        audio.play().catch(() => {});
      }
    }
  }

  function setEqGains(gains: number[]) {
    getRuntime().audioEngine.setEqGains(gains);
  }

  function setPlaylist(list: any[], startIndex = 0, playlistId?: number) {
    state.playlist = list.map((x) => formatTrack(x));
    state.currentIndex = startIndex;
    if (typeof playlistId === 'number') {
      state.currentPlaylistId = playlistId;
    }
    syncRuntimeState();
    persist();
  }
/** 将一批 track 追加到当前播放列表末尾，不替换已有队列。
   *  - 按 (id + source) 组合键去重
   *  - 允许歌曲和播客节目混合在同一队列中
   *  - 返回实际追加数量
   */
  function appendToQueue(tracks: any[]) {
    if (!tracks.length) return 0;

    const incoming = tracks.map((t) => formatTrack(t));

    // 组合键去重 (id:source)，避免歌曲与播客 id 碰撞
    const existingKeys = new Set(state.playlist.map((t) => `${t.id}:${t.source}`));
    const unique = incoming.filter((t) => t.id > 0 && !existingKeys.has(`${t.id}:${t.source}`));

    if (!unique.length) return 0;

    state.playlist.push(...unique);
    syncRuntimeState();
    persist();
    return unique.length;
  }

  async function playIntelligenceList() {
    let songId = state.currentSongId;
    const pid = state.currentPlaylistId;
    if (!pid) return '请先从歌单选择歌曲';
    state.currentIntelligenceLoading = true;
    try {
      // 未播放时，取歌单第一首作为种子
      if (!songId) {
        const cookie = userStore.state.loginCookie || undefined;
        const plRes = await getPlaylistTrackAll({ id: pid, limit: 1, cookie });
        const firstTrack = plRes?.data?.songs?.[0];
        if (firstTrack?.id) {
          songId = firstTrack.id;
        } else {
          return '歌单暂无歌曲，无法开启心动模式';
        }
      }
      const cookie = userStore.state.loginCookie || undefined;
      const { data } = await getIntelligenceList({ id: songId, pid, cookie });
      if (!data) return '网络请求失败，请稍后重试';
      if (data.code === 400) return data.message || '该歌单暂不支持智能播放';
      if (data.code !== 200 || !Array.isArray(data?.data)) {
        return data?.message || '获取智能播放列表失败';
      }
      const rawList = data.data;
      const tracks = rawList.map((item: any) => {
        const info = item.songInfo || {};
        return formatTrack({
          id: info.id || item.id,
          name: info.name,
          ar: info.ar,
          al: info.al,
        });
      }).filter((t: Track) => t.id > 0);
      if (!tracks.length) return '暂无推荐歌曲';
      setPlaylist(tracks, 0, pid);
      await playByIndex(0);
      return null;
    } catch (e: any) {
      console.warn('[intelligence] failed:', e);
      return '智能播放请求异常，请稍后重试';
    } finally {
      state.currentIntelligenceLoading = false;
    }
  }

  function setPersonalFmPlaylist(list: any[], startIndex = 0) {
    state.personalFmTrackIds = list.map((x) => Number(x?.id || 0)).filter((id) => id > 0);
    setPlaylist(list, startIndex);
  }

  function appendPersonalFmTracks(list: any[]) {
    const incoming = list.map((x) => formatTrack(x));
    const existingIds = new Set(state.playlist.map((track) => track.id));
    const uniqueIncoming = incoming.filter((track) => track.id && !existingIds.has(track.id));

    if (!uniqueIncoming.length) return 0;

    state.playlist.push(...uniqueIncoming);
    state.personalFmTrackIds = [...new Set([...state.personalFmTrackIds, ...uniqueIncoming.map((track) => track.id)])];
    syncRuntimeState();
    persist();
    return uniqueIncoming.length;
  }

  function setPersonalFmFetcher(fetcher: PersonalFmFetcher | null) {
    state.personalFmFetcher = fetcher;
  }

  function setFmMode(mode: string, submode = '') {
    state.fmMode = mode;
    state.fmSubmode = submode;
    syncRuntimeState();
    persist();
  }

  function clearPersonalFmContext() {
    state.personalFmTrackIds = [];
    state.personalFmFetcher = null;
    state.personalFmLoadingMore = false;
    state.personalFmHasMore = true;
    syncRuntimeState();
    persist();
  }

  function clearPlaylistContext() {
    state.currentPlaylistId = 0;
    persist();
  }

  function isPersonalFmTrack(track?: Track | null) {
    const trackId = Number(track?.id || 0);
    return trackId > 0 && state.personalFmTrackIds.includes(trackId);
  }

  async function ensurePersonalFmQueue(minRemaining?: number) {
    if (!state.personalFmFetcher || state.personalFmLoadingMore || !state.personalFmHasMore) return 0;
    const threshold = typeof minRemaining === 'number' ? minRemaining : state.personalFmPrefetchThreshold;
    const remaining = state.playlist.length - state.currentIndex - 1;
    if (remaining >= threshold) return 0;

    state.personalFmLoadingMore = true;
    try {
      const nextBatch = await state.personalFmFetcher();
      const appendedCount = appendPersonalFmTracks(nextBatch || []);
      state.personalFmHasMore = Array.isArray(nextBatch) && nextBatch.length > 0;
      persist();
      return appendedCount;
    } catch {
      state.personalFmHasMore = false;
      persist();
      return 0;
    } finally {
      state.personalFmLoadingMore = false;
    }
  }

  function syncThemeState(themeMode?: ThemeMode) {
    if (themeMode) {
      state.themeMode = themeMode;
    }

    if (typeof window === 'undefined') {
      state.isDarkMode = state.themeMode === '深色';
      return;
    }

    const root = document.documentElement;
    const resolvedTheme = getComputedStyle(root).getPropertyValue('--theme-primary').trim();
    state.themePrimary = resolvedTheme || 'var(--theme-primary)';
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    const explicitTheme = root.dataset.theme;

    if (state.themeMode === '深色') {
      state.isDarkMode = true;
    } else if (state.themeMode === '浅色') {
      state.isDarkMode = false;
    } else if (explicitTheme === 'dark' || explicitTheme === 'light') {
      state.isDarkMode = explicitTheme === 'dark';
    } else {
      state.isDarkMode = prefersDark;
    }
  }

  async function playByIndex(index: number, options?: { fromRemote?: boolean }) {
    if (isMiniWindow() && !options?.fromRemote) {
      sendPlaybackCommand({ type: 'playByIndex', index });
      return;
    }
    if (!state.playlist[index]) {
      if (state.personalFmFetcher) {
        await ensurePersonalFmQueue(0);
      }
      if (!state.playlist[index]) return;
    }
    state.currentIndex = index;
    state.currentTrack = state.playlist[index];
    state.currentSongId = Number(state.currentTrack?.id || 0);
    syncRuntimeState();
    persist();
    await playTrack(state.currentTrack);
    if (isPersonalFmTrack(state.currentTrack)) {
      void ensurePersonalFmQueue();
    }
  }

  async function playTrack(track: Track, seekTo?: number) {
    // 付费播客提示
    if (track.source === 'podcast' && track.podcast?.feeTone === 'paid') {
      useLoginModalStore().showGlobalToast('该节目为付费内容，请前往播客详情页购买后收听', 'warning', 4000);
      state.loading = false;
      syncRuntimeState();
      if (state.paidContentSkip) {
        await next();
      } else {
        state.isPlaying = false;
        persist();
      }
      return;
    }
    state.qualityDowngradeInfo = null;
    // 切歌时重置播放速度为全局默认
    state.playbackRate = state.defaultPlaybackRate;
    if (!state.audio) return false;
    state.audio.playbackRate = state.defaultPlaybackRate;
    state.loading = true;
    syncRuntimeState();
    try {
      let playUrl = track.url || '';

      // ── 本地歌曲：通过 IPC 读取文件 → blob URL，避免 local:// 跨协议 CORS 问题 ──
      if (track.source === 'local' && (track as any).path) {
        state.currentSource = 'local';
        state.loading = false;
        // 使用 IPC 读取文件内容，创建 blob URL 给 audio 播放
        if (platform.localApi) {
          try {
            const buffer = await platform.localApi.readFile((track as any).path);
            if (buffer) {
              const ext = (track as any).path?.split('.').pop()?.toLowerCase() || 'mp3';
              const mime = ext === 'flac' ? 'audio/flac' : ext === 'wav' ? 'audio/wav' : ext === 'ogg' ? 'audio/ogg' : ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
              const blob = new Blob([buffer], { type: mime });
              playUrl = URL.createObjectURL(blob);
            }
          } catch {}
        }
        if (!playUrl) {
          // 降级：直接使用 local://（桌面端可能支持，Web 端会报 CORS）
          playUrl = `local:///${(track as any).path}`;
        }
        state.audio.src = playUrl;
        try {
          await state.audio.play();
        } catch {
          state.isPlaying = false;
          if (playUrl.startsWith('blob:')) URL.revokeObjectURL(playUrl);
          persist();
          return false;
        }
        state.isPlaying = true;
        state.currentTrack = track;
        state.currentSongId = Number(track.id || 0);
        syncRuntimeState();
        recordCurrentTrackToHistory();
        persist();
        return true;
      }

      // URL 决议：fee 探测 → 音质选择 → 缓存 → unblock → 降级检测 → 代理回退
      const uiStore = useUiStore();
      const result = await resolvePlayUrl({
        trackId: track.id,
        defaultQuality: state.defaultQuality,
        isVip: userStore.state.isVip,
        loginCookie: userStore.state.loginCookie,
        unblockEnabled: uiStore.state.unblockEnabled,
        unblockSources: uiStore.state.unblockSources,
        apiBaseUrl: platform.apiBaseUrl,
        unblockProxyUrl: platform.unblockProxyUrl,
        getCache,
        setCache,
      });
      playUrl = result.url;
      state.currentSource = result.source;
      state.currentQualityBr = result.br;
      state.currentQualityDowngraded = result.isDowngraded;
      state.qualityDowngradeInfo = result.downgradeInfo;

      const wasPlaying = state.isPlaying;
      if (typeof seekTo === 'number') {
        console.log('[quality] playTrack with seekTo:', seekTo, '| wasPlaying:', wasPlaying, '| level:', state.defaultQuality);
      }
      // 背景获取歌曲详情，不阻塞播放
      if (track.id) {
        getSongDetail(track.id).then(res => {
          const detail = res?.data?.songs?.[0];
          if (detail && state.currentSongId === track.id) {
            const n = formatTrack(detail);
            state.currentTrack = {
              ...n, name: track.name || n.name,
              ar: track.ar?.length ? track.ar : n.ar,
              al: track.al?.picUrl || track.al?.name ? track.al : n.al,
              url: track.url || n.url, source: track.source || n.source,
              podcast: track.podcast || n.podcast,
              description: track.description || n.description,
              cloudSid: track.cloudSid || n.cloudSid,
              cloudOwnerId: track.cloudOwnerId || n.cloudOwnerId,
              uid: track.uid || n.uid,
            };
            syncRuntimeState();
          }
        }).catch(() => {});
      }

      state.currentTrack = track;
      state.currentSongId = Number(track.id || 0);
      syncRuntimeState();
      console.log("[playback] source:", state.currentSource, "| br:", state.currentQualityBr, "| id:", state.currentSongId, "| song:", track.name);
      if (!playUrl) {
        state.audio.removeAttribute('src');
        state.audio.load();
        state.isPlaying = false;
        syncRuntimeState();
        persist();
        return false;
      }

      if (eqSettings.state.enabled && state.audio.crossOrigin !== 'anonymous') {
        state.audio.crossOrigin = 'anonymous';
      }
      state.audio.src = playUrl;
      if (eqSettings.state.enabled) {
        enableEq(true);
        setEqGains(eqSettings.state.gains);
      }
      if (typeof seekTo === 'number' && seekTo > 0) {
        state.audio.currentTime = seekTo;
      }
      // 确保 AudioContext 处于运行态（预创建时可能为 suspended）
      getRuntime().audioEngine.resumeIfSuspended();
      try {
        await state.audio.play();
      } catch {
        state.isPlaying = false;
        syncRuntimeState();
        persist();
        return false;
      }
      state.isPlaying = true;
      syncRuntimeState();

      if (typeof seekTo === 'number' && seekTo > 0 && wasPlaying) {
        state.audio.currentTime = seekTo;
      }

      recordCurrentTrackToHistory();

      if (state.currentIndex === -1) {
        const idx = state.playlist.findIndex((x) => x.id === state.currentSongId);
        state.currentIndex = idx;
      }

      persist();
      return true;
    } finally {
      state.loading = false;
      syncRuntimeState();
    }
  }

  async function togglePlay(options?: { fromRemote?: boolean }) {
    if (isMiniWindow() && !options?.fromRemote) {
      sendPlaybackCommand({ type: 'togglePlay' });
      return;
    }
    if (!state.currentTrack && state.playlist.length === 0 && state.defaultPlaylist.length > 0) {
      setPlaylist(state.defaultPlaylist, 0);
      await playByIndex(0);
      return;
    }
    if (!state.currentTrack && state.playlist.length > 0) {
      await playByIndex(Math.max(0, state.currentIndex));
      return;
    }

    // 刷新后可能仅恢复了歌曲信息，但 audio.src 尚未恢复
    // 此时直接 audio.play() 会失败，需要先重新拉取播放地址
    if (state.audio.paused) {
      const hasSource = Boolean(state.audio.src || state.audio.currentSrc);
      if (!hasSource && state.currentTrack) {
        await playTrack(state.currentTrack);
        return;
      }

      try {
        await state.audio.play();
        state.isPlaying = true;
        syncRuntimeState();
      } catch {
        // 若播放地址失效或被浏览器策略拦截，回退到重新拉取地址再播放
        if (state.currentTrack) {
          await playTrack(state.currentTrack);
        }
      }
    } else {
      state.audio.pause();
      state.isPlaying = false;
      syncRuntimeState();
    }
  }

  async function next(options?: { fromRemote?: boolean }) {
    if (isMiniWindow() && !options?.fromRemote) {
      sendPlaybackCommand({ type: 'next' });
      return;
    }
    if (state.playlist.length === 0) return;

    const isPersonalFmMode = isPersonalFmTrack(state.currentTrack) && Boolean(state.personalFmFetcher);

    if (state.playMode === 'single' && !isPersonalFmMode) {
      await playByIndex(state.currentIndex);
      return;
    }

    if (state.playMode === 'shuffle' && !isPersonalFmMode) {
      const nextIndex = Math.floor(Math.random() * state.playlist.length);
      await playByIndex(nextIndex);
      return;
    }

    if (isPersonalFmMode) {
      const targetIndex = state.currentIndex + 1;
      if (!state.playlist[targetIndex]) {
        await ensurePersonalFmQueue(0);
      }
      if (!state.playlist[targetIndex]) {
        return;
      }
      await playByIndex(targetIndex);
      return;
    }

    const nextIndex = (state.currentIndex + 1 + state.playlist.length) % state.playlist.length;
    await playByIndex(nextIndex);
  }

  async function dislikeCurrentPersonalFm(cookie?: string) {
    const trackId = Number(state.currentTrack?.id || 0);
    if (!trackId || !isPersonalFmTrack(state.currentTrack)) return false;

    try {
      await trashPersonalFm(trackId, cookie);
    } catch {
      // ignore network failure and still skip locally for responsiveness
    }

    state.personalFmTrackIds = state.personalFmTrackIds.filter((id) => id !== trackId);

    const removedIndex = state.currentIndex;
    state.playlist.splice(removedIndex, 1);

    if (!state.playlist.length) {
      await ensurePersonalFmQueue(0);
    } else if (removedIndex >= state.playlist.length - state.personalFmPrefetchThreshold) {
      void ensurePersonalFmQueue();
    }

    if (!state.playlist.length) {
      pausePlayback();
      state.currentIndex = -1;
      state.currentTrack = null;
      state.currentSongId = 0;
      syncRuntimeState();
      persist();
      return true;
    }

    const nextIndex = removedIndex >= state.playlist.length ? state.playlist.length - 1 : removedIndex;
    state.currentIndex = Math.max(0, nextIndex);
    syncRuntimeState();
    persist();
    await playByIndex(state.currentIndex);
    return true;
  }

  async function prev(options?: { fromRemote?: boolean }) {
    if (isMiniWindow() && !options?.fromRemote) {
      sendPlaybackCommand({ type: 'prev' });
      return;
    }
    if (state.playlist.length === 0) return;

    if (state.playMode === 'shuffle') {
      const prevIndex = Math.floor(Math.random() * state.playlist.length);
      await playByIndex(prevIndex);
      return;
    }

    const prevIndex = (state.currentIndex - 1 + state.playlist.length) % state.playlist.length;
    await playByIndex(prevIndex);
  }

  function seek(time: number, options?: { fromRemote?: boolean }) {
    if (isMiniWindow() && !options?.fromRemote) {
      sendPlaybackCommand({ type: 'seek', time });
      return;
    }
    if (!state.audio) return;
    state.audio.currentTime = Math.max(0, Math.min(time, state.duration || 0));
    state.currentTime = state.audio.currentTime;
    syncRuntimeState();
  }

  function pausePlayback(options?: { fromRemote?: boolean }) {
    if (isMiniWindow() && !options?.fromRemote) {
      sendPlaybackCommand({ type: 'togglePlay' });
      return;
    }
    if (!state.audio) return;
    state.audio.pause();
    state.isPlaying = false;
    syncRuntimeState();
  }

  function setVolume(v: number, options?: { fromRemote?: boolean }) {
    if (isMiniWindow() && !options?.fromRemote) {
      sendPlaybackCommand({ type: 'setVolume', volume: v });
      return;
    }
    const { audioEngine } = getRuntime();
    if (!state.audio) return;
    const val = Math.max(0, Math.min(v, 1));
    state.volume = val;
    if (state.muted) {
      state.muted = false;
    }
    if (audioEngine.isReady) {
      audioEngine.syncVolume(val, false);
      state.audio.volume = 1;
    } else {
      state.audio.volume = val;
    }
    syncRuntimeState();
    persist();
  }

  function toggleMute(options?: { fromRemote?: boolean }) {
    if (isMiniWindow() && !options?.fromRemote) {
      sendPlaybackCommand({ type: 'toggleMute' });
      return;
    }
    const { audioEngine } = getRuntime();
    if (!state.audio) return;
    if (state.muted) {
      state.muted = false;
      const vol = state.volumeBeforeMute;
      if (audioEngine.isReady) {
        audioEngine.syncVolume(vol, false);
        state.audio.volume = 1;
      } else {
        state.audio.volume = vol;
      }
    } else {
      state.volumeBeforeMute = state.volume;
      state.muted = true;
      if (audioEngine.isReady) {
        audioEngine.syncVolume(0, true);
        state.audio.volume = 1;
      } else {
        state.audio.volume = 0;
      }
    }
    syncRuntimeState();
    persist();
  }

  function setAutoplayNext(enabled: boolean) {
    state.autoplayNext = enabled;
    persist();
  }

  function setPlayMode(mode: 'loop' | 'single' | 'shuffle') {
    state.playMode = mode;
    syncRuntimeState();
    persist();
  }

  function cyclePlayMode() {
    const order: Array<'loop' | 'single' | 'shuffle'> = ['loop', 'single', 'shuffle'];
    const idx = order.indexOf(state.playMode);
    state.playMode = order[(idx + 1) % order.length];
    syncRuntimeState();
    persist();
  }

  function setCrossfadeSec(sec: number) {
    state.crossfadeSec = Math.max(0, Math.min(12, Math.floor(sec || 0)));
    persist();
  }

  function setPlaybackRate(rate: number) {
    const r = Math.max(0.5, Math.min(3, Number(rate || 1)));
    state.playbackRate = r;
    if (state.audio) state.audio.playbackRate = r;
    syncRuntimeState();
  }

  function setDefaultPlaybackRate(rate: number) {
    const r = Math.max(0.5, Math.min(3, Number(rate || 1)));
    state.defaultPlaybackRate = r;
    state.playbackRate = r;
    if (state.audio) state.audio.playbackRate = r;
    syncRuntimeState();
    persist();
  }

  function setCurrentSource(source: string) {
    state.currentSource = source || 'official';
    syncRuntimeState();
  }

  function setDefaultQuality(quality: '标准' | '较高' | '极高(HQ)' | '无损(SQ)' | 'Hi-Res' | '高清臻音' | '高清环绕声' | '沉浸环绕声' | '杜比全景声' | '超清母带') {
    state.defaultQuality = quality;
    console.log('[quality] setDefaultQuality:', quality);
    localStorage.setItem('gm_quality_v1', quality);
    persist();
  }

  function adjustLyricsOffset(delta: number) {
    state.lyricsOffset = Math.max(-10, Math.min(10, state.lyricsOffset + delta));
  }

  function resetLyricsOffset() {
    state.lyricsOffset = 0;
  }

  function openExpanded(options?: { fromRemote?: boolean }) {
    if (isMiniWindow() && !options?.fromRemote) {
      sendPlaybackCommand({ type: 'openExpanded' });
      return;
    }
    if (options?.fromRemote) {
      const uiStore = useUiStore();
      if (uiStore.state.isMiniMode) {
        uiStore.exitMiniMode();
        window.setTimeout(() => {
          state.expanded = true;
        }, 80);
        return;
      }
    }
    state.expanded = true;
  }

  function closeExpanded(options?: { fromRemote?: boolean }) {
    if (isMiniWindow() && !options?.fromRemote) {
      sendPlaybackCommand({ type: 'closeExpanded' });
      return;
    }
    state.expanded = false;
  }

  function toggleExpanded() {
    state.expanded = !state.expanded;
  }
/* ---- queue management ---- */

  function removeFromPlaylist(index: number, options?: { fromRemote?: boolean }) {
    if (isMiniWindow() && !options?.fromRemote) {
      sendPlaybackCommand({ type: 'removeFromPlaylist', index });
      return;
    }
    if (index < 0 || index >= state.playlist.length) return;
    state.playlist.splice(index, 1);

    if (state.playlist.length === 0) {
      state.currentIndex = -1;
      state.currentTrack = null;
      state.currentSongId = 0;
      state.miniLyricText = '';
      pausePlayback();
    } else if (index < state.currentIndex) {
      state.currentIndex -= 1;
    } else if (index === state.currentIndex) {
      const nextIndex = Math.min(state.currentIndex, state.playlist.length - 1);
      state.currentIndex = nextIndex;
      state.currentTrack = state.playlist[nextIndex] || null;
      state.currentSongId = Number(state.currentTrack?.id || 0);
      persist();
      if (state.isPlaying || state.autoplayNext) {
        void playByIndex(nextIndex);
        return;
      }
    }
    syncRuntimeState();
    persist();
  }

  function clearPlaylist() {
    state.playlist = [];
    state.currentIndex = -1;
    state.currentTrack = null;
    state.currentSongId = 0;
    state.miniLyricText = '';
    pausePlayback();
    syncRuntimeState();
    persist();
  }
/** 登出时清理播放器持久化数据，防止用户切换后 playlist 残留在 localStorage */
  function clearPersistedState() {
    clearPlaylist();
    try { localStorage.removeItem(PLAYER_STORAGE_KEY); } catch {}
  }

  function moveTrack(fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex >= state.playlist.length) return;
    if (toIndex < 0 || toIndex >= state.playlist.length) return;
    if (fromIndex === toIndex) return;
    const [track] = state.playlist.splice(fromIndex, 1);
    state.playlist.splice(toIndex, 0, track);
    if (state.currentIndex === fromIndex) {
      state.currentIndex = toIndex;
    } else {
      if (fromIndex < state.currentIndex && toIndex >= state.currentIndex) state.currentIndex -= 1;
      else if (fromIndex > state.currentIndex && toIndex <= state.currentIndex) state.currentIndex += 1;
    }
    syncRuntimeState();
    persist();
  }

  function recordCurrentTrackToHistory() {
    const track = state.currentTrack;
    if (!track?.id || !track?.name) return;
    const artistNames = (track.ar || []).map((a) => a.name).join('/');
    const entry = {
      key: `song-${track.id}`,
      title: track.name,
      subtitle: artistNames || '未知歌手',
      source: 'local_play_history',
      sourceTip: '当前设备本地播放记录',
      summary: artistNames || '单曲',
      typeLabel: '单曲',
      countLabel: '0',
      updatedAt: String(Date.now()),
      playableLabel: '播放',
      playActionTip: '',
      coverUrl: track.al?.picUrl || '',
      playTracks: [track],
      playableItem: track,
      manageType: 'song' as const,
      canUnlike: false,
      canOpenDetail: false,
      sortKey: Date.now(),
    };
    recordLocalHistoryEntry(entry as any);
  }

  return {
    state,
    init, hydrate, persist, trimPlaylistForStorage,
    enableEq, setEqGains,
    playByIndex, playTrack, togglePlay, next, prev, dislikeCurrentPersonalFm,
    setPlaylist, appendToQueue, removeFromPlaylist, clearPlaylist, moveTrack, clearPersistedState,
    setPersonalFmPlaylist, appendPersonalFmTracks, setPersonalFmFetcher, setFmMode,
    clearPersonalFmContext, ensurePersonalFmQueue, isPersonalFmTrack,
    playIntelligenceList,
    setVolume, toggleMute, setAutoplayNext, setPlayMode, cyclePlayMode, setCrossfadeSec,
    setPlaybackRate, setDefaultPlaybackRate, setCurrentSource, setDefaultQuality,
    adjustLyricsOffset, resetLyricsOffset,
    openExpanded, closeExpanded, toggleExpanded,
    seek, pausePlayback, syncThemeState, recordCurrentTrackToHistory, setMiniLyricText,
  };
});
