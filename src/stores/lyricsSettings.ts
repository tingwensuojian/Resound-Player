import { defineStore } from 'pinia';
import { reactive } from 'vue';

export type BgTheme = 'default' | 'light' | 'dark';
export type BgMode = 'basic' | 'custom';
export type BgCustomMode = 'solid' | 'gradient' | 'image' | 'css' | 'iridescence' | 'soft-gradient' | 'three-scene' | 'paper-shaders' | 'mist' | 'digital-loom' | 'silk' | 'aurora' | 'amll-fluid';
export type DisplayMode = 'cover' | 'record' | 'fullscreen';

export interface LyricsSettings {
  showCover: boolean;
  displayMode: DisplayMode;
  centerAlign: boolean;
  showTranslation: boolean;
  showRomalrc: boolean;
  showLyrics: boolean;
  showMiniBar: boolean;
  useAmllRenderer: boolean;
  autoPlayOnSeek: boolean;
  followCoverColor: boolean;
  showBarLyric: boolean;
  contentWidth: number;
  fontSize: number;
  letterSpacing: number;
  fontWeight: number;
  lineHeight: number;
  bgMode: BgMode;
  bgTheme: BgTheme;
  bgCustomMode: BgCustomMode;
  bgColor: string;
  anchorPos: number;
  hidePlayed: boolean;
  iriColors: string[];
  iriSpeed: number;
  iriScale: number;
  iriBlur: number;
  /** 歌词面板水平偏移（百分比） */
  lyricOffsetX: number;
}

const STORAGE_KEY = 'gm_lyrics_settings_v1';

const defaults: LyricsSettings = {
  showCover: true,
  displayMode: 'cover',
  centerAlign: true,
  showTranslation: true,
  showRomalrc: false,
  showLyrics: true,
  showMiniBar: true,
  useAmllRenderer: false,
  autoPlayOnSeek: true,
  followCoverColor: false,
  showBarLyric: true,
  contentWidth: 45,
  fontSize: 5,
  letterSpacing: 3,
  fontWeight: 4,
  lineHeight: 5,
  bgMode: 'basic',
  bgTheme: 'default',
  bgCustomMode: 'solid',
  bgColor: '#1e293b',
  anchorPos: 3,
  hidePlayed: false,
  iriColors: ['#3A29FF', '#FF94B4', '#FF3232'],
  iriSpeed: 5,
  iriScale: 5,
  iriBlur: 10,
  lyricOffsetX: 0,
};

export const useLyricsSettingsStore = defineStore('lyricsSettings', () => {
  const state = reactive<LyricsSettings>({ ...defaults });

  // hydrate from localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      Object.assign(state, { ...defaults, ...JSON.parse(raw) });
    }
  } catch { /* ignore */ }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* silently fail */ }
  }

  return { state, save };
});