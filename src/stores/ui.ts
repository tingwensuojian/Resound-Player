import { defineStore } from 'pinia';
import { reactive } from 'vue';
import { searchMusicDefault } from '../api/music';
import { setUnblockProxyEnabled } from '../api/client';

type ThemeMode = '浅色' | '深色' | '跟随系统';
type ResolvedTheme = 'light' | 'dark';
type AccentMode = '绿色' | '蓝色' | '紫色' | '橙色' | '自定义';

const STORAGE_KEY = 'tm_theme_mode';
const GLASS_KEY = 'tm_liquid_glass';
const UNBLOCK_KEY = 'tm_unblock_enabled';
const UNBLOCK_SRC_KEY = 'tm_unblock_sources';
const ACCENT_KEY = 'tm_accent_mode';
const ACCENT_COLOR_KEY = 'tm_accent_custom_color';
const RESUME_AFTER_MV_KEY = 'tm_resume_after_mv';
const SHOW_INTEL_KEY = 'tm_show_intel_indicator';
const AUTO_HIDE_UI_KEY = 'tm_auto_hide_player_ui';
const MINI_ALWAYS_ON_TOP_KEY = 'tm_mini_always_on_top';

export type UiState = {
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  accentMode: AccentMode;
  accentCustomColor: string;
  unblockEnabled: boolean;
  unblockSources: string[];
  resumeAfterMv: boolean;
  showIntelligenceIndicator: boolean;
  autoHidePlayerUI: boolean;
  showPlayQueue: boolean;
  searchKeyword: string;
  searchType: number;
  defaultSearchHint: string;
  defaultSearchKeyword: string;
  defaultSearchLoading: boolean;
  isMiniMode: boolean;
  miniAlwaysOnTop: boolean;
};

let mediaQuery: MediaQueryList | null = null;
let mediaListener: ((e: MediaQueryListEvent) => void) | null = null;

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === '浅色') return 'light';
  if (mode === '深色') return 'dark';
  return getSystemTheme();
}

function applyThemeToDom(theme: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function syncDesktopWindowBackground(theme: ResolvedTheme) {
  if (typeof window === 'undefined') return;
  const color = theme === 'dark' ? '#100e0d' : '#f5f5f4';
  window.appEnv?.window?.setBackgroundColor?.(color);
}

function applyGlassToDom(enabled: boolean) {
  document.documentElement.setAttribute('data-glass', enabled ? 'on' : 'off');
}

function normalizeHexColor(input: string) {
  const v = String(input || '').trim().toLowerCase();
  const full = /^#[0-9a-f]{6}$/;
  const short = /^#[0-9a-f]{3}$/;
  if (full.test(v)) return v;
  if (short.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return '#22c55e';
}

function hexToRgb(hex: string) {
  const n = normalizeHexColor(hex);
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  return { r, g, b };
}

function applyAccentToDom(mode: AccentMode, customColor?: string) {
  const accent = mode === '蓝色' ? 'blue' : mode === '紫色' ? 'purple' : mode === '橙色' ? 'orange' : mode === '自定义' ? 'custom' : 'green';
  document.documentElement.setAttribute('data-accent', accent);

  if (accent === 'custom') {
    const hex = normalizeHexColor(customColor || '#22c55e');
    const { r, g, b } = hexToRgb(hex);
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.2)`);
  } else {
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--accent-soft');
  }
}

function getWindowRole(): 'main' | 'mini' {
  return window.appEnv?.windowRole === 'mini' ? 'mini' : 'main';
}

export const useUiStore = defineStore('ui', () => {
  const state = reactive<UiState>({
    themeMode: '跟随系统',
    resolvedTheme: 'light',
    accentMode: '绿色',
    accentCustomColor: '#22c55e',
    unblockEnabled: true,
    unblockSources: ['bodian', 'kugou', 'migu', 'qq', 'bilibili'],
    resumeAfterMv: true,
    showIntelligenceIndicator: true,
    autoHidePlayerUI: true,
    showPlayQueue: false,
    searchKeyword: '',
    searchType: 1,
    defaultSearchHint: '',
    defaultSearchKeyword: '',
    defaultSearchLoading: false,
    isMiniMode: false,
    miniAlwaysOnTop: false,
  });

  function init() {
    const saved = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) || '跟随系统';
    const savedAccent = (localStorage.getItem(ACCENT_KEY) as AccentMode | null) || '绿色';
    const savedAccentColor = localStorage.getItem(ACCENT_COLOR_KEY) || '#22c55e';

    state.themeMode = saved;
    state.accentMode = savedAccent;
    state.accentCustomColor = normalizeHexColor(savedAccentColor);
    const savedUnblock = localStorage.getItem(UNBLOCK_KEY);
    const savedUnblockSources = localStorage.getItem(UNBLOCK_SRC_KEY);
    state.unblockEnabled = savedUnblock === null ? true : savedUnblock === '1';
    setUnblockProxyEnabled(state.unblockEnabled);
    try { state.unblockSources = savedUnblockSources ? JSON.parse(savedUnblockSources) : ['bodian', 'kugou', 'migu', 'qq', 'bilibili']; } catch { state.unblockSources = ['bodian', 'kugou', 'migu', 'qq', 'bilibili']; }
    const savedResume = localStorage.getItem(RESUME_AFTER_MV_KEY);
    state.resumeAfterMv = savedResume === null ? true : savedResume === '1';
    const savedIntel = localStorage.getItem(SHOW_INTEL_KEY);
    state.showIntelligenceIndicator = savedIntel === null ? true : savedIntel === '1';
    const savedAutoHide = localStorage.getItem(AUTO_HIDE_UI_KEY);
    state.autoHidePlayerUI = savedAutoHide === null ? true : savedAutoHide === '1';
    state.isMiniMode = getWindowRole() === 'mini';

    // 迷你模式置顶偏好
    const savedMiniTop = sessionStorage.getItem(MINI_ALWAYS_ON_TOP_KEY);
    if (savedMiniTop !== null) {
      state.miniAlwaysOnTop = savedMiniTop === '1';
    }

    state.resolvedTheme = resolveTheme(state.themeMode);
    applyThemeToDom(state.resolvedTheme);
    syncDesktopWindowBackground(state.resolvedTheme);
    applyAccentToDom(state.accentMode, state.accentCustomColor);

    if (!mediaQuery) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    }

    if (!mediaListener) {
      mediaListener = () => {
        if (state.themeMode === '跟随系统') {
          state.resolvedTheme = getSystemTheme();
          applyThemeToDom(state.resolvedTheme);
          syncDesktopWindowBackground(state.resolvedTheme);
        }
      };
      mediaQuery.addEventListener('change', mediaListener);
    }
  }

  function setThemeMode(mode: ThemeMode) {
    state.themeMode = mode;
    localStorage.setItem(STORAGE_KEY, mode);
    state.resolvedTheme = resolveTheme(mode);
    applyThemeToDom(state.resolvedTheme);
    syncDesktopWindowBackground(state.resolvedTheme);
  }

  function setAccentMode(mode: AccentMode) {
    state.accentMode = mode;
    localStorage.setItem(ACCENT_KEY, mode);
    applyAccentToDom(mode, state.accentCustomColor);
  }

  function setAccentCustomColor(color: string) {
    const next = normalizeHexColor(color);
    state.accentCustomColor = next;
    localStorage.setItem(ACCENT_COLOR_KEY, next);
    if (state.accentMode === '自定义') {
      applyAccentToDom('自定义', next);
    }
  }

  function setUnblockEnabled(enabled: boolean) {
    state.unblockEnabled = enabled;
    localStorage.setItem(UNBLOCK_KEY, enabled ? '1' : '0');
    setUnblockProxyEnabled(enabled);
  }

  function setUnblockSources(sources: string[]) {
    state.unblockSources = sources;
    localStorage.setItem(UNBLOCK_SRC_KEY, JSON.stringify(sources));
  }

  function setResumeAfterMv(enabled: boolean) {
    state.resumeAfterMv = enabled;
    localStorage.setItem(RESUME_AFTER_MV_KEY, enabled ? '1' : '0');
  }

  function setShowIntelligenceIndicator(enabled: boolean) {
    state.showIntelligenceIndicator = enabled;
    localStorage.setItem(SHOW_INTEL_KEY, enabled ? '1' : '0');
  }

  function setAutoHidePlayerUI(enabled: boolean) {
    state.autoHidePlayerUI = enabled;
    localStorage.setItem(AUTO_HIDE_UI_KEY, enabled ? '1' : '0');
  }

  function enterMiniMode() {
    if (getWindowRole() === 'main' && !state.isMiniMode) {
      window.appEnv?.miniMode?.enter(state.miniAlwaysOnTop);
    }
  }

  function exitMiniMode() {
    if (state.isMiniMode || getWindowRole() === 'mini') {
      window.appEnv?.miniMode?.exit();
    }
  }

  function setMiniAlwaysOnTop(enabled: boolean) {
    state.miniAlwaysOnTop = enabled;
    sessionStorage.setItem(MINI_ALWAYS_ON_TOP_KEY, enabled ? '1' : '0');
    if (state.isMiniMode) {
      window.appEnv?.miniMode?.setAlwaysOnTop(enabled);
    }
  }

  function togglePlayQueue() {
    state.showPlayQueue = !state.showPlayQueue;
  }

  async function loadDefaultSearchKeyword(force = false) {
    if (state.defaultSearchLoading) return;
    if (!force && state.defaultSearchKeyword && state.defaultSearchHint) return;

    state.defaultSearchLoading = true;
    try {
      const res = await searchMusicDefault();
      const data = res?.data?.data || res?.data || {};
      state.defaultSearchHint = String(data.showKeyword || data.styleKeyword?.keyWord || data.realkeyword || '').trim();
      state.defaultSearchKeyword = String(data.realkeyword || data.showKeyword || data.styleKeyword?.keyWord || '').trim();
    } catch {
      if (!state.defaultSearchHint) state.defaultSearchHint = '';
      if (!state.defaultSearchKeyword) state.defaultSearchKeyword = '';
    } finally {
      state.defaultSearchLoading = false;
    }
  }

  function dispose() {
    if (mediaQuery && mediaListener) {
      mediaQuery.removeEventListener('change', mediaListener);
      mediaListener = null;
    }
  }

  return {
    state,
    init,
    setThemeMode,
    setAccentMode,
    setAccentCustomColor,
    setUnblockEnabled,
    setUnblockSources,
    setResumeAfterMv,
    setShowIntelligenceIndicator,
    setAutoHidePlayerUI,
    enterMiniMode,
    exitMiniMode,
    setMiniAlwaysOnTop,
    togglePlayQueue,
    loadDefaultSearchKeyword,
    dispose,
  };
});
