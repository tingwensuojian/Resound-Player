/**
 * 性能监控工具
 *
 * 用于检测和记录渲染性能指标
 */

interface PerformanceMetrics {
  /** 帧率 */
  fps: number;
  /** 帧时间 */
  frameTime: number;
  /** 是否掉帧 */
  droppedFrames: boolean;
}

let _monitoring = false;
let _metrics: PerformanceMetrics = {
  fps: 60,
  frameTime: 16.67,
  droppedFrames: false
};

/**
 * 开始性能监控
 * @param onMetricsChange 指标变化回调
 */
export function startPerformanceMonitoring(
  onMetricsChange?: (metrics: PerformanceMetrics) => void
): () => void {
  if (_monitoring) return () => {};
  
  _monitoring = true;
  let frameCount = 0;
  let lastTime = performance.now();
  let rafId = 0;
  
  function measure() {
    frameCount++;
    const currentTime = performance.now();
    const elapsed = currentTime - lastTime;
    
    // 每秒计算一次帧率
    if (elapsed >= 1000) {
      const fps = Math.round((frameCount * 1000) / elapsed);
      const frameTime = elapsed / frameCount;
      const droppedFrames = fps < 55; // 低于55fps视为掉帧
      
      _metrics = { fps, frameTime, droppedFrames };
      onMetricsChange?.(_metrics);
      
      frameCount = 0;
      lastTime = currentTime;
    }
    
    if (_monitoring) {
      rafId = requestAnimationFrame(measure);
    }
  }
  
  rafId = requestAnimationFrame(measure);
  
  // 返回停止函数
  return () => {
    _monitoring = false;
    cancelAnimationFrame(rafId);
  };
}

/**
 * 获取当前性能指标
 */
export function getPerformanceMetrics(): PerformanceMetrics {
  return { ..._metrics };
}

/**
 * 检测当前是否处于性能瓶颈
 */
export function isPerformanceDegraded(): boolean {
  return _metrics.droppedFrames || _metrics.fps < 30;
}

/**
 * FPS显示组件（开发调试用）
 */
export function createFpsOverlay(options?: {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size?: 'small' | 'medium' | 'large';
  showFrameTime?: boolean;
}): HTMLElement {
  const { 
    position = 'top-right', 
    size = 'medium',
    showFrameTime = false 
  } = options || {};
  
  const positionStyles: Record<string, string> = {
    'top-left': 'top: 10px; left: 10px;',
    'top-right': 'top: 10px; right: 10px;',
    'bottom-left': 'bottom: 10px; left: 10px;',
    'bottom-right': 'bottom: 10px; right: 10px;'
  };
  
  const sizeStyles: Record<string, string> = {
    'small': 'padding: 4px 8px; font-size: 12px;',
    'medium': 'padding: 8px 12px; font-size: 14px;',
    'large': 'padding: 12px 16px; font-size: 18px;'
  };
  
  const overlay = document.createElement('div');
  overlay.id = 'fps-overlay';
  overlay.style.cssText = `
    position: fixed;
    ${positionStyles[position]}
    background: rgba(0, 0, 0, 0.8);
    color: #0f0;
    ${sizeStyles[size]}
    border-radius: 8px;
    font-family: monospace;
    z-index: 99999;
    pointer-events: none;
  `;
  
  document.body.appendChild(overlay);
  
  startPerformanceMonitoring((metrics) => {
    const color = metrics.fps >= 55 ? '#0f0' : metrics.fps >= 30 ? '#ff0' : '#f00';
    let html = `<span style="color: ${color}; font-weight: bold;">${metrics.fps} FPS</span>`;
    if (showFrameTime) {
      html += `<br><span style="font-size: 0.9em; opacity: 0.8;">${metrics.frameTime.toFixed(1)}ms</span>`;
    }
    overlay.innerHTML = html;
  });
  
  return overlay;
}

/**
 * 切换FPS显示（开发调试用）
 */
let _fpsOverlay: HTMLElement | null = null;
export function toggleFpsOverlay(options?: Parameters<typeof createFpsOverlay>[0]): void {
  if (_fpsOverlay) {
    _fpsOverlay.remove();
    _fpsOverlay = null;
  } else {
    _fpsOverlay = createFpsOverlay(options);
  }
}

/**
 * 暴露到全局，方便控制台调用
 * 使用方法：
 * - window.__showFps() - 显示FPS监控
 * - window.__hideFps() - 隐藏FPS监控
 * - window.__toggleFps() - 切换显示
 */
declare global {
  interface Window {
    __showFps: (options?: Parameters<typeof createFpsOverlay>[0]) => void;
    __hideFps: () => void;
    __toggleFps: (options?: Parameters<typeof createFpsOverlay>[0]) => void;
  }
}

// 自动初始化全局方法
if (typeof window !== 'undefined') {
  window.__showFps = (options) => {
    if (_fpsOverlay) return;
    _fpsOverlay = createFpsOverlay(options);
  };
  window.__hideFps = () => {
    if (_fpsOverlay) {
      _fpsOverlay.remove();
      _fpsOverlay = null;
    }
  };
  window.__toggleFps = toggleFpsOverlay;
  
  // URL参数自动启用: ?fps 或 ?fps=1
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('fps') !== null) {
    // 延迟初始化，确保DOM已加载
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        createFpsOverlay({ position: 'top-right', size: 'large', showFrameTime: true });
      });
    } else {
      createFpsOverlay({ position: 'top-right', size: 'large', showFrameTime: true });
    }
  }
  
  // URL参数支持位置: ?fps=top-left
  const fpsPosition = urlParams.get('fps-position') as Parameters<typeof createFpsOverlay>[0]['position'];
  const fpsSize = urlParams.get('fps-size') as Parameters<typeof createFpsOverlay>[0]['size'];
  const fpsShowTime = urlParams.get('fps-time') !== null;
  
  if (urlParams.get('fps') !== null && (fpsPosition || fpsSize || fpsShowTime)) {
    // 如果有额外参数，重新创建
    if (_fpsOverlay) {
      _fpsOverlay.remove();
      _fpsOverlay = null;
    }
    createFpsOverlay({
      position: fpsPosition || 'top-right',
      size: fpsSize || 'medium',
      showFrameTime: fpsShowTime
    });
  }
}
