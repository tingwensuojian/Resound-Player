<template>
  <AnimatedAppear tag="header" variant="content" rhythm="head" class-name="topbar">
    <div class="topbar-left">
      <button class="nav-btn button-surface" type="button" :disabled="!canGoBack" aria-label="后退" @click="emit('nav-back')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <button class="nav-btn button-surface" type="button" :disabled="!canGoForward" aria-label="前进" @click="emit('nav-forward')">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>

    <div class="topbar-spacer" />

    <div class="actions">
      <AnimatedAppear
        tag="div"
        variant="content"
        rhythm="body"
        :index="0"
        class-name="search-wrap"
        :class="{ expanded: isExpanded }"
        @mouseenter="onSearchMouseEnter"
        @mouseleave="onSearchMouseLeave"
        @click="onSearchClick"
      >
        <button class="search-trigger" type="button" :aria-expanded="isExpanded" aria-label="打开搜索">
          <Search :size="16" class="icon" />
        </button>
        <div v-if="isExpanded" class="search-input-shell">
          <div class="search-input-wrap">
            <input
              ref="searchInputRef"
              v-model="searchKeyword"
              class="search-input"
              :class="{ 'has-clear': !!searchKeyword }"
              :placeholder="searchPlaceholder"
              @focus="openRecentPanel"
              @input="openRecentPanel"
              @keydown.enter="onSubmitSearch"
              @keydown.escape="onInputEscape"
            />
            <button v-if="searchKeyword" class="clear-btn" type="button" @click.stop="clearSearch" aria-label="清空搜索内容">
              ×
            </button>
          </div>
          <transition name="recent-panel-fade">
            <div v-if="showRecentPanel && recentSearches.length" class="recent-panel" :style="recentPanelStyle">
              <div class="recent-panel-head">
                <span>最近搜索</span>
                <button class="recent-clear" type="button" @click.stop="clearRecentSearches">清空历史</button>
              </div>
              <button
                v-for="item in recentSearches"
                :key="item"
                class="recent-item"
                type="button"
                @click.stop="useRecentSearch(item)"
              >
                <span class="recent-dot" />
                <span class="recent-text">{{ item }}</span>
              </button>
            </div>
          </transition>
        </div>
      </AnimatedAppear>

      <AnimatedAppear tag="button" variant="control" rhythm="actions" :index="1" class-name="msg button-surface" :attrs="intelligenceBtnAttrs" :data-tooltip="playerStore.isIntelligenceActive ? '退出心动模式' : '心动模式'" data-tooltip-dir="down" @click="handleIntelligencePlay">
        <Sparkles :size="16" />
      </AnimatedAppear>
      <div class="user-menu-wrap">
        <AnimatedAppear
          tag="button"
          variant="control"
          rhythm="actions"
          :index="2"
          class-name="avatar button-surface"
          :attrs="{ type: 'button', 'aria-label': userStore.isLogin ? '打开用户菜单' : '登录', 'aria-expanded': userStore.isLogin ? String(showUserMenu) : undefined }"
          @click.stop="onUserButtonClick"
        >
          <img v-if="userAvatarUrl" :src="userAvatarUrl" :alt="userAvatarAlt" class="avatar-img" />
          <span v-else class="avatar-text">{{ userInitials }}</span>
        </AnimatedAppear>

        <transition name="user-menu-fade">
          <div v-if="showUserMenu && userStore.isLogin" class="user-menu" :style="userMenuStyle" @click.stop>
            <div class="user-card">
              <img v-if="userAvatarUrl" :src="userAvatarUrl" :alt="userAvatarAlt" class="user-card-avatar" />
              <div class="user-card-meta">
                <div class="user-card-name-row">
                  <strong>{{ userStore.profile?.nickname || '未命名用户' }}</strong>
                </div>
                <div class="user-card-vip-row">
                  <span class="level-tag">Lv.{{ userStore.level || 0 }}</span>
                  <img v-if="userStore.isVip && userStore.vipInfo?.redVipLevelIcon" :src="userStore.vipInfo.redVipLevelIcon" class="vip-icon" alt="VIP" />
                </div>
                <span>UID {{ userStore.profile?.userId || '-' }}</span>
                <em>{{ loginModeLabel }}</em>
              </div>
            </div>

            <div class="menu-section">
              <button class="menu-item" type="button" @click="emitMenuAction('open-user')">用户中心</button>
              <button class="menu-item" type="button" @click="emitMenuAction('open-settings-page')">设置页面</button>
              <button class="menu-item" type="button" @click="refreshLoginState">刷新登录状态</button>
              <button class="menu-item" type="button" @click="forceReload">强制重新加载</button>
            </div>

            <div class="menu-section">
              <button class="menu-item" type="button" @click="toggleThemeMode">主题模式<span>{{ currentThemeLabel }}</span></button>
              <button class="menu-item" type="button" @click="toggleAccentMode">主题色<span>{{ currentAccentLabel }}</span></button>
            </div>

            <div class="menu-section">
              <button class="menu-item" type="button" @click="copyUserId">复制用户 ID</button>
              <button class="menu-item danger" type="button" @click="logoutUser">退出登录</button>
            </div>

            <p v-if="menuFeedback" class="menu-feedback">{{ menuFeedback }}</p>
          </div>
        </transition>
      </div>
      <div v-if="platform.isDesktop" class="win-controls">
        <button class="win-btn" type="button" title="最小化" @click="minimizeWindow">
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg>
        </button>
        <button class="win-btn" type="button" :title="isMaximized ? '还原' : '最大化'" @click="maximizeWindow">
          <svg v-if="isMaximized" width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="0.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><rect x="0.5" y="2" width="9" height="9" rx="1" fill="var(--bg-surface)" stroke="currentColor" stroke-width="1"/></svg>
          <svg v-else width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>
        </button>
        <button class="win-btn win-btn--close" type="button" title="关闭" @click="closeWindow">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>
        </button>
      </div>
    </div>
  </AnimatedAppear>

  <Teleport to="body">
    <HeartbeatActivateEffect
      :visible="showHeartbeatEffect"
      @done="showHeartbeatEffect = false"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Sparkles, Search } from 'lucide-vue-next';
import AnimatedAppear from './AnimatedAppear.vue';
import { platform } from '../utils/platform';

import { useUiStore } from '../stores/ui';
const uiStore = useUiStore();
import { userStore } from '../stores/user';
import { playerStore } from '../stores/player';
import { useAuthAction } from '../composables/useAuthAction';
import { useLoginModalStore } from '../stores/loginModal';
const loginModalStore = useLoginModalStore();
import HeartbeatActivateEffect from './effects/HeartbeatActivateEffect.vue';

const RECENT_KEY = 'tm_search_history';
const emit = defineEmits<{
  (e: 'search-submit', keyword: string): void;
  (e: 'user-click'): void;
  (e: 'open-settings-page'): void;
  (e: 'nav-back'): void;
  (e: 'nav-forward'): void;
}>();

const props = withDefaults(
  defineProps<{
    canGoBack?: boolean;
    canGoForward?: boolean;
  }>(),
  {
    canGoBack: false,
    canGoForward: false,
  },
);
const searchInputRef = ref<HTMLInputElement | null>(null);
const showRecentPanel = ref(false);
const showUserMenu = ref(false);
const menuFeedback = ref('');
const recentSearches = ref<string[]>(readRecentSearches());
const isExpanded = ref(false);
const isClicked = ref(false);
const userMenuStyle = ref<Record<string, string>>({});
const recentPanelStyle = ref<Record<string, string>>({});

const isIntelligenceDisabled = computed(() => {
  return playerStore.currentIntelligenceLoading;
});

const intelligenceBtnAttrs = computed(() => {
  const cls: string[] = [];
  if (playerStore.currentIntelligenceLoading) cls.push('msg--loading');
  if (playerStore.isIntelligenceActive) cls.push('msg--active');
  return {
    disabled: playerStore.currentIntelligenceLoading,
    class: cls.length ? cls.join(' ') : undefined,
  };
});

const intelligenceTooltip = computed(() => {
  if (playerStore.currentIntelligenceLoading) return '';
  return '';
});

const { checkAuth } = useAuthAction(
  '智能播放需要扫码或 Cookie 方式登录',
  'playlist',
);

const showHeartbeatEffect = ref(false);

async function handleIntelligencePlay() {
  if (playerStore.currentIntelligenceLoading) return;

  // 已开启 → 退出心动模式
  if (playerStore.isIntelligenceActive) {
    playerStore.isIntelligenceActive = false;
    playerStore.clearPlaylist();
    loginModalStore.showGlobalToast('已退出心动模式', 'success');
    showHeartbeatEffect.value = true;
    return;
  }

  if (!checkAuth()) return;

  // 从用户歌单列表中找一个有曲目的作为 pid
  const validPlaylist = userStore.playlists.find(p => p.trackCount && p.trackCount > 0);
  if (!validPlaylist) {
    loginModalStore.showGlobalToast('您的歌单列表暂无心动推荐', 'warning');
    return;
  }
  playerStore.currentPlaylistId = validPlaylist.id;

  const err = await playerStore.playIntelligenceList();
  if (err) {
    loginModalStore.showGlobalToast(err, 'warning');
  } else {
    playerStore.isIntelligenceActive = true;
    loginModalStore.showGlobalToast('已开启心动模式', 'success');
    showHeartbeatEffect.value = true;
  }
}

// 当心动模式激活时，如果用户切换了歌单播放，自动退出
watch(() => playerStore.currentPlaylistId, () => {
  if (playerStore.isIntelligenceActive) {
    playerStore.isIntelligenceActive = false;
    loginModalStore.showGlobalToast('已退出心动模式', 'success');
    showHeartbeatEffect.value = true;
  }
});

const searchKeyword = computed({
  get: () => uiStore.state.searchKeyword,
  set: (value: string) => {
    uiStore.state.searchKeyword = value;
    if (value.trim()) showRecentPanel.value = true;
  },
});
const searchPlaceholder = computed(() => uiStore.state.defaultSearchHint || '搜索歌曲/歌手，热搜：周杰伦、林俊杰、告五人');
const userAvatarUrl = computed(() => userStore.profile?.avatarUrl || '');
const userAvatarAlt = computed(() => `${userStore.profile?.nickname || '用户'}头像`);
const userInitials = computed(() => {
  if (!userStore.isLogin) return '登录';
  const name = userStore.profile?.nickname?.trim() || '用户';
  return Array.from(name).slice(0, 2).join('').toUpperCase();
});
const loginModeLabel = computed(() => {
  if (userStore.loginMode === 'uid') return '搜索用户模式';
  if (userStore.loginMode === 'qr') return '扫码登录';
  if (userStore.loginMode === 'cookie') return 'Cookie 登录';
  return '已登录';
});
const vipLabel = computed(() => {
  if (!userStore.isVip) return '';
  const info = userStore.vipInfo;
  if (!info) return '';
  const parts: string[] = [];
  if (info.associator?.vipCode > 0) {
    parts.push('黑胶 ' + (info.associator.vipLevel > 0 ? 'Lv.' + info.associator.vipLevel : ''));
  }
  if (info.musicPackage?.vipCode > 0) {
    parts.push('音乐包');
  }
  if (info.redplus?.vipCode > 0) {
    parts.push('红砖PLUS');
  }
  return parts.join(' + ') || '';
});
const accentModes = ['绿色', '蓝色', '紫色', '橙色', '自定义'] as const;
const currentThemeLabel = computed(() => uiStore.state.themeMode);
const currentAccentLabel = computed(() => uiStore.state.accentMode);
function getNextThemeMode() {
  if (uiStore.state.themeMode === '浅色') return '深色' as const;
  if (uiStore.state.themeMode === '深色') return '跟随系统' as const;
  return '浅色' as const;
}
function getNextAccentMode() {
  const currentIndex = accentModes.indexOf(uiStore.state.accentMode);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  return accentModes[(safeIndex + 1) % accentModes.length];
}

function readRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 8);
  } catch {
    return [];
  }
}

function saveRecentSearches() {
  localStorage.setItem(RECENT_KEY, JSON.stringify(recentSearches.value.slice(0, 8)));
}

function rememberSearch(keyword: string) {
  const clean = keyword.trim();
  if (!clean) return;
  recentSearches.value = [clean, ...recentSearches.value.filter((item) => item !== clean)].slice(0, 8);
  saveRecentSearches();
}

function onSubmitSearch() {
  const keyword = uiStore.state.searchKeyword.trim() || uiStore.state.defaultSearchKeyword.trim();
  if (!keyword) return;
  rememberSearch(keyword);
  uiStore.state.searchKeyword = keyword;
  isExpanded.value = true;
  isClicked.value = true;
  showRecentPanel.value = false;
  emit('search-submit', keyword);
}

function useRecentSearch(keyword: string) {
  uiStore.state.searchKeyword = keyword;
  isExpanded.value = true;
  isClicked.value = true;
  showRecentPanel.value = false;
  emit('search-submit', keyword);
}

function clearSearch() {
  uiStore.state.searchKeyword = '';
  isExpanded.value = true;
  isClicked.value = true;
  showRecentPanel.value = recentSearches.value.length > 0;
  searchInputRef.value?.focus();
}

function onSearchMouseEnter() {
  isExpanded.value = true;
}

function onSearchMouseLeave() {
  if (!isClicked.value) {
    isExpanded.value = false;
    showRecentPanel.value = false;
  }
}

function onSearchClick() {
  isClicked.value = true;
  isExpanded.value = true;
  requestAnimationFrame(() => {
    searchInputRef.value?.focus();
  });
  emit('search-submit', uiStore.state.searchKeyword || '');
}

function collapseSearch() {
  isClicked.value = false;
  isExpanded.value = false;
  showRecentPanel.value = false;
}

function clearRecentSearches() {
  recentSearches.value = [];
  saveRecentSearches();
  showRecentPanel.value = false;
}

function openRecentPanel() {
  isExpanded.value = true;
  showRecentPanel.value = recentSearches.value.length > 0;
  if (showRecentPanel.value) {
    const wrap = document.querySelector('.search-wrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const gap = 8;
    if (window.innerHeight - rect.bottom < 200 + gap) {
      recentPanelStyle.value = { bottom: 'calc(100% + var(--space-2))', top: 'auto' };
    } else {
      recentPanelStyle.value = {};
    }
  }
}

function closeRecentPanel() {
  showRecentPanel.value = false;
  recentPanelStyle.value = {};
}

function onInputEscape() {
  closeRecentPanel();
  closeUserMenu();
  if (!uiStore.state.searchKeyword.trim()) {
    collapseSearch();
  }
}

function closeUserMenu() {
  showUserMenu.value = false;
  userMenuStyle.value = {};
}

function onUserButtonClick() {
  if (!userStore.isLogin) {
    emit('user-click');
    return;
  }

  showUserMenu.value = !showUserMenu.value;
  menuFeedback.value = '';

  if (showUserMenu.value) {
    const wrap = document.querySelector('.user-menu-wrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const gap = 8;
    if (window.innerHeight - rect.bottom < 300 + gap) {
      userMenuStyle.value = { bottom: 'calc(100% + var(--space-2))', top: 'auto' };
    } else {
      userMenuStyle.value = {};
    }
  }
}

function emitMenuAction(action: 'open-user' | 'open-settings-page') {
  closeUserMenu();
  if (action === 'open-user') emit('user-click');
  if (action === 'open-settings-page') emit('open-settings-page');
}

async function refreshLoginState() {
  menuFeedback.value = '正在刷新...';
  await userStore.refreshLoginStatus();
  menuFeedback.value = '登录状态已刷新';
}

function toggleThemeMode() {
  const nextMode = getNextThemeMode();
  uiStore.setThemeMode(nextMode);
  menuFeedback.value = `已切换到${uiStore.state.themeMode}`;
}

function toggleAccentMode() {
  const nextAccent = getNextAccentMode();
  uiStore.setAccentMode(nextAccent);
  menuFeedback.value = `已切换到${uiStore.state.accentMode}主题`;
}

async function copyUserId() {
  const uid = userStore.profile?.userId;
  if (!uid) return;
  await navigator.clipboard?.writeText(String(uid));
  menuFeedback.value = '用户 ID 已复制';
}

async function logoutUser() {
  await userStore.logout();
  closeUserMenu();
  emit('user-click');
}

function forceReload() {
  window.location.reload();
}

// ── 窗口控制 ──
const isMaximized = ref(false);

function minimizeWindow() { document.title = 'cmd:minimize:' + Date.now(); }
function maximizeWindow() {
  document.title = (isMaximized.value ? 'cmd:restore:' : 'cmd:maximize:') + Date.now();
}
function closeWindow() { window.close(); }

// 监听最大化状态变更（通过 preload 设置的 data-win-maximized + MutationObserver）
onMounted(() => {
  isMaximized.value = 'winMaximized' in document.documentElement.dataset;
  const observer = new MutationObserver(() => {
    isMaximized.value = 'winMaximized' in document.documentElement.dataset;
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-win-maximized'],
  });
  onBeforeUnmount(() => observer.disconnect());
});

function onDocClick(e: MouseEvent) {
  const target = e.target as Node;
  const root = searchInputRef.value?.closest('.search-wrap');
  const userMenuRoot = document.querySelector('.user-menu-wrap');

  if (root && !root.contains(target)) {
    closeRecentPanel();
    if (!uiStore.state.searchKeyword.trim()) {
      collapseSearch();
    } else {
      isClicked.value = false;
    }
  }

  if (userMenuRoot && !userMenuRoot.contains(target)) {
    closeUserMenu();
  }
}

function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeRecentPanel();
    closeUserMenu();
  }
}

onMounted(() => {
  window.addEventListener('click', onDocClick);
  window.addEventListener('keydown', onDocKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', onDocClick);
  window.removeEventListener('keydown', onDocKeydown);
});
</script>

<style scoped>
.topbar {
  height: 100%;
  border: 1px solid var(--border);
  border-radius: 14px 14px 0 0 !important;
  background: var(--glass-reflection), var(--bg-surface) !important;
  backdrop-filter: blur(var(--glass-blur)) saturate(145%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(145%);
  box-shadow: var(--glass-shadow), var(--glass-highlight);
  display: grid;
  grid-template-columns: minmax(140px, 180px) minmax(0, 1fr) auto;
  align-items: center;
  padding: 0 var(--space-4);
  gap: var(--space-3);
  box-sizing: border-box;
  min-width: 0;
  position: relative;
  z-index: 120;
  overflow: visible;
  -webkit-app-region: drag;
}
.topbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.nav-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}
.nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
  pointer-events: none;
}
.topbar-spacer {
  min-width: 0;
}
.search-wrap {
  position: relative;
  width: 36px;
  min-width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--glass-reflection), var(--bg-muted);
  backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  display: flex;
  align-items: center;
  overflow: visible;
  transition: width 0.28s ease, min-width 0.28s ease, height 0.28s ease, border-radius 0.28s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
  -webkit-app-region: no-drag;
}
.search-wrap.expanded {
  width: min(596px, calc(100vw - 320px));
  min-width: min(596px, calc(100vw - 320px));
  height: 46px;
  border-radius: 16px;
  border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
  box-shadow: 0 14px 32px color-mix(in srgb, var(--accent-soft) 55%, rgba(0, 0, 0, 0.08));
}
.search-wrap.expanded:focus-within {
  border-color: color-mix(in srgb, var(--accent) 58%, var(--border));
  box-shadow: 0 16px 36px color-mix(in srgb, var(--accent-soft) 72%, rgba(0, 0, 0, 0.08));
}
.search-trigger {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: var(--text-main);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex: 0 0 36px;
}
.search-trigger:hover {
  color: var(--accent);
}
.icon {
  margin: 0 auto;
  color: currentColor;
}
.search-input-shell {
  position: relative;
  min-width: 0;
  height: 100%;
  flex: 1;
  overflow: visible;
}
.search-input-wrap {
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: stretch;
  position: relative;
}
.search-input {
  min-width: 0;
  flex: 1;
  height: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--text-main);
  padding: 0 44px 0 var(--space-2);
  box-sizing: border-box;
  font-size: var(--text-label-md);
}
.search-input::placeholder {
  color: var(--text-sub);
}
.clear-btn {
  position: absolute;
  right: var(--space-2);
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-muted) 72%, transparent);
  color: var(--text-soft);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  font-size: var(--text-body-lg);
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
}
.clear-btn:hover {
  color: var(--text-main);
  background: color-mix(in srgb, var(--accent-soft) 65%, var(--bg-muted));
}
.clear-btn:active {
  transform: translateY(-50%) scale(0.96);
}
.recent-panel {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + var(--space-2));
  z-index: 40;
  border-radius: 18px;
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.recent-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: 0;
  color: var(--text-sub);
  font-size: var(--text-label-sm);
}
.recent-clear {
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font-size: var(--text-label-sm);
}
.recent-clear:hover {
  text-decoration: underline;
}
.recent-item {
  border: 0;
  background: transparent;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) 6px;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
}
.recent-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  flex: 0 0 auto;
}
.recent-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recent-panel-fade-enter-active,
.recent-panel-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.recent-panel-fade-enter-from,
.recent-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
  position: relative;
  z-index: 130;
  overflow: visible;
  -webkit-app-region: no-drag;
}
.msg {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  color: var(--text-main);
  cursor: pointer;
  display: grid;
  place-items: center;
  -webkit-app-region: no-drag;
}
.msg:hover {
  transform: translateY(-1px);
}
.msg:active {
  transform: translateY(0) scale(0.99);
}
.msg:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
.msg--loading svg {
  animation: an-spin 1s linear infinite;
}
.msg--active svg {
  animation: an-spin 5s linear infinite;
}
.user-menu-wrap {
  position: relative;
  display: grid;
  place-items: center;
  z-index: 140;
  overflow: visible;
  -webkit-app-region: no-drag;
}
.avatar {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 12px;
  color: var(--text-main);
  cursor: pointer;
  display: block;
  font-size: var(--text-label-sm);
  font-weight: 700;
  overflow: hidden;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}
.avatar:hover {
  transform: translateY(-1px);
}
.avatar:active {
  transform: translateY(0) scale(0.99);
}
.avatar-text {
  writing-mode: horizontal-tb;
  white-space: nowrap;
  line-height: 1;
  transform: none;
}
.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
  object-position: center;
  display: block;
}
.user-menu {
  position: absolute;
  top: calc(100% + var(--space-2));
  right: 0;
  z-index: 300;
  width: 286px;
  padding: var(--space-3);
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.user-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: 16px;
  background: color-mix(in srgb, var(--bg-solid) 88%, var(--bg-muted));
}
.user-card-avatar {
  width: 68px;
  height: 68px;
  border-radius: 14px;
  object-fit: cover;
  flex: 0 0 auto;
}
.user-card-meta {
  min-width: 0;
  display: grid;
  gap: 3px;
}
.user-card-meta strong,
.user-card-meta span,
.user-card-meta em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.user-card-meta strong {
  color: var(--text-main);
  font-size: 15px;
}
.user-card-name-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.user-card-vip-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.user-card-meta span,
.user-card-meta em {
  color: var(--text-sub);
  font-size: var(--text-label-sm);
  font-style: normal;
}
.vip-icon {
  width: 50px;
  height: 50px;
  margin: -15px 0;
  object-fit: contain;
  flex: 0 0 auto;
}
.level-tag {
  display: inline-block;
  font-size: var(--text-label-xs);
  font-weight: 600;
  color: #f5a623;
  background: color-mix(in srgb, #f5a623 14%, var(--bg-solid));
  padding: 0 6px;
  border-radius: 4px;
  white-space: nowrap;
  border: 1px solid color-mix(in srgb, #f5a623 24%, transparent);
}
.menu-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: var(--space-2);
  border-top: 1px solid var(--border);
}
.menu-item {
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-3);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.menu-item span {
  margin-left: auto;
  color: var(--text-sub);
  font-size: var(--text-label-sm);
}
.menu-item:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-solid));
  color: var(--accent);
}
.menu-item.danger {
  color: #dc2626;
}
.menu-feedback {
  margin: 0;
  color: var(--text-sub);
  font-size: var(--text-label-sm);
  text-align: center;
}
.user-menu-fade-enter-active,
.user-menu-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.user-menu-fade-enter-from,
.user-menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.win-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 6px;
  -webkit-app-region: no-drag;
}
.win-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.12s ease, color 0.12s ease;
}
.win-btn:hover {
  background: color-mix(in srgb, var(--accent) 12%, var(--bg-muted));
  color: var(--text-main);
}
.win-btn--close:hover {
  background: #e81123;
  color: #fff;
}
</style>
