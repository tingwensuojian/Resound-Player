<template>
  <AnimatedAppear
    tag="button"
    variant="control"
    rhythm="actions"
    type="button"
    class-name="bookmark-icon-button"
    :class="{ saved: isSaved, loading: isLoading }"
    :aria-pressed="isSaved"
    :aria-label="isSaved ? '取消收藏' : '收藏'"
    :disabled="isLoading"
    @click="toggleSaved"
  >
    <span class="button-core">
      <span class="icon-wrap" aria-hidden="true">
        <span
          class="heart-svg"
          :style="{
            opacity: isSaved ? 0 : 0.96,
            transform: isSaved ? 'scale(0.35) rotate(-8deg)' : 'none',
          }"
        >
          <Heart :size="16" :style="{ color: 'var(--text-soft)' }" />
        </span>
        <span
          class="heart-svg"
          :style="{
            opacity: isSaved ? 1 : 0,
            transform: isSaved ? 'scale(1) rotate(0deg)' : 'scale(0.4)',
          }"
        >
          <Heart :size="16" :style="{ color: 'var(--bookmark-heart-fill)', fill: 'currentColor' }" />
        </span>
      </span>
    </span>

    <span class="glow" aria-hidden="true"></span>
    <span class="pulse pulse-a" aria-hidden="true"></span>
    <span class="pulse pulse-b" aria-hidden="true"></span>
    <span class="pulse pulse-c" aria-hidden="true"></span>

    <span class="sparkles" aria-hidden="true">
      <span v-for="sparkle in sparkles" :key="sparkle.id" class="sparkle" :style="sparkle.style"></span>
    </span>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Heart } from 'lucide-vue-next';
import { useUserStore } from '../../stores/user';
const userStore = useUserStore();
import { useLoginModalStore } from '../../stores/loginModal';
const loginModalStore = useLoginModalStore();
import { toggleSongLike } from '../../api/music';
import { usePlayerStore } from '../../stores/player';
const playerStore = usePlayerStore();
import AnimatedAppear from '../AnimatedAppear.vue';

const props = defineProps<{
  songId?: number;
  liked?: boolean;
}>();

const isSaved = ref(Boolean(props.liked ?? (props.songId ? userStore.state.likedSongIds.includes(props.songId) : false)));
const isLoading = ref(false);
const burstSeed = ref(0);

function syncIsSaved() {
  if (props.liked !== undefined) {
    isSaved.value = props.liked;
  } else if (props.songId) {
    isSaved.value = userStore.state.likedSongIds.includes(props.songId);
  } else {
    isSaved.value = false;
  }
}

watch([() => props.liked, () => props.songId], syncIsSaved, { immediate: true });

watch(
  () => userStore.state.likedSongIds,
  () => {
    if (props.liked === undefined && props.songId) {
      isSaved.value = userStore.state.likedSongIds.includes(props.songId);
    }
  },
);

const sparkles = computed(() => {
  const colors = [
    'color-mix(in srgb, var(--bookmark-accent) 92%, white)',
    'color-mix(in srgb, var(--bookmark-accent) 78%, white)',
    'color-mix(in srgb, var(--bookmark-accent) 62%, white)',
    'color-mix(in srgb, var(--bookmark-accent) 86%, var(--accent-purple))',
    'rgba(255,255,255,0.9)',
  ];
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (index / 6) * Math.PI * 2;
    const distance = 16 + (index % 3) * 7;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance * 0.7;
    return {
      id: `${burstSeed.value}-${index}`,
      style: {
        '--tx': `${x}px`,
        '--ty': `${y}px`,
        '--delay': `${index * 40}ms`,
        '--sparkle-color': colors[index % colors.length],
      },
    };
  });
});

async function toggleSaved() {
  if (isLoading.value) return;
  if (typeof props.songId !== 'number') return;

  // 鉴权检查
  if (!userStore.state.isLogin) {
    loginModalStore.showLoginModal('like');
    return;
  }
  if (userStore.state.loginMode !== 'cookie' && userStore.state.loginMode !== 'qr') {
    loginModalStore.showGlobalToast('搜索用户方式登录不支持收藏功能，请使用扫码或 Cookie 登录', 'warning', 5000);
    return;
  }

  const nextState = !isSaved.value;
  isLoading.value = true;

  try {
    const response = await toggleSongLike({
      id: props.songId,
      like: nextState,
      uid: userStore.state.profile?.userId,
      cookie: userStore.state.loginCookie || undefined,
    });
    const code = response?.data?.code ?? response?.data?.data?.code;
    if (typeof code === 'number' && code !== 200) {
      throw new Error(`收藏失败，接口返回 ${code}`);
    }

    isSaved.value = nextState;
    if (typeof props.songId === 'number') {
      const exists = userStore.state.likedSongIds.includes(props.songId);
      if (nextState && !exists) userStore.state.likedSongIds = [...userStore.state.likedSongIds, props.songId];
      if (!nextState && exists) userStore.state.likedSongIds = userStore.state.likedSongIds.filter((id) => id !== props.songId);
    }
    burstSeed.value += 1;

    // If this song is the current track, sync state to taskbar widget immediately
    if (playerStore.state.currentTrack?.id === props.songId) {
      if (playerStore.state.currentTrack) {
        playerStore.state.currentTrack.liked = nextState;
        playerStore.state.currentTrack.isLiked = nextState;
      }
      playerStore.syncRuntimeState();
      try { window.appEnv?.taskbarWidget?.notifyLikeStatus?.(nextState); } catch (e) {}
    }
  } catch (error) {
    console.error('[bookmark-icon-button] toggle failed', error);
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
.bookmark-icon-button {
  --bookmark-accent: var(--bookmark-heart-fill);
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--bookmark-accent) 18%, var(--button-surface-border));
  border-radius: 999px;
  background: var(--button-surface-bg);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.4);
  color: var(--text-main);
  cursor: pointer;
  overflow: hidden;
  transition: transform 180ms ease, border-color 220ms ease, background 220ms ease, box-shadow 220ms ease;
  box-shadow: var(--button-surface-shadow), 0 10px 24px color-mix(in srgb, var(--bookmark-accent) 8%, rgba(15, 23, 42, 0.14));
}

.bookmark-icon-button::before {
  content: '';
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  background: radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0) 48%);
  opacity: 0.95;
  pointer-events: none;
}

.bookmark-icon-button::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0));
  pointer-events: none;
}

.bookmark-icon-button:hover { transform: translateY(-1px) scale(1.02); border-color: color-mix(in srgb, var(--bookmark-accent) 34%, var(--button-surface-hover-border)); }

.bookmark-icon-button.loading {
  opacity: 0.72;
  cursor: progress;
}

.bookmark-icon-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--bookmark-accent) 60%, white);
  outline-offset: 2px;
}

.bookmark-icon-button.saved {
  border-color: color-mix(in srgb, var(--bookmark-accent) 42%, var(--button-surface-hover-border));
  background: var(--glass-reflection), color-mix(in srgb, var(--bookmark-accent) 16%, var(--bg-surface));
  color: var(--bookmark-accent);
}

.button-core {
  position: relative;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.icon-wrap {
  position: relative;
  width: 16px;
  height: 16px;
  display: inline-grid;
  place-items: center;
}

.heart-svg {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 220ms ease, transform 220ms ease;
}

.glow,
.pulse,
.sparkles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.glow {
  background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.34) 0%, color-mix(in srgb, var(--bookmark-accent) 24%, transparent) 42%, color-mix(in srgb, var(--bookmark-accent) 0%, transparent) 70%);
  opacity: 0;
  transform: scale(0.7);
  transition: opacity 220ms ease, transform 260ms ease;
}

.bookmark-icon-button.saved .glow {
  opacity: 1;
  transform: scale(1.15);
}

.pulse {
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--bookmark-accent) 22%, rgba(255, 255, 255, 0.34));
  opacity: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.bookmark-icon-button.saved .pulse {
  animation: pulse-bloom 700ms ease-out;
}

.pulse-a { animation-delay: 0ms; }
.pulse-b { animation-delay: 90ms; }
.pulse-c { animation-delay: 180ms; }

.sparkles {
  z-index: 2;
}

.sparkle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 5px;
  height: 5px;
  margin-left: -2.5px;
  margin-top: -2.5px;
  border-radius: 999px;
  background: var(--sparkle-color);
  opacity: 0;
  box-shadow: 0 0 10px color-mix(in srgb, var(--sparkle-color) 70%, white);
}

.bookmark-icon-button.saved .sparkle {
  animation: sparkle-burst 680ms ease-out var(--delay);
}

@keyframes pulse-bloom {
  0% { opacity: 0.78; transform: scale(0.6); }
  100% { opacity: 0; transform: scale(2.15); }
}

@keyframes sparkle-burst {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.2);
  }
  20% { opacity: 1; }
  100% {
    opacity: 0;
    transform: translate(var(--tx), var(--ty)) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .bookmark-icon-button,
  .heart-svg,
  .glow {
    transition: none;
  }

  .bookmark-icon-button.saved .pulse,
  .bookmark-icon-button.saved .sparkle {
    animation: none;
  }
}

.bookmark-icon-button:disabled {
  pointer-events: none;
}

:global(html[data-theme='light']) {
  --bookmark-heart-outline: #ef4444;
  --bookmark-heart-fill: #fb7185;
}

:global(html[data-theme='dark']) {
  --bookmark-heart-outline: #fda4af;
  --bookmark-heart-fill: #fb7185;
}
</style>
