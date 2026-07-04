<template>
  <aside
    ref="sidebarRef"
    class="sidebar"
    :class="{ collapsed: isCollapsed, 'mac-window-controls': platform.isMacOS }"
    :style="{ '--sidebar-w': isCollapsed ? '76px' : '220px' }"
  >
    <AnimatedAppear tag="div" variant="sidebar" rhythm="shell" class-name="sidebar-shell">
      <AnimatedAppear tag="div" variant="content" rhythm="head" class-name="profile" :class="{ compact: isCollapsed }">
        <AnimatedAppear tag="div" variant="control" rhythm="actions" class-name="avatar" @click="toggleCollapsed">
          <div v-if="updateDownloaded && isCollapsed" class="update-badge collapsed" @click.stop="onUpdateBadgeClick" title="新版本可安装"></div>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="48" height="48">
            <defs>
              <linearGradient id="logoGradSidebar" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#22c55e;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#16a34a;stop-opacity:1" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="200" height="200" rx="44" fill="#121317" />
            <path d="M55,100 A45,45 0 0,1 145,100" fill="none" stroke="url(#logoGradSidebar)" stroke-width="16" stroke-linecap="round" />
            <rect x="40" y="100" width="30" height="45" rx="12" fill="url(#logoGradSidebar)" />
            <rect x="130" y="100" width="30" height="45" rx="12" fill="url(#logoGradSidebar)" />
            <circle cx="145" cy="122.5" r="5" fill="#121317" opacity="0.8" />
          </svg>
        </AnimatedAppear>
        <div class="user" :class="{ collapsedText: isCollapsed }">
          <AnimatedAppear tag="div" variant="text" rhythm="body" class-name="name">Resound</AnimatedAppear>
          <div v-if="updateDownloaded && !isCollapsed" class="update-badge expanded" @click.stop="onUpdateBadgeClick">
            <span class="badge-dot"></span>
            <span class="badge-label">可更新</span>
          </div>
        </div>
      </AnimatedAppear>

      <nav class="menu">
        <AnimatedAppear
          v-for="(item, idx) in items"
          :key="item.key"
          tag="button"
          variant="nav"
          rhythm="list"
          :index="idx"
          class-name="menu-item"
          :class="{ active: item.key === activeKey, iconOnly: isCollapsed }"
          :title="isCollapsed ? item.label : ''"
          @click="onMenuClick(item.key)"
        >
          <component :is="item.icon" :size="18" class="icon" />
          <span class="text" :class="{ collapsedText: isCollapsed }">{{ item.label }}</span>
        </AnimatedAppear>
      </nav>
    </AnimatedAppear>

    <!-- 右侧边缘折叠折痕 -->
    <div
      class="edge-crease"
      :class="{ collapsed: isCollapsed }"
      :title="isCollapsed ? '展开侧栏' : '收起侧栏'"
      @click="toggleCollapsed"
    >
      <span class="crease-line"></span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { BarChart3, BookAudio, Clapperboard, Compass, Disc3, FolderOpen, FolderTree, History, Home, ListMusic, Mic2, Search, Settings, Trophy, User } from 'lucide-vue-next';
import AnimatedAppear from './AnimatedAppear.vue';
import { platform } from '../utils/platform';

const STORAGE_KEY = 'tm_sidebar_collapsed';

const props = withDefaults(
  defineProps<{
    activeKey: string;
    collapsed?: boolean;
    overlay?: boolean;
  }>(),
  { collapsed: false, overlay: false },
);

const emit = defineEmits<{
  (e: 'update:collapsed', v: boolean): void;
  (e: 'select', key: string): void;
  (e: 'close'): void;
  (e: 'open-settings', tab: string): void;
}>();

const sidebarRef = ref<HTMLElement | null>(null);
const isCollapsed = ref(props.collapsed);

// 从父组件同步
watch(() => props.collapsed, (v) => {
  isCollapsed.value = v;
});

// 持久化本地存储
watch(isCollapsed, (v) => {
  localStorage.setItem(STORAGE_KEY, v ? '1' : '0');
  emit('update:collapsed', v);
});

// 初始化时从 localStorage 恢复状态
onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    const next = saved === '1';
    if (next !== isCollapsed.value) {
      isCollapsed.value = next;
    }
  }

  // 自动更新监听（桌面端）
  if (platform.isDesktop && (window as any).appEnv?.autoUpdater?.onStatus) {
    unsubUpdater = (window as any).appEnv.autoUpdater.onStatus((status: any) => {
      if (status.status === 'downloaded') {
        updateDownloaded.value = true;
        if (status.info?.version) updateVersion.value = status.info.version;
      }
    });
    // 初始化时检查当前状态（可能已下载完成）
    (window as any).appEnv.autoUpdater.getStatus().then((s: any) => {
      if (s.status === 'downloaded') {
        updateDownloaded.value = true;
        if (s.info?.version) updateVersion.value = s.info.version;
      }
    });
  }
});

let unsubUpdater: (() => void) | null = null;

onBeforeUnmount(() => {
  if (unsubUpdater) {
    unsubUpdater();
    unsubUpdater = null;
  }
});

const updateDownloaded = ref(false);
const updateVersion = ref('');

function onUpdateBadgeClick() {
  if (platform.isDesktop && (window as any).appEnv?.autoUpdater) {
    emit('open-settings', 'about');
  }
}

function toggleCollapsed() {
  if (props.overlay) {
    // overlay 模式：折叠时通知父组件关闭
    emit('close');
  } else {
    isCollapsed.value = !isCollapsed.value;
  }
}

function onMenuClick(key: string) {
  emit('select', key);
  // overlay 模式下选择菜单项后自动关闭侧栏
  if (props.overlay) {
    emit('close');
  }
}

const items = [
  { key: 'home', label: '首页', icon: Home },
  { key: 'search', label: '搜索', icon: Search },
  { key: 'playlist', label: '歌单', icon: ListMusic },
  { key: 'rank', label: '排行榜', icon: Trophy },
  { key: 'mv', label: 'MV', icon: Clapperboard },
  { key: 'podcast-list', label: '播客有声书', icon: BookAudio },
  { key: 'history', label: '收藏历史', icon: History },
  { key: 'stats', label: '听歌统计', icon: BarChart3 },
  ...(platform.isDesktop ? [
    { key: 'local-music', label: '本地音乐', icon: Disc3 },
  ] : []),
  { key: 'user', label: '用户', icon: User },
  { key: 'settings', label: '设置', icon: Settings },
  { key: 'discover', label: '发现', icon: Compass },
];
</script>

<style scoped>
.sidebar {
  position: fixed;
  top: var(--layout-top, 8px);
  left: var(--layout-left, 8px);
  width: var(--sidebar-w, 220px);
  height: var(--sidebar-height, 1026px);
  min-width: 0;
  max-width: 100%;
  border-radius: 14px;
  padding: var(--space-3) var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  box-sizing: border-box;
  cursor: default;
  overflow: visible;
  contain: layout style;
  transition: width 0.28s cubic-bezier(0.34, 1, 0.64, 1);
  z-index: 10;
  border: none !important;
}

.sidebar-shell {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  height: 100%;
  min-width: 0;
}

.sidebar-shell::-webkit-scrollbar {
  display: none;
}

.profile {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: 14px;
  transition: padding 0.26s ease, gap 0.26s ease;
  flex-shrink: 0;
  border: none !important;
}

.sidebar.mac-window-controls .profile {
  padding-top: 36px;
}

.profile.compact {
  justify-content: center;
  padding: 0;
  gap: 0;
}

.sidebar.mac-window-controls .profile.compact {
  padding-top: 36px;
}

.user {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
  transition: opacity 0.22s ease, max-width 0.22s ease, margin 0.22s ease;
  max-width: 120px;
  opacity: 1;
}

.text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  transition: opacity 0.2s ease, max-width 0.2s ease, margin 0.2s ease;
  max-width: 120px;
  opacity: 1;
}

.collapsedText {
  opacity: 0;
  max-width: 0;
  margin: 0 !important;
}

/* ?? ?????? ?? */
.update-badge.collapsed {
  position: absolute;
  bottom: 0px;
  right: 0px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent, #22c55e);
  border: 2px solid var(--bg-surface, #1a1a2e);
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  z-index: 2;
  cursor: pointer;
  animation: badge-pulse 2s ease-in-out infinite;
}

.update-badge.expanded {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 4px;
  padding: 1px 6px;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
}

.update-badge.expanded:hover {
  background: color-mix(in srgb, var(--accent, #22c55e) 25%, transparent);
}

.badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent, #22c55e);
  flex-shrink: 0;
  animation: badge-pulse 2s ease-in-out infinite;
}

.badge-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent, #22c55e);
  line-height: 1;
}

@keyframes badge-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.avatar {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--accent) 92%, #fff), color-mix(in srgb, var(--accent) 74%, #000));
  display: grid;
  place-items: center;
  flex-shrink: 0;
  cursor: pointer;
}

.user .name {
  font-size: 26px;
  font-weight: 600;
  color: var(--text-main);
}

.user .sub {
  font-size: var(--text-label-sm);
  color: var(--text-sub);
}

.menu {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: 12px;
  border: 1px solid var(--border) !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.22s ease;
  min-height: 40px;
  min-width: 0;
  overflow: hidden;
}

.menu-item.iconOnly {
  justify-content: center;
  padding: var(--space-2);
  gap: 0;
}

.menu-item.active {
  color: var(--accent);
  font-weight: 600;
}

.icon {
  flex-shrink: 0;
}

/* ── 右侧边缘折叠折痕 ── */
.edge-crease {
  position: absolute;
  top: 0;
  right: -6px;
  width: 18px;
  height: 100%;
  z-index: 20;
  cursor: pointer;
}

/* 折痕线 */
.crease-line {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%) translateX(-50%);
  width: 10px;
  height: 48px;
  border-radius: 3px;
  background: var(--border);
  opacity: 1;
  transition: opacity 0.22s ease, height 0.22s ease, width 0.22s ease, background 0.22s ease;
}

.edge-crease:hover .crease-line {
  width: 14px;
  height: 64px;
  background: var(--accent);
}

.edge-crease:active .crease-line {
  height: 40px;
  background: var(--accent);
}

.edge-crease.collapsed .crease-line {
  left: 12px;
  transform: translateY(-50%) translateX(-50%);
}

/* ── Overlay 模式（平板端展开） ── */
@media (min-width: 768px) and (max-width: 1023px) {
  .sidebar.sidebar-overlay-open {
    z-index: 10;
    animation: sidebar-slide-in 0.28s cubic-bezier(0.34, 1, 0.64, 1);
  }
}

@keyframes sidebar-slide-in {
  from { transform: translateX(-100%); opacity: 0.6; }
  to { transform: translateX(0); opacity: 1; }
}
</style>