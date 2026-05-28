<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="login-panel">
    <div class="hero">
      <div>
        <AnimatedAppear tag="p" variant="text" rhythm="body" class-name="eyebrow">用户中心</AnimatedAppear>
        <AnimatedAppear tag="h2" variant="title" rhythm="title" class-name="title">登录你的音乐空间</AnimatedAppear>
        <AnimatedAppear tag="p" variant="text" rhythm="body" class-name="subtitle">
          支持扫码登录、Cookie 登录和搜索用户，便于继续同步歌单、收藏和用户详情。
        </AnimatedAppear>
      </div>
      <div class="hero-badges">
        <span>扫码</span>
        <span>Cookie</span>
        <span>搜索用户</span>
      </div>
    </div>

    <div class="tabs" role="tablist" aria-label="登录方式">
      <button
        v-for="tab in loginTabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="panel-card">
      <template v-if="activeTab === 'qr'">
        <div class="panel-head">
          <div>
            <h3>扫码登录</h3>
            <p>进入页面后会自动生成二维码，使用网易云音乐 APP 扫码即可。</p>
          </div>
        </div>

        <div class="qr-grid">
          <div class="qr-box" :class="{ 'qr-box--placeholder': !qrImg }">
            <img v-if="qrImg" :src="qrImg" alt="登录二维码" class="qr" />
            <div v-else class="qr-placeholder">
              <strong>{{ qrLoading ? '生成中' : '待生成' }}</strong>
              <span>{{ qrLoading ? '正在自动生成二维码，请稍候' : '即将自动生成二维码' }}</span>
            </div>
          </div>

          <div class="status-card">
            <p class="status-label">当前状态</p>
            <strong>{{ qrStatusText }}</strong>
            <ul>
              <li>1. 页面自动生成二维码</li>
              <li>2. 打开网易云音乐 App 扫码</li>
              <li>3. 手机确认后自动登录</li>
            </ul>
          </div>
        </div>
      </template>

      <template v-else-if="activeTab === 'cookie'">
        <div class="panel-head">
          <div>
            <h3>Cookie 登录</h3>
            <p>适合已有登录态的场景，粘贴完整 Cookie 后直接校验。</p>
          </div>
        </div>

        <label class="field-label" for="cookie-input">Cookie</label>
        <textarea
          id="cookie-input"
          v-model="cookieInput"
          class="text-area"
          placeholder="例如：MUSIC_U=...; __csrf=..."
          :disabled="disabled || submitting"
        />
        <div class="action-row">
          <span class="hint">建议粘贴浏览器或抓包工具中完整的网易云 Cookie。</span>
          <button class="primary-btn" type="button" :disabled="disabled || submitting" @click="submitCookieLogin">
            {{ submitting && activeTab === 'cookie' ? '登录中...' : '使用 Cookie 登录' }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="panel-head">
          <div>
            <h3>搜索用户</h3>
            <p>输入用户名自动联想账号，在列表中选择你的账号后确认。</p>
          </div>
        </div>

        <label class="field-label" for="user-search-input">用户名</label>
        <input
          id="user-search-input"
          v-model="userSearchKeyword"
          class="text-input"
          type="text"
          placeholder="搜索网易云用户名"
          :disabled="disabled || submitting"
        />

        <p class="search-prompt">在列表中选中你的账号</p>
        <div class="user-result-panel">
          <div v-if="userSearchLoading" class="user-search-state">正在搜索用户...</div>
          <div v-else-if="userSearchKeyword.trim() && !userSearchResults.length" class="user-search-state">暂无匹配用户</div>
          <button
            v-for="user in userSearchResults"
            :key="user.userId"
            class="user-result-item"
            :class="{ selected: selectedSearchUser?.userId === user.userId }"
            type="button"
            @click="selectedSearchUser = user"
            @dblclick="submitSearchUser(user)"
          >
            <img :src="user.avatarUrl || fallbackAvatar" alt="" class="user-avatar" />
            <span class="user-name">{{ user.nickname }}</span>
          </button>
        </div>

        <div class="action-row">
          <span class="hint">搜索用户适合浏览公开用户资料，不等同于完整私有登录态。</span>
          <button class="primary-btn" type="button" :disabled="disabled || submitting || !selectedSearchUser" @click="submitUserSearchLogin">
            {{ submitting && activeTab === 'userSearch' ? '加载中...' : '确认' }}
          </button>
        </div>
      </template>
    </div>

    <div class="footer-bar">
      <div class="login-meta">
        <span class="meta-dot" :class="{ active: userStore.state.isLogin }"></span>
        <template v-if="userStore.state.isLogin && userStore.state.profile">
          当前用户：<strong>{{ userStore.state.profile.nickname }}</strong>
        </template>
        <template v-else>
          当前未登录
        </template>
      </div>
      <p v-if="feedbackText" class="feedback" :class="feedbackType">{{ feedbackText }}</p>
    </div>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { checkQrStatus, createQr, getQrKey } from '../api/auth';
import { searchMusic } from '../api/music';
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import { useLoginModalStore } from '../stores/loginModal';
const loginModalStore = useLoginModalStore();
import AnimatedAppear from './AnimatedAppear.vue';

const props = defineProps<{ disabled?: boolean }>();

const loginTabs = [
  { key: 'qr', label: '扫码登录' },
  { key: 'cookie', label: 'Cookie 登录' },
  { key: 'userSearch', label: '搜索用户' },
] as const;

type LoginTabKey = (typeof loginTabs)[number]['key'];
type FeedbackType = 'success' | 'error' | 'info';
type SearchUser = {
  userId: number;
  nickname: string;
  avatarUrl?: string;
};

const activeTab = ref<LoginTabKey>('qr');
const qrLoading = ref(false);
const qrImg = ref('');
const qrStatusText = ref('未开始登录');
const cookieInput = ref('');
const userSearchKeyword = ref('');
const userSearchResults = ref<SearchUser[]>([]);
const selectedSearchUser = ref<SearchUser | null>(null);
const userSearchLoading = ref(false);
const submitting = ref(false);
const feedbackText = ref('');
const feedbackType = ref<FeedbackType>('info');
let qrTimer: ReturnType<typeof setInterval> | null = null;
let userSearchTimer: ReturnType<typeof setTimeout> | null = null;
const fallbackAvatar = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="%23e0e7ff"/><circle cx="48" cy="36" r="16" fill="%238b5cf6" opacity="0.65"/><path d="M20 82c5-18 18-28 28-28s23 10 28 28" fill="%238b5cf6" opacity="0.45"/></svg>';

function setFeedback(message: string, type: FeedbackType = 'info') {
  feedbackText.value = message;
  feedbackType.value = type;
}

function clearQrTimer() {
  if (qrTimer) {
    clearInterval(qrTimer);
    qrTimer = null;
  }
}

async function startQrLogin() {
  if (props.disabled) {
    qrStatusText.value = 'API 尚未就绪，请稍后重试';
    setFeedback('API 尚未就绪，请稍后重试', 'error');
    return;
  }

  qrLoading.value = true;
  qrStatusText.value = '正在生成二维码...';
  setFeedback('正在生成二维码', 'info');
  clearQrTimer();

  try {
    const keyRes = await getQrKey();
    const unikey = keyRes?.data?.data?.unikey;
    if (!unikey) throw new Error('获取二维码 key 失败');

    const qrRes = await createQr(unikey);
    qrImg.value = qrRes?.data?.data?.qrimg || '';
    qrStatusText.value = '请使用网易云音乐 APP 扫码';
    setFeedback('二维码已生成，请扫码', 'success');

    qrTimer = setInterval(async () => {
      try {
        const statusRes = await checkQrStatus(unikey);
        const code = statusRes?.data?.code;

        if (code === 801) qrStatusText.value = '等待扫码';
        if (code === 802) qrStatusText.value = '已扫码，请在手机确认';

        if (code === 803) {
          qrStatusText.value = '登录成功';
          const cookie = statusRes?.data?.cookie as string | undefined;
          if (cookie) userStore.saveCookie(cookie);
          clearQrTimer();
          await userStore.refreshLoginStatus();
          setFeedback('扫码登录成功', 'success');
          loginModalStore.hideLoginModal();
        }

        if (code === 800) {
          qrStatusText.value = '二维码已过期，请重新生成';
          setFeedback('二维码已过期，请重新生成', 'error');
          clearQrTimer();
        }
      } catch {
        qrStatusText.value = '轮询失败，请重试';
        setFeedback('扫码状态轮询失败，请重试', 'error');
        clearQrTimer();
      }
    }, 2500);
  } catch (e: any) {
    qrStatusText.value = e?.message || '生成二维码失败';
    setFeedback(qrStatusText.value, 'error');
  } finally {
    qrLoading.value = false;
  }
}

async function submitCookieLogin() {
  if (props.disabled || submitting.value) return;

  submitting.value = true;
  setFeedback('正在校验 Cookie...', 'info');
  try {
    await userStore.loginWithCookie(cookieInput.value);
    cookieInput.value = '';
    setFeedback('Cookie 登录成功', 'success');
    loginModalStore.hideLoginModal();
  } catch (error: any) {
    setFeedback(error?.message || 'Cookie 登录失败', 'error');
  } finally {
    submitting.value = false;
  }
}

function normalizeSearchUsers(payload: any): SearchUser[] {
  const candidates = [
    payload?.result?.userprofiles,
    payload?.result?.users,
    payload?.data?.result?.userprofiles,
    payload?.data?.userprofiles,
    payload?.userprofiles,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item: any) => ({
          userId: Number(item.userId || item.user?.userId || item.id || 0),
          nickname: item.nickname || item.user?.nickname || item.name || '未命名用户',
          avatarUrl: item.avatarUrl || item.user?.avatarUrl || '',
        }))
        .filter((item: SearchUser) => item.userId > 0);
    }
  }

  return [];
}

async function searchUsers(keyword: string) {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) {
    userSearchResults.value = [];
    selectedSearchUser.value = null;
    return;
  }

  userSearchLoading.value = true;
  try {
    const payload = await searchMusic(normalizedKeyword, { type: 1002, limit: 8, offset: 0 });
    userSearchResults.value = normalizeSearchUsers(payload);
    selectedSearchUser.value = userSearchResults.value[0] || null;
  } catch (error: any) {
    userSearchResults.value = [];
    selectedSearchUser.value = null;
    setFeedback(error?.message || '搜索用户失败', 'error');
  } finally {
    userSearchLoading.value = false;
  }
}

async function submitSearchUser(user: SearchUser) {
  if (props.disabled || submitting.value) return;

  selectedSearchUser.value = user;
  submitting.value = true;
  setFeedback('正在加载用户信息...', 'info');
  try {
    await userStore.loginWithUid(user.userId);
    setFeedback('已选择用户：' + user.nickname, 'success');
    loginModalStore.hideLoginModal();
  } catch (error: any) {
    setFeedback(error?.message || '加载用户失败', 'error');
  } finally {
    submitting.value = false;
  }
}

async function submitUserSearchLogin() {
  if (!selectedSearchUser.value) return;
  await submitSearchUser(selectedSearchUser.value);
}

watch(
  () => activeTab.value,
  (tab) => {
    if (tab === 'qr' && !qrImg.value && !qrLoading.value && !userStore.state.isLogin) {
      void startQrLogin();
    }
  },
);

watch(
  userSearchKeyword,
  (keyword) => {
    selectedSearchUser.value = null;

    if (userSearchTimer) {
      clearTimeout(userSearchTimer);
    }

    userSearchTimer = setTimeout(() => {
      void searchUsers(keyword);
    }, 350);
  },
);

onMounted(() => {
  if (activeTab.value === 'qr' && !qrImg.value && !userStore.state.isLogin) {
    void startQrLogin();
  }
});

onBeforeUnmount(() => {
  clearQrTimer();
  if (userSearchTimer) {
    clearTimeout(userSearchTimer);
  }
});
</script>

<style scoped>
.login-panel {
  display: grid;
  gap: 18px;
  padding: 22px;
  border: 1px solid color-mix(in srgb, var(--accent) 14%, var(--border));
  border-radius: 24px;
  background-color: var(--bg-solid);
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 38%),
    linear-gradient(145deg, color-mix(in srgb, var(--bg-solid) 96%, rgba(15, 23, 42, 0.05)), color-mix(in srgb, var(--bg-solid) 92%, rgba(255, 255, 255, 0.08))),
    var(--bg-solid);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
}

.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: var(--text-label-sm);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
}

.title {
  margin: 0;
  font-size: var(--text-headline-md);
  line-height: 1.1;
  color: var(--text-main);
}

.subtitle {
  margin: 10px 0 0;
  max-width: 620px;
  font-size: var(--text-label-md);
  line-height: 1.7;
  color: var(--text-sub);
}

.hero-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.hero-badges span {
  padding: 7px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-solid));
  font-size: var(--text-label-sm);
  color: var(--text-main);
}

.tabs {
  display: inline-flex;
  gap: 8px;
  padding: 6px;
  width: fit-content;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-solid) 96%, #fff);
}

.tab-btn {
  height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-sub);
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.tab-btn.active {
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-solid));
  color: var(--accent);
  font-weight: 700;
}

.panel-card {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: 20px;
  background: color-mix(in srgb, var(--bg-solid) 98%, #fff);
  min-height: 0;
  overflow: visible;
}

.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.panel-head h3 {
  margin: 0;
  font-size: 20px;
  color: var(--text-main);
}

.panel-head p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-sub);
}

.primary-btn {
  height: 38px;
  padding: 0 16px;
  border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-solid));
  color: var(--accent);
  font-weight: 700;
  cursor: pointer;
}

.primary-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.qr-grid {
  display: grid;
  grid-template-columns: minmax(220px, 260px) 1fr;
  gap: 18px;
}

.qr-box,
.status-card {
  border: 1px solid var(--border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--bg-solid) 96%, #fff);
}

.qr-box {
  min-height: 240px;
  display: grid;
  place-items: center;
  padding: 14px;
}

.qr-box--placeholder {
  border-style: dashed;
}

.qr {
  width: min(100%, 220px);
  aspect-ratio: 1;
  object-fit: contain;
  border-radius: 16px;
}

.qr-placeholder {
  display: grid;
  gap: 8px;
  text-align: center;
  color: var(--text-sub);
}

.status-card {
  display: grid;
  gap: 10px;
  align-content: start;
  padding: 18px;
}

.status-label {
  margin: 0;
  font-size: var(--text-label-sm);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-soft);
}

.status-card strong {
  font-size: var(--text-body-lg);
  color: var(--text-main);
}

.status-card ul {
  margin: 0;
  padding-left: 18px;
  color: var(--text-sub);
  line-height: 1.8;
}

.field-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

.text-area,
.text-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--bg-solid) 96%, #fff);
  color: var(--text-main);
  box-sizing: border-box;
}

.text-area {
  min-height: 144px;
  padding: 14px 16px;
  resize: vertical;
  line-height: 1.6;
}

.text-input {
  height: 46px;
  padding: 0 16px;
}

.search-prompt {
  margin: 2px 0 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

.user-result-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr));
  gap: 16px 28px;
  min-height: 88px;
  max-height: min(340px, 42vh);
  overflow-y: auto;
  overflow-x: visible;
  align-items: start;
  padding: 4px var(--space-1) 4px 0;
}

.user-result-item {
  min-height: 76px;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  border: 1px solid var(--border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--bg-solid) 96%, #fff);
  color: var(--text-main);
  text-align: left;
  cursor: pointer;
  padding: var(--space-2) var(--space-3);
  position: relative;
  z-index: 1;
  transition: background-color 0.18s ease, border-color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}

.user-result-item.selected,
.user-result-item:hover {
  border-color: color-mix(in srgb, var(--accent) 44%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-muted));
  transform: translateY(-1px);
  box-shadow: 0 10px 22px color-mix(in srgb, var(--accent) 12%, transparent);
  z-index: 4;
}

.user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  object-fit: cover;
  flex: 0 0 auto;
}

.user-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.user-result-item.selected .user-name {
  color: var(--accent);
}

.user-search-state {
  grid-column: 1 / -1;
  min-height: 86px;
  display: grid;
  place-items: center;
  border: 1px dashed var(--border);
  border-radius: 10px;
  color: var(--text-sub);
}

.action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hint {
  font-size: var(--text-label-sm);
  color: var(--text-sub);
}

.footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.login-meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-sub);
}

.meta-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #94a3b8;
}

.meta-dot.active {
  background: #22c55e;
  box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.14);
}

.feedback {
  margin: 0;
  font-size: 13px;
}

.feedback.success {
  color: #16a34a;
}

.feedback.error {
  color: #dc2626;
}

.feedback.info {
  color: var(--text-sub);
}

@media (max-width: 900px) {
  .hero,
  .panel-head,
  .action-row,
  .footer-bar {
    grid-template-columns: 1fr;
    display: grid;
  }

  .qr-grid,
  .user-result-panel {
    grid-template-columns: 1fr;
  }

  .tabs {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
