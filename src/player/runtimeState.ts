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
  };
}

export function toPlaybackSnapshot(state: RuntimeState): PlaybackSnapshot {
  return {
    currentTrack: state.currentTrack,
    playlist: state.playlist,
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
  };
}
