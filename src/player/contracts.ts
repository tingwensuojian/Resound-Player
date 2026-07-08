export type WindowRole = 'main' | 'mini';

export type PlaybackCommand =
  | { type: 'togglePlay' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'seek'; time: number }
  | { type: 'setVolume'; volume: number }
  | { type: 'toggleMute' }
  | { type: 'playByIndex'; index: number }
  | { type: 'removeFromPlaylist'; index: number }
  | { type: 'openExpanded' }
  | { type: 'closeExpanded' }
  | { type: 'toggleLike' }
  | { type: 'dislike' };

export type QualityDowngradeInfo = {
  from: string;
  to: string;
};

export type TrackArtist = {
  id?: number;
  artistId?: number;
  name: string;
};

export type TrackAlbum = {
  name?: string;
  picUrl?: string;
};

export type TrackSource = 'song' | 'podcast' | 'cloud' | 'local';

export type PodcastMeta = {
  rid?: number;
  programId?: number;
  createTime?: number;
  feeBadge?: string;
  feeTone?: string;
};

export type PlaybackTrack = {
  id: number;
  name: string;
  ar?: TrackArtist[];
  al?: TrackAlbum;
  url?: string;
  source?: TrackSource;
  podcast?: PodcastMeta;
  liked?: boolean;
  isLiked?: boolean;
  description?: string;
  cloudSid?: number;
  cloudOwnerId?: number;
  uid?: number;
  path?: string;
};

export type PlaybackSnapshot = {
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
  fullLyrics: { time: number; text: string; words: { text: string; startTime: number; duration: number; space?: boolean }[] }[];
  isFm: boolean;
};
