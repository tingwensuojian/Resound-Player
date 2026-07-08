# 任务栏播控稳定性修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复任务栏播控在使用过程中突然消失的问题，添加崩溃恢复机制。

**Architecture:** 在 `electron/main.js` 中为 Widget 和 Shadow BrowserWindow 添加崩溃/错误监听器，添加自动重建逻辑，修复状态清理遗漏，添加 `loadURL` 错误处理。

**Tech Stack:** Electron BrowserWindow, IPC, Node.js

---

## File Structure

| 文件 | 职责 |
|------|------|
| `electron/main.js` | 主进程：Widget 窗口管理、崩溃恢复、状态清理 |

仅修改 `electron/main.js` 一个文件，所有修复集中在任务栏播控相关代码段。

---

## Task 1: 添加 `unhandledRejection` 处理器

**Covers:** 防止异步错误导致主进程崩溃

**Files:**
- Modify: `electron/main.js:83-87`

- [ ] **Step 1: 在 `uncaughtException` 处理器之后添加 `unhandledRejection` 处理器**

在 `electron/main.js` 第 87 行（`uncaughtException` 处理器闭合大括号之后）添加：

```javascript
process.on('unhandledRejection', (reason) => {
  writeMainLog('[unhandledRejection]', reason);
  console.error('[unhandledRejection]', reason);
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "fix: add unhandledRejection handler to prevent main process crash"
```

---

## Task 2: 添加 Widget BrowserWindow 崩溃/错误监听

**Covers:** 检测 Widget 渲染进程崩溃并触发恢复

**Files:**
- Modify: `electron/main.js:1146-1193` (`createTaskbarWidgetWin` 函数)

- [ ] **Step 1: 在 `createTaskbarWidgetWin` 中添加崩溃监听器**

在 `taskbarWidgetWin.on('closed', ...)` 之前（约第 1189 行）添加：

```javascript
  // ── 崩溃/错误监听：渲染进程死亡时自动重建 ──
  taskbarWidgetWin.webContents.on('render-process-gone', (_event, details) => {
    console.error('[taskbar-widget] render process gone:', details.reason, details.exitCode);
    writeMainLog('[taskbar-widget] render-process-gone', details.reason, details.exitCode);
    taskbarWidgetWin = null;
    _widgetIsDragging = false;
    _widgetSnapping = false;
    hideShadow();
    // 延迟重建，避免快速循环崩溃
    setTimeout(() => {
      if (taskbarWidgetConfig.enabled) createTaskbarWidgetWin();
    }, 1000);
  });

  taskbarWidgetWin.on('unresponsive', () => {
    console.warn('[taskbar-widget] window unresponsive, reloading');
    writeMainLog('[taskbar-widget] unresponsive');
    try { taskbarWidgetWin.reload(); } catch {}
  });
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "fix: add crash/error handlers on taskbar widget BrowserWindow"
```

---

## Task 3: 添加 Shadow BrowserWindow 崩溃监听

**Covers:** Shadow 窗口崩溃时不阻塞主流程

**Files:**
- Modify: `electron/main.js:1078-1091` (`ensureShadowWin` 函数内)

- [ ] **Step 1: 在 Shadow 窗口创建后添加 `render-process-gone` 监听**

在 `taskbarWidgetShadowWin.on('closed', ...)` 之前（约第 1090 行）添加：

```javascript
    taskbarWidgetShadowWin.webContents.on('render-process-gone', () => {
      console.warn('[taskbar-widget-shadow] render process gone');
      taskbarWidgetShadowWin = null;
    });
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "fix: add crash handler on taskbar widget shadow window"
```

---

## Task 4: 添加 `loadURL` 错误处理

**Covers:** 加载失败时有明确日志而非静默失败

**Files:**
- Modify: `electron/main.js:1162-1163`

- [ ] **Step 1: 为 `taskbarWidgetWin.loadURL` 添加 `.catch()`**

将：

```javascript
  taskbarWidgetWin.loadURL(url);
```

替换为：

```javascript
  taskbarWidgetWin.loadURL(url).catch((err) => {
    console.error('[taskbar-widget] loadURL failed:', err.message);
    writeMainLog('[taskbar-widget] loadURL failed', err.message);
  });
```

- [ ] **Step 2: 为 Shadow 窗口的 `loadURL` 也添加 `.catch()`**

将 `ensureShadowWin` 中的：

```javascript
    taskbarWidgetShadowWin.loadURL(shadowUrl);
```

替换为：

```javascript
    taskbarWidgetShadowWin.loadURL(shadowUrl).catch((err) => {
      console.error('[taskbar-widget-shadow] loadURL failed:', err.message);
    });
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.js
git commit -m "fix: add loadURL error handling for taskbar widget windows"
```

---

## Task 5: 修复 `onWidgetDragEnd` 提前返回时的状态清理

**Covers:** 窗口销毁时清理残留的 shadow 和 snap 状态

**Files:**
- Modify: `electron/main.js:1123-1143` (`onWidgetDragEnd` 函数)

- [ ] **Step 1: 在 `onWidgetDragEnd` 的两个提前 return 处添加清理**

将：

```javascript
function onWidgetDragEnd(x, y) {
  if (!_widgetIsDragging) return;
  _widgetIsDragging = false;
  stopDragPoll();
  if (!taskbarWidgetWin || taskbarWidgetWin.isDestroyed()) return;
```

替换为：

```javascript
function onWidgetDragEnd(x, y) {
  if (!_widgetIsDragging) return;
  _widgetIsDragging = false;
  stopDragPoll();
  if (!taskbarWidgetWin || taskbarWidgetWin.isDestroyed()) {
    // 窗口已销毁：清理残留状态
    _widgetSnapping = false;
    hideShadow();
    _widgetSnapStage = 'none';
    return;
  }
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "fix: clean up shadow/snap state when widget window destroyed mid-drag"
```

---

## Task 6: 修复 `_widgetSnapping` 超时在窗口销毁后的安全问题

**Covers:** 防止 `_widgetSnapping` 超时回调在窗口已销毁后执行无效操作

**Files:**
- Modify: `electron/main.js:1131-1134`

- [ ] **Step 1: 在 `_widgetSnapping` 超时回调中添加窗口存活检查**

将：

```javascript
    _widgetSnapping = true;
    taskbarWidgetWin.setPosition(pos.x, pos.y);
    setTimeout(() => { _widgetSnapping = false; }, 300);
```

替换为：

```javascript
    _widgetSnapping = true;
    taskbarWidgetWin.setPosition(pos.x, pos.y);
    setTimeout(() => {
      _widgetSnapping = false;
      // 如果窗口在吸附期间被销毁，清理残留状态
      if (!taskbarWidgetWin || taskbarWidgetWin.isDestroyed()) {
        hideShadow();
        _widgetSnapStage = 'none';
      }
    }, 300);
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "fix: safe-guard _widgetSnapping timeout against destroyed window"
```

---

## Task 7: 添加 `taskbar-widget:dock` 的 try/catch 保护

**Covers:** 防止 `webContents.send` 在窗口过渡状态时抛出异常

**Files:**
- Modify: `electron/main.js` 中的 `taskbar-widget:dock` IPC handler

- [ ] **Step 1: 为 `webContents.send` 添加 try/catch**

找到 `ipcMain.on('taskbar-widget:dock', ...)` 中的：

```javascript
    taskbarWidgetWin.webContents.send('taskbar-widget:config-changed', { ...taskbarWidgetConfig });
```

替换为：

```javascript
    try { taskbarWidgetWin.webContents.send('taskbar-widget:config-changed', { ...taskbarWidgetConfig }); } catch {}
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "fix: wrap webContents.send in try/catch for dock IPC handler"
```

---

## Task 8: 添加 `taskbar-widget:move` IPC 处理器

**Covers:** 渲染进程 JS 拖拽路径的增量移动

**Files:**
- Modify: `electron/main.js` — 在 `taskbar-widget:dock` IPC handler 附近添加

- [ ] **Step 1: 添加 `taskbar-widget:move` IPC 处理器**

在 `ipcMain.on('taskbar-widget:dock', ...)` 之前添加：

```javascript
ipcMain.on('taskbar-widget:move', (_event, delta) => {
  if (!taskbarWidgetWin || taskbarWidgetWin.isDestroyed()) return;
  if (_widgetSnapping) return;
  const bounds = taskbarWidgetWin.getBounds();
  const newX = bounds.x + (delta.dx || 0);
  const newY = bounds.y + (delta.dy || 0);
  taskbarWidgetWin.setPosition(newX, newY);
  if (!_widgetIsDragging) onWidgetDragStart();
  if (_widgetIsDragging) onWidgetDragMove(newX, newY);
});
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.js
git commit -m "fix: add missing taskbar-widget:move IPC handler for JS drag path"
```

---

## Verification

- [ ] 启动开发模式 `npm run dev`，确认 Widget 正常显示
- [ ] 在设置中启用/禁用任务栏播控，确认创建/销毁正常
- [ ] 拖拽 Widget 离开任务栏再放回，确认吸附提示和吸附正常
- [ ] 在 DevTools Console 中检查无 `[taskbar-widget]` 相关错误日志
