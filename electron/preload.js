const { contextBridge, ipcRenderer } = require('electron');

// Parse the --service-ports argument injected by main.js
const portsArg = process.argv.find((s) => s.startsWith('--service-ports='));
let ports = { api: 38761, unblockProxy: 38762, unblockMatch: 38763 };
if (portsArg) {
  try {
    const parsed = JSON.parse(portsArg.split('=')[1]);
    ports = { ...ports, ...parsed };
  } catch {
    // fall back to defaults
  }
}

contextBridge.exposeInMainWorld('appEnv', {
  apiPort: ports.api,
  apiBaseUrl: `http://127.0.0.1:${ports.api}`,
  unblockProxyUrl: `http://127.0.0.1:${ports.unblockProxy}`,
  unblockMatchUrl: `http://127.0.0.1:${ports.unblockMatch}`,
  isDesktop: true,
  platform: process.platform,
  electronVersion: process.versions.electron,
  nodeVersion: process.versions.node,
  cacheApi: {
    getItem: () => ipcRenderer.invoke('cache:get'),
    setItem: (data) => ipcRenderer.invoke('cache:set', data),
    clear: () => ipcRenderer.invoke('cache:clear'),
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
});

// ── 本地音乐 IPC ──
contextBridge.exposeInMainWorld('localApi', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  scan: (dirPath) => ipcRenderer.invoke('local:scan', dirPath),
  search: (query) => ipcRenderer.invoke('local:search', query),
  getAll: () => ipcRenderer.invoke('local:get-all'),
  trackCount: () => ipcRenderer.invoke('local:track-count'),
  getLyric: (filePath) => ipcRenderer.invoke('local:get-lyric', filePath),
  getCover: (filePath) => ipcRenderer.invoke('local:get-cover', filePath),
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

// 标记桌面端，供 CSS 选择器控制平台专属 UI 显隐
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('resound-desktop');
});