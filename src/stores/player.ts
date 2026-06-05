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
import type { PlaybackCommand, PlaybackSnapshot } from '../player/contracts';

type Artist = { name: string };
type Album = { name?: string; picUrl?: string };
type TrackSource = 'song' | 'podcast' | 'cloud' | 'local';
type PodcastMeta = { rid?: number; programId?: number; createTime?: number; feeBadge?: string; feeTone?: string };
type ThemeMode = '浅色' | '深色' | '跟随系统';
type PersonalFmFetcher = () => Promise<any[]>;
type PlayReason = 'switch-track' | 'reload-source';
type PlayTrackOptions = { index?: number; reason?: PlayReason; fromPaidSkip?: boolean };
type ResolvedSourceInfo = {
  source: string;
  br: number;
  qualityLabel: string;
  isDowngraded: boolean;
  downgradeInfo: { from: string; to: string } | null;
};

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
let _playRequestSeq = 0;
let _activeLocalObjectUrl = '';

export function getTrackPlaybackKey(track?: Track | null) {
  if (!track) return '';
  const id = Number(track.id || 0);
  if (track.source === 'local') return `local:${id}:${track.path || ''}`;
  if (track.source === 'podcast') return `podcast:${id}:${track.podcast?.programId || track.podcast?.rid || ''}`;
  if (track.source === 'cloud') return `cloud:${id}:${track.cloudSid || ''}`;
  return `song:${id}`;
}

function isSamePlaybackResource(a?: Track | null, b?: Track | null) {
  const ak = getTrackPlaybackKey(a);
  return !!ak && ak === getTrackPlaybackKey(b);
}

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

function inferLocalAudioMime(ext: string) {
  if (ext === 'flac') return 'audio/flac'
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'ogg') return 'audio/ogg'
  if (ext === 'opus') return 'audio/ogg; codecs=opus'
  if (ext === 'm4a' || ext === 'aac') return 'audio/mp4'
  if (ext === 'wma') return 'audio/x-ms-wma'
  return 'audio/mpeg'
}

function canBrowserPlayLocalExt(ext: string) {
  if (typeof document === 'undefined') return false
  const probe = document.createElement('audio')
  const mime = inferLocalAudioMime(ext)
  return Boolean(probe.canPlayType(mime))
}

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
  currentQualityLabel: '',
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
    state.currentQualityLabel = snapshot.currentQualityLabel || '';
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
    runtime.state.currentQualityLabel = state.currentQualityLabel;
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
      window.appEnv?.playback?.getInitialSnapshot?.().then((snapshot: PlaybackSnapshot | null | undefined) => {
        if (snapshot) applyPlaybackSnapshot(snapshot);
      }).catch(() => {});
      stopPlaybackStateSubscription?.();
      stopPlaybackStateSubscription = window.appEnv?.playback?.onState?.((snapshot: PlaybackSnapshot | null | undefined) => {
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
    stopPlaybackCommandSubscription = window.appEnv?.playback?.onCommand?.((command: PlaybackCommand) => {
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

  function insertNext(rawTrack: any) {
    const track = formatTrack(rawTrack);
    if (!track?.id) return -1;
    const insertIndex = state.currentIndex >= 0
      ? Math.min(state.currentIndex + 1, state.playlist.length)
      : state.playlist.length;
    state.playlist.splice(insertIndex, 0, track);
    syncRuntimeState();
    persist();
    return insertIndex;
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

  function parsePlayTrackArgs(seekToOrOptions?: number | PlayTrackOptions, options?: PlayTrackOptions) {
    const seekTo = typeof seekToOrOptions === 'number' ? seekToOrOptions : undefined;
    const parsedOptions = typeof seekToOrOptions === 'object' && seekToOrOptions
      ? seekToOrOptions
      : options || {};
    return { seekTo, options: parsedOptions };
  }

  function findPlaylistIndexByPlaybackKey(track: Track) {
    const key = getTrackPlaybackKey(track);
    if (!key) return -1;
    return state.playlist.findIndex((item) => getTrackPlaybackKey(item) === key);
  }

  async function setAudioCurrentTimeWhenReady(time: number) {
    const audio = state.audio;
    if (!audio || time <= 0) return;
    const apply = () => {
      try {
        audio.currentTime = Math.max(0, Math.min(time, Number.isFinite(audio.duration) ? audio.duration : time));
      } catch {
        // Some streams reject seeking before metadata; play() path will continue without seek.
      }
    };
    if (audio.readyState >= 1) {
      apply();
      return;
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        audio.removeEventListener('loadedmetadata', done);
        audio.removeEventListener('error', done);
        resolve();
      };
      audio.addEventListener('loadedmetadata', done, { once: true });
      audio.addEventListener('error', done, { once: true });
      window.setTimeout(done, 1200);
    });
    apply();
  }

  function shouldUseCorsProxy(playUrl: string) {
    if (!playUrl || playUrl.startsWith('/dl-proxy')) return false;
    if (playUrl.startsWith('blob:') || playUrl.startsWith('local:')) return false;
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') return false;
    try {
      const url = new URL(playUrl, window.location.href);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function toCorsProxyUrl(playUrl: string) {
    return '/dl-proxy?url=' + encodeURIComponent(playUrl);
  }

  async function switchAudioSource(params: {
    playUrl: string;
    seekTo?: number;
    requestSeq: number;
    nextLocalObjectUrl?: string;
    sourceKind: TrackSource | string;
    previousIsPlaying: boolean;
  }) {
    const audio = state.audio;
    if (!audio || params.requestSeq !== _playRequestSeq) return false;

    const previousLocalObjectUrl = _activeLocalObjectUrl;
    const nextLocalObjectUrl = params.nextLocalObjectUrl || '';
    const previousSrc = audio.currentSrc || audio.src;
    const previousCrossOrigin = audio.crossOrigin || '';
    const previousTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;

    try {
      audio.pause();
      state.isPlaying = params.previousIsPlaying;
      if (eqSettings.state.enabled && params.sourceKind !== 'local' && audio.crossOrigin !== 'anonymous') {
        audio.crossOrigin = 'anonymous';
      }
      audio.src = params.playUrl;
      audio.load();

      if (nextLocalObjectUrl) _activeLocalObjectUrl = nextLocalObjectUrl;
      else _activeLocalObjectUrl = '';

      if (eqSettings.state.enabled) {
        enableEq(true);
        setEqGains(eqSettings.state.gains);
      }

      if (typeof params.seekTo === 'number' && params.seekTo > 0) {
        await setAudioCurrentTimeWhenReady(params.seekTo);
      }

      if (params.requestSeq !== _playRequestSeq) return false;
      state.isPlaying = params.previousIsPlaying;
      syncRuntimeState();
      getRuntime().audioEngine.resumeIfSuspended();
      await audio.play();
      if (params.requestSeq !== _playRequestSeq) return false;

      if (typeof params.seekTo === 'number' && params.seekTo > 0) {
        await setAudioCurrentTimeWhenReady(params.seekTo);
      }
      if (previousLocalObjectUrl && previousLocalObjectUrl !== nextLocalObjectUrl) {
        URL.revokeObjectURL(previousLocalObjectUrl);
      }
      return true;
    } catch (err) {
      const mediaError = audio.error;
      console.warn('[playback] switch audio source failed:', {
        requestSeq: params.requestSeq,
        sourceKind: params.sourceKind,
        targetUrl: params.playUrl,
        error: err instanceof Error ? err.message : String(err),
        mediaError: mediaError ? { code: mediaError.code, message: mediaError.message } : null,
        networkState: audio.networkState,
        readyState: audio.readyState,
      });
      if (nextLocalObjectUrl && _activeLocalObjectUrl === nextLocalObjectUrl) {
        _activeLocalObjectUrl = previousLocalObjectUrl || '';
      }
      if (nextLocalObjectUrl) URL.revokeObjectURL(nextLocalObjectUrl);
      if (previousSrc) {
        try {
          audio.pause();
          audio.crossOrigin = previousCrossOrigin;
          audio.src = previousSrc;
          audio.load();
          if (previousTime > 0) {
            await setAudioCurrentTimeWhenReady(previousTime);
          }
          if (params.previousIsPlaying) {
            state.isPlaying = true;
            syncRuntimeState();
            await audio.play();
          }
        } catch (restoreErr) {
          console.warn('[playback] restore previous audio source failed:', restoreErr);
        }
      }
      return false;
    }
  }

  function commitPlaybackTransaction(params: {
    track: Track;
    index?: number;
    requestSeq: number;
    reason: PlayReason;
    sourceInfo: ResolvedSourceInfo;
  }) {
    if (params.requestSeq !== _playRequestSeq) return false;
    const resolvedIndex = typeof params.index === 'number' ? params.index : findPlaylistIndexByPlaybackKey(params.track);
    if (params.reason === 'switch-track') {
      state.miniLyricText = '';
    }
    state.currentTrack = params.track;
    state.currentIndex = resolvedIndex;
    state.currentSongId = Number(params.track.id || 0);
    state.currentSource = params.sourceInfo.source;
    state.currentQualityBr = params.sourceInfo.br;
    state.currentQualityLabel = params.sourceInfo.qualityLabel;
    state.currentQualityDowngraded = params.sourceInfo.isDowngraded;
    state.qualityDowngradeInfo = params.sourceInfo.downgradeInfo;
    state.isPlaying = true;
    syncRuntimeState();
    recordCurrentTrackToHistory();
    persist();
    return true;
  }

  function rollbackPlaybackTransaction(previous: {
    track: Track | null;
    index: number;
    songId: number;
    isPlaying: boolean;
    currentTime: number;
  }, requestSeq: number, reason: PlayReason) {
    if (requestSeq !== _playRequestSeq) return;
    if (reason === 'switch-track') {
      state.currentTrack = previous.track;
      state.currentIndex = previous.index;
      state.currentSongId = previous.songId;
      state.isPlaying = previous.isPlaying;
      state.currentTime = previous.currentTime;
      syncRuntimeState();
    }
    persist();
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
    const targetTrack = state.playlist[index];
    const ok = await playTrack(targetTrack, { index, reason: 'switch-track' });
    if (ok && isPersonalFmTrack(state.currentTrack)) {
      void ensurePersonalFmQueue();
    }
  }

  function findNextPlayableIndexAfter(index: number) {
    if (!state.playlist.length) return -1;
    for (let step = 1; step <= state.playlist.length; step += 1) {
      const idx = (index + step) % state.playlist.length;
      const candidate = state.playlist[idx];
      if (!(candidate?.source === 'podcast' && candidate.podcast?.feeTone === 'paid')) return idx;
    }
    return -1;
  }

  async function playTrack(track: Track, seekToOrOptions?: number | PlayTrackOptions, maybeOptions?: PlayTrackOptions) {
    const { seekTo, options } = parsePlayTrackArgs(seekToOrOptions, maybeOptions);
    const reason: PlayReason = options.reason || (isSamePlaybackResource(track, state.currentTrack) ? 'reload-source' : 'switch-track');
    const targetIndex = typeof options.index === 'number' ? options.index : (reason === 'reload-source' ? state.currentIndex : findPlaylistIndexByPlaybackKey(track));
    const requestSeq = ++_playRequestSeq;
    const previous = {
      track: state.currentTrack ? cloneTrack(state.currentTrack) : null,
      index: state.currentIndex,
      songId: state.currentSongId,
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
    };
    // 付费播客提示
    if (track.source === 'podcast' && track.podcast?.feeTone === 'paid') {
      useLoginModalStore().showGlobalToast('该节目为付费内容，请前往播客详情页购买后收听', 'warning', 4000);
      state.loading = false;
      syncRuntimeState();
      if (state.paidContentSkip) {
        const nextIndex = findNextPlayableIndexAfter(targetIndex >= 0 ? targetIndex : state.currentIndex);
        if (nextIndex >= 0 && nextIndex !== targetIndex) {
          await playByIndex(nextIndex);
        }
      } else {
        state.currentTrack = previous.track;
        state.currentIndex = previous.index;
        state.currentSongId = previous.songId;
        state.isPlaying = previous.isPlaying;
        state.currentTime = previous.currentTime;
        syncRuntimeState();
        persist();
      }
      return false;
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
      let sourceInfo: ResolvedSourceInfo = {
        source: track.source === 'local' ? 'local' : 'official',
        br: 0,
        qualityLabel: track.source === 'local' ? '本地' : '',
        isDowngraded: false,
        downgradeInfo: null,
      };

      // ── 本地歌曲：通过 IPC 读取文件 → blob URL，避免 local:// 跨协议 CORS 问题 ──
      if (track.source === 'local' && (track as any).path) {
        // 使用 IPC 读取文件内容，创建 blob URL 给 audio 播放
        if (platform.localApi) {
          try {
            const buffer = await platform.localApi.readFile((track as any).path);
            if (requestSeq !== _playRequestSeq) return false;
            if (buffer) {
              const ext = (track as any).path?.split('.').pop()?.toLowerCase() || 'mp3';
              if (!canBrowserPlayLocalExt(ext)) {
                useLoginModalStore().showGlobalToast(`当前桌面播放内核暂不支持 ${ext.toUpperCase()} 本地播放，请先转为 MP3/FLAC/M4A/WAV/OGG/OPUS`, 'warning', 4200);
                rollbackPlaybackTransaction(previous, requestSeq, reason);
                return false;
              }
              const mime = inferLocalAudioMime(ext);
              const blob = new Blob([buffer], { type: mime });
              playUrl = URL.createObjectURL(blob);
            }
          } catch {}
        }
        if (requestSeq !== _playRequestSeq) {
          if (playUrl.startsWith('blob:')) URL.revokeObjectURL(playUrl);
          return false;
        }
        if (!playUrl) {
          // 降级：直接使用 local://（桌面端可能支持，Web 端会报 CORS）
          playUrl = `local:///${(track as any).path}`;
        }
        console.debug('[playback:local] switching audio source:', {
          requestSeq,
          id: track.id,
          name: track.name,
          path: (track as any).path,
          sourceType: playUrl.startsWith('blob:') ? 'blob' : 'local-protocol',
        });
        const ok = await switchAudioSource({
          playUrl,
          seekTo,
          requestSeq,
          nextLocalObjectUrl: playUrl.startsWith('blob:') ? playUrl : '',
          sourceKind: 'local',
          previousIsPlaying: previous.isPlaying,
        });
        if (!ok) {
          rollbackPlaybackTransaction(previous, requestSeq, reason);
          return false;
        }
        return commitPlaybackTransaction({ track, index: targetIndex, requestSeq, reason, sourceInfo });
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
      if (requestSeq !== _playRequestSeq) return false;
      playUrl = result.url;
      if (eqSettings.state.enabled && shouldUseCorsProxy(playUrl)) {
        console.debug('[playback] EQ enabled, proxy remote audio for CORS:', {
          id: track.id,
          source: result.source,
          quality: result.qualityLabel,
        });
        playUrl = toCorsProxyUrl(playUrl);
      }
      sourceInfo = {
        source: result.source,
        br: result.br,
        qualityLabel: result.qualityLabel,
        isDowngraded: result.isDowngraded,
        downgradeInfo: result.downgradeInfo,
      };

      const wasPlaying = state.isPlaying;
      if (typeof seekTo === 'number') {
        console.log('[quality] playTrack with seekTo:', seekTo, '| wasPlaying:', wasPlaying, '| level:', state.defaultQuality);
      }
      // 背景获取歌曲详情，不阻塞播放
      if (track.id && track.source !== 'podcast') {
        getSongDetail(track.id).then(res => {
          const detail = res?.data?.songs?.[0];
          if (detail && state.currentSongId === track.id && isSamePlaybackResource(state.currentTrack, track)) {
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

      console.log("[playback] source:", sourceInfo.source, "| br:", sourceInfo.br, "| id:", Number(track.id || 0), "| song:", track.name);
      if (!playUrl) {
        rollbackPlaybackTransaction(previous, requestSeq, reason);
        return false;
      }

      const ok = await switchAudioSource({
        playUrl,
        seekTo,
        requestSeq,
        sourceKind: track.source || 'song',
        previousIsPlaying: previous.isPlaying,
      });
      if (!ok) {
        rollbackPlaybackTransaction(previous, requestSeq, reason);
        return false;
      }

      if (typeof seekTo === 'number' && seekTo > 0 && wasPlaying) {
        state.audio.currentTime = seekTo;
      }
      return commitPlaybackTransaction({ track, index: targetIndex, requestSeq, reason, sourceInfo });
    } finally {
      if (requestSeq === _playRequestSeq) {
        state.loading = false;
        syncRuntimeState();
      }
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
    if (!state.audio) return;

    const audio = state.audio;

    // 刷新后可能仅恢复了歌曲信息，但 audio.src 尚未恢复
    // 此时直接 audio.play() 会失败，需要先重新拉取播放地址
    if (audio.paused) {
      const hasSource = Boolean(audio.src || audio.currentSrc);
      if (!hasSource && state.currentTrack) {
        await playTrack(state.currentTrack);
        return;
      }

      try {
        await audio.play();
        state.isPlaying = true;
        syncRuntimeState();
      } catch {
        // 若播放地址失效或被浏览器策略拦截，回退到重新拉取地址再播放
        if (state.currentTrack) {
          await playTrack(state.currentTrack);
        }
      }
    } else {
      audio.pause();
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
    setPlaylist, appendToQueue, insertNext, removeFromPlaylist, clearPlaylist, moveTrack, clearPersistedState,
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
