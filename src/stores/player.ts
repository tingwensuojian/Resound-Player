import { reactive } from 'vue';
import { getIntelligenceList, getPlaylistTrackAll, getSongDetail, trashPersonalFm } from '../api/music';
import { userStore } from './user';
import { useLoginModalStore } from '../stores/loginModal';
import { hydrateCache, getCache, setCache } from './unblock-cache';
import { recordLocalHistoryEntry } from '../utils/localHistory';
import { platform } from '../utils/platform';
import { useEqSettingsStore } from './eqSettings';
const eqSettings = useEqSettingsStore();
import { setupMediaSession } from '../composables/useMediaSession';
import { createAudioEngine } from '../player/audioEngine';
import { resolvePlayUrl } from '../player/playbackResolver';

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


const VALID_QUALITIES = new Set(['标准', '较高', '极高(HQ)', '无损(SQ)', 'Hi-Res', '高清臻音', '高清环绕声', '沉浸环绕声', '杜比全景声', '超清母带']);

const audioEl = new Audio();
const audioEngine = createAudioEngine(audioEl);

export const playerStore = reactive({
  audio: audioEl,
  playlist: [] as Track[],
  currentIndex: -1,
  currentTrack: null as Track | null,
  currentSongId: 0,
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

  init() {
    hydrateCache();
    this.audio.volume = this.volume;

    // 注册 macOS Now Playing / Media Session API（系统栏封面、歌名、控制）
    setupMediaSession();

    this.audio.ontimeupdate = () => {
      this.currentTime = this.audio.currentTime || 0;
    };

    this.audio.onloadedmetadata = () => {
      this.duration = this.audio.duration || 0;
    };

    this.audio.onended = () => {
      if (this.autoplayNext) this.next();
      else this.isPlaying = false;
    };

    this.audio.onplay = () => {
      this.isPlaying = true;
    };

    this.audio.onpause = () => {
      this.isPlaying = false;
    };

    // 预热音频硬件，缩短首次 AudioContext 创建时间
    // Windows 上首次 new AudioContext() 需初始化 WASAPI，延迟可达 500ms+
    audioEngine.ensureReady();

    this.hydrate();
  },

  persist() {
    if (_persistTimer) clearTimeout(_persistTimer);
    _persistTimer = setTimeout(() => {
      _persistTimer = null;
      const playlist = this.trimPlaylistForStorage();
    const defaultPlaylist = Array.isArray(this.defaultPlaylist) ? this.defaultPlaylist.slice(0, 50).map((t: any) =>
      t ? { id: t.id, name: t.name, ar: t.ar?.slice(0, 3) || [], al: t.al ? { name: t.al.name } : undefined } : t
    ) : [];
    const personalFmTrackIds = this.personalFmTrackIds.slice(0, 200);
    const payload = {
      playlist,
      currentIndex: this.currentIndex,
      volume: this.volume,
      muted: this.muted,
      volumeBeforeMute: this.volumeBeforeMute,
      autoplayNext: this.autoplayNext,
      playMode: this.playMode,
      crossfadeSec: this.crossfadeSec,
      defaultPlaybackRate: this.defaultPlaybackRate,
      paidContentSkip: this.paidContentSkip,
      defaultQuality: this.defaultQuality,
      themePrimary: this.themePrimary,
      themeMode: this.themeMode,
      isDarkMode: this.isDarkMode,
      personalFmTrackIds,
      personalFmHasMore: this.personalFmHasMore,
      fmMode: this.fmMode,
      fmSubmode: this.fmSubmode,
      defaultPlaylist,
      currentPlaylistId: this.currentPlaylistId,
    };
    try {
      const json = JSON.stringify(payload);
      localStorage.setItem(PLAYER_STORAGE_KEY, json);
      console.debug('[player] persist saved, defaultQuality:', payload.defaultQuality);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn('[player] quota exceeded, trimming to 10 tracks');
        payload.playlist = this.trimPlaylistForStorage(10);
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
  },

  trimPlaylistForStorage(maxEntries = 50) {
    if (this.playlist.length <= maxEntries) {
      return this.playlist.map((t) => ({
        id: t.id,
        name: t.name,
        ar: t.ar?.slice(0, 3) || [],
        al: t.al ? { name: t.al.name } : undefined,
        source: t.source,
        podcast: t.podcast,
      }));
    }
    const start = Math.max(0, this.currentIndex - 10);
    const trimmed = this.playlist.slice(start, start + maxEntries);
    return trimmed.map((t) => ({
      id: t.id,
      name: t.name,
      ar: t.ar?.slice(0, 3) || [],
      al: t.al ? { name: t.al.name } : undefined,
      source: t.source,
      podcast: t.podcast,
    }));
  },

  hydrate() {
    try {
      const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
      if (!raw) {
        this.syncThemeState();
        return;
      }
      const parsed = JSON.parse(raw);
      // 不恢复播放列表和播放状态，用户需要主动点击歌单或播放时才加载内容
      this.playlist = [];
      this.currentIndex = -1;
      this.currentTrack = null;
      this.currentSongId = 0;
      this.volume = typeof parsed.volume === 'number' ? parsed.volume : 0.7;
      this.muted = typeof parsed.muted === 'boolean' ? parsed.muted : false;
      this.volumeBeforeMute = typeof parsed.volumeBeforeMute === 'number' ? parsed.volumeBeforeMute : this.volume;
      this.audio.volume = this.muted ? 0 : this.volume;

      this.autoplayNext = typeof parsed.autoplayNext === 'boolean' ? parsed.autoplayNext : true;
      this.playMode = parsed.playMode === 'single' || parsed.playMode === 'shuffle' ? parsed.playMode : 'loop';
      this.crossfadeSec = typeof parsed.crossfadeSec === 'number' ? parsed.crossfadeSec : 0;
      this.playbackRate = 1;
      this.defaultPlaybackRate = typeof parsed.defaultPlaybackRate === 'number' ? parsed.defaultPlaybackRate : 1;
      this.paidContentSkip = typeof parsed.paidContentSkip === 'boolean' ? parsed.paidContentSkip : true;
      const savedQuality = localStorage.getItem('gm_quality_v1');
      const persistedQuality = typeof parsed.defaultQuality === 'string' ? parsed.defaultQuality : '';
      const VALID_QUALITIES = new Set(['标准', '较高', '极高(HQ)', '无损(SQ)', 'Hi-Res', '高清臻音', '高清环绕声', '沉浸环绕声', '杜比全景声', '超清母带']);
      this.defaultQuality = savedQuality && VALID_QUALITIES.has(savedQuality)
        ? savedQuality
        : (VALID_QUALITIES.has(persistedQuality) ? persistedQuality : '较高');
      console.debug('[player] hydrate defaultQuality:', parsed.defaultQuality, '→', this.defaultQuality);
      this.themePrimary = typeof parsed.themePrimary === 'string' && parsed.themePrimary ? parsed.themePrimary : 'var(--theme-primary)';
      this.themeMode = parsed.themeMode === '浅色' || parsed.themeMode === '深色' || parsed.themeMode === '跟随系统' ? parsed.themeMode : '跟随系统';
      this.isDarkMode = typeof parsed.isDarkMode === 'boolean' ? parsed.isDarkMode : false;
      this.personalFmTrackIds = Array.isArray(parsed.personalFmTrackIds) ? parsed.personalFmTrackIds.map((id: unknown) => Number(id || 0)).filter((id: number) => id > 0) : [];
      this.personalFmHasMore = typeof parsed.personalFmHasMore === 'boolean' ? parsed.personalFmHasMore : true;
      this.fmMode = typeof parsed.fmMode === 'string' ? parsed.fmMode : 'DEFAULT';
      this.fmSubmode = typeof parsed.fmSubmode === 'string' ? parsed.fmSubmode : '';
      this.defaultPlaylist = Array.isArray(parsed.defaultPlaylist) ? parsed.defaultPlaylist : [];
      this.currentPlaylistId = typeof parsed.currentPlaylistId === 'number' ? parsed.currentPlaylistId : 0;
      this.audio.playbackRate = this.playbackRate;
      this.syncThemeState();
    } catch {
      this.syncThemeState();
    }
  },

  enableEq(on: boolean) {
    if (audioEngine.isEnabled === on) return;

    if (on) {
      const wasPlaying = this.isPlaying;
      const savedTime = this.audio.currentTime;
      if (wasPlaying) this.audio.pause();

      audioEngine.ensureReady();
      if (!audioEngine.isReady) {
        console.warn('[EQ] pipeline init failed, fallback to native');
        if (wasPlaying) {
          this.audio.currentTime = savedTime;
          this.audio.play().catch(() => {});
        }
        return;
      }

      audioEngine.rebuildChain(true, eqSettings.state.gains);

      if (wasPlaying) {
        this.audio.currentTime = savedTime;
        this.audio.play().catch((err) => {
          console.warn('[EQ] resume playback failed:', err);
        });
      }

      audioEngine.syncVolume(this.volume, this.muted);
    } else {
      const wasPlaying = this.isPlaying;
      const savedTime = this.audio.currentTime;
      if (wasPlaying) this.audio.pause();

      audioEngine.rebuildChain(false);

      if (this.audio.crossOrigin === 'anonymous' && this.audio.src) {
        this.audio.crossOrigin = '';
        const savedSrc = this.audio.currentSrc || this.audio.src;
        this.audio.src = savedSrc;
        this.audio.load();
      }

      if (wasPlaying) {
        this.audio.currentTime = savedTime;
        this.audio.play().catch(() => {});
      }
    }
  },

  setEqGains(gains: number[]) {
    audioEngine.setEqGains(gains);
  },

  setPlaylist(list: any[], startIndex = 0, playlistId?: number) {
    this.playlist = list.map((x) => formatTrack(x));
    this.currentIndex = startIndex;
    if (typeof playlistId === 'number') {
      this.currentPlaylistId = playlistId;
    }
    this.persist();
  },

  /** 将一批 track 追加到当前播放列表末尾，不替换已有队列。
   *  - 按 (id + source) 组合键去重
   *  - 允许歌曲和播客节目混合在同一队列中
   *  - 返回实际追加数量
   */
  appendToQueue(tracks: any[]): number {
    if (!tracks.length) return 0;

    const incoming = tracks.map((t) => formatTrack(t));

    // 组合键去重 (id:source)，避免歌曲与播客 id 碰撞
    const existingKeys = new Set(this.playlist.map((t) => `${t.id}:${t.source}`));
    const unique = incoming.filter((t) => t.id > 0 && !existingKeys.has(`${t.id}:${t.source}`));

    if (!unique.length) return 0;

    this.playlist.push(...unique);
    this.persist();
    return unique.length;
  },

  async playIntelligenceList(): Promise<string | null> {
    let songId = this.currentSongId;
    const pid = this.currentPlaylistId;
    if (!pid) return '请先从歌单选择歌曲';
    this.currentIntelligenceLoading = true;
    try {
      // 未播放时，取歌单第一首作为种子
      if (!songId) {
        const cookie = userStore.loginCookie || undefined;
        const plRes = await getPlaylistTrackAll({ id: pid, limit: 1, cookie });
        const firstTrack = plRes?.data?.songs?.[0];
        if (firstTrack?.id) {
          songId = firstTrack.id;
        } else {
          return '歌单暂无歌曲，无法开启心动模式';
        }
      }
      const cookie = userStore.loginCookie || undefined;
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
      this.setPlaylist(tracks, 0, pid);
      await this.playByIndex(0);
      return null;
    } catch (e: any) {
      console.warn('[intelligence] failed:', e);
      return '智能播放请求异常，请稍后重试';
    } finally {
      this.currentIntelligenceLoading = false;
    }
  },

  setPersonalFmPlaylist(list: any[], startIndex = 0) {
    this.personalFmTrackIds = list.map((x) => Number(x?.id || 0)).filter((id) => id > 0);
    this.setPlaylist(list, startIndex);
  },

  appendPersonalFmTracks(list: any[]) {
    const incoming = list.map((x) => formatTrack(x));
    const existingIds = new Set(this.playlist.map((track) => track.id));
    const uniqueIncoming = incoming.filter((track) => track.id && !existingIds.has(track.id));

    if (!uniqueIncoming.length) return 0;

    this.playlist.push(...uniqueIncoming);
    this.personalFmTrackIds = [...new Set([...this.personalFmTrackIds, ...uniqueIncoming.map((track) => track.id)])];
    this.persist();
    return uniqueIncoming.length;
  },

  setPersonalFmFetcher(fetcher: PersonalFmFetcher | null) {
    this.personalFmFetcher = fetcher;
  },

  setFmMode(mode: string, submode = '') {
    this.fmMode = mode;
    this.fmSubmode = submode;
    this.persist();
  },

  clearPersonalFmContext() {
    this.personalFmTrackIds = [];
    this.personalFmFetcher = null;
    this.personalFmLoadingMore = false;
    this.personalFmHasMore = true;
    this.persist();
  },

  clearPlaylistContext() {
    this.currentPlaylistId = 0;
    this.persist();
  },

  isPersonalFmTrack(track?: Track | null) {
    const trackId = Number(track?.id || 0);
    return trackId > 0 && this.personalFmTrackIds.includes(trackId);
  },

  async ensurePersonalFmQueue(minRemaining?: number) {
    if (!this.personalFmFetcher || this.personalFmLoadingMore || !this.personalFmHasMore) return 0;
    const threshold = typeof minRemaining === 'number' ? minRemaining : this.personalFmPrefetchThreshold;
    const remaining = this.playlist.length - this.currentIndex - 1;
    if (remaining >= threshold) return 0;

    this.personalFmLoadingMore = true;
    try {
      const nextBatch = await this.personalFmFetcher();
      const appendedCount = this.appendPersonalFmTracks(nextBatch || []);
      this.personalFmHasMore = Array.isArray(nextBatch) && nextBatch.length > 0;
      this.persist();
      return appendedCount;
    } catch {
      this.personalFmHasMore = false;
      this.persist();
      return 0;
    } finally {
      this.personalFmLoadingMore = false;
    }
  },

  syncThemeState(themeMode?: ThemeMode) {
    if (themeMode) {
      this.themeMode = themeMode;
    }

    if (typeof window === 'undefined') {
      this.isDarkMode = this.themeMode === '深色';
      return;
    }

    const root = document.documentElement;
    const resolvedTheme = getComputedStyle(root).getPropertyValue('--theme-primary').trim();
    this.themePrimary = resolvedTheme || 'var(--theme-primary)';
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    const explicitTheme = root.dataset.theme;

    if (this.themeMode === '深色') {
      this.isDarkMode = true;
    } else if (this.themeMode === '浅色') {
      this.isDarkMode = false;
    } else if (explicitTheme === 'dark' || explicitTheme === 'light') {
      this.isDarkMode = explicitTheme === 'dark';
    } else {
      this.isDarkMode = prefersDark;
    }
  },

  async playByIndex(index: number) {
    if (!this.playlist[index]) {
      if (this.personalFmFetcher) {
        await this.ensurePersonalFmQueue(0);
      }
      if (!this.playlist[index]) return;
    }
    this.currentIndex = index;
    this.currentTrack = this.playlist[index];
    this.currentSongId = Number(this.currentTrack?.id || 0);
    this.persist();
    await this.playTrack(this.currentTrack);
    if (this.isPersonalFmTrack(this.currentTrack)) {
      void this.ensurePersonalFmQueue();
    }
  },

  async playTrack(track: Track, seekTo?: number) {
    // 付费播客提示
    if (track.source === 'podcast' && track.podcast?.feeTone === 'paid') {
      useLoginModalStore().showGlobalToast('该节目为付费内容，请前往播客详情页购买后收听', 'warning', 4000);
      this.loading = false;
      if (this.paidContentSkip) {
        await this.next();
      } else {
        this.isPlaying = false;
        this.persist();
      }
      return;
    }
    this.qualityDowngradeInfo = null;
    // 切歌时重置播放速度为全局默认
    this.playbackRate = this.defaultPlaybackRate;
    this.audio.playbackRate = this.defaultPlaybackRate;
    this.loading = true;
    try {
      let playUrl = track.url || '';

      // ── 本地歌曲：通过 IPC 读取文件 → blob URL，避免 local:// 跨协议 CORS 问题 ──
      if (track.source === 'local' && (track as any).path) {
        this.currentSource = 'local';
        this.loading = false;
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
        this.audio.src = playUrl;
        try {
          await this.audio.play();
        } catch {
          this.isPlaying = false;
          if (playUrl.startsWith('blob:')) URL.revokeObjectURL(playUrl);
          this.persist();
          return false;
        }
        this.isPlaying = true;
        this.currentTrack = track;
        this.currentSongId = Number(track.id || 0);
        this.recordCurrentTrackToHistory();
        this.persist();
        return true;
      }

      // URL 决议：fee 探测 → 音质选择 → 缓存 → unblock → 降级检测 → 代理回退
      const uiImport = import("../stores/ui");
      const { uiStore } = await uiImport;
      const result = await resolvePlayUrl({
        trackId: track.id,
        defaultQuality: this.defaultQuality,
        isVip: userStore.isVip,
        loginCookie: userStore.loginCookie,
        unblockEnabled: uiStore.unblockEnabled,
        unblockSources: uiStore.unblockSources,
        apiBaseUrl: platform.apiBaseUrl,
        unblockProxyUrl: platform.unblockProxyUrl,
        getCache,
        setCache,
      });
      playUrl = result.url;
      this.currentSource = result.source;
      this.currentQualityBr = result.br;
      this.currentQualityDowngraded = result.isDowngraded;
      this.qualityDowngradeInfo = result.downgradeInfo;

      const wasPlaying = this.isPlaying;
      if (typeof seekTo === 'number') {
        console.log('[quality] playTrack with seekTo:', seekTo, '| wasPlaying:', wasPlaying, '| level:', this.defaultQuality);
      }
      // 背景获取歌曲详情，不阻塞播放
      if (track.id) {
        getSongDetail(track.id).then(res => {
          const detail = res?.data?.songs?.[0];
          if (detail && this.currentSongId === track.id) {
            const n = formatTrack(detail);
            this.currentTrack = {
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
          }
        }).catch(() => {});
      }

      this.currentTrack = track;
      this.currentSongId = Number(track.id || 0);
	console.log("[playback] source:", this.currentSource, "| br:", this.currentQualityBr, "| id:", this.currentSongId, "| song:", track.name);
      if (!playUrl) {
          this.audio.removeAttribute('src');
        this.audio.load();
        this.isPlaying = false;
        this.persist();
        return false;
      }

      if (eqSettings.state.enabled && this.audio.crossOrigin !== 'anonymous') {
        this.audio.crossOrigin = 'anonymous';
      }
      this.audio.src = playUrl;
      if (eqSettings.state.enabled) {
        this.enableEq(true);
        this.setEqGains(eqSettings.state.gains);
      }
      if (typeof seekTo === 'number' && seekTo > 0) {
        this.audio.currentTime = seekTo;
      }
      // 确保 AudioContext 处于运行态（预创建时可能为 suspended）
      audioEngine.resumeIfSuspended();
      try {
        await this.audio.play();
      } catch {
        this.isPlaying = false;
        this.persist();
        return false;
      }
      this.isPlaying = true;

      if (typeof seekTo === 'number' && seekTo > 0 && wasPlaying) {
        this.audio.currentTime = seekTo;
      }

      this.recordCurrentTrackToHistory();

      if (this.currentIndex === -1) {
        const idx = this.playlist.findIndex((x) => x.id === this.currentSongId);
        this.currentIndex = idx;
      }

      this.persist();
      return true;
    } finally {
      this.loading = false;
    }
  },

  async togglePlay() {
    if (!this.currentTrack && this.playlist.length === 0 && this.defaultPlaylist.length > 0) {
      this.setPlaylist(this.defaultPlaylist, 0);
      await this.playByIndex(0);
      return;
    }
    if (!this.currentTrack && this.playlist.length > 0) {
      await this.playByIndex(Math.max(0, this.currentIndex));
      return;
    }

    // 刷新后可能仅恢复了歌曲信息，但 audio.src 尚未恢复
    // 此时直接 audio.play() 会失败，需要先重新拉取播放地址
    if (this.audio.paused) {
      const hasSource = Boolean(this.audio.src || this.audio.currentSrc);
      if (!hasSource && this.currentTrack) {
        await this.playTrack(this.currentTrack);
        return;
      }

      try {
        await this.audio.play();
        this.isPlaying = true;
      } catch {
        // 若播放地址失效或被浏览器策略拦截，回退到重新拉取地址再播放
        if (this.currentTrack) {
          await this.playTrack(this.currentTrack);
        }
      }
    } else {
      this.audio.pause();
      this.isPlaying = false;
    }
  },

  async next() {
    if (this.playlist.length === 0) return;

    const isPersonalFmMode = this.isPersonalFmTrack(this.currentTrack) && Boolean(this.personalFmFetcher);

    if (this.playMode === 'single' && !isPersonalFmMode) {
      await this.playByIndex(this.currentIndex);
      return;
    }

    if (this.playMode === 'shuffle' && !isPersonalFmMode) {
      const nextIndex = Math.floor(Math.random() * this.playlist.length);
      await this.playByIndex(nextIndex);
      return;
    }

    if (isPersonalFmMode) {
      const targetIndex = this.currentIndex + 1;
      if (!this.playlist[targetIndex]) {
        await this.ensurePersonalFmQueue(0);
      }
      if (!this.playlist[targetIndex]) {
        return;
      }
      await this.playByIndex(targetIndex);
      return;
    }

    const nextIndex = (this.currentIndex + 1 + this.playlist.length) % this.playlist.length;
    await this.playByIndex(nextIndex);
  },

  async dislikeCurrentPersonalFm(cookie?: string) {
    const trackId = Number(this.currentTrack?.id || 0);
    if (!trackId || !this.isPersonalFmTrack(this.currentTrack)) return false;

    try {
      await trashPersonalFm(trackId, cookie);
    } catch {
      // ignore network failure and still skip locally for responsiveness
    }

    this.personalFmTrackIds = this.personalFmTrackIds.filter((id) => id !== trackId);

    const removedIndex = this.currentIndex;
    this.playlist.splice(removedIndex, 1);

    if (!this.playlist.length) {
      await this.ensurePersonalFmQueue(0);
    } else if (removedIndex >= this.playlist.length - this.personalFmPrefetchThreshold) {
      void this.ensurePersonalFmQueue();
    }

    if (!this.playlist.length) {
      this.audio.pause();
      this.isPlaying = false;
      this.currentIndex = -1;
      this.currentTrack = null;
      this.currentSongId = 0;
      this.persist();
      return true;
    }

    const nextIndex = removedIndex >= this.playlist.length ? this.playlist.length - 1 : removedIndex;
    this.currentIndex = Math.max(0, nextIndex);
    this.persist();
    await this.playByIndex(this.currentIndex);
    return true;
  },

  async prev() {
    if (this.playlist.length === 0) return;

    if (this.playMode === 'shuffle') {
      const prevIndex = Math.floor(Math.random() * this.playlist.length);
      await this.playByIndex(prevIndex);
      return;
    }

    const prevIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    await this.playByIndex(prevIndex);
  },

  seek(time: number) {
    this.audio.currentTime = Math.max(0, Math.min(time, this.duration || 0));
    this.currentTime = this.audio.currentTime;
  },

  setVolume(v: number) {
    const val = Math.max(0, Math.min(v, 1));
    this.volume = val;
    if (this.muted) {
      this.muted = false;
    }
    if (audioEngine.isReady) {
      audioEngine.syncVolume(val, false);
      this.audio.volume = 1;
    } else {
      this.audio.volume = val;
    }
    this.persist();
  },

  toggleMute() {
    if (this.muted) {
      this.muted = false;
      const vol = this.volumeBeforeMute;
      if (audioEngine.isReady) {
        audioEngine.syncVolume(vol, false);
        this.audio.volume = 1;
      } else {
        this.audio.volume = vol;
      }
    } else {
      this.volumeBeforeMute = this.volume;
      this.muted = true;
      if (audioEngine.isReady) {
        audioEngine.syncVolume(0, true);
        this.audio.volume = 1;
      } else {
        this.audio.volume = 0;
      }
    }
    this.persist();
  },

  setAutoplayNext(enabled: boolean) {
    this.autoplayNext = enabled;
    this.persist();
  },

  setPlayMode(mode: 'loop' | 'single' | 'shuffle') {
    this.playMode = mode;
    this.persist();
  },

  cyclePlayMode() {
    const order: Array<'loop' | 'single' | 'shuffle'> = ['loop', 'single', 'shuffle'];
    const idx = order.indexOf(this.playMode);
    this.playMode = order[(idx + 1) % order.length];
    this.persist();
  },

  setCrossfadeSec(sec: number) {
    this.crossfadeSec = Math.max(0, Math.min(12, Math.floor(sec || 0)));
    this.persist();
  },

  setPlaybackRate(rate: number) {
    const r = Math.max(0.5, Math.min(3, Number(rate || 1)));
    this.playbackRate = r;
    this.audio.playbackRate = r;
  },

  setDefaultPlaybackRate(rate: number) {
    const r = Math.max(0.5, Math.min(3, Number(rate || 1)));
    this.defaultPlaybackRate = r;
    this.playbackRate = r;
    this.audio.playbackRate = r;
    this.persist();
  },

  setCurrentSource(source: string) {
    this.currentSource = source || 'official';
  },

  setDefaultQuality(quality: '标准' | '较高' | '极高(HQ)' | '无损(SQ)' | 'Hi-Res' | '高清臻音' | '高清环绕声' | '沉浸环绕声' | '杜比全景声' | '超清母带') {
    this.defaultQuality = quality;
    console.log('[quality] setDefaultQuality:', quality);
    localStorage.setItem('gm_quality_v1', quality);
    this.persist();
  },

  adjustLyricsOffset(delta: number) {
    this.lyricsOffset = Math.max(-10, Math.min(10, this.lyricsOffset + delta));
  },

  resetLyricsOffset() {
    this.lyricsOffset = 0;
  },

  openExpanded() {
    this.expanded = true;
  },

  closeExpanded() {
    this.expanded = false;
  },

  toggleExpanded() {
    this.expanded = !this.expanded;
  },

  /* ---- queue management ---- */

  removeFromPlaylist(index: number) {
    if (index < 0 || index >= this.playlist.length) return;
    this.playlist.splice(index, 1);

    if (this.playlist.length === 0) {
      this.currentIndex = -1;
      this.currentTrack = null;
      this.currentSongId = 0;
      this.audio.pause();
      this.isPlaying = false;
    } else if (index < this.currentIndex) {
      this.currentIndex -= 1;
    } else if (index === this.currentIndex) {
      const nextIndex = Math.min(this.currentIndex, this.playlist.length - 1);
      this.currentIndex = nextIndex;
      this.currentTrack = this.playlist[nextIndex] || null;
      this.currentSongId = Number(this.currentTrack?.id || 0);
      this.persist();
      if (this.isPlaying || this.autoplayNext) {
        void this.playByIndex(nextIndex);
        return;
      }
    }
    this.persist();
  },

  clearPlaylist() {
    this.playlist = [];
    this.currentIndex = -1;
    this.currentTrack = null;
    this.currentSongId = 0;
    this.audio.pause();
    this.isPlaying = false;
    this.persist();
  },

  /** 登出时清理播放器持久化数据，防止用户切换后 playlist 残留在 localStorage */
  clearPersistedState() {
    this.clearPlaylist();
    try { localStorage.removeItem(PLAYER_STORAGE_KEY); } catch {}
  },

  moveTrack(fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || fromIndex >= this.playlist.length) return;
    if (toIndex < 0 || toIndex >= this.playlist.length) return;
    if (fromIndex === toIndex) return;
    const [track] = this.playlist.splice(fromIndex, 1);
    this.playlist.splice(toIndex, 0, track);
    if (this.currentIndex === fromIndex) {
      this.currentIndex = toIndex;
    } else {
      if (fromIndex < this.currentIndex && toIndex >= this.currentIndex) this.currentIndex -= 1;
      else if (fromIndex > this.currentIndex && toIndex <= this.currentIndex) this.currentIndex += 1;
    }
    this.persist();
  },

  recordCurrentTrackToHistory() {
    const track = this.currentTrack;
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
  },
});
