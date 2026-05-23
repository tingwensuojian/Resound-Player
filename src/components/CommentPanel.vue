<template>
  <div class="comment-panel">
    <div class="comment-head">
      <h4 class="comment-title">{{ title }}</h4>
      <span class="comment-count">{{ total }} 条</span>
    </div>

    <div class="comment-editor">
      <textarea v-model="newComment" class="comment-input" maxlength="300" placeholder="写下你的评论..." />
      <div class="comment-editor-actions">
        <span class="comment-limit">{{ newComment.length }}/300</span>
        <button type="button" class="comment-submit" :disabled="!newComment.trim()" @click="submitComment">发表评论</button>
      </div>
    </div>

    <section v-if="hotLoading || hotError || hotComments.length" class="hot-comment-section">
      <div class="hot-comment-head">
        <h5 class="hot-comment-title">热门评论</h5>
        <span class="hot-comment-count">{{ hotComments.length }} 条</span>
      </div>
      <div v-if="hotLoading" class="comment-status">热门评论加载中…</div>
      <div v-else-if="hotError" class="comment-status error">{{ hotError }}</div>
      <div v-else-if="!hotComments.length" class="comment-status">暂无热门评论</div>
      <ul v-else class="comment-list hot-comment-list">
        <AnimatedAppear
          v-for="(item, idx) in hotComments"
          :key="item.id"
          tag="li"
          variant="text"
          rhythm="list"
          :index="idx"
          class-name="comment-item hot-comment-item"
        >
          <div class="comment-main">
            <div class="comment-user-row">
              <img class="comment-avatar" :src="item.avatarUrl + '?imageView&thumbnail=40x40'" :alt="item.user" @click="openUser(item)" />
              <button class="comment-user" @click="openUser(item)">{{ item.user }}</button>
            </div>
            <p class="comment-content">{{ item.content }}</p>
            <div v-if="item.replyTo" class="comment-reply">
              <button v-if="item.replyTo.userId" class="reply-user" @click="openUser(item.replyTo)">@{{ item.replyTo.user }}：</button>
              <span v-else class="reply-user">@{{ item.replyTo.user }}：</span>
              <span class="reply-text">{{ item.replyTo.content }}</span>
            </div>
            <div class="comment-actions">
              <span class="comment-time">{{ item.time }}</span>
              <span class="hot-badge">热门</span>
              <button class="text-btn" @click="toggleLike(item)">{{ item.liked ? '取消赞' : '点赞' }}({{ item.likes }})</button>
              <button class="text-btn" @click="toggleReply(item)">{{ item.showReply ? '取消回复' : '回复' }}</button>
            </div>
          </div>
          <div v-if="item.showReply" class="reply-editor">
            <input v-model="item.replyDraft" class="reply-input" type="text" maxlength="200" placeholder="回复这条评论..." />
            <button type="button" class="reply-submit" :disabled="!item.replyDraft?.trim()" @click="submitReply(item)">发送</button>
          </div>
          <ul v-if="item.replies?.length" class="reply-list">
            <li v-for="(reply, rIdx) in item.replies" :key="reply.id" class="reply-item">
              <span class="reply-user">{{ reply.user }}</span>
              <p class="reply-content">{{ reply.content }}</p>
              <div class="comment-actions">
                <span class="comment-time">{{ reply.time }}</span>
                <button class="text-btn" @click="toggleReplyLike(item, rIdx)">{{ reply.liked ? '取消赞' : '点赞' }}({{ reply.likes }})</button>
                <button v-if="reply.user === myNickname" class="text-btn danger" @click="removeReply(item, rIdx)">删除</button>
              </div>
            </li>
          </ul>
        </AnimatedAppear>
      </ul>
    </section>

    <div v-if="hotComments.length" class="comment-divider" aria-hidden="true"></div>

    <section class="recent-comment-section">
      <div class="recent-comment-head">
        <h5 class="recent-comment-title">最新评论</h5>
        <span class="recent-comment-count">{{ total }} 条</span>
      </div>

      <div v-if="loading" class="comment-status">评论加载中…</div>
      <div v-else-if="error" class="comment-status error">{{ error }}</div>
      <div v-else-if="!comments.length" class="comment-status">暂无评论</div>

      <template v-else>
        <ul class="comment-list">
          <AnimatedAppear v-for="(item, idx) in comments" :key="item.id" tag="li" variant="text" rhythm="list" :index="idx" class-name="comment-item">
            <div class="comment-main">
              <div class="comment-user-row">
                <img class="comment-avatar" :src="item.avatarUrl + '?imageView&thumbnail=40x40'" :alt="item.user" @click="openUser(item)" />
                <button class="comment-user" @click="openUser(item)">{{ item.user }}</button>
              </div>
              <p class="comment-content">{{ item.content }}</p>
              <div v-if="item.replyTo" class="comment-reply">
                <button v-if="item.replyTo.userId" class="reply-user" @click="openUser(item.replyTo)">@{{ item.replyTo.user }}：</button>
                <span v-else class="reply-user">@{{ item.replyTo.user }}：</span>
                <span class="reply-text">{{ item.replyTo.content }}</span>
              </div>
              <div class="comment-actions">
                <span class="comment-time">{{ item.time }}</span>
                <button class="text-btn" @click="toggleLike(item)">{{ item.liked ? '取消赞' : '点赞' }}({{ item.likes }})</button>
                <button class="text-btn" @click="toggleReply(item)">{{ item.showReply ? '取消回复' : '回复' }}</button>
                <button v-if="canDelete(item)" class="text-btn danger" @click="removeComment(item)">删除</button>
              </div>
            </div>
            <div v-if="item.showReply" class="reply-editor">
              <input v-model="item.replyDraft" class="reply-input" type="text" maxlength="200" placeholder="回复这条评论..." />
              <button type="button" class="reply-submit" :disabled="!item.replyDraft?.trim()" @click="submitReply(item)">发送</button>
            </div>
            <ul v-if="item.replies?.length" class="reply-list">
              <li v-for="(reply, rIdx) in item.replies" :key="reply.id" class="reply-item">
                <span class="reply-user">{{ reply.user }}</span>
                <p class="reply-content">{{ reply.content }}</p>
                <div class="comment-actions">
                  <span class="comment-time">{{ reply.time }}</span>
                  <button class="text-btn" @click="toggleReplyLike(item, rIdx)">{{ reply.liked ? '取消赞' : '点赞' }}({{ reply.likes }})</button>
                  <button v-if="reply.user === myNickname" class="text-btn danger" @click="removeReply(item, rIdx)">删除</button>
                </div>
              </li>
            </ul>
          </AnimatedAppear>
        </ul>
        <div v-if="hasMore" class="comment-more-wrap">
          <button class="comment-more-btn" @click="loadMore" :disabled="loadingMore">{{ loadingMore ? '加载中…' : '加载更多' }}</button>
        </div>
      </template>
    </section>

    <transition name="toast-fade">
      <div v-if="toast" class="cp-toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getCommentHot } from '../api/music';
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import { useLoginModalStore } from '../stores/loginModal';
const loginModalStore = useLoginModalStore();
import AnimatedAppear from './AnimatedAppear.vue';

const props = defineProps<{
  resourceId: number;
  resourceType: number; // 0=歌曲, 1=MV
  title?: string;
  fetcher: (params: { id: number; limit?: number; offset?: number }) => Promise<any>;
  sender: (params: { id: number; t: number; content: string; commentId?: number; cookie?: string }) => Promise<any>;
  liker: (params: { id: number; cid: number; t: number; type: number; cookie?: string }) => Promise<any>;
  deleter: (params: { id: number; commentId: number; cookie?: string }) => Promise<any>;
}>();

const newComment = ref('');
const comments = ref<any[]>([]);
const hotComments = ref<any[]>([]);
const total = ref(0);
const loading = ref(true);
const loadingMore = ref(false);
const hotLoading = ref(true);
const error = ref('');
const hotError = ref('');
const offset = ref(0);
const LIMIT = 20;
const toast = ref('');

const hasMore = computed(() => comments.value.length < total.value);
const myNickname = computed(() => userStore.state.profile?.nickname || '');

const emit = defineEmits<{ (e: 'open-user', userId: number): void }>();

function openUser(item: any) {
  const uid = item.ownerUserId ?? item.userId;
  if (uid) emit('open-user', uid);
}

function normalizeComment(c: any) {
  return {
    id: c.commentId != null ? String(c.commentId) : `c-${Date.now()}-${Math.random()}`,
    rawId: c.commentId,
    user: c.user?.nickname || '匿名用户',
    avatarUrl: c.user?.avatarUrl || '',
    content: c.content || '',
    time: formatTime(c.time),
    likes: c.likedCount ?? 0,
    liked: !!c.liked,
    ownerUserId: c.user?.userId ?? null,
    replyTo: c.beReplied?.[0]
      ? {
          user: c.beReplied[0].user?.nickname,
          content: c.beReplied[0].content,
          userId: c.beReplied[0].user?.userId ?? null,
        }
      : null,
    showReply: false,
    replyDraft: '',
    replies: [],
  };
}

function requireAuth(): boolean {
  if (!userStore.state.isLogin) {
    loginModalStore.showLoginModal();
    return false;
  }
  return true;
}

async function fetchHotComments() {
  hotLoading.value = true;
  hotError.value = '';
  try {
    const res = await getCommentHot({ id: props.resourceId, type: props.resourceType, limit: 5 });
    const body = res.data;
    const data = body?.data || body || {};
    const raw = data?.hotComments || data?.comments || [];
    hotComments.value = raw.map(normalizeComment);
  } catch (e: any) {
    hotError.value = e?.message || '热门评论加载失败';
    hotComments.value = [];
  } finally {
    hotLoading.value = false;
  }
}

async function fetchComments(append = false) {
  if (!append) {
    loading.value = true;
    offset.value = 0;
    error.value = '';
  } else {
    loadingMore.value = true;
  }
  try {
    const res = await props.fetcher({ id: props.resourceId, limit: LIMIT, offset: offset.value });
    const body = res.data;
    const data = body?.data || body || {};
    total.value = data?.total || data?.totalCount || 0;
    const raw = data?.comments || [];
    const normalized = raw.map(normalizeComment);
    comments.value = append ? [...comments.value, ...normalized] : normalized;
  } catch (e: any) {
    error.value = e?.message || '加载失败';
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
  // 独立加载热门评论，不影响主评论展示
  try {
    await fetchHotComments();
  } catch { /* 热门评论错误已在内部处理 */ }
}

async function loadMore() {
  offset.value += LIMIT;
  await fetchComments(true);
}

async function submitComment() {
  const text = newComment.value.trim();
  if (!text) return;
  if (!requireAuth()) return;
  let res: any;
  try {
    res = await props.sender({ id: props.resourceId, t: 1, content: text, type: props.resourceType, cookie: userStore.state.loginCookie || undefined });
  } catch (e: any) {
    console.error('[comment] submit ERROR', e, e?.response?.data);
    return;
  }
  if (res?.data?.code === 200 || res?.data?.code === 250) {
    newComment.value = '';
    comments.value.unshift({
      id: `c-local-${Date.now()}`,
      rawId: null,
      user: userStore.state.profile?.nickname || '我',
      avatarUrl: userStore.state.profile?.avatarUrl || '',
      content: text,
      time: '刚刚',
      likes: 0,
      liked: false,
      ownerUserId: userStore.state.profile?.userId ?? null,
      replyTo: null,
      showReply: false,
      replyDraft: '',
      replies: [],
    });
    total.value += 1;
  }
}

async function toggleLike(item: any) {
  if (!requireAuth()) return;
  const liked = !item.liked;
  const cid = item.rawId;
  if (!cid) return;
  const res = await props.liker({ id: props.resourceId, cid, t: liked ? 1 : 0, type: props.resourceType, cookie: userStore.state.loginCookie || undefined }).catch(() => null);
  if (res?.data?.code === 200 || res?.data?.code === 250) {
    item.liked = liked;
    item.likes += liked ? 1 : -1;
  }
}

function toggleReply(item: any) {
  item.showReply = !item.showReply;
  if (!item.showReply) item.replyDraft = '';
}

async function submitReply(item: any) {
  if (!item.replyDraft?.trim() || !requireAuth()) return;
  const cid = item.rawId;
  if (!cid) return;
  let res: any;
  try {
    res = await props.sender({ id: props.resourceId, t: 2, content: item.replyDraft, commentId: cid, type: props.resourceType, cookie: userStore.state.loginCookie || undefined });
  } catch (e: any) {
    console.error('[reply] ERROR', e, e?.response?.data);
    return;
  }
  if (res?.data?.code === 200 || res?.data?.code === 250) {
    const rawId = Number(res?.data?.comment?.commentId || 0);
    item.replies = item.replies || [];
    item.replies.push({ id: `r-${Date.now()}`, rawId: rawId > 0 ? rawId : undefined, user: userStore.state.profile?.nickname || '我', content: item.replyDraft, time: '刚刚', liked: false, likes: 0 });
    item.replyDraft = '';
    item.showReply = false;
  }
}

function toggleReplyLike(item: any, rIdx: number) {
  const r = item.replies?.[rIdx];
  if (!r) return;
  r.liked = !r.liked;
  r.likes += r.liked ? 1 : -1;
}

function canDelete(item: any) {
  const uid = userStore.state.profile?.userId;
  const nickname = userStore.state.profile?.nickname;
  if (!uid && !nickname) return false;
  if (item.user === '我') return true;
  if (uid && item.ownerUserId != null && item.ownerUserId === uid) return true;
  if (nickname && item.user?.toLowerCase() === nickname.toLowerCase()) return true;
  return false;
}

async function removeComment(item: any) {
  const cid = item.rawId;
  if (!cid) {
    comments.value = comments.value.filter((c: any) => c.id !== item.id);
    total.value = Math.max(0, total.value - 1);
    return;
  }
  const res = await props.deleter({ id: props.resourceId, commentId: cid, cookie: userStore.state.loginCookie || undefined }).catch(() => null);
  if (res?.data?.code === 200 || res?.data?.code === 250) {
    comments.value = comments.value.filter((c: any) => c.id !== item.id);
    total.value = Math.max(0, total.value - 1);
  }
}

async function removeReply(item: any, rIdx: number) {
  const reply = item.replies?.[rIdx];
  if (!reply) return;
  const rawId = reply.rawId;
  if (rawId) {
    const res = await props.deleter({ id: props.resourceId, commentId: rawId, cookie: userStore.state.loginCookie || undefined }).catch(() => null);
    if (res?.data?.code !== 200 && res?.data?.code !== 250) return;
  }
  item.replies?.splice(rIdx, 1);
}

function formatTime(ms: number) {
  if (!ms) return '';
  const date = new Date(ms);
  const diff = Date.now() - ms;
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

watch(() => props.resourceId, (id) => {
  if (id > 0) fetchComments();
}, { immediate: true });
</script>

<style scoped>
@import '../styles/detail-page.css';
.comment-panel { width: 100%; box-sizing: border-box; padding-right: var(--space-2); }

.comment-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; padding-right: var(--space-2); }
.comment-title { margin: 0; font-size: var(--text-body-md); color: var(--text-main); }
.comment-count { font-size: var(--text-label-sm); color: var(--text-sub); }
.comment-editor { border: 1px solid var(--border-soft); border-radius: 12px; padding: 10px; background: var(--bg-muted); margin-bottom: 12px; }
.comment-input { width: 100%; min-height: 76px; resize: vertical; border: 1px solid var(--border); border-radius: 10px; padding: 8px 10px; box-sizing: border-box; background: var(--bg-surface); color: var(--text-main); font-family: inherit; font-size: 13px; }
.comment-input:focus { outline: none; border-color: var(--accent); }
.comment-editor-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.comment-limit { font-size: var(--text-label-sm); color: var(--text-sub); }
.comment-submit { padding: 6px 16px; border-radius: 999px; border: none; background: var(--accent); color: #fff; font-size: 13px; cursor: pointer; transition: opacity 0.12s ease; }
.comment-submit:disabled { opacity: 0.4; cursor: default; }
.comment-submit:not(:disabled):hover { opacity: 0.85; }
.comment-status { padding: 32px 0; text-align: center; color: var(--text-sub); font-size: var(--text-label-md); }
.comment-status.error { color: #ef4444; }
.hot-comment-section { margin-bottom: 16px; }
.hot-comment-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-right: var(--space-2); }
.hot-comment-title { margin: 0; font-size: var(--text-label-md); color: var(--text-main); }
.hot-comment-count { font-size: var(--text-label-sm); color: var(--text-sub); }
.hot-comment-list { margin-top: 0; }
.hot-comment-item { border-color: color-mix(in srgb, var(--accent) 18%, var(--border-soft)); }
.hot-badge { font-size: var(--text-label-xs); line-height: 1; padding: 3px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent) 12%, var(--bg-surface)); color: var(--accent); }
.comment-divider {
  height: 1px;
  margin: var(--space-5) 0 var(--space-4);
  background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--accent) 38%, var(--border-soft)) 50%, transparent 100%);
  opacity: 0.95;
}
.recent-comment-section {
  padding-top: var(--space-1);
}
.recent-comment-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-right: var(--space-2);
}
.recent-comment-title {
  margin: 0;
  font-size: var(--text-label-md);
  color: var(--text-main);
}
.recent-comment-count {
  font-size: var(--text-label-sm);
  color: var(--text-sub);
}
.comment-list { display: grid; gap: 10px; list-style: none; padding: 0; margin: 0; }
.comment-item { border: 1px solid var(--border-soft); border-radius: 12px; padding: 10px; background: var(--bg-muted); list-style: none; }
.comment-user-row { display: flex; align-items: center; gap: 8px; }
.comment-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; flex-shrink: 0; cursor: pointer; }
.comment-avatar:hover { opacity: 0.8; }
.comment-user { border: 0; background: transparent; padding: 0; font-size: 13px; font-weight: 600; color: var(--text-main); cursor: pointer; font-family: inherit; }
.comment-user:hover { color: var(--accent); }
.comment-content { margin: 6px 0; font-size: 13px; line-height: 1.5; color: var(--text-sub); word-break: break-word; }
.comment-reply { margin: 6px 0; font-size: 13px; line-height: 1.5; color: var(--text-sub); }
.reply-user { font-weight: 600; color: var(--text-main); }
.reply-user:is(button) { border: 0; background: transparent; padding: 0; font-size: inherit; font-family: inherit; cursor: pointer; }
.reply-user:is(button):hover { color: var(--accent); }
.reply-text { color: var(--text-sub); }
.comment-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.comment-time { font-size: var(--text-label-sm); color: var(--text-sub); }
.text-btn { border: 0; background: transparent; color: var(--accent); cursor: pointer; padding: 0; font-size: var(--text-label-sm); white-space: nowrap; }
.text-btn:hover { opacity: 0.75; }
.text-btn.danger { color: #ef4444; }
.reply-editor { margin-top: 8px; display: flex; gap: 8px; }
.reply-input { flex: 1; min-width: 0; height: 32px; border-radius: 8px; border: 1px solid var(--border); padding: 0 10px; background: var(--bg-surface); color: var(--text-main); font-size: 13px; }
.reply-input:focus { outline: none; border-color: var(--accent); }
.reply-submit { height: 32px; padding: 0 14px; border-radius: 8px; border: none; background: var(--accent); color: #fff; font-size: var(--text-label-sm); cursor: pointer; }
.reply-submit:disabled { opacity: 0.4; cursor: default; }
.reply-list { margin-top: 8px; display: grid; gap: 6px; list-style: none; padding: 0; }
.reply-item { padding: 8px 10px; border-radius: 8px; background: var(--bg-surface); }
.reply-item .comment-actions { margin-top: 4px; }
.reply-item .reply-user { font-size: 13px; font-weight: 600; color: var(--text-main); }
.reply-item .reply-content { margin: 2px 0; font-size: 13px; line-height: 1.5; color: var(--text-sub); }
.comment-more-wrap { text-align: center; padding-top: 12px; }
.comment-more-btn { padding: 6px 20px; border-radius: 999px; border: 1px solid var(--border-soft); background: var(--bg-muted); color: var(--accent); font-size: 13px; cursor: pointer; transition: all 0.12s ease; }
.comment-more-btn:hover { background: color-mix(in srgb, var(--accent) 14%, var(--bg-muted)); }
.comment-more-btn:disabled { opacity: 0.5; cursor: default; }
.cp-toast { position: fixed; bottom: 12%; left: 50%; transform: translateX(-50%); padding: 10px 20px; border-radius: 999px; max-width: 420px; text-align: center; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); color: #fbbf24; font-size: 13px; font-weight: 500; line-height: 1.4; pointer-events: none; z-index: 310; }
.toast-fade-enter-active, .toast-fade-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.toast-fade-enter-from, .toast-fade-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
</style>