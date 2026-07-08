# 托盘右键菜单 IPC 修复说明

## 问题现象

Windows 托盘右键菜单的以下功能全部失效：

- 收藏（喜欢/取消喜欢）
- 播放模式切换（列表循环/单曲循环/随机播放）
- 上一首 / 播放暂停 / 下一首

主进程终端日志显示菜单点击事件正常触发（`[tray] MENU CLICK: xxx`），但 DevTools Console 中无任何 `[preload]` 或 `[playerbar]` 相关日志输出，说明 IPC 消息从未到达渲染进程。

## 根因分析

### 根因 1：暂时性死区（TDZ）缺陷

上一轮调试提交 `_add_more_logs.py` 在点击处理函数中写入了以下代码：

```js
click: () => {
  console.log("[tray] MENU CLICK: next | winId=", _w?.id ?? "null");
  const _w = getWin();
  if (_w) {
    _w.webContents.send("tray:next");
  }
}
```

箭头函数作用域内，`console.log` 访问了 `_w` 变量，但 `const _w = getWin()` 声明在其之后。根据 ES 规范，`const` 变量在其声明之前处于**暂时性死区（Temporal Dead Zone）**，任何对其的访问都会抛出 `ReferenceError`。

执行流程：
1. 用户点击菜单项，箭头函数执行
2. `console.log` 试图求值 `_w?.id` → `_w` 处于 TDZ → 抛出 `ReferenceError`
3. `const _w = getWin()` 和 `_w.webContents.send(...)` 从未执行
4. IPC 消息从未发出，preload 自然收不到

### 根因 2：单窗口查找不可靠

`buildTrayMenu` 中原有的 `getWin()` 实现：

```js
const getWin = () => {
  const all = BrowserWindow.getAllWindows();
  return all.find((w) => w && !w.isDestroyed()) || null;
};
```

此函数返回 `getAllWindows()` 中第一个非销毁窗口。Electron 中 `getAllWindows()` 返回的窗口顺序按创建时间排列，而当存在多个窗口（splash、桌面歌词窗口、迷你模式窗口等）时，返回的窗口可能不是主窗口。桌面歌词窗口使用独立的 `desktop-lyric-preload.js`，其中没有 `tray:*` IPC 监听器。

## 修复方案

仅修改 `electron/main.js` 中 `buildTrayMenu` 函数内部。

### 改动 1：添加广播辅助函数

用两个新函数替换原有的 `getWin()`：

- **`getWindow()`** — 查找第一个有效窗口，仅用于 `setTrayMenu()` 重建菜单
- **`trySend(channel, ...args)`** — **广播到所有非销毁窗口**，用于发送播放控制 IPC

```js
// 获取第一个有效窗口（用于重建菜单）
const getWindow = () => {
  const all = BrowserWindow.getAllWindows();
  return all.find((w) => w && !w.isDestroyed()) || null;
};
// 发送到所有非销毁窗口（广播），确保主窗口能收到
const trySend = (channel, ...args) => {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (w && !w.isDestroyed()) {
      try {
        w.webContents.send(channel, ...args);
      } catch {}
    }
  });
};
```

由于只有主窗口的 preload（`electron/preload.js`）注册了 `tray:*` 和 `tray-action` 通道的 IPC 监听器，广播到其他窗口（桌面歌词窗口、任务栏播控窗口等）的消息会被静默忽略，不会产生副作用。

### 改动 2：修复所有点击处理函数

所有 7 个菜单项的 click handler 全部改用 `trySend()`，消除 TDZ 缺陷：

| 菜单项 | 原代码 | 修复后 |
|--------|--------|--------|
| 喜欢/取消喜欢 | `getWin()?.webContents.send("tray-action", "toggleLike")` | `trySend("tray-action", "toggleLike")` |
| 播放模式 × 3 | `getWin()?.webContents.send("tray-action", "cycleMode")` 等 | `trySend("tray-action", "cycleMode")` 等 |
| 上一首 | `_w.webContents.send("tray:prev")` | `trySend("tray:prev")` |
| 播放/暂停 | `_w.webContents.send("tray:play-pause")` | `trySend("tray:play-pause")` |
| 下一首 | `_w.webContents.send("tray:next")` | `trySend("tray:next")` |

### 改动 3：清理

删除临时调试文件 `_add_debug_logs.py`、`_add_more_logs.py`、`_tray_check.py`。

## 通信链路验证

修复后的完整通信链路：

```
托盘菜单点击
  → trySend("tray:next")     // main.js: 广播到所有窗口
  → ipcRenderer.on("tray:next", () => {       // preload.js: 仅主窗口有监听器
      window.postMessage({source: "__tray__", action: "next"}, "*");
    })
  → window.addEventListener("message", (e) => {  // PlayerBar.vue
      if (e.data?.source !== "__tray__") return;
      playerStore.next();
    })
```

## 影响范围

- 修改文件：仅 `electron/main.js`
- 涉及函数：`buildTrayMenu`（约 20 行代码改动）
- 无新增依赖，无外部接口变更
- macOS 端无需额外适配（与 Windows 共用同一套 IPC 逻辑）

## 测试方法

1. 启动桌面开发模式：`npm run dev:desktop`
2. 右键托盘图标，依次测试各菜单项
3. 验证终端日志 `[tray] MENU CLICK: xxx` 出现
4. 验证 DevTools Console 中依次出现：
   - `[preload] INIT: script loaded, ipcRenderer available: true`
   - `[preload] tray:xxx -> postMessage`
   - `[playerbar] postMessage received: ...`
   - `[playerbar] tray action: ...`
5. 验证各功能实际生效（歌曲切换、播放暂停、收藏状态变化、播放模式切换）
