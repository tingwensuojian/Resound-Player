const { contextBridge, ipcRenderer } = require('electron');

const portsArg = process.argv.find((s) => s.startsWith('--service-ports='));
let ports = { api: 38761, unblockProxy: 38762, unblockMatch: 38763 };
if (portsArg) {
  try { ports = { ...ports, ...JSON.parse(portsArg.split('=')[1]) }; } catch {}
}

contextBridge.exposeInMainWorld('widgetEnv', {
  apiBaseUrl: `http://127.0.0.1:${ports.api}`,
  platform: process.platform,

  playback: {
    getInitialSnapshot: () => ipcRenderer.invoke('taskbar-widget:get-initial-snapshot'),
    onState: (cb) => {
      const handler = (_e, snap) => cb(snap);
      ipcRenderer.on('playback:state', handler);
      return () => ipcRenderer.removeListener('playback:state', handler);
    },
  },

  widget: {
    getConfig: () => ipcRenderer.invoke('taskbar-widget:get-config'),
    setConfig: (cfg) => ipcRenderer.invoke('taskbar-widget:set-config', cfg),
    sendCommand: (cmd) => ipcRenderer.send('taskbar-widget:playback-command', cmd),
    startDrag: () => { try { ipcRenderer.send('taskbar-widget:begin-track-drag'); } catch(e) {} }, // SodaMusic: -webkit-app-region: drag handles it natively
    rendererReady: () => ipcRenderer.send('taskbar-widget:renderer-ready', 'widget'),
    debugLog: (message, payload) => ipcRenderer.send('taskbar-widget:renderer-log', {
      role: 'widget', message, payload,
    }),

    // Theme changes
    onThemeChanged: (cb) => {
      const handler = (_e, isDark) => cb(isDark);
      ipcRenderer.on('taskbar-widget:theme-changed', handler);
      return () => ipcRenderer.removeListener('taskbar-widget:theme-changed', handler);
    },

    // Config changes
    onConfigChanged: (cb) => {
      const handler = (_e, cfg) => cb(cfg);
      ipcRenderer.on('taskbar-widget:config-changed', handler);
      return () => ipcRenderer.removeListener('taskbar-widget:config-changed', handler);
    },

    // Hover state from native addon (via C++ HoverHelper -> main process -> IPC)
    onHoverChanged: (cb) => {
      const handler = (_e, isHovering) => cb(isHovering);
      ipcRenderer.on('taskbar-widget:hover-changed', handler);
      return () => ipcRenderer.removeListener('taskbar-widget:hover-changed', handler);
    },

    // Drag region state
    onDragRegionChanged: (cb) => {
      const handler = (_e, inDragRegion) => cb(inDragRegion);
      ipcRenderer.on('taskbar-widget:drag-region-changed', handler);
      return () => ipcRenderer.removeListener('taskbar-widget:drag-region-changed', handler);
    },
  },
});

document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('resound-desktop');
  document.documentElement.dataset.platform = process.platform;
  document.documentElement.dataset.windowRole = 'taskbarWidget';
});


