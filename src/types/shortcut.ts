/**
 * 快捷键设置系统类型定义
 *
 * ShortcutCombo 使用平台无关的存储格式（{key, modifiers}），
 * 主进程和渲染进程各自转换为 Electron accelerator 或展示文本。
 */

/** 运行平台 */
export type PlatformType = 'darwin' | 'win32'

/** 修饰键 */
export type ModifierKey = 'meta' | 'ctrl' | 'alt' | 'shift'

/** 快捷键动作 ID — 对应 8 个固定功能 */
export type ShortcutActionId =
  | 'playPause'
  | 'prevTrack'
  | 'nextTrack'
  | 'volumeUp'
  | 'volumeDown'
  | 'likeSong'
  | 'toggleLyrics'
  | 'toggleMiniMode'

/** 平台无关的快捷键组合存储格式 */
export interface ShortcutCombo {
  /** 按键名：Space / Left / Right / Up / Down / A-Z / F1-F24 */
  key: string
  modifiers: ModifierKey[]
}

/** 单条快捷键项，不含平台默认值（默认值由工具函数实时计算） */
export interface ShortcutItem {
  id: ShortcutActionId
  /** 中文功能名称，如 "播放/暂停" */
  name: string
  /** 应用内快捷键（用户自定义，可能为 null） */
  appShortcut: ShortcutCombo | null
  /** 全局快捷键（用户自定义，可能为 null） */
  globalShortcut: ShortcutCombo | null
}

/** 完整配置快照 — 单行存入 sqlite */
export interface ShortcutConfig {
  shortcuts: ShortcutItem[]
  /** 启用全局快捷键总开关 */
  globalEnabled: boolean
  /** 启用系统媒体快捷键（物理键盘媒体键） */
  mediaKeysEnabled: boolean
}

/** 动作中文名映射 */
export const SHORTCUT_ACTION_NAMES: Record<ShortcutActionId, string> = {
  playPause: '播放/暂停',
  prevTrack: '上一首',
  nextTrack: '下一首',
  volumeUp: '音量加',
  volumeDown: '音量减',
  likeSong: '喜欢歌曲',
  toggleLyrics: '打开/关闭歌词',
  toggleMiniMode: 'mini/完整模式',
}

/** 动作固定顺序（表格行顺序） */
export const SHORTCUT_ACTION_ORDER: ShortcutActionId[] = [
  'playPause',
  'prevTrack',
  'nextTrack',
  'volumeUp',
  'volumeDown',
  'likeSong',
  'toggleLyrics',
  'toggleMiniMode',
]
