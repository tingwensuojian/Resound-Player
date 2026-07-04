# macOS 播放/暂停全局快捷键冲突说明

## 问题描述

macOS 上播放/暂停的默认全局快捷键为 Option+Cmd+Space（⌥⌘空格）。在某些 macOS 配置下，此组合键会被系统截获并触发访达搜索（Finder 搜索或聚焦搜索），导致 Electron 的 globalShortcut.register() 返回成功但按键仍被系统拦截。

## 受影响的范围

仅影响播放/暂停（playPause）的默认全局快捷键。其他快捷键（上一首/下一首/音量加/减等）使用的 Option+Cmd+箭头/L/R 不与系统快捷键冲突。

## 原因

- macOS 系统偏好设置 -> 键盘 -> 快捷键 中，Option+Cmd+Space 可能被配置为"显示访达搜索"或聚焦搜索
- Electron 的 globalShortcut 无法覆盖 macOS 系统级快捷键
- 即使 globalShortcut.register() 返回 true（注册成功），系统仍可能同时响应快捷键

## 解决方案

### 方案 1：修改 macOS 系统快捷键（推荐）

前往系统偏好设置 -> 键盘 -> 快捷键，找到"显示访达搜索"或类似条目，取消勾选或修改为其他组合键。

### 方案 2：修改应用内快捷键

在 Resound-Player 设置 -> 快捷键 tab 中，将播放/暂停的全局快捷键改为不与 macOS 冲突的组合键，例如：
- Option+Cmd+P（⌥⌘P）
- Option+Cmd+F5（⌥⌘F5）
- Option+Cmd+,（⌥⌘逗号）
- Option+Cmd+.（⌥⌘句号）

### 方案 3：使用应用内快捷键代替

应用内快捷键（空格键）在窗口聚焦时始终有效，不受系统快捷键影响。

## 已实施的修复

自 v1.2.1 起，macOS 默认全局快捷键已从 Option+Cmd+Space（⌥⌘空格）改为 Option+Cmd+P（⌥⌘P），避免与系统的 Finder 搜索冲突。已有配置的用户需要在设置页点击"恢复默认"或手动修改。

## 测试指引

1. 确保正在播放一首歌曲
2. 切换到其他应用（如浏览器）
3. 按 Option+Cmd+P
4. 预期：触发播放/暂停
5. 如果仍有问题：检查系统偏好设置中是否有其他快捷键占用 Option+Cmd+P
