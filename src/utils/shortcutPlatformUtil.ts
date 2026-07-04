/**
 * 双平台快捷键符号格式化工具函数
 *
 * 所有快捷键组合统一使用 ShortcutCombo 平台无关存储格式，
 * 展示时根据平台映射为符号（macOS）或文本（Windows）。
 */

import type { ModifierKey, PlatformType, ShortcutActionId, ShortcutCombo, ShortcutItem } from '../types/shortcut'

// ── 修饰键展示映射 ──

/** macOS 修饰符符号 */
const MACOS_MODIFIER: Record<ModifierKey, string> = {
  meta: '⌘',
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧',
}

/** Windows 修饰符文本 */
const WINDOWS_MODIFIER: Record<ModifierKey, string> = {
  meta: 'Win',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
}

/** Electron accelerator 修饰符名 */
const ACCELERATOR_MODIFIER: Record<ModifierKey, string> = {
  meta: 'Command',
  ctrl: 'Control',
  alt: 'Alt',
  shift: 'Shift',
}

// ── 按键名展示映射 ──

/** 底层键名 → UI 展示文本 */
const KEY_DISPLAY: Record<string, { mac: string; win: string }> = {
  // 标点符号
  Backquote: { mac: '\`', win: '\`' },
  Minus: { mac: '-', win: '-' },
  Equal: { mac: '=', win: '=' },
  BracketLeft: { mac: '[', win: '[' },
  BracketRight: { mac: ']', win: ']' },
  Backslash: { mac: '\\', win: '\\' },
  Semicolon: { mac: ';', win: ';' },
  Quote: { mac: "'", win: "'" },
  Comma: { mac: ',', win: ',' },
  Period: { mac: '.', win: '.' },
  Slash: { mac: '/', win: '/' },
  Plus: { mac: '+', win: '+' },

  // 控制键
  Space: { mac: '空格', win: '空格' },
  Tab: { mac: 'Tab', win: 'Tab' },
  Capslock: { mac: 'CapsLock', win: 'CapsLock' },
  Backspace: { mac: '退格', win: 'Backspace' },
  Return: { mac: 'Enter', win: 'Enter' },
  Enter: { mac: 'Enter', win: 'Enter' },
  Escape: { mac: 'Esc', win: 'Esc' },
  Delete: { mac: 'Delete', win: 'Delete' },
  Insert: { mac: 'Insert', win: 'Insert' },

  // 方向键
  Left: { mac: '←', win: '←' },
  Right: { mac: '→', win: '→' },
  Up: { mac: '↑', win: '↑' },
  Down: { mac: '↓', win: '↓' },
  Home: { mac: 'Home', win: 'Home' },
  End: { mac: 'End', win: 'End' },
  PageUp: { mac: 'PgUp', win: 'PgUp' },
  PageDown: { mac: 'PgDn', win: 'PgDn' },

  // 小键盘
  Num0: { mac: '0', win: '0' },
  Num1: { mac: '1', win: '1' },
  Num2: { mac: '2', win: '2' },
  Num3: { mac: '3', win: '3' },
  Num4: { mac: '4', win: '4' },
  Num5: { mac: '5', win: '5' },
  Num6: { mac: '6', win: '6' },
  Num7: { mac: '7', win: '7' },
  Num8: { mac: '8', win: '8' },
  Num9: { mac: '9', win: '9' },
  NumDec: { mac: '.', win: '.' },
  NumAdd: { mac: '+', win: '+' },
  NumSub: { mac: '-', win: '-' },
  NumMult: { mac: '*', win: '*' },
  NumDiv: { mac: '/', win: '/' },
  NumEnter: { mac: 'NumEnter', win: 'NumEnter' },

  // 多媒体
  VolumeUp: { mac: '音量+', win: 'VolumeUp' },
  VolumeDown: { mac: '音量-', win: 'VolumeDown' },
  VolumeMute: { mac: '静音', win: 'VolumeMute' },
  MediaPlayPause: { mac: '播放/暂停', win: 'MediaPlayPause' },
  MediaNextTrack: { mac: '下一曲', win: 'MediaNextTrack' },
  MediaPreviousTrack: { mac: '上一曲', win: 'MediaPreviousTrack' },
  MediaStop: { mac: '停止', win: 'MediaStop' },

  // 系统键
  PrintScreen: { mac: 'PrtSc', win: 'PrtSc' },
  PauseBreak: { mac: 'Pause', win: 'Pause' },
}

/** 中文界面专用按键映射（覆盖英文标点为中文标点） */
const KEY_DISPLAY_CN: Record<string, string> = {
  Comma: '，',
  Period: '。',
  Slash: '、',
}

/**
 * 按键展示顺序（修饰符顺序）：alt → meta/ctrl → shift
 * 与需求文档中的默认快捷键展示顺序一致。
 */
const MODIFIER_DISPLAY_ORDER: ModifierKey[] = ['alt', 'meta', 'ctrl', 'shift']

/** Electron accelerator 修饰符注册顺序 */
const ACCELERATOR_MODIFIER_ORDER: ModifierKey[] = ['alt', 'meta', 'ctrl', 'shift']

/**
 * event.code / ShortcutCombo.key → Electron accelerator 键名映射
 * 对标点/符号键使用 Electron 可接受的 accelerator 格式。
 */
const ELECTRON_KEY_MAP: Record<string, string> = {
  Backquote: '\`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
}

// ── 格式化函数 ──

/**
 * 将快捷键组合格式化为当前平台展示文本。
 * macOS 使用符号（⌘⌃⌥⇧），Windows 使用文本（Ctrl Alt Shift）。
 * null 组合返回 '-'。
 */
export function formatShortcut(combo: ShortcutCombo | null, platform: PlatformType, useCn = false): string {
  if (!combo) return '-'

  const modifierMap = platform === 'darwin' ? MACOS_MODIFIER : WINDOWS_MODIFIER
  const displayKey = KEY_DISPLAY[combo.key]
  // 中文界面标点覆盖
  const cnLabel = useCn ? KEY_DISPLAY_CN[combo.key] : undefined
  const keyLabel = cnLabel ?? (displayKey ? displayKey[platform === 'darwin' ? 'mac' : 'win'] : combo.key)

  const modTexts = MODIFIER_DISPLAY_ORDER
    .filter((m) => combo.modifiers.includes(m))
    .map((m) => modifierMap[m])

  // macOS 修饰符间无空格，Windows 修饰符间加空格
  if (platform === 'darwin') {
    return [...modTexts, keyLabel].join('')
  }
  return [...modTexts, keyLabel].join(' ')
}

/**
 * 将快捷键组合转换为 Electron globalShortcut.register 可接受的 accelerator 字符串。
 * macOS 用 Command，Windows 用 Control。
 */
export function toElectronAccelerator(combo: ShortcutCombo, platform: PlatformType): string {
  let accelKey = combo.key
  // 标点符号键 → Electron 可接受的 accelerator 键名
  if (ELECTRON_KEY_MAP[accelKey]) {
    accelKey = ELECTRON_KEY_MAP[accelKey]
  } else if (accelKey === 'Space') {
    accelKey = 'Space'
  } else if (/^[A-Z]$/.test(accelKey) || /^\d$/.test(accelKey) || /^F\d{1,2}$/.test(accelKey)) {
    // keep as is (letters, numbers, function keys)
  }

  const parts = ACCELERATOR_MODIFIER_ORDER
    .filter((m) => combo.modifiers.includes(m))
    .map((m) => ACCELERATOR_MODIFIER[m])

  return [...parts, accelKey].join('+')
}

// ── 平台默认快捷键 ──

/**
 * 根据平台返回 8 条快捷键的默认配置。
 * macOS 用 meta 修饰符（⌘），Windows 用 ctrl 修饰符。
 */
export function getDefaultShortcuts(platform: PlatformType): ShortcutItem[] {
  const m: ModifierKey = platform === 'darwin' ? 'meta' : 'ctrl'

  // macOS 全局快捷键使用 alt+meta，Windows 全局使用 alt+ctrl
  const gm: ModifierKey[] = platform === 'darwin' ? ['alt', 'meta'] : ['alt', 'ctrl']

  return [
    {
      id: 'playPause',
      name: '播放/暂停',
      appShortcut: { key: 'Space', modifiers: [] },
      globalShortcut: { key: platform === 'darwin' ? 'P' : 'Space', modifiers: gm },
    },
    {
      id: 'prevTrack',
      name: '上一首',
      appShortcut: { key: 'Left', modifiers: [m] },
      globalShortcut: { key: 'Left', modifiers: gm },
    },
    {
      id: 'nextTrack',
      name: '下一首',
      appShortcut: { key: 'Right', modifiers: [m] },
      globalShortcut: { key: 'Right', modifiers: gm },
    },
    {
      id: 'volumeUp',
      name: '音量加',
      appShortcut: { key: 'Up', modifiers: [m] },
      globalShortcut: { key: 'Up', modifiers: gm },
    },
    {
      id: 'volumeDown',
      name: '音量减',
      appShortcut: { key: 'Down', modifiers: [m] },
      globalShortcut: { key: 'Down', modifiers: gm },
    },
    {
      id: 'likeSong',
      name: '喜欢歌曲',
      appShortcut: { key: 'L', modifiers: [m] },
      globalShortcut: { key: 'L', modifiers: gm },
    },
    {
      id: 'toggleLyrics',
      name: '打开/关闭歌词',
      appShortcut: { key: 'R', modifiers: [m] },
      globalShortcut: { key: 'R', modifiers: gm },
    },
    {
      id: 'toggleMiniMode',
      name: 'mini/完整模式',
      appShortcut: (platform === 'darwin')
        ? { key: 'M', modifiers: ['ctrl', 'meta'] }
        : { key: 'M', modifiers: ['ctrl', 'shift'] as ModifierKey[] },
      globalShortcut: null,
    },
  ]
}

// ── 按键标准化 ──

/**
 * 将 KeyboardEvent 的 code 值转换为 ShortcutCombo.key 存储格式。
 *
 * 使用 event.code 而非 event.key，因为 code 与键盘布局无关，
 * 跨平台行为一致（例如：Qwerty 和 Azerty 布局下，物理按键位置固定）。
 *
 * 输入示例：'Space' → 'Space', 'KeyL' → 'L', 'ArrowLeft' → 'Left'
 */
export function normalizeKey(eventCode: string): string {
  // ArrowLeft/Right/Up/Down → Left/Right/Up/Down
  if (eventCode.startsWith('Arrow')) {
    return eventCode.slice(5) // 'Left', 'Right', 'Up', 'Down'
  }

  // KeyA-KeyZ → A-Z
  if (eventCode.startsWith('Key') && eventCode.length === 4) {
    return eventCode[3].toUpperCase()
  }

  // Digit0-Digit9 → 0-9
  if (eventCode.startsWith('Digit') && eventCode.length === 6) {
    return eventCode[5]
  }

  // Space, F1-F24 — 直接保留
  return eventCode
}

/**
 * 从 event.code + 修饰键构造 ShortcutCombo。
 * 用于 ShortcutInput 录制时捕获原始按键。
 */
export function eventToShortcutCombo(code: string, altKey: boolean, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean): ShortcutCombo {
  const modifiers: ModifierKey[] = []
  if (altKey) modifiers.push('alt')
  if (ctrlKey) modifiers.push('ctrl')
  if (metaKey) modifiers.push('meta')
  if (shiftKey) modifiers.push('shift')

  return {
    key: normalizeKey(code),
    modifiers,
  }
}
