const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widgetEnv', {
  shadow: {
    onSnapStage: (cb) => {
      const handler = (_e, stage) => { console.log('[shadow-preload] snap-stage received:', stage); cb(stage); };
      ipcRenderer.on('taskbar-widget:shadow-snap-stage', handler); console.log('[shadow-preload] snap-stage listener registered');
      return () => ipcRenderer.removeListener('taskbar-widget:shadow-snap-stage', handler);
    },
    onThemeChanged: (cb) => {
      const handler = (_e, isDark) => cb(isDark);
      ipcRenderer.on('taskbar-widget:theme-changed', handler);
      return () => ipcRenderer.removeListener('taskbar-widget:theme-changed', handler);
    },
    rendererReady: () => ipcRenderer.send('taskbar-widget:renderer-ready', 'shadow'),
    debugLog: (message, payload) => ipcRenderer.send('taskbar-widget:renderer-log', {
      role: 'shadow', message, payload,
    }),
  },
});

document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.platform = process.platform;
  document.documentElement.dataset.windowRole = 'taskbarWidgetShadow';
});