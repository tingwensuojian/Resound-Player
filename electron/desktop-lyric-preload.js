const { contextBridge, ipcRenderer } = require('electron');

// 桌面歌词窗口专用 preload
contextBridge.exposeInMainWorld('desktopLyricWinApi', {
  sendAction: (action) => ipcRenderer.send('desktop-lyric:action', action),
  moveWindow: (dx, dy) => ipcRenderer.send('desktop-lyric:move-window', { dx, dy }),
  getBounds: () => ipcRenderer.invoke('desktop-lyric:get-bounds'),
  getVirtualScreenBounds: () => ipcRenderer.invoke('desktop-lyric:get-virtual-screen-bounds'),
  resize: (width, height) => ipcRenderer.send('desktop-lyric:resize', { width, height }),
  setHeight: (height) => ipcRenderer.send('desktop-lyric:set-height', { height }),
  toggleFixedSize: (width, height, fixed) => ipcRenderer.send('desktop-lyric:toggle-fixed-size', { width, height, fixed }),
});