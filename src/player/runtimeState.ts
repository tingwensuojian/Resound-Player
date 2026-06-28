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
  currentSource: string;
  currentQualityBr: number;
  currentQualityLabel: string;
  currentQualityDowngraded: boolean;
  qualityDowngradeInfo: QualityDowngradeInfo | null;
  lastError: string | null;
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
    currentSource: 'official',
    currentQualityBr: 0,
    currentQualityLabel: '',
    currentQualityDowngraded: false,
    qualityDowngradeInfo: null,
    lastError: null,
    fullLyrics: [],
  };
}

/** Strip non-cloneable properties (Vue proxies, functions, etc.) for IPC-safe transfer. */
function sanitizeTrackForIPC(t: PlaybackTrack | null): PlaybackTrack | null {
  if (!t) return null;
  return {
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
}

export function toPlaybackSnapshot(state: RuntimeState): PlaybackSnapshot {
  return {
    currentTrack: sanitizeTrackForIPC(state.currentTrack),
    playlist: Array.isArray(state.playlist) ? state.playlist.map(sanitizeTrackForIPC).filter(Boolean) as PlaybackTrack[] : [],
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
    currentSource: state.currentSource,
    currentQualityBr: state.currentQualityBr,
    currentQualityLabel: state.currentQualityLabel,
    currentQualityDowngraded: state.currentQualityDowngraded,
    qualityDowngradeInfo: state.qualityDowngradeInfo,
    lastError: state.lastError,
    fullLyrics: Array.isArray(state.fullLyrics)
      ? state.fullLyrics.map(l => ({
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
        }))
      : [],
  };
}
