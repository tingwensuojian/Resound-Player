import type { PlaybackSnapshot, PlaybackTrack, QualityDowngradeInfo } from './contracts';

export type RuntimeState = {
  currentTrack: PlaybackTrack | null;
  playlist: PlaybackTrack[];
  currentIndex: number;
  miniLyricText: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playMode: 'loop' | 'single' | 'shuffle';
  playbackRate: number;
  loading: boolean;
  buffered: number;
  currentSource: string;
  currentQualityBr: number;
  currentQualityLabel: string;
  currentQualityDowngraded: boolean;
  qualityDowngradeInfo: QualityDowngradeInfo | null;
  lastError: string | null;
  isFm: boolean;
    fullLyrics: { time: number; text: string; words: { text: string; startTime: number; duration: number; space?: boolean }[] }[];
};

export function createInitialRuntimeState(): RuntimeState {
  return {
    currentTrack: null,
    playlist: [],
    currentIndex: -1,
    miniLyricText: '',
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.7,
    muted: false,
    playMode: 'loop',
    playbackRate: 1,
    loading: false,
    buffered: 0,
    currentSource: 'official',
    currentQualityBr: 0,
    currentQualityLabel: '',
    currentQualityDowngraded: false,
    qualityDowngradeInfo: null,
    lastError: null,
    isFm: false,
        fullLyrics: [],
  };
}

let _lastSanitizedInput: PlaybackTrack | null = null;
let _lastSanitizedOutput: PlaybackTrack | null = null;

/** Strip non-cloneable properties (Vue proxies, functions, etc.) for IPC-safe transfer.
 *  Memoized: returns cached result when the same object reference is passed (track identity unchanged). */
function sanitizeTrackForIPC(t: PlaybackTrack | null): PlaybackTrack | null {
  if (!t) return null;
  // Cache hit: same object reference, track hasn't changed
  if (t === _lastSanitizedInput) return _lastSanitizedOutput;

  const result: PlaybackTrack = {
    id: t.id as any,
    name: String(t.name || ''),
    ar: Array.isArray(t.ar) ? t.ar.map((a) => ({ id: a?.id, artistId: a?.artistId, name: String(a?.name || '') })) : [],
    al: t.al ? { name: String(t.al.name || ''), picUrl: t.al.picUrl ? String(t.al.picUrl) : undefined } : undefined,
    url: t.url ? String(t.url) : undefined,
    source: t.source,
    podcast: t.podcast ? {
      rid: t.podcast.rid, programId: t.podcast.programId,
      createTime: t.podcast.createTime, feeBadge: t.podcast.feeBadge, feeTone: t.podcast.feeTone,
    } : undefined,
    liked: Boolean(t.liked),
    isLiked: Boolean(t.isLiked),
    description: t.description ? String(t.description) : undefined,
    cloudSid: t.cloudSid,
    cloudOwnerId: t.cloudOwnerId,
    uid: t.uid,
    path: t.path ? String(t.path) : undefined,
  };
  _lastSanitizedInput = t;
  _lastSanitizedOutput = result;
  return result;
}

/** Memoized playlist sanitization: reuses cached result when the same array reference is passed.
 *  The playlist array rarely changes during playback of a single track. */
let _lastPlaylistInput: PlaybackTrack[] = [];
let _lastPlaylistOutput: PlaybackTrack[] = [];

function toSanitizedPlaylist(playlist: PlaybackTrack[]): PlaybackTrack[] {
  if (!Array.isArray(playlist)) return [];
  if (playlist === _lastPlaylistInput) return _lastPlaylistOutput;
  _lastPlaylistInput = playlist;
  _lastPlaylistOutput = playlist.map(sanitizeTrackForIPC).filter(Boolean) as PlaybackTrack[];
  return _lastPlaylistOutput;
}

/** Memoized lyrics sanitization: only rebuilds when the lyrics array reference changes. */
let _lastLyricsInput: any[] = [];
let _lastLyricsOutput: any[] = [];

function toSanitizedLyrics(lyrics: any): any[] {
  if (!Array.isArray(lyrics)) return [];
  if (lyrics === _lastLyricsInput) return _lastLyricsOutput;
  _lastLyricsInput = lyrics;
  _lastLyricsOutput = lyrics.map(l => ({
    time: Number(l?.time || 0),
    text: String(l?.text || ''),
    words: Array.isArray(l?.words)
      ? l.words.map(w => ({
          text: String(w?.text || ''),
          startTime: Number(w?.startTime || 0),
          duration: Number(w?.duration || 0),
          space: Boolean(w?.space),
        }))
      : [],
  }));
  return _lastLyricsOutput;
}

export function toPlaybackSnapshot(state: RuntimeState): PlaybackSnapshot {
  return {
    currentTrack: sanitizeTrackForIPC(state.currentTrack),
    playlist: toSanitizedPlaylist(state.playlist),
    currentIndex: state.currentIndex,
    miniLyricText: state.miniLyricText,
    isPlaying: state.isPlaying,
    currentTime: state.currentTime,
    duration: state.duration,
    volume: state.volume,
    muted: state.muted,
    playMode: state.playMode,
    playbackRate: state.playbackRate,
    loading: state.loading,
    buffered: state.buffered,
    currentSource: state.currentSource,
    currentQualityBr: state.currentQualityBr,
    currentQualityLabel: state.currentQualityLabel,
    currentQualityDowngraded: state.currentQualityDowngraded,
    qualityDowngradeInfo: state.qualityDowngradeInfo,
    lastError: state.lastError,
    isFm: state.isFm,
        fullLyrics: toSanitizedLyrics(state.fullLyrics),
  };
}

