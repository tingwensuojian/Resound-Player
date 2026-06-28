const { contextBridge, ipcRenderer } = require('electron');

// Parse the --service-ports argument injected by main.js
const portsArg = process.argv.find((s) => s.startsWith('--service-ports='));
const windowRoleArg = process.argv.find((s) => s.startsWith('--window-role='));
let ports = { api: 38761, unblockProxy: 38762, unblockMatch: 38763 };
let windowRole = 'main';
if (portsArg) {
  try {
    const parsed = JSON.parse(portsArg.split('=')[1]);
    ports = { ...ports, ...parsed };
  } catch {
    // fall back to defaults
  }
}
if (windowRoleArg) {
  const parsedRole = windowRoleArg.split('=')[1];
  if (parsedRole === 'mini') windowRole = 'mini';
}

contextBridge.exposeInMainWorld('appEnv', {
  apiPort: ports.api,
  apiBaseUrl: `http://127.0.0.1:${ports.api}`,
  unblockProxyUrl: `http://127.0.0.1:${ports.unblockProxy}`,
  unblockMatchUrl: `http://127.0.0.1:${ports.unblockMatch}`,
  isDesktop: true,
  windowRole,
  platform: process.platform,
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  cacheApi: {
    getItem: () => ipcRenderer.invoke('cache:get'),
    setItem: (data) => ipcRenderer.invoke('cache:set', data),
    clear: () => ipcRenderer.invoke('cache:clear'),
  },
  // ── 内置 unblock 匹配桥 ──
  unblockBridge: {
    matchSong: (id, sources) => {
      const safeId = Number(id) || 0;
      const safeSources = Array.isArray(sources)
        ? sources.map((source) => String(source || '').trim()).filter(Boolean)
        : [];
      return ipcRenderer.invoke('unblock:match-song', safeId, safeSources);
    },
    isReady: () => ipcRenderer.invoke('unblock:is-native-ready'),
  },
  // ── 系统托盘歌词 API ──
  trayLyric: {
    getConfig: () => ipcRenderer.invoke('tray-lyric:get-config'),
    setConfig: (config) => ipcRenderer.invoke('tray-lyric:set-config', config),
    updateLyric: (data) => ipcRenderer.send('lyric:update', data),
    syncState: (payload) => ipcRenderer.send('tray-lyric:sync-state', payload),
    syncTick: (payload) => ipcRenderer.send('tray-lyric:sync-tick', payload),
    notifyLikeStatus: (liked) => ipcRenderer.send('like-status-change', liked),
    onConfigChanged: (cb) => {
      const handler = (_e, config) => cb(config);
      ipcRenderer.on('tray-lyric:config-changed', handler);
      return () => ipcRenderer.removeListener('tray-lyric:config-changed', handler);
    },
  },
  // ── 桌面歌词 API ──
  desktopLyric: {
    getConfig: () => ipcRenderer.invoke('desktop-lyric:get-config'),
    setConfig: (config) => ipcRenderer.invoke('desktop-lyric:set-config', config),
    updateData: (data) => ipcRenderer.send('desktop-lyric:update-data', data),
    sendAction: (action) => ipcRenderer.send('desktop-lyric:action', action),
    onConfigChanged: (cb) => {
      const handler = (_e, config) => cb(config);
      ipcRenderer.on('desktop-lyric:config-changed', handler);
      return () => ipcRenderer.removeListener('desktop-lyric:config-changed', handler);
    },
  },
    // ── 任务栏播控 API ──
  taskbarWidget: {
    getConfig: () => ipcRenderer.invoke('taskbar-widget:get-config'),
    setConfig: (cfg) => ipcRenderer.invoke('taskbar-widget:set-config', cfg),
    setEnabled: (enabled) => ipcRenderer.invoke('taskbar-widget:set-enabled', enabled),
    onConfigChanged: (cb) => {
      const handler = (_e, config) => cb(config);
      ipcRenderer.on('taskbar-widget:config-changed', handler);
      return () => ipcRenderer.removeListener('taskbar-widget:config-changed', handler);
    },
  },
  // ── 迷你模式 API ──
  miniMode: {
    enter: (alwaysOnTop) => ipcRenderer.send('mini-mode:enter', alwaysOnTop),
    exit: () => ipcRenderer.send('mini-mode:exit'),
    rendererReady: () => ipcRenderer.send('mini-mode:renderer-ready'),
    setAlwaysOnTop: (enabled) => ipcRenderer.send('mini-mode:set-always-on-top', enabled),
    resize: (height) => ipcRenderer.send('mini-mode:resize', height),
    onStateChange: (cb) => {
      const handler = (_e, isMini) => cb(isMini);
      ipcRenderer.on('mini-mode:state-change', handler);
      return () => ipcRenderer.removeListener('mini-mode:state-change', handler);
    },
  },
  playback: {
    // ── publishState: structured-clone-safe IPC ──
    // ipcRenderer.send() uses structured clone which fails on Vue proxies / non-plain refs.
    // On first failure, switch to JSON round-trip sanitised path and cache the flag.
    publishState: (() => {
      let _needsSanitize = false;
      return (snapshot) => {
        if (_needsSanitize) {
          try { ipcRenderer.send('playback:publish-state', JSON.parse(JSON.stringify(snapshot))); } catch {}
          return;
        }
        try {
          ipcRenderer.send('playback:publish-state', snapshot);
        } catch {
          _needsSanitize = true;
          console.warn('[preload] publishState structured-clone failed, falling back to JSON sanitise');
          try { ipcRenderer.send('playback:publish-state', JSON.parse(JSON.stringify(snapshot))); } catch {}
        }
      };
    })(),
    sendCommand: (command) => ipcRenderer.send('playback:command', command),
    getInitialSnapshot: () => ipcRenderer.invoke('playback:get-initial-snapshot'),
    onState: (cb) => {
      const handler = (_e, snapshot) => cb(snapshot);
      ipcRenderer.on('playback:state', handler);
      return () => ipcRenderer.removeListener('playback:state', handler);
    },
    onCommand: (cb) => {
      const handler = (_e, command) => cb(command);
      ipcRenderer.on('playback:command', handler);
      return () => ipcRenderer.removeListener('playback:command', handler);
    },
  },
  window: {
    setBackgroundColor: (color) => ipcRenderer.send('window:set-background-color', color),
  },
});

// ── 本地音乐 IPC ──
contextBridge.exposeInMainWorld('localApi', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  scan: (dirPath) => ipcRenderer.invoke('local:scan', dirPath),
  search: (query) => ipcRenderer.invoke('local:search', query),
  getAll: () => ipcRenderer.invoke('local:get-all'),
  trackCount: () => ipcRenderer.invoke('local:track-count'),
  openFolder: (folderPath) => ipcRenderer.invoke('local:open-folder', folderPath),
  listScanDirs: () => ipcRenderer.invoke('local:list-scan-dirs'),
  saveScanDir: (dirPath) => ipcRenderer.invoke('local:save-scan-dir', dirPath),
  removeScanDir: (dirPath) => ipcRenderer.invoke('local:remove-scan-dir', dirPath),
  getLyric: (filePath) => ipcRenderer.invoke('local:get-lyric', filePath),
  getLyricMatch: (localTrackId, localPath) => ipcRenderer.invoke('local:get-lyric-match', localTrackId, localPath),
  saveLyricMatch: (payload) => ipcRenderer.invoke('local:save-lyric-match', payload),
  removeLyricMatch: (localTrackId, localPath) => ipcRenderer.invoke('local:remove-lyric-match', localTrackId, localPath),
  previewMetadataWrite: (payload) => ipcRenderer.invoke('local:metadata-preview', payload),
  writeMetadata: (payload) => ipcRenderer.invoke('local:metadata-write-one', payload),
  revertMetadata: (payload) => ipcRenderer.invoke('local:metadata-revert-one', payload),
  getMetadataStatus: (payload) => ipcRenderer.invoke('local:metadata-status', payload),
  getMetadataStatusBatch: (payload) => ipcRenderer.invoke('local:metadata-status-batch', payload),
  getCover: (filePath) => ipcRenderer.invoke('local:get-cover', filePath),
  getCoversBatch: (filePaths) => ipcRenderer.invoke('local:get-covers-batch', filePaths),
  readFile: (filePath) => ipcRenderer.invoke('local:read-file', filePath),
  computeFileMd5: (filePath) => ipcRenderer.invoke('local:compute-file-md5', filePath),
  onScanProgress: (cb) => {
    ipcRenderer.on('local:scan-progress', (_e, data) => cb(data));
  },
  removeScanListeners: () => {
    ipcRenderer.removeAllListeners('local:scan-progress');
  },

  // ── 本地歌单 API ──
  createPlaylist: (name, description) => ipcRenderer.invoke('local:playlist-create', name, description),
  listPlaylists: () => ipcRenderer.invoke('local:playlist-list'),
  getPlaylist: (id) => ipcRenderer.invoke('local:playlist-get', id),
  getPlaylistCoverPaths: () => ipcRenderer.invoke('local:playlist-cover-paths'),
  savePlaylistMosaic: (id, dataUrl) => ipcRenderer.invoke('local:playlist-save-mosaic', id, dataUrl),
  deletePlaylist: (id) => ipcRenderer.invoke('local:playlist-delete', id),
  renamePlaylist: (id, name) => ipcRenderer.invoke('local:playlist-rename', id, name),
  updatePlaylist: (id, updates) => ipcRenderer.invoke('local:playlist-update', id, updates),
  addTrackToPlaylist: (playlistId, trackId) => ipcRenderer.invoke('local:playlist-add-track', playlistId, trackId),
  removeTrackFromPlaylist: (playlistId, trackId) => ipcRenderer.invoke('local:playlist-remove-track', playlistId, trackId),
  getPlaylistTracks: (playlistId) => ipcRenderer.invoke('local:playlist-tracks', playlistId),

  deleteTracksByDirectory: (dirPath) => ipcRenderer.invoke('local:remove-tracks-by-dir', dirPath),
  removeTracks: (paths) => ipcRenderer.invoke('local:remove-tracks', paths),
  clearAllData: () => ipcRenderer.invoke('local:clear-all'),

  // ── 本地歌曲统计 ──
  getRecent: (limit) => ipcRenderer.invoke('local:get-recent', limit),
  getStats: () => ipcRenderer.invoke('local:get-stats'),
});

// ── 窗口控制：通过主进程 page-title-updated 事件实现 ──
// 最小化/最大化通过 document.title 触发 page-title-updated 事件
// 关闭使用原生 window.close()（Electron 会将其转为 BrowserWindow.close()）

// 主进程广播最大化状态 → data-win-maximized 渲染进程通过 MutationObserver 获取
ipcRenderer.on('win-state-change', (_event, maximized) => {
  if (maximized) {
    document.documentElement.dataset.winMaximized = '';
  } else {
    delete document.documentElement.dataset.winMaximized;
  }
});

ipcRenderer.on('win-fullscreen-change', (_event, fullscreen) => {
  if (fullscreen) {
    document.documentElement.dataset.winFullscreen = '';
  } else {
    delete document.documentElement.dataset.winFullscreen;
  }
});

// ── 系统托盘动作 → 自定义 DOM 事件 ──
// 渲染进程通过 document.addEventListener('tray-action', handler) 监听
ipcRenderer.on('tray:play-pause', () => {
  document.dispatchEvent(new CustomEvent('tray-action', { detail: 'togglePlay' }));
});
ipcRenderer.on('tray:next', () => {
  document.dispatchEvent(new CustomEvent('tray-action', { detail: 'next' }));
});
ipcRenderer.on('tray:prev', () => {
  document.dispatchEvent(new CustomEvent('tray-action', { detail: 'prev' }));
});
// Generic tray action dispatcher (toggleLike, openSettings, toggleDesktopLyric, mode changes, etc.)
ipcRenderer.on('tray-action', (_event, action) => {
  document.dispatchEvent(new CustomEvent('tray-action', { detail: action }));
});

// ── 迷你模式状态变更 → 自定义 DOM 事件 ──
ipcRenderer.on('mini-mode:state-change', (_event, isMini) => {
  document.dispatchEvent(new CustomEvent('mini-mode-state', { detail: isMini, bubbles: true }));
});

// 标记桌面端及平台，供 CSS 选择器控制平台专属 UI 显隐
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('resound-desktop');
  document.documentElement.dataset.platform = process.platform;
});
