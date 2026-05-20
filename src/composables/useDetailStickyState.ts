import { onMounted, onBeforeUnmount, nextTick, type ComputedRef, watch } from 'vue';

/**
 * 详情页吸顶栏统一状态管理。
 *
 * 所有配置集中于此 composable：
 * - `scrollHost` 固定为 `.playlist-detail-page`（详情页内部滚动容器）
 * - 同时阻止 `.content` 竞争滚动容器（设置 overflow: hidden，卸载时恢复）
 * - `stickyClassTarget` 固定为 `.playlist-detail-header-wrap`
 * - 自动同步 `--cover-bg-url` 到 `.content`（提供 blur 背景）
 * - 自动清理所有副作用（scroll event、CSS 变量、sticky class）
 *
 * @param coverUrl 可选，封面 URL 的 ComputedRef，用于自动同步 blur 背景
 * @param embedded 可选，是否嵌入在 UserSplitView 中。为 true 时使用 `.detail-panel` 作为滚动宿主
 */
export function useDetailStickyState(
  coverUrl?: ComputedRef<string>,
  embedded = false,
): { refresh: () => void } {
  const SCROLL_HOST_SELECTOR = embedded ? '.detail-panel' : '.playlist-detail-page';
  const HEADER_WRAP_SELECTOR = '.playlist-detail-header-wrap';
  const STICKY_CLASS_TARGET = HEADER_WRAP_SELECTOR;

  let rafId = 0;
  let scrollHost: HTMLElement | null = null;
  const PROGRESS_DISTANCE = embedded ? 120 : 324;

  function getScrollHost(): HTMLElement | null {
    return document.querySelector(SCROLL_HOST_SELECTOR) as HTMLElement | null;
  }

  function update(force = false): void {
    if (!scrollHost) return;
    const st = scrollHost.scrollTop;
    const progress = Math.max(0, Math.min(1, st / PROGRESS_DISTANCE));
    writeStickyProgress(progress, force);
    syncBlurOpacity(progress);
    syncStickyClass(progress);
  }

  let lastProgress = -1;
  function writeStickyProgress(progress: number, force = false): void {
    const host = getScrollHost();
    if (!host) return;
    const delta = Math.abs(progress - lastProgress);
    if (!force && delta < 0.005) return;
    lastProgress = progress;
    host.style.setProperty('--sticky-progress', String(progress));
  }

  /** 同步 content::before blur 的透明度 */
  function syncBlurOpacity(progress: number): void {
    const contentEl = document.querySelector('.content');
    if (contentEl) {
      const blurOpacity = Math.max(0, 1 - progress * 1.5);
      contentEl.style.setProperty('--blur-opacity', String(blurOpacity));
    }
  }

  /** 同步 is-sticky-header class */
  function syncStickyClass(progress: number): void {
    const target = document.querySelector(STICKY_CLASS_TARGET) as HTMLElement | null;
    if (!target) return;
    target.classList.toggle('is-sticky-header', progress >= 0.998);
  }

  function onScroll(): void {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => update());
  }

  /**
   * 自动同步封面图到 `.content`，供 `content::before` blur 使用。
   * 页面销毁时自动清理 `--cover-bg-url`，避免残留到下一个详情页。
   */
  if (coverUrl) {
    watch(coverUrl, (url) => {
      const el = document.querySelector('.content') as HTMLElement | null;
      if (!el) return;
      if (url?.trim()) {
        el.style.setProperty('--cover-bg-url', `url("${url.trim()}")`);
      } else {
        el.style.removeProperty('--cover-bg-url');
      }
    }, { immediate: true });
  }

  function refresh(): void {
    nextTick(() => {
      scrollHost = getScrollHost();
      if (scrollHost) {
        scrollHost.scrollTop = 0;
      }
      update(true);
    });
  }

  onMounted(() => {
    requestAnimationFrame(() => {
      scrollHost = getScrollHost();
      if (scrollHost) {
        // 阻止 .content 竞争滚动容器，确保 .playlist-detail-page 是唯一滚动宿主
        const contentEl = document.querySelector('.content') as HTMLElement | null;
        if (contentEl) {
          contentEl.style.overflow = 'hidden';
        }

        scrollHost.addEventListener('scroll', onScroll, { passive: true });
        getScrollHost()?.style.setProperty('--sticky-progress', '0');
      }
    });
  });

  onBeforeUnmount(() => {
    scrollHost?.removeEventListener('scroll', onScroll);
    cancelAnimationFrame(rafId);
    // 恢复 .content 滚动能力
    const contentEl = document.querySelector('.content') as HTMLElement | null;
    if (contentEl) {
      contentEl.style.overflow = '';
    }
    // 清理 --sticky-progress
    const host = getScrollHost();
    if (host) {
      host.style.removeProperty('--sticky-progress');
    }
    // 清理 blur opacity
    document.querySelector('.content')?.style.removeProperty('--blur-opacity');
    // 清理 is-sticky-header class
    document.querySelector(STICKY_CLASS_TARGET)?.classList.remove('is-sticky-header');
    // 清理 --cover-bg-url（避免残留到下一个详情页）
    document.querySelector('.content')?.style.removeProperty('--cover-bg-url');
  });

  return { refresh };
}