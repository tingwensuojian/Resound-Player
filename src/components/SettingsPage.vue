<template>
  <AnimatedAppear tag="section" variant="content" rhythm="shell" class-name="settings-page">
    <AnimatedAppear tag="header" variant="content" rhythm="head" class-name="top-tabs-wrap">
      <nav class="top-tabs" aria-label="设置分组">
        <AnimatedAppear
          v-for="(tab, idx) in tabs"
          :key="tab.key"
          tag="button"
          variant="control"
          rhythm="actions"
          :index="idx"
          class-name="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </AnimatedAppear>
      </nav>
    </AnimatedAppear>

    <AnimatedAppear
      v-for="(group, gIdx) in currentGroups"
      :key="group.title"
      tag="section"
      variant="content" rhythm="body"
      :index="gIdx"
      class-name="setting-group"
    >
      <AnimatedAppear tag="h3" variant="title" rhythm="title" class-name="group-title">{{ group.title }}</AnimatedAppear>

      <div class="rows">
        <AnimatedAppear
          v-for="(item, idx) in group.items"
          :key="item.key"
          tag="div"
          variant="text" rhythm="body"
          :index="idx"
          class-name="row"
        >
          <div class="left">
            <p class="label">{{ item.label }}</p>
            <p v-if="item.desc" class="desc">{{ item.desc }}</p>
          </div>

          <div class="right">
            <div v-if="item.type === 'switch'" class="control-slot switch-slot">
              <FancySwitch v-model="switchState[item.key]" />
            </div>

            <div v-else-if="item.type === 'source-order'" class="source-order-wrap">
              <button
                class="source-order-toggle"
                type="button"
                @click="sourceOrderExpanded = !sourceOrderExpanded"
                :aria-expanded="sourceOrderExpanded"
                aria-controls="source-order-list"
              >
                <span class="source-order-summary">
                  {{ sourceOrder.length }}个音源
                  <span class="source-order-hint">{{ sourceOrderExpanded ? '点击收起' : '点击展开' }}</span>
                </span>
                <svg
                  class="source-order-chevron"
                  :class="{ rotated: sourceOrderExpanded }"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  width="16"
                  height="16"
                >
                  <path d="M4 6l4 4 4-4" />
                </svg>
              </button>
              <div
                v-show="sourceOrderExpanded"
                id="source-order-list"
                class="source-order-list"
              >
                <div
                  v-for="(src, srcIdx) in sourceOrder"
                  :key="src.key"
                  class="source-row"
                >
                  <span class="source-index" :style="{ backgroundColor: src.color + '22', color: src.color }">{{ srcIdx + 1 }}</span>
                  <span class="source-name">{{ src.label }}</span>
                  <div class="source-arrows">
                    <button
                      class="arrow-btn"
                      :disabled="srcIdx === 0"
                      @click="moveSource(srcIdx, -1)"
                      aria-label="上移"
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M4 10l4-4 4 4"/></svg>
                    </button>
                    <button
                      class="arrow-btn"
                      :disabled="srcIdx === sourceOrder.length - 1"
                      @click="moveSource(srcIdx, 1)"
                      aria-label="下移"
                    >
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M4 6l4 4 4-4"/></svg>
                    </button>
                  </div>
                </div>
                <p v-if="sourceOrderFeedback" class="source-order-feedback">{{ sourceOrderFeedback }}</p>
              </div>
            </div>

            <DropdownSelect
              v-else-if="item.type === 'select'"
              v-model="selectState[item.key]"
              :options="item.options || []"
              :option-colors="item.key === 'accent' ? accentColors : {}"
              :option-vip-labels="item.optionVipLabels || {}"
            />

            <input
              v-else-if="item.type === 'range'"
              class="range"
              type="range"
              :min="item.min || 0"
              :max="item.max || 100"
              v-model="rangeState[item.key]"
            />

            <template v-else-if="item.key === 'accentCustomColor'">
              <div class="color-picker-wrap">
                <input class="color-picker" type="color" v-model="accentCustomColor" aria-label="选择自定义主题色" />
                <span class="color-hex">{{ accentCustomColor }}</span>
              </div>
            </template>

            <template v-else-if="item.key === 'desktopLyricHighlightColor'">
              <div class="color-picker-wrap">
                <input class="color-picker" type="color" v-model="desktopLyricHighlightColor" aria-label="选择高亮颜色" />
                <span class="color-hex">{{ desktopLyricHighlightColor }}</span>
              </div>
            </template>

            <template v-else-if="item.key === 'desktopLyricTextColor'">
              <div class="color-picker-wrap">
                <input class="color-picker" type="color" v-model="desktopLyricTextColor" aria-label="选择未播放颜色" />
                <span class="color-hex">{{ desktopLyricTextColor }}</span>
              </div>
            </template>

            <div v-else-if="item.type === 'input'" class="input-action-wrap">
              <input
                v-model="inputState[item.key]"
                class="inline-input"
                type="text"
                :placeholder="item.placeholder || ''"
                @keydown.enter.prevent="handleAction(item.key)"
              />
              <AnimatedAppear
                tag="button"
                variant="control"
                rhythm="actions"
                class-name="action-btn"
                @click="handleAction(item.key)"
              >
                {{ item.actionText || '保存' }}
              </AnimatedAppear>
            </div>

            <AnimatedAppear
              v-else
              tag="button"
              variant="control"
              rhythm="actions"
              class-name="action-btn"
              @click="handleAction(item.key)"
            >
              {{ item.actionText || '操作' }}
            </AnimatedAppear>
          </div>
        </AnimatedAppear>
      </div>
    </AnimatedAppear>

    <template v-if="activeTab === 'about'">
      <AnimatedAppear
        tag="section"
        variant="content" rhythm="body"
        class-name="setting-group"
      >
        <AnimatedAppear tag="h3" variant="title" rhythm="title" class-name="group-title">关于 Resound-Player</AnimatedAppear>
        <div class="about-project">
          <div class="about-project-logo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="64" height="64">
              <defs>
                <linearGradient id="logoGradAbout" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#22c55e;stop-opacity:1" />
                  <stop offset="100%" style="stop-color:#16a34a;stop-opacity:1" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width="200" height="200" rx="44" fill="#121317" />
              <path d="M55,100 A45,45 0 0,1 145,100" fill="none" stroke="url(#logoGradAbout)" stroke-width="16" stroke-linecap="round" />
              <rect x="40" y="100" width="30" height="45" rx="12" fill="url(#logoGradAbout)" />
              <rect x="130" y="100" width="30" height="45" rx="12" fill="url(#logoGradAbout)" />
              <circle cx="145" cy="122.5" r="5" fill="#121317" opacity="0.8" />
            </svg>
          </div>
          <div class="about-project-text">
            <p class="about-project-name">Resound-Player {{ appVersion }}</p>
            <p class="about-project-desc">基于 Vue 3 + Vite + Electron 构建的桌面音乐播放器，融合网易云音乐生态与多端播放体验。</p>
          </div>
        </div>
        <div class="about-actions">
          <button class="about-update-btn" type="button" @click="checkUpdate" :disabled="updateStatus === '检查中' || updateStatus === '下载中'">
            {{ updateStatus === 'idle' ? '检查更新' :
               updateStatus === '检查中' ? '检查中...' :
               updateStatus === 'available' ? '发现新版本 ' + updateVersion :
               updateStatus === '下载中' ? '下载中 ' + updateProgress + '%' :
               updateStatus === 'downloaded' ? '更新已下载' :
               updateStatus === 'not-available' ? '已是最新版' :
               updateStatus === 'error' ? '检查失败，重试' : '检查更新' }}
          </button>
          <button v-if="updateStatus === 'available'" class="about-download-link" @click="startDownload">
            下载更新
          </button>
          <button v-if="updateStatus === 'downloaded'" class="about-download-link" @click="installUpdate">
            立即安装
          </button>
          <button class="about-changelog-btn" type="button" @click="changelogExpanded = !changelogExpanded; if (changelogExpanded) fetchChangelog()">
            <svg class="about-chevron" :class="{ rotated: changelogExpanded }" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><path d="M4 6l4 4 4-4"/></svg>
            更新日志
          </button>
        </div>
        <div v-show="changelogExpanded" class="about-changelog">
          <div v-if="changelogLoading" class="changelog-loading">加载中…</div>
          <template v-else-if="changelogList.length">
            <div v-for="(release, i) in changelogList" :key="i" class="changelog-entry">
              <div class="changelog-header">
                <span class="changelog-version">{{ release.tag }}</span>
                <span class="changelog-date">{{ release.date }}</span>
              </div>
              <div class="changelog-desc" v-html="renderMarkdown(release.desc)"></div>
            </div>
          </template>
          <div v-else class="changelog-entry">
            <span class="changelog-version">v0.1.0</span>
            <span class="changelog-date">—</span>
            <p class="changelog-desc">首个稳定版本发布，暂无详细记录。</p>
          </div>
        </div>
      </AnimatedAppear>

      <AnimatedAppear
        tag="section"
        variant="content" rhythm="body"
        :index="1"
        class-name="setting-group"
      >
        <AnimatedAppear tag="h3" variant="title" rhythm="title" class-name="group-title">开源致谢</AnimatedAppear>
        <div class="about-credits">
          <p class="about-credits-intro">本项目的诞生离不开以下开源项目及其维护者的贡献，在此致以诚挚感谢：</p>

          <h4 class="about-category">前端框架与构建工具</h4>
          <a v-for="pkg in frameworkPkgs" :key="pkg.name" class="about-pkg" :href="pkg.url" target="_blank" rel="noopener">
            <img v-if="pkg.icon" class="about-pkg-icon" :src="pkg.icon" alt="" loading="lazy" />
            <div class="about-pkg-body">
              <div class="about-pkg-head">
                <span class="about-pkg-name">{{ pkg.name }}</span>
                <span class="about-pkg-meta">
                  <span class="about-pkg-version">{{ pkg.version }}</span>
                  <span class="about-pkg-license">{{ pkg.license }}</span>
                </span>
              </div>
              <span class="about-pkg-author">{{ pkg.author }}</span>
            </div>
          </a>

          <h4 class="about-category">歌词渲染</h4>
          <a v-for="pkg in lyricPkgs" :key="pkg.name" class="about-pkg" :href="pkg.url" target="_blank" rel="noopener">
            <img v-if="pkg.icon" class="about-pkg-icon" :src="pkg.icon" alt="" loading="lazy" />
            <div class="about-pkg-body">
              <div class="about-pkg-head">
                <span class="about-pkg-name">{{ pkg.name }}</span>
                <span class="about-pkg-meta">
                  <span class="about-pkg-version">{{ pkg.version }}</span>
                  <span class="about-pkg-license">{{ pkg.license }}</span>
                </span>
              </div>
              <span class="about-pkg-author">{{ pkg.author }}</span>
            </div>
          </a>

          <h4 class="about-category">图形与 3D 渲染</h4>
          <a v-for="pkg in graphicsPkgs" :key="pkg.name" class="about-pkg" :href="pkg.url" target="_blank" rel="noopener">
            <img v-if="pkg.icon" class="about-pkg-icon" :src="pkg.icon" alt="" loading="lazy" />
            <div class="about-pkg-body">
              <div class="about-pkg-head">
                <span class="about-pkg-name">{{ pkg.name }}</span>
                <span class="about-pkg-meta">
                  <span class="about-pkg-version">{{ pkg.version }}</span>
                  <span class="about-pkg-license">{{ pkg.license }}</span>
                </span>
              </div>
              <span class="about-pkg-author">{{ pkg.author }}</span>
            </div>
          </a>

          <h4 class="about-category">网络与 API</h4>
          <a v-for="pkg in networkPkgs" :key="pkg.name" class="about-pkg" :href="pkg.url" target="_blank" rel="noopener">
            <img v-if="pkg.icon" class="about-pkg-icon" :src="pkg.icon" alt="" loading="lazy" />
            <div class="about-pkg-body">
              <div class="about-pkg-head">
                <span class="about-pkg-name">{{ pkg.name }}</span>
                <span class="about-pkg-meta">
                  <span class="about-pkg-version">{{ pkg.version }}</span>
                  <span class="about-pkg-license">{{ pkg.license }}</span>
                </span>
              </div>
              <span class="about-pkg-author" v-html="pkg.author"></span>
            </div>
          </a>

          <h4 class="about-category">桌面端</h4>
          <a v-for="pkg in desktopPkgs" :key="pkg.name" class="about-pkg" :href="pkg.url" target="_blank" rel="noopener">
            <img v-if="pkg.icon" class="about-pkg-icon" :src="pkg.icon" alt="" loading="lazy" />
            <div class="about-pkg-body">
              <div class="about-pkg-head">
                <span class="about-pkg-name">{{ pkg.name }}</span>
                <span class="about-pkg-meta">
                  <span class="about-pkg-version">{{ pkg.version }}</span>
                  <span class="about-pkg-license">{{ pkg.license }}</span>
                </span>
              </div>
              <span class="about-pkg-author">{{ pkg.author }}</span>
            </div>
          </a>

          <h4 class="about-category">音源替换</h4>
          <a v-for="pkg in unblockPkgs" :key="pkg.name" class="about-pkg" :href="pkg.url" target="_blank" rel="noopener">
            <img v-if="pkg.icon" class="about-pkg-icon" :src="pkg.icon" alt="" loading="lazy" />
            <div class="about-pkg-body">
              <div class="about-pkg-head">
                <span class="about-pkg-name">{{ pkg.name }}</span>
                <span class="about-pkg-meta">
                  <span class="about-pkg-version">{{ pkg.version }}</span>
                  <span class="about-pkg-license">{{ pkg.license }}</span>
                </span>
              </div>
              <span class="about-pkg-author">{{ pkg.author }}</span>
            </div>
          </a>

          <h4 class="about-category">其他</h4>
          <a v-for="pkg in otherPkgs" :key="pkg.name" class="about-pkg" :href="pkg.url" target="_blank" rel="noopener">
            <img v-if="pkg.icon" class="about-pkg-icon" :src="pkg.icon" alt="" loading="lazy" />
            <div class="about-pkg-body">
              <div class="about-pkg-head">
                <span class="about-pkg-name">{{ pkg.name }}</span>
                <span class="about-pkg-meta">
                  <span class="about-pkg-version">{{ pkg.version }}</span>
                  <span class="about-pkg-license">{{ pkg.license }}</span>
                </span>
              </div>
              <span class="about-pkg-author">{{ pkg.author }}</span>
            </div>
          </a>
        </div>
      </AnimatedAppear>

      <AnimatedAppear
        tag="section"
        variant="content" rhythm="body"
        :index="2"
        class-name="setting-group"
      >
        <AnimatedAppear tag="h3" variant="title" rhythm="title" class-name="group-title">开发者</AnimatedAppear>
        <div class="about-developer">
          <a class="about-pkg" href="https://github.com/tingwensuojian/Resound-Player" target="_blank" rel="noopener">
            <img class="about-pkg-icon" src="https://github.com/tingwensuojian.png?size=48" alt="" loading="lazy" />
            <div class="about-pkg-body">
              <span class="about-pkg-name">tingwensuojian</span>
              <span class="about-pkg-author">项目开发者与维护者 — 独立开发并持续维护 Resound-Player</span>
            </div>
          </a>
        </div>
      </AnimatedAppear>

      <AnimatedAppear
        tag="section"
        variant="content"
        rhythm="body"
        :index="3"
        class-name="setting-group"
      >
        <AnimatedAppear tag="h3" variant="title" rhythm="title" class-name="group-title">捐赠支持</AnimatedAppear>
        <div class="donate-card">
          <p class="donate-desc">您的捐赠将用于支持开发和维护工作，包括但不限于服务器维护、域名续费等。</p>
          <div class="donate-methods">
            <div class="donate-method" @click="showQrCode = 'alipay'">
              <div class="donate-method-icon donate-alipay">
                <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
                  <path d="M19.695 15.07c3.426 1.158 4.203 1.22 4.203 1.22V3.846c0-2.124-1.705-3.845-3.81-3.845H3.914C1.808.001.102 1.722.102 3.846v16.31c0 2.123 1.706 3.845 3.813 3.845h16.173c2.105 0 3.81-1.722 3.81-3.845v-.157s-6.19-2.602-9.315-4.119c-2.096 2.602-4.8 4.181-7.607 4.181-4.75 0-6.361-4.19-4.112-6.949.49-.602 1.324-1.175 2.617-1.497 2.025-.502 5.247.313 8.266 1.317a16.796 16.796 0 0 0 1.341-3.302H5.781v-.952h4.799V6.975H4.77v-.953h5.81V3.591s0-.409.411-.409h2.347v2.84h5.744v.951h-5.744v1.704h4.69a19.453 19.453 0 0 1-1.986 5.06c1.424.52 2.702 1.011 3.654 1.333m-13.81-2.032c-.596.06-1.71.325-2.321.869-1.83 1.608-.735 4.55 2.968 4.55 2.151 0 4.301-1.388 5.99-3.61-2.403-1.182-4.438-2.028-6.637-1.809" fill="#1677FF"/>
                </svg>
              </div>
              <span class="donate-method-label">支付宝</span>
            </div>
            <div class="donate-method" @click="showQrCode = 'wechat'">
              <div class="donate-method-icon donate-wechat">
                <svg viewBox="0 0 24 24" fill="none" width="28" height="28"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.854-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.11.24-.245 0-.06-.024-.12-.04-.178l-.325-1.233a.59.59 0 0 1-.04-.21.49.49 0 0 1 .201-.397C23.024 17.48 24 15.82 24 13.938c0-3.453-3.444-6.08-7.062-6.08zM15.35 12.18c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982z" fill="currentColor"/></svg>
              </div>
              <span class="donate-method-label">微信支付</span>
            </div>
          </div>
          <div class="donate-list-header">
            <span class="donate-list-title">捐赠列表</span>
            <button class="donate-refresh" type="button" @click="refreshDonationList">刷新列表</button>
          </div>
          <p class="donate-list-desc">您的赞助将会出现在这里，您的赞助将支持开发者持续更新</p>
          <div v-if="donations.length" class="donate-list">
            <div v-for="(d, i) in donations" :key="i" class="donate-item">
              <span class="donate-user">{{ d.name }}</span>
              <span class="donate-amount">{{ d.amount }}</span>
            </div>
          </div>
          <div v-else class="donate-empty">暂无捐赠记录</div>
        </div>

      <!-- 收款码弹窗 -->
      <Teleport to="body">
        <div v-if="showQrCode" class="qr-modal" @click.self="showQrCode = null">
          <div class="qr-modal-content">
            <button class="qr-modal-close" type="button" @click="showQrCode = null">&times;</button>
            <img
              v-if="showQrCode === 'alipay'"
              src="/alipay-qr.jpg"
              alt="支付宝收款码"
              class="qr-modal-img"
            />
            <img
              v-else-if="showQrCode === 'wechat'"
              src="/wechat-qr.jpg"
              alt="微信收款码"
              class="qr-modal-img"
            />
            <p class="qr-modal-tip">{{ showQrCode === 'alipay' ? '打开支付宝扫码捐赠' : '打开微信扫码捐赠' }}</p>
          </div>
        </div>
      </Teleport>
      </AnimatedAppear>

    </template>

    <AnimatedAppear
      v-if="showEmptyAccountState"
      tag="section"
      variant="content"
      rhythm="body"
      class-name="setting-group account-empty-state"
    >
      <AnimatedAppear tag="h3" variant="title" rhythm="title" class-name="group-title">账号设置</AnimatedAppear>
      <div class="empty-card">
        <p class="empty-title">当前未登录</p>
        <p class="empty-desc">登录后可管理账号同步、隐私和退出登录等选项。</p>
        <button class="empty-action-btn" type="button" @click="goToLogin">去登录</button>
      </div>
    </AnimatedAppear>

    <transition name="toast-fade">
      <div v-if="logoutMessage" class="toast" role="status" aria-live="polite">
        {{ logoutMessage }}
      </div>
    </transition>
  </AnimatedAppear>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { marked } from 'marked';

type SettingsTabKey = 'playback' | 'appearance' | 'local' | 'account' | 'about';

const props = withDefaults(
  defineProps<{
    initialTab?: SettingsTabKey;
  }>(),
  {
    initialTab: 'appearance',
  },
);

import AnimatedAppear from './AnimatedAppear.vue';

const emit = defineEmits<{
  (e: 'go-login'): void;
}>();
import DropdownSelect from './ui/DropdownSelect.vue';
import FancySwitch from './ui/FancySwitch.vue';
import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import { useUiStore, type PlayerPageTransition } from '../stores/ui';
const uiStore = useUiStore();
import { useUserStore } from '../stores/user';
const userStore = useUserStore();
import { getSourceMeta } from '../config/musicSources';
import { useLyricsSettingsStore } from '../stores/lyricsSettings';
const lyricsSettings = useLyricsSettingsStore();
import { useLocalMusicStore } from '../stores/localMusic';
import { platform } from '../utils/platform';

type SettingItem = {
  key: string;
  label: string;
  desc?: string;
  type: 'switch' | 'select' | 'range' | 'action' | 'input' | 'source-order';
  options?: string[];
  optionVipLabels?: Record<string, string>;
  min?: number;
  max?: number;
  actionText?: string;
  placeholder?: string;
};

type SettingGroup = {
  title: string;
  items: SettingItem[];
};

const allTabs = [
  { key: 'playback', label: '播放' },
  { key: 'appearance', label: '外观' },
  { key: 'local', label: '本地音乐' },
  { key: 'account', label: '账号' },
  { key: 'about', label: '关于' },
] as const;

function isTabAvailable(tab: SettingsTabKey) {
  if (tab === 'local') return platform.isDesktop;
  return true;
}

function normalizeTab(tab: SettingsTabKey): SettingsTabKey {
  return isTabAvailable(tab) ? tab : 'appearance';
}

const tabs = computed(() => allTabs.filter((tab) => isTabAvailable(tab.key)));

const activeTab = ref<SettingsTabKey>(normalizeTab(props.initialTab));

const groupsMap: Record<string, SettingGroup[]> = {
  playback: [
    {
      title: '播放设置',
      items: [
        { key: 'autoplay', label: '自动播放下一首', desc: '当前歌曲结束后自动切换到下一首', type: 'switch' },
        { key: 'resumeAfterMv', label: 'MV 关闭后恢复播放', desc: '关闭 MV 播放页后自动恢复歌曲播放', type: 'switch' },
        { key: 'quality', label: '默认音质', desc: '以账号具体权限为准', type: 'select', options: ['标准', '较高', '极高(HQ)', '无损(SQ)', 'Hi-Res', '高清臻音', '沉浸环绕声', '杜比全景声', '超清母带'], optionVipLabels: { '无损(SQ)': '黑胶VIP', 'Hi-Res': '黑胶VIP', '高清臻音': 'SVIP', '沉浸环绕声': 'SVIP', '杜比全景声': 'SVIP', '超清母带': 'SVIP' } },
        { key: 'unblock', label: '音源替换', desc: '非会员用户，建议打开。可享受所有会员歌曲播放。仅对播放音乐有限制，下载不受该选项的管理。启用后自动从波点/酷狗/咪咕等源替换无法播放的歌曲', type: 'switch' },
        { key: 'unblockSources', label: '音源优先级', desc: '按从上到下的顺序逐个尝试，第一个匹配成功的使用，全部失败则使用官方音源', type: 'source-order' },
        { key: 'paidContentSkip', label: '付费内容自动跳过', desc: '遇到未购买的付费播客时自动跳过到下一首，关闭则停止播放', type: 'switch' },
        { key: 'playMode', label: '默认播放模式', desc: '循环/单曲/随机播放策略', type: 'select', options: ['列表循环', '单曲循环', '随机播放'] },
        { key: 'playbackRate', label: '播放速度', desc: '设置全局默认播放速度，各歌曲可在底部栏单独调整', type: 'select', options: ['0.5x', '0.75x', '1.0x', '1.25x', '1.5x', '2.0x', '2.5x', '3.0x'] },
        { key: 'crossfade', label: '淡入淡出时长', desc: '控制切歌时过渡顺滑程度', type: 'range', min: 0, max: 12 },
      ],
    },
  ],
  appearance: [
    {
      title: '外观设置',
      items: [
        { key: 'theme', label: '主题模式', desc: '切换浅色或深色界面', type: 'select', options: ['浅色', '深色', '跟随系统'] },
        { key: 'accent', label: '主题色', desc: '切换系统强调色（带颜色预览）', type: 'select', options: ['绿色', '蓝色', '紫色', '橙色', '自定义'] },
        { key: 'accentCustomColor', label: '自定义主题色', desc: '在调色盘中选择任意颜色', type: 'action' },
        { key: 'showIntelligenceIndicator', label: '控制中心心动图标', desc: '在播放器控制栏显示心动模式图标', type: 'switch' },
        { key: 'autoHidePlayerUI', label: '全屏播放页自动隐藏 UI', desc: '在全屏播放页中，无操作时自动隐藏顶部栏、右侧按钮和底部控制台', type: 'switch' },
        { key: 'playerPageTransition', label: '播放页打开动画', desc: '选择主界面打开和关闭播放页时的动态效果', type: 'select', options: ['经典上滑', '景深推进', '液态扩散', '幕布揭开'] },
        { key: 'miniAlwaysOnTop', label: '迷你模式窗口置顶', desc: '迷你模式下保持窗口置顶；macOS 会在所有桌面显示，Windows 暂保持当前桌面置顶', type: 'switch' },
      ],
    },
    {
      title: '歌词显示',
      items: [
        { key: 'barLyric', label: '底部栏歌词', desc: '播放时底部栏显示歌词', type: 'switch' },
        { key: 'desktopControlEnabled', label: '启用桌面播控', desc: 'macOS 菜单栏歌词 / Windows 任务栏播控', type: 'switch' },
        { key: 'desktopLyricEnabled', label: '启用桌面歌词', desc: '在桌面上显示一个可拖拽的歌词浮窗', type: 'switch' },
        { key: 'desktopLyricMode', label: '显示模式', desc: '选择歌词展示方式', type: 'select', options: ['滚动列表', '单行', '双行'] },
        { key: 'desktopLyricFontSize', label: '字体大小', desc: '歌词文字大小', type: 'select', options: ['小', '中', '大', '特大'] },
        { key: 'desktopLyricHighlightColor', label: '高亮颜色', desc: '当前播放歌词的颜色', type: 'action' },
        { key: 'desktopLyricTextColor', label: '未播放颜色', desc: '未播放歌词的文字颜色', type: 'action' },
        { key: 'desktopLyricAlwaysShowBg', label: '始终显示背景', desc: '开启后桌面歌词始终显示毛玻璃背景（锁定状态除外）', type: 'switch' },
      ],
    },
  ],
  local: [
    {
      title: '本地音乐目录',
      items: [
        { key: 'localAddDir', label: '添加目录', desc: '选择本地音乐文件夹进行扫描', type: 'action', actionText: '选择文件夹' },
        { key: 'localScan', label: '扫描本地音乐', desc: '立即重新扫描所有已添加的目录', type: 'action', actionText: '扫描' },
      ],
    },
  ],
  account: [
    {
      title: '账号设置',
      items: [
        { key: 'cookieEditor', label: 'Cookie 修改', desc: '支持手动输入或编辑 Cookie；扫码登录成功后会自动填入最新 Cookie', type: 'input', actionText: '保存', placeholder: '例如：MUSIC_U=...; __csrf=...' },
        { key: 'logout', label: '退出登录', desc: '退出当前账号并清除本地登录态', type: 'action', actionText: '退出' },
      ],
    },
  ],
};

const logoutMessage = ref('');
let logoutMessageTimer: ReturnType<typeof setTimeout> | null = null;

// --- About / Open Source Credits ---

interface AboutPkg {
  name: string;
  version: string;
  license: string;
  author: string;
  url: string;
  icon?: string;
}

const frameworkPkgs: AboutPkg[] = [
  { name: 'Vue 3', version: '3.5.32', license: 'MIT', author: 'Evan You — 渐进式 JavaScript 框架，驱动整个前端应用', url: 'https://github.com/vuejs/core', icon: 'https://github.com/vuejs.png?size=48' },
  { name: 'Vite', version: '6.4.2', license: 'MIT', author: 'Evan You — 下一代前端构建工具，提供极速开发体验', url: 'https://github.com/vitejs/vite', icon: 'https://github.com/vitejs.png?size=48' },
  { name: 'TypeScript', version: '5.9.3', license: 'Apache-2.0', author: 'Microsoft — JavaScript 超集，为项目提供类型安全', url: 'https://github.com/microsoft/TypeScript', icon: 'https://github.com/microsoft.png?size=48' },
  { name: '@vitejs/plugin-vue', version: '5.2.4', license: 'MIT', author: 'Evan You — Vite 官方 Vue 插件，提供 SFC 编译支持', url: 'https://github.com/vitejs/vite-plugin-vue', icon: 'https://github.com/vitejs.png?size=48' },
];

const lyricPkgs: AboutPkg[] = [
  { name: '@applemusic-like-lyrics（core / lyric / vue）', version: '0.4.2 / 1.0.0', license: 'GPL-3.0', author: 'AMLL Dev — 基于 Web 技术制作的类 Apple Music 歌词显示组件库', url: 'https://github.com/amll-dev/applemusic-like-lyrics', icon: 'https://github.com/amll-dev.png?size=48' },
];

const graphicsPkgs: AboutPkg[] = [
  { name: 'Three.js', version: '0.184.0', license: 'MIT', author: 'mrdoob — 轻量级 3D 引擎，驱动视觉动效与背景', url: 'https://github.com/mrdoob/three.js', icon: 'https://github.com/mrdoob.png?size=48' },
  { name: 'OGL', version: '1.0.11', license: 'Unlicense', author: 'Nathan Gordon — 小巧的 WebGL 库，用于粒子与着色器效果', url: 'https://github.com/oframe/ogl', icon: 'https://github.com/oframe.png?size=48' },
  { name: 'PixiJS', version: '7.4.3', license: 'MIT', author: 'Mat Groves — 高性能 2D 渲染引擎，处理封面与图形加速', url: 'https://github.com/pixijs/pixijs', icon: 'https://github.com/pixijs.png?size=48' },
  { name: 'gl-matrix', version: '4.0.0-beta.2', license: 'MIT', author: 'Brandon Jones, Colin MacKenzie IV — 高性能矩阵与向量运算库', url: 'https://github.com/toji/gl-matrix', icon: 'https://github.com/toji.png?size=48' },
];

const networkPkgs: AboutPkg[] = [
  { name: 'axios', version: '1.15.0', license: 'MIT', author: 'Matt Zabriskie — 基于 Promise 的 HTTP 客户端，承载所有 API 请求', url: 'https://github.com/axios/axios', icon: 'https://github.com/axios.png?size=48' },
  { name: 'Binaryify/NeteaseCloudMusicApi', version: '-', license: 'MIT', author: 'Binaryify — 网易云音乐 Node.js API 服务，为本项目的 API 层提供基础支持', url: 'https://github.com/Binaryify/NeteaseCloudMusicApi', icon: 'https://github.com/Binaryify.png?size=48' },
  { name: '@neteasecloudmusicapienhanced/api', version: '4.32.1', license: 'MIT', author: 'MoeFurina — 🎉 全网收集最全的网易云音乐 api 接口，基于 <a href=\"https://github.com/binaryify/NeteaseCloudMusicApi\" target=\"_blank\" rel=\"noopener\">NeteaseCloudMusicAPI</a> 的复刻版本。', url: 'https://github.com/neteasecloudmusicapienhanced/api-enhanced', icon: 'https://github.com/neteasecloudmusicapienhanced.png?size=48' },
];

const desktopPkgs: AboutPkg[] = [
  { name: 'Electron', version: '34.5.8', license: 'MIT', author: 'Electron Community — 跨平台桌面应用框架，提供原生窗口与系统集成', url: 'https://github.com/electron/electron', icon: 'https://github.com/electron.png?size=48' },
  { name: 'electron-builder', version: '25.1.8', license: 'MIT', author: 'Vladimir Krivosheev — Electron 应用打包与分发工具', url: 'https://github.com/electron-userland/electron-builder', icon: 'https://github.com/electron-userland.png?size=48' },
];

const unblockPkgs: AboutPkg[] = [
  { name: '@unblockneteasemusic/server', version: '0.28.0', license: 'LGPL-3.0', author: 'nondanee, 1715173329, pan93412 — 解锁网易云音乐客户端变灰歌曲', url: 'https://github.com/UnblockNeteaseMusic/server', icon: 'https://github.com/UnblockNeteaseMusic.png?size=48' },
];

const otherPkgs: AboutPkg[] = [
  { name: '@tanstack/vue-query', version: '5.100.14', license: 'MIT', author: 'Tanner Linsley — TanStack Query 的 Vue 适配，提供声明式服务端状态管理与缓存', url: 'https://github.com/TanStack/query', icon: 'https://github.com/TanStack.png?size=48' },
  { name: '@tanstack/vue-virtual', version: '3.13.24', license: 'MIT', author: 'Tanner Linsley — 高性能虚拟滚动库，用于长列表渲染优化', url: 'https://github.com/TanStack/virtual', icon: 'https://github.com/TanStack.png?size=48' },
  { name: 'lucide-vue-next', version: '0.507.0', license: 'ISC', author: 'Lucide — 开源图标库，提供一致的应用图标体系', url: 'https://github.com/lucide-icons/lucide', icon: 'https://github.com/lucide-icons.png?size=48' },
  { name: 'bezier-easing', version: '3.0.0', license: 'MIT', author: 'Gaëtan Renaudeau — 贝塞尔曲线缓动函数，用于动画时间曲线', url: 'https://github.com/gre/bezier-easing', icon: 'https://github.com/gre.png?size=48' },
  { name: 'jss', version: '10.10.0', license: 'MIT', author: 'JSS Team — CSS-in-JS 方案，用于动态样式生成', url: 'https://github.com/cssinjs/jss', icon: 'https://github.com/cssinjs.png?size=48' },
  { name: '@ungap/structured-clone', version: '1.3.0', license: 'ISC', author: 'Andrea Giammarchi — structuredClone 原生 polyfill', url: 'https://github.com/ungap/structured-clone', icon: 'https://github.com/ungap.png?size=48' },
  { name: 'concurrently', version: '9.2.1', license: 'MIT', author: 'Kimmo Brunfeldt — 并行运行多个 npm 命令', url: 'https://github.com/open-cli-tools/concurrently', icon: 'https://github.com/open-cli-tools.png?size=48' },
  { name: 'wait-on', version: '8.0.5', license: 'MIT', author: 'Jeff Barczewski — 等待资源就绪后再启动服务', url: 'https://github.com/jeffbski/wait-on', icon: 'https://github.com/jeffbski.png?size=48' },
];

// --- About / Update check ---

const changelogExpanded = ref(false);
const donations = ref<Array<{ name: string; amount: string }>>([]);
const showQrCode = ref<string | null>(null);

function refreshDonationList() {
  donations.value = [
    { name: '匿名用户', amount: '¥ 10.00' },
    { name: '音乐爱好者', amount: '¥ 20.00' },
  ];
}

// 更新日志
const changelogLoading = ref(false);
const changelogList = ref<Array<{tag: string; date: string; desc: string}>>([]);


function renderMarkdown(text: string): string {
  if (!text) return "";
  return marked.parse(text);
}
async function fetchChangelog() {
  if (changelogLoading.value) return;
  // Try loading from cache first
  const cached = (() => {
    try {
      const raw = localStorage.getItem('changelog_cache');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Cache valid for 2 hours
      if (Date.now() - parsed.ts > 2 * 60 * 60 * 1000) return null;
      return parsed.data;
    } catch { return null; }
  })();
  if (cached && cached.length > 0) {
    changelogList.value = cached;
    return;
  }

  changelogLoading.value = true;
  try {
    const res = await fetch('https://api.github.com/repos/tingwensuojian/Resound-Player/releases?per_page=10');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const releases = Array.isArray(data) ? data : [];
    const mapped = releases.map((r: any) => ({
      tag: r.tag_name || '',
      date: r.published_at ? r.published_at.slice(0, 10) : '',
      desc: (r.body || '').trim() || '暂无描述',
    }));
    // Save to cache
    try {
      localStorage.setItem('changelog_cache', JSON.stringify({ ts: Date.now(), data: mapped }));
    } catch { /* storage full, ignore */ }
    changelogList.value = mapped;
  } catch (e) {
    // Fall back to cache even if expired, rather than showing nothing
    if (!cached) {
      const stale = (() => {
        try {
          const raw = localStorage.getItem('changelog_cache');
          if (!raw) return null;
          return JSON.parse(raw).data;
        } catch { return null; }
      })();
      changelogList.value = stale || [];
    }
  } finally {
    changelogLoading.value = false;
  }
}
// 当前版本号
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? `v${__APP_VERSION__}` : 'v0.0.0';

// ── 自动更新状态 (electron-updater) ──
const updateStatus = ref('idle'); // idle | 检查中 | available | 下载中 | downloaded | not-available | error
const updateVersion = ref('');
const updateProgress = ref(0);

let unsubUpdater: (() => void) | null = null;

onMounted(() => {
  if ((window as any).appEnv?.autoUpdater?.onStatus) {
    unsubUpdater = (window as any).appEnv.autoUpdater.onStatus((status: any) => {
      updateStatus.value = status.status;
      if (status.info?.version) {
        updateVersion.value = status.info.version;
      }
      if (status.progress?.percent !== null && status.progress?.percent !== undefined) {
        updateProgress.value = status.progress.percent;
      }
    });
    // 获取当前状态
    (window as any).appEnv.autoUpdater.getStatus().then((s: any) => {
      updateStatus.value = s.status;
      if (s.info?.version) updateVersion.value = s.info.version;
      if (s.progress?.percent !== null && s.progress?.percent !== undefined) updateProgress.value = s.progress.percent;
    }).catch(() => {});
  }
});

onUnmounted(() => {
  if (unsubUpdater) { unsubUpdater(); unsubUpdater = null; }
});

async function checkUpdate() {
  if (updateStatus.value === '检查中' || updateStatus.value === '下载中') return;
  updateStatus.value = '检查中';
  try {
    await (window as any).appEnv?.autoUpdater?.check();
  } catch (e) {
    console.warn('[UpdateCheck] 检查更新失败:', e);
    updateStatus.value = 'error';
  }
}

async function startDownload() {
  if (updateStatus.value !== 'available') return;
  try {
    await (window as any).appEnv?.autoUpdater?.download();
  } catch (e) {
    console.warn('[UpdateCheck] 下载失败:', e);
  }
}

function installUpdate() {
  if (updateStatus.value !== 'downloaded') return;
  (window as any).appEnv?.autoUpdater?.install();
}

const showEmptyAccountState = computed(() => activeTab.value === 'account' && !currentGroups.value.length);

watch(
  () => props.initialTab,
  (tab) => {
    activeTab.value = normalizeTab(tab);
  },
  { immediate: true },
);

watch(
  () => userStore.state.loginMode,
  (mode) => {
    if (mode === 'none' && activeTab.value === 'account') {
      activeTab.value = 'appearance';
    }
  },
  { immediate: true },
);

const currentGroups = computed(() => {
  const groups = groupsMap[activeTab.value] || [];
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        if (item.key === 'accentCustomColor') return selectState.accent === '自定义';
        if (item.key === 'unblockSources') return switchState.unblock;
        if (item.key === 'logout') return userStore.state.isLogin;
        if (item.key === 'cookieEditor') return userStore.state.isLogin;
        if (!userStore.state.isLogin && activeTab.value === 'account') {
          return false;
        }
        // 本地音乐功能仅桌面端可用
        if (['localAddDir', 'localScan'].includes(item.key) && !platform.isDesktop) {
          return false;
        }
        // 系统托盘功能仅桌面端可用
        if (['desktopControlEnabled', 'miniAlwaysOnTop'].includes(item.key) && !platform.isDesktop) {
          return false;
        }
        // 桌面歌词：仅桌面端可见
        if (['desktopLyricEnabled', 'desktopLyricMode', 'desktopLyricFontSize', 'desktopLyricHighlightColor', 'desktopLyricTextColor', 'desktopLyricAlwaysShowBg'].includes(item.key) && !platform.isDesktop) {
          return false;
        }
        // 任务栏播控：仅 Windows 桌面端可见
        if (['desktopControlEnabled'].includes(item.key) && !(platform.isDesktop && platform.isWindows)) {
          return false;
        }
        // 桌面歌词子选项仅在启用时可见
        if (['desktopLyricMode', 'desktopLyricFontSize', 'desktopLyricHighlightColor', 'desktopLyricTextColor', 'desktopLyricAlwaysShowBg'].includes(item.key) && !switchState.desktopLyricEnabled) {
          return false;
        }
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
});

const switchState = reactive<Record<string, boolean>>({
  unblock: uiStore.state.unblockEnabled,
  autoplay: playerStore.state.autoplayNext,
  barLyric: lyricsSettings.state.showBarLyric,
  resumeAfterMv: uiStore.state.resumeAfterMv,
  showIntelligenceIndicator: uiStore.state.showIntelligenceIndicator,
  autoHidePlayerUI: uiStore.state.autoHidePlayerUI,
  paidContentSkip: playerStore.state.paidContentSkip,
  miniAlwaysOnTop: uiStore.state.miniAlwaysOnTop,
  desktopControlEnabled: false, // 实际值从主进程加载
  desktopLyricEnabled: false, // 实际值从主进程加载
  desktopLyricAlwaysShowBg: false, // 实际值从主进程加载
});

const selectState = reactive<Record<string, string>>({
  quality: playerStore.state.defaultQuality,
  playMode: playerStore.state.playMode === 'single' ? '单曲循环' : playerStore.state.playMode === 'shuffle' ? '随机播放' : '列表循环',
  playbackRate: `${playerStore.state.defaultPlaybackRate.toFixed(2).replace(/\.00$/, '.0')}x`,
  theme: uiStore.state.themeMode,
  accent: uiStore.state.accentMode,
  playerPageTransition: uiStore.state.playerPageTransition,
  desktopLyricMode: '滚动列表', // 实际值从主进程加载
  desktopLyricFontSize: '中', // 实际值从主进程加载
});

const accentCustomColor = ref(uiStore.state.accentCustomColor);
const desktopLyricHighlightColor = ref('#ff6b81');
const desktopLyricTextColor = ref('#ffffff');

watch(
  () => uiStore.state.themeMode,
  (value) => {
    selectState.theme = value;
  },
  { immediate: true },
);

watch(
  () => uiStore.state.accentMode,
  (value) => {
    selectState.accent = value;
  },
  { immediate: true },
);

watch(
  () => uiStore.state.accentCustomColor,
  (value) => {
    accentCustomColor.value = value;
  },
  { immediate: true },
);

const accentColors = computed<Record<string, string>>(() => ({
  绿色: 'var(--accent-green, #22c55e)',
  蓝色: 'var(--accent-blue, #3b82f6)',
  紫色: 'var(--accent-purple, #a855f7)',
  橙色: 'var(--accent-orange, #f97316)',
  自定义: accentCustomColor.value,
}));

const rangeState = reactive<Record<string, number>>({
  crossfade: playerStore.state.crossfadeSec,
});

const inputState = reactive<Record<string, string>>({
  cookieEditor: userStore.state.loginCookie || '',
});

// --- Source order ---

const sourceOrder = computed({
  get: () =>
    uiStore.state.unblockSources.map((key) => {
      const meta = getSourceMeta(key);
      return { key, label: meta?.label || key, color: meta?.color || '#888' };
    }),
  set: (value) => {
    uiStore.setUnblockSources(value.map((s) => s.key));
  },
});

const sourceOrderExpanded = ref(false);
const sourceOrderFeedback = ref('');
let sourceOrderFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

function showSourceFeedback(message: string) {
  sourceOrderFeedback.value = message;
  if (sourceOrderFeedbackTimer) clearTimeout(sourceOrderFeedbackTimer);
  sourceOrderFeedbackTimer = setTimeout(() => {
    sourceOrderFeedback.value = '';
  }, 4000);
}

function moveSource(index: number, direction: number) {
  const list = [...sourceOrder.value];
  const target = index + direction;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  uiStore.setUnblockSources(list.map((s) => s.key));
  showSourceFeedback('音源顺序已更新，播放下首歌曲时生效');
}

watch(
  () => selectState.theme,
  (next) => {
    if (next === '浅色' || next === '深色' || next === '跟随系统') {
      uiStore.setThemeMode(next);
    }
  },
);

watch(
  () => selectState.accent,
  (next) => {
    if (next === '绿色' || next === '蓝色' || next === '紫色' || next === '橙色' || next === '自定义') {
      uiStore.setAccentMode(next);
    }
  },
);

watch(
  () => selectState.playerPageTransition,
  (next) => {
    uiStore.setPlayerPageTransition(next as PlayerPageTransition);
  },
);

watch(
  accentCustomColor,
  (next) => {
    uiStore.setAccentCustomColor(next);
  },
);
watch(
  () => switchState.unblock,
  (enabled) => {
    uiStore.setUnblockEnabled(Boolean(enabled));
    showSourceFeedback(enabled ? '音源替换已开启' : '音源替换已关闭');
  },
);

watch(
  () => switchState.autoplay,
  (enabled) => {
    playerStore.setAutoplayNext(Boolean(enabled));
  },
);

watch(
  () => switchState.barLyric,
  (enabled) => {
    lyricsSettings.state.showBarLyric = Boolean(enabled);
    lyricsSettings.save();
  },
);

// 反向同步：当外部（如 PlayerBar 弹窗）改变 showBarLyric 时，同步回 switchState
watch(
  () => lyricsSettings.state.showBarLyric,
  (enabled) => {
    switchState.barLyric = Boolean(enabled);
  },
);

watch(
  () => switchState.resumeAfterMv,
  (enabled) => {
    uiStore.setResumeAfterMv(Boolean(enabled));
  },
);

watch(
  () => switchState.showIntelligenceIndicator,
  (enabled) => {
    uiStore.setShowIntelligenceIndicator(Boolean(enabled));
  },
);

watch(
  () => switchState.autoHidePlayerUI,
  (enabled) => {
    uiStore.setAutoHidePlayerUI(Boolean(enabled));
  },
);

watch(
  () => switchState.paidContentSkip,
  (enabled) => {
    playerStore.state.paidContentSkip = Boolean(enabled);
    playerStore.persist();
  },
);

watch(
  () => switchState.miniAlwaysOnTop,
  (enabled) => {
    uiStore.setMiniAlwaysOnTop(Boolean(enabled));
  },
);

// 从 playerStore 持久化数据同步到 selectState
watch(() => playerStore.state.defaultQuality, (val) => {
  selectState.quality = val;
});

watch(
  () => selectState.quality,
  (value) => {
    const validQualities = ['标准', '较高', '极高(HQ)', '无损(SQ)', 'Hi-Res', '高清臻音', '沉浸环绕声', '杜比全景声', '超清母带'];
    if (validQualities.includes(value)) {
      playerStore.setDefaultQuality(value);
      console.log('[quality] 设置页切换为:', value, '| 歌曲:', playerStore.state.currentTrack?.name);
      if (playerStore.state.currentTrack && playerStore.state.isPlaying) {
        const ct = playerStore.state.currentTime;
        console.log('[quality] 设置页触发重拉, 进度:', Math.floor(ct), 's');
        void playerStore.playTrack(playerStore.state.currentTrack, ct);
      }
    }
  },
);

watch(
  () => selectState.playMode,
  (value) => {
    if (value === '单曲循环') playerStore.setPlayMode('single');
    else if (value === '随机播放') playerStore.setPlayMode('shuffle');
    else playerStore.setPlayMode('loop');
  },
);

watch(
  () => selectState.playbackRate,
  (value) => {
    const rate = Number(String(value).replace('x', ''));
    if (Number.isFinite(rate)) playerStore.setDefaultPlaybackRate(rate);
  },
);

watch(
  () => rangeState.crossfade,
  (value) => {
    playerStore.setCrossfadeSec(Number(value));
  },
);

watch(
  () => selectState.playMode,
  (value) => {
    const mode = value === '单曲循环' ? 'single' : value === '随机播放' ? 'shuffle' : 'loop';
    playerStore.setPlayMode(mode);
  },
);

watch(
  () => selectState.playbackRate,
  (value) => {
    const n = Number(String(value).replace('x', ''));
    if (Number.isFinite(n)) playerStore.setPlaybackRate(n);
  },
);

watch(
  () => userStore.state.loginCookie,
  (value) => {
    inputState.cookieEditor = value || '';
  },
  { immediate: true },
);

// ═══════════════════════════════════════════════════════════════════
// 系统托盘歌词设置（仅桌面端，通过 IPC 与主进程通信）
// ═══════════════════════════════════════════════════════════════════

// 用于卸载 IPC 监听
let cleanupTrayConfigListener: (() => void) | null = null;

// 桌面播控：加载配置并监听变更（macOS 菜单栏歌词 + Windows 任务栏播控）
onMounted(async () => {
  if (!platform.isDesktop) return;
  let mergedEnabled = false;
  if (window.appEnv?.trayLyric) {
    try {
      const config = await window.appEnv.trayLyric.getConfig();
      mergedEnabled = mergedEnabled || config.enabled;
    } catch (e) {
      console.warn('[settings] failed to load tray config:', e);
    }
  }
  if (platform.isWindows && window.appEnv?.taskbarWidget) {
    try {
      const config = await window.appEnv.taskbarWidget.getConfig();
      mergedEnabled = mergedEnabled || config.enabled;
    } catch (e) {
      console.warn('[settings] failed to load taskbar widget config:', e);
    }
  }
  switchState.desktopControlEnabled = mergedEnabled;
  if (window.appEnv?.trayLyric) {
    cleanupTrayConfigListener = window.appEnv.trayLyric.onConfigChanged((config) => {
      switchState.desktopControlEnabled = config.enabled;
    });
  }
  if (platform.isWindows && window.appEnv?.taskbarWidget) {
    window.appEnv.taskbarWidget.onConfigChanged((config) => {
      switchState.desktopControlEnabled = config.enabled;
    });
  }
});
onUnmounted(() => {
  if (cleanupTrayConfigListener) {
    cleanupTrayConfigListener();
    cleanupTrayConfigListener = null;
  }
});
watch(
  () => switchState.desktopControlEnabled,
  (enabled) => {
    if (!platform.isDesktop) return;
    const next = Boolean(enabled);
    if (window.appEnv?.trayLyric) {
      window.appEnv.trayLyric.setConfig({ enabled: next }).catch((e) => {
        console.warn('[settings] failed to send tray config:', e);
      });
    }
    if (platform.isWindows && window.appEnv?.taskbarWidget) {
      window.appEnv.taskbarWidget.setEnabled(next).catch((e) => {
        console.warn('[settings] failed to send taskbar widget config:', e);
      });
    }
  },
  { immediate: true }
);

// 桌面歌词区段
let cleanupDesktopLyricListener: (() => void) | null = null;

onMounted(async () => {
  if (!platform.isDesktop || !window.appEnv?.desktopLyric) return;
  try {
    const config = await window.appEnv.desktopLyric.getConfig();
    switchState.desktopLyricEnabled = config.enabled;
    selectState.desktopLyricMode = config.displayMode === 'scroll' ? '滚动列表' : config.displayMode === 'single' ? '单行' : '双行';
    selectState.desktopLyricFontSize = config.fontSize <= 28 ? '小' : config.fontSize <= 42 ? '中' : config.fontSize <= 56 ? '大' : '特大';
    desktopLyricHighlightColor.value = config.highlightColor || '#ff6b81';
    desktopLyricTextColor.value = config.textColor || '#ffffff';
    switchState.desktopLyricAlwaysShowBg = config.alwaysShowBg ?? false;
  } catch (e) {
    console.warn('[settings] 加载桌面歌词配置失败:', e);
  }

  cleanupDesktopLyricListener = window.appEnv.desktopLyric.onConfigChanged((config) => {
    switchState.desktopLyricEnabled = config.enabled;
    selectState.desktopLyricMode = config.displayMode === 'scroll' ? '滚动列表' : config.displayMode === 'single' ? '单行' : '双行';
    selectState.desktopLyricFontSize = config.fontSize <= 28 ? '小' : config.fontSize <= 42 ? '中' : config.fontSize <= 56 ? '大' : '特大';
    desktopLyricHighlightColor.value = config.highlightColor || '#ff6b81';
    desktopLyricTextColor.value = config.textColor || '#ffffff';
    switchState.desktopLyricAlwaysShowBg = config.alwaysShowBg ?? false;
  });
});

const DESKTOP_FONT_SIZE_MAP: Record<string, number> = { '小': 24, '中': 36, '大': 48, '特大': 64 };
const DESKTOP_MODE_MAP: Record<string, string> = { '滚动列表': 'scroll', '单行': 'single', '双行': 'double' };

// 同步 switch → 主进程
watch(() => switchState.desktopLyricEnabled, (enabled) => {
  if (!platform.isDesktop || !window.appEnv?.desktopLyric) return;
  window.appEnv.desktopLyric.setConfig({
    enabled: Boolean(enabled),
    displayMode: DESKTOP_MODE_MAP[selectState.desktopLyricMode] || 'scroll',
    fontSize: DESKTOP_FONT_SIZE_MAP[selectState.desktopLyricFontSize] || 36,
    highlightColor: desktopLyricHighlightColor.value,
    textColor: desktopLyricTextColor.value,
    alwaysShowBg: switchState.desktopLyricAlwaysShowBg,
  }).catch((e) => console.warn('[settings] 桌面歌词配置失败:', e));
});

// 同步 select → 主进程
watch(() => selectState.desktopLyricMode, (modeStr) => {
  if (!platform.isDesktop || !window.appEnv?.desktopLyric) return;
  window.appEnv.desktopLyric.setConfig({
    enabled: switchState.desktopLyricEnabled,
    displayMode: DESKTOP_MODE_MAP[modeStr] || 'scroll',
    fontSize: DESKTOP_FONT_SIZE_MAP[selectState.desktopLyricFontSize] || 36,
    highlightColor: desktopLyricHighlightColor.value,
    textColor: desktopLyricTextColor.value,
    alwaysShowBg: switchState.desktopLyricAlwaysShowBg,
  }).catch((e) => console.warn('[settings] 桌面歌词配置失败:', e));
});

// 同步字体大小 → 主进程
watch(() => selectState.desktopLyricFontSize, (sizeStr) => {
  if (!platform.isDesktop || !window.appEnv?.desktopLyric) return;
  window.appEnv.desktopLyric.setConfig({
    enabled: switchState.desktopLyricEnabled,
    displayMode: DESKTOP_MODE_MAP[selectState.desktopLyricMode] || 'scroll',
    fontSize: DESKTOP_FONT_SIZE_MAP[sizeStr] || 36,
    highlightColor: desktopLyricHighlightColor.value,
    textColor: desktopLyricTextColor.value,
    alwaysShowBg: switchState.desktopLyricAlwaysShowBg,
  }).catch((e) => console.warn('[settings] 桌面歌词配置失败:', e));
});

// 同步高亮色 → 主进程
watch(desktopLyricHighlightColor, (color) => {
  if (!platform.isDesktop || !window.appEnv?.desktopLyric) return;
  window.appEnv.desktopLyric.setConfig({
    enabled: switchState.desktopLyricEnabled,
    displayMode: DESKTOP_MODE_MAP[selectState.desktopLyricMode] || 'scroll',
    fontSize: DESKTOP_FONT_SIZE_MAP[selectState.desktopLyricFontSize] || 36,
    highlightColor: color,
    textColor: desktopLyricTextColor.value,
    alwaysShowBg: switchState.desktopLyricAlwaysShowBg,
  }).catch((e) => console.warn('[settings] 桌面歌词配置失败:', e));
});

// 同步未播放颜色 → 主进程
watch(desktopLyricTextColor, (color) => {
  if (!platform.isDesktop || !window.appEnv?.desktopLyric) return;
  window.appEnv.desktopLyric.setConfig({
    enabled: switchState.desktopLyricEnabled,
    displayMode: DESKTOP_MODE_MAP[selectState.desktopLyricMode] || 'scroll',
    fontSize: DESKTOP_FONT_SIZE_MAP[selectState.desktopLyricFontSize] || 36,
    highlightColor: desktopLyricHighlightColor.value,
    textColor: color,
    alwaysShowBg: switchState.desktopLyricAlwaysShowBg,
  }).catch((e) => console.warn('[settings] 桌面歌词配置失败:', e));
});

// 同步始终显示背景 → 主进程
watch(() => switchState.desktopLyricAlwaysShowBg, (alwaysShowBg) => {
  if (!platform.isDesktop || !window.appEnv?.desktopLyric) return;
  window.appEnv.desktopLyric.setConfig({
    enabled: switchState.desktopLyricEnabled,
    displayMode: DESKTOP_MODE_MAP[selectState.desktopLyricMode] || 'scroll',
    fontSize: DESKTOP_FONT_SIZE_MAP[selectState.desktopLyricFontSize] || 36,
    highlightColor: desktopLyricHighlightColor.value,
    textColor: desktopLyricTextColor.value,
    alwaysShowBg,
  }).catch((e) => console.warn('[settings] 桌面歌词配置失败:', e));
});

onUnmounted(() => {
  cleanupDesktopLyricListener?.();
});


function showLogoutMessage(message: string) {
  logoutMessage.value = message;

  if (logoutMessageTimer) {
    clearTimeout(logoutMessageTimer);
  }

  logoutMessageTimer = setTimeout(() => {
    logoutMessage.value = '';
    logoutMessageTimer = null;
  }, 2200);
}

function goToLogin() {
  emit('go-login');
}

async function handleAction(key: string) {
  if (key === 'cookieEditor') {
    try {
      const normalizedCookie = String(inputState.cookieEditor || '').trim();
      userStore.saveCookie(normalizedCookie);
      showLogoutMessage(normalizedCookie ? 'Cookie 已保存' : 'Cookie 已清空');
    } catch (e: any) {
      showLogoutMessage(e?.message || 'Cookie 保存失败');
    }
    return;
  }

  if (key === 'logout') {
    await userStore.logout();
    activeTab.value = 'account';
    showLogoutMessage('已退出登录');
  }

  if (key === 'localAddDir') {
    const localMusicStore = useLocalMusicStore()
    if (!localMusicStore.hasLocalSupport) {
      console.warn('[settings] hasLocalSupport=false, isDesktop=', platform.isDesktop, 'localApi=', !!(window as any).localApi)
      showLogoutMessage(platform.isDesktop ? '正在扫描…' : '本地音乐功能仅支持桌面端')
      if (platform.isDesktop) {
        await localMusicStore.addDirectory()
        showLogoutMessage('已添加目录')
      }
      return
    }
    await localMusicStore.addDirectory()
    showLogoutMessage('已添加目录')
  }

  if (key === 'localScan') {
    const localMusicStore = useLocalMusicStore()
    if (!localMusicStore.hasLocalSupport) {
      console.warn('[settings] hasLocalSupport=false, isDesktop=', platform.isDesktop, 'localApi=', !!(window as any).localApi)
      showLogoutMessage(platform.isDesktop ? '正在扫描…' : '本地音乐功能仅支持桌面端')
      if (platform.isDesktop) {
        await localMusicStore.scanAll()
        showLogoutMessage('扫描完成')
      }
      return
    }
    await localMusicStore.scanAll()
    showLogoutMessage('扫描完成')
  }
}
</script>

<style scoped>
.settings-page {
  width: 100%;
  display: grid;
  gap: var(--space-3);
}

.top-tabs-wrap {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-surface);
  padding: calc(var(--space-2) + 2px) var(--space-2) var(--space-2);
  overflow: visible;
}

.top-tabs {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  overflow: visible;
}

.tab-btn {
  height: 34px;
  padding: 0 var(--space-3);
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-muted);
  color: var(--text-sub);
  cursor: pointer;
}

.tab-btn.active {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.setting-group {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-surface);
  padding: var(--space-3);
  overflow: visible;
}

.account-empty-state {
  min-height: 220px;
}

.group-title {
  margin: 0 0 var(--space-3);
  font-size: var(--text-body-md);
  font-weight: 700;
  color: var(--text-main);
}

.rows {
  display: grid;
  gap: var(--space-2);
}

.empty-card {
  min-height: 144px;
  display: grid;
  place-content: center;
  gap: var(--space-2);
  border: 1px dashed var(--border);
  border-radius: 12px;
  background: var(--bg-muted);
  text-align: center;
}

.empty-title {
  margin: 0;
  font-size: var(--text-body-md);
  font-weight: 700;
  color: var(--text-main);
}

.empty-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-sub);
}

.empty-action-btn {
  justify-self: center;
  height: 36px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 44%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--bg-surface));
  color: var(--accent);
  font-weight: 600;
  cursor: pointer;
}

.row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-3) var(--space-3);
  border-top: 1px solid var(--border-soft);
  border-radius: 10px;
  position: relative;
  z-index: 1;
  transition: transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease, border-color 0.18s ease;
}

.row:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
}

.row:focus-within {
  z-index: 50;
}

.row:first-child {
  border-top: 0;
}

.label {
  margin: 0;
  font-size: var(--text-label-md);
  font-weight: 600;
  color: var(--text-main);
}

.desc {
  margin: var(--space-1) 0 0;
  font-size: var(--text-label-sm);
  color: var(--text-sub);
}

 .right {
  min-width: 180px;
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.input-action-wrap {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  width: min(560px, 100%);
}

.inline-input {
  width: min(440px, 100%);
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0 var(--space-3);
  background: var(--bg-muted);
  color: var(--text-main);
  outline: none;
}

.inline-input:focus {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
}

.control-slot {
  width: 120px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.switch-slot {
  justify-content: center;
  padding-right: 0;
  box-sizing: border-box;
}

.select {
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0 10px;
  background: var(--bg-muted);
  color: var(--text-main);
}

.range {
  width: 180px;
}

.action-btn {
  height: 34px;
  padding: 0 var(--space-3);
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, #ef4444 34%, var(--border));
  background: color-mix(in srgb, #ef4444 12%, var(--bg-surface));
  color: color-mix(in srgb, #ef4444 74%, var(--text-main));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-direction: row;
  white-space: nowrap;
  writing-mode: horizontal-tb;
}

.color-picker-wrap {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.color-picker {
  width: 42px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: transparent;
  padding: 2px;
  cursor: pointer;
}

.color-hex {
  font-size: var(--text-label-sm);
  color: var(--text-soft);
  min-width: 74px;
  text-transform: lowercase;
}

.source-order-feedback {
  margin: 6px 0 0;
  font-size: var(--text-label-sm);
  color: var(--accent);
  text-align: center;
  transition: opacity 0.3s ease;
}

.source-order-wrap {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  max-width: 280px;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}

.source-order-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 40px;
  padding: 0 var(--space-3);
  border: none;
  background: var(--bg-muted);
  color: var(--text-main);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.source-order-toggle:hover {
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-muted));
}

.source-order-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 13px;
  font-weight: 500;
}

.source-order-hint {
  font-size: var(--text-label-xs);
  color: var(--text-soft);
  font-weight: 400;
}

.source-order-chevron {
  transition: transform 0.2s ease;
  color: var(--text-sub);
}

.source-order-chevron.rotated {
  transform: rotate(180deg);
}

.source-order-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-2);
  border-top: 1px solid var(--border);
  background: var(--bg-surface);
}

.source-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-muted);
}

.source-index {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: var(--text-label-xs);
  font-weight: 700;
  flex-shrink: 0;
}

.source-name {
  flex: 1;
  font-size: 13px;
  color: var(--text-main);
}

.source-arrows {
  display: flex;
  gap: 2px;
}

.arrow-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-sub);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.arrow-btn:hover:not(:disabled) {
  color: var(--accent);
  border-color: var(--accent);
}

.arrow-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.toast {
  position: fixed;
  right: 28px;
  bottom: 132px;
  z-index: 120;
  min-width: 132px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));
  border-radius: 12px;
  background: var(--bg-solid);
  color: var(--text-main);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(12px);
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* --- About / 开源致谢 --- */

.about-project {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) 0;
}

.about-project-logo {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 14px;
  overflow: hidden;
}

.about-project-logo svg {
  display: block;
  width: 100%;
  height: 100%;
}

.about-project-text {
  flex: 1;
  min-width: 0;
}

.about-project-name {
  margin: 0 0 var(--space-1);
  font-size: var(--text-body-md, 16px);
  font-weight: 700;
  color: var(--text-main);
}

.about-project-desc {
  margin: 0;
  font-size: var(--text-body-sm, 14px);
  color: var(--text-sub);
  line-height: 1.6;
}

.about-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.about-update-btn {
  height: 34px;
  padding: 0 var(--space-4);
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 44%, var(--border));
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.about-update-btn:hover {
  opacity: 0.85;
}

.about-update-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.about-download-link {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 var(--space-3);
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: opacity 0.15s;
}

.about-download-link:hover {
  opacity: 0.85;
}

.about-changelog-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 34px;
  padding: 0 var(--space-3);
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-muted);
  color: var(--text-sub);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.about-changelog-btn:hover {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 44%, var(--border));
}

.about-chevron {
  transition: transform 0.2s ease;
}

.about-chevron.rotated {
  transform: rotate(180deg);
}

.about-changelog {
  margin-top: var(--space-3);
  border-top: 1px solid var(--border-soft);
  padding-top: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.changelog-entry {
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
}
.changelog-entry:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.changelog-header {
  margin-bottom: 8px;
}

.changelog-version {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
}

.changelog-date {
  font-size: 11px;
  color: var(--text-soft);
  margin-left: 8px;
  font-weight: 400;
}

.changelog-desc {
  margin: 0;
  width: 100%;
  font-size: 13px;
  color: var(--text-sub);
  line-height: 1.5;
}

.changelog-desc h3:first-child {
  margin-top: 0;
}
.changelog-desc h3 {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent);
  margin: 12px 0 6px;
}
.changelog-desc ul {
  margin: 4px 0;
  padding-left: 18px;
}
.changelog-desc li {
  margin: 2px 0;
}
.changelog-desc hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 10px 0;
}
.changelog-desc a {
  color: var(--accent);
  text-decoration: underline;
}
.changelog-desc strong {
  font-weight: 700;
  color: var(--text-main);
}
.changelog-desc h2 {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  margin: 14px 0 6px;
}
.changelog-desc h2:first-child {
  margin-top: 0;
}
.changelog-desc p {
  margin: 6px 0;
}
.changelog-desc table {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 12px;
}
.changelog-desc td {
  border: 1px solid var(--border);
  padding: 4px 8px;
  vertical-align: top;
  color: var(--text-sub);
}
.changelog-desc td:first-child {
  font-weight: 600;
  color: var(--text-main);
  white-space: nowrap;
}
.changelog-desc th {
  border: 1px solid var(--border);
  padding: 4px 8px;
  font-weight: 700;
  color: var(--text-main);
  background: var(--bg-secondary);
  text-align: left;
  white-space: nowrap;
}

.about-credits {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.about-credits-intro {
  margin: 0;
  font-size: 13px;
  color: var(--text-soft);
  line-height: 1.6;
}

.about-category {
  margin: var(--space-2) 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-sub);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--border);
}

.about-pkg {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-3);
  align-items: start;
  padding: var(--space-2) var(--space-3);
  border-radius: 12px;
  text-decoration: none;
  transition: background-color 0.15s ease;
}

.about-pkg:hover {
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}

.about-pkg-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 2px;
}

.about-pkg-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.about-pkg-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.about-pkg-name {
  font-size: var(--text-label-md);
  font-weight: 600;
  color: var(--text-main);
}

.about-pkg-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.about-pkg-version {
  font-size: var(--text-label-xs);
  color: var(--text-soft);
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
}

.about-pkg-license {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-muted));
  color: var(--accent);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.about-pkg-author {
  font-size: var(--text-label-xs);
  color: var(--text-soft);
  grid-column: 1 / -1;
  margin-top: -4px;
}

/* ========== 捐赠支持 ========== */
.donate-card {
  padding: var(--space-3) var(--space-4);
  background: var(--bg-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.donate-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-sub);
}

.donate-methods {
  display: flex;
  gap: var(--space-3);
}

.donate-method {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-muted);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}

.donate-method:hover {
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-surface));
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  transform: translateY(-1px);
}

.donate-method-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.donate-alipay { color: #1677ff; background: color-mix(in srgb, #1677ff 10%, var(--bg-solid)); }
.donate-wechat { color: #07c160; background: color-mix(in srgb, #07c160 10%, var(--bg-solid)); }

.donate-method-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.donate-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.donate-list-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.donate-refresh {
  height: 30px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-muted);
  color: var(--text-sub);
  font-size: var(--text-label-sm);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.donate-refresh:hover {
  background: color-mix(in srgb, var(--accent) 8%, var(--bg-surface));
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  color: var(--accent);
}

.donate-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.donate-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg-muted) 60%, transparent);
  font-size: 13px;
}

.donate-user {
  color: var(--text-main);
  font-weight: 500;
}

.donate-amount {
  color: var(--text-sub);
  font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
  font-size: var(--text-label-sm);
}

.donate-empty {
  text-align: center;
  padding: var(--space-4);
  color: var(--text-soft);
  font-size: 13px;
}

/* ========== 收款码弹窗 ========== */
.qr-modal {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.5);
  display: grid;
  place-items: center;
  animation: qr-fade-in 0.2s ease;
}

.qr-modal-content {
  background: var(--bg-solid);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  position: relative;
}

.qr-modal-close {
  position: absolute;
  top: var(--space-2);
  right: var(--space-3);
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--border) 40%, transparent);
  color: var(--text-sub);
  font-size: var(--text-body-lg);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.qr-modal-close:hover {
  background: color-mix(in srgb, var(--border) 70%, transparent);
  color: var(--text-main);
}

.qr-modal-img {
  width: 240px;
  height: 240px;
  border-radius: var(--radius-md);
  object-fit: cover;
}

.qr-modal-tip {
  margin: 0;
  font-size: 13px;
  color: var(--text-sub);
}

@keyframes qr-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}


/* ── 平板端设置页适配 ── */
@media (max-width: 1023px) and (min-width: 768px) {
  .settings-page { padding: 0; }
  .row { padding: var(--space-2) var(--space-3); }
}
@media (pointer: coarse) {
  .tab-btn { min-height: 44px; }
  .row { min-height: 44px; }
}
</style>
