<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="comment-page">
    <div class="playlist-detail-back">
      <button class="back-btn" @click="$emit('back')">← 返回</button>
    </div>
    <header class="comment-page-head">
      <div class="head-cover-wrap">
        <img v-if="song?.al?.picUrl" class="head-cover" :src="resolveSizedImageUrl(song.al.picUrl, 80)" :alt="song.name" />
        <button v-if="song?.id" class="head-play-btn" @click="togglePlayback" :title="isPlayingThis ? '暂停' : '播放这首歌'">
          <svg v-if="isPlayingThis" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
          <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>
      <div class="head-info">
        <h2 class="head-title">{{ song?.name || '歌曲评论' }}</h2>
        <p class="head-artist">
          歌手：<button v-for="(ar, i) in song?.ar || []" :key="ar.id || ar.name" type="button" class="head-link" @click="openArtist(ar)">{{ i > 0 ? ' / ' : '' }}{{ ar.name }}</button>
        </p>
        <p v-if="song?.al?.name" class="head-album">
          专辑：<button type="button" class="head-link" @click="openAlbum(song.al.id)">{{ song.al.name }}</button>
        </p>
      </div>
    </header>
    <CommentPanel
      :resource-id="props.songId"
      :resource-type="0"
      :fetcher="api.getSongComments"
      :sender="api.sendComment"
      :liker="api.likeComment"
      :deleter="api.deleteSongComment"
      @open-user="(uid) => emit('open-user', uid)"
    />
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { getSongDetail } from '../api/music';
import * as api from '../api/music';
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import AnimatedAppear from './AnimatedAppear.vue';
import CommentPanel from './CommentPanel.vue';
import { resolveSizedImageUrl } from '../utils/image';

const props = defineProps<{ songId: number }>();
const emit = defineEmits<{ (e: 'back'): void; (e: 'open-artist', artist: any): void; (e: 'open-album', albumId: number): void; (e: 'play-song', songId: number): void; (e: 'open-user', userId: number): void }>();

const song = ref<any>(null);

const isCurrentSong = computed(() => playerStore.state.currentTrack?.id === props.songId);
const isPlayingThis = computed(() => isCurrentSong.value && playerStore.state.isPlaying);

function togglePlayback() {
  if (isCurrentSong.value) {
    playerStore.togglePlay();
  } else {
    emit('play-song', props.songId);
  }
}

function openArtist(ar: any) {
  emit('open-artist', ar);
}

function openAlbum(id: number) {
  emit('open-album', id);
}

onMounted(async () => {
  try {
    const detail = await getSongDetail(props.songId);
    song.value = detail.data?.songs?.[0] || null;
  } catch {}
});
</script>

<style scoped>
@import '../styles/detail-page.css';
.comment-page {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: var(--space-4);
  background: var(--glass-reflection), var(--bg-surface);
  position: relative;
  isolation: isolate;
  overflow: visible;
  outline: none;
}
.comment-page-head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); }
.head-cover-wrap { position: relative; width: 80px; height: 80px; flex-shrink: 0; border-radius: 12px; overflow: hidden; }
.head-cover-wrap:hover .head-play-btn { opacity: 1; }
.head-cover { width: 80px; height: 80px; border-radius: 12px; object-fit: cover; display: block; }
.head-play-btn { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; border: 0; background: rgba(0,0,0,0.45); color: #fff; cursor: pointer; opacity: 0; transition: opacity 0.18s ease; backdrop-filter: blur(2px); border-radius: 12px; }
.head-info { min-width: 0; display: grid; gap: 2px; }
.head-title { margin: 0; color: var(--text-main); font-size: var(--text-body-lg); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head-artist { margin: 0; color: var(--text-sub); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head-album { margin: 0; color: var(--text-sub); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head-link { border: 0; background: transparent; color: var(--accent); cursor: pointer; padding: 0; font-size: inherit; font-family: inherit; white-space: nowrap; }
.head-link:hover { opacity: 0.75; }</style>
