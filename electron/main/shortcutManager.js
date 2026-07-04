/**
 * 跨平台全局快捷键管理器
 *
 * 职责：
 * 1. 使用 sql.js 持久化用户自定义快捷键配置
 * 2. 管理 Electron globalShortcut 注册/注销
 * 3. 管理物理键盘媒体键（MediaPlayPause/MediaNextTrack/MediaPreviousTrack）注册
 * 4. 向渲染进程分发快捷键动作（IPC 'shortcut:action'）
 *
 * 限制：
 * - 仅 Electron 主进程可用，Web 端无此模块
 * - MediaSession（操作系统媒体控制中心）是渲染进程 navigator API，不在本模块处理
 */

import path from 'path'
import fs from 'fs'
import { globalShortcut, ipcMain } from 'electron'
import initSqlJs from 'sql.js'
/**
 * Electron accelerator 修饰符名
 */
const ACCELERATOR_MODIFIER = {
  meta: 'Command',
  ctrl: 'Control',
  alt: 'Alt',
  shift: 'Shift',
}

const ACCELERATOR_MODIFIER_ORDER = ['alt', 'meta', 'ctrl', 'shift']

/**
 * 将 ShortcutCombo 转换为 Electron globalShortcut 可接受的 accelerator 字符串。
 */
function toElectronAccelerator(combo, platform) {
  let accelKey = combo.key
  const parts = ACCELERATOR_MODIFIER_ORDER
    .filter((m) => combo.modifiers.includes(m))
    .map((m) => ACCELERATOR_MODIFIER[m])
  return [...parts, accelKey].join('+')
}

/**
 * 根据平台返回 8 条快捷键的默认配置。
 */
function getDefaultShortcuts(platform) {
  const m = platform === 'darwin' ? 'meta' : 'ctrl'
  const gm = platform === 'darwin' ? ['alt', 'meta'] : ['alt', 'ctrl']

  return [
    {
      id: 'playPause', name: '播放/暂停',
      appShortcut: { key: 'Space', modifiers: [] },
      globalShortcut: { key: platform === 'darwin' ? 'P' : 'Space', modifiers: gm },
    },
    {
      id: 'prevTrack', name: '上一首',
      appShortcut: { key: 'Left', modifiers: [m] },
      globalShortcut: { key: 'Left', modifiers: gm },
    },
    {
      id: 'nextTrack', name: '下一首',
      appShortcut: { key: 'Right', modifiers: [m] },
      globalShortcut: { key: 'Right', modifiers: gm },
    },
    {
      id: 'volumeUp', name: '音量加',
      appShortcut: { key: 'Up', modifiers: [m] },
      globalShortcut: { key: 'Up', modifiers: gm },
    },
    {
      id: 'volumeDown', name: '音量减',
      appShortcut: { key: 'Down', modifiers: [m] },
      globalShortcut: { key: 'Down', modifiers: gm },
    },
    {
      id: 'likeSong', name: '喜欢歌曲',
      appShortcut: { key: 'L', modifiers: [m] },
      globalShortcut: { key: 'L', modifiers: gm },
    },
    {
      id: 'toggleLyrics', name: '打开/关闭歌词',
      appShortcut: { key: 'R', modifiers: [m] },
      globalShortcut: { key: 'R', modifiers: gm },
    },
    {
      id: 'toggleMiniMode', name: 'mini/完整模式',
      appShortcut: platform === 'darwin'
        ? { key: 'M', modifiers: ['ctrl', 'meta'] }
        : { key: 'M', modifiers: ['ctrl', 'shift'] },
      globalShortcut: null,
    },
  ]
}


const DB_FILENAME = 'shortcuts.sqlite'
const DB_ROW_KEY = 'v1'

const SCHEMA = `
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS shortcut_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`

/** 物理媒体键 → 动作 ID 映射 */
const MEDIA_KEY_MAP = {
  MediaPlayPause: 'playPause',
  MediaNextTrack: 'nextTrack',
  MediaPreviousTrack: 'prevTrack',
  MediaStop: 'playPause',
}

const MEDIA_KEY_NAMES = Object.keys(MEDIA_KEY_MAP)

class ShortcutManager {
  #db = null
  #dbPath = ''
  #config = null
  /** Map<actionId, fn> — 注册的 globalShortcut 注销函数 */
  #registry = new Map()
  /** 当前 BrowserWindow 引用，用于 IPC 动作分发 */
  #win = null
  #platform = process.platform

  // ── 生命周期 ──

  /**
   * 初始化 sql.js 数据库并加载用户配置。
   * 应在 app.whenReady() 后调用（需要 userData 路径）。
   */
  async init(userDataPath) {
    this.#dbPath = path.join(userDataPath, DB_FILENAME)

    const SQL = await initSqlJs({
      locateFile: (file) => path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file),
    })

    const dir = path.dirname(this.#dbPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    if (fs.existsSync(this.#dbPath)) {
      const buffer = fs.readFileSync(this.#dbPath)
      this.#db = new SQL.Database(buffer)
    } else {
      this.#db = new SQL.Database()
    }

    this.#db.run(SCHEMA)

    // 加载已保存的配置，不存在则返回 null
    const row = this.#db.exec(`SELECT value FROM shortcut_config WHERE key = '${DB_ROW_KEY}'`)
    if (row.length > 0 && row[0].values.length > 0) {
      try {
        const parsed = JSON.parse(row[0].values[0][0])
        this.#config = parsed
      } catch {
        this.#config = null
      }
    }

    // 无有效配置 → 用当前平台默认值
    if (!this.#config) {
      this.#config = {
        shortcuts: getDefaultShortcuts(this.#platform),
        globalEnabled: true,
        mediaKeysEnabled: true,
      }
      this.#persist()
    }

    // ── 注册 IPC Handlers ──
    this.#registerIpcHandlers()

    console.log('[shortcutManager] initialized, platform=' + this.#platform)
  }

  /**
   * 在 createMainWindow 成功后传入 BrowserWindow 引用，并注册全局快捷键。
   * 两步初始化确保 win 引用创建完毕后才注册 shortcut。
   */
  registerAll(win) {
    this.#win = win

    if (this.#config.globalEnabled) {
      this.#registerAllGlobals()
    }
    if (this.#config.mediaKeysEnabled) {
      this.#registerMediaKeys()
    }
  }

  /** 销毁管理器，用于应用退出前清理 */
  destroy() {
    this.#unregisterAllGlobals()
    this.#unregisterMediaKeys()
    if (this.#db) {
      this.#db.close()
      this.#db = null
    }
    this.#win = null
  }

  // ── SQLite 持久化 ──

  #persist() {
    if (!this.#db) return
    const value = JSON.stringify(this.#config)
    this.#db.run(`INSERT OR REPLACE INTO shortcut_config (key, value) VALUES ('${DB_ROW_KEY}', ?)`, [value])
    try {
      const data = this.#db.export()
      const tmpPath = this.#dbPath + '.tmp'
      fs.writeFileSync(tmpPath, Buffer.from(data))
      fs.renameSync(tmpPath, this.#dbPath)
    } catch (e) {
      console.error('[shortcutManager] persist failed:', e)
    }
  }

  // ── 动作分发 ──

  /**
   * 向渲染进程广播快捷键动作。
   * 窗口销毁后静默忽略。
   */
  sendAction(actionId) {
    if (!this.#win || this.#win.isDestroyed()) return
    this.#win.webContents.send('shortcut:action', actionId)
  }

  // ── GlobalShortcut 注册/注销 ──

  #registerAllGlobals() {
    if (!this.#config) return
    for (const item of this.#config.shortcuts) {
      if (item.globalShortcut) {
        this.#registerOne(item.id, item.globalShortcut)
      }
    }
  }

  #unregisterAllGlobals() {
    for (const [actionId] of this.#registry) {
      this.#unregisterOne(actionId)
    }
  }

  #registerOne(actionId, combo) {
    // 先从 Map 中清空旧的注册（防止重复注册）
    this.#unregisterOne(actionId)

    const accelerator = toElectronAccelerator(combo, this.#platform)
    if (!accelerator) return

    const registered = globalShortcut.register(accelerator, () => {
      this.sendAction(actionId)
    })

    if (registered) {
      this.#registry.set(actionId, () => {
        globalShortcut.unregister(accelerator)
      })
    } else {
      console.warn('[shortcutManager] globalShortcut register failed:', accelerator)
      return
    }
    console.log('[shortcutManager] registered:', accelerator, 'for', actionId)
  }

  #unregisterOne(actionId) {
    const unregister = this.#registry.get(actionId)
    if (unregister) {
      unregister()
      this.#registry.delete(actionId)
    }
  }

  /** 刷新所有全局快捷键（用户修改配置后） */
  refreshAll() {
    console.log('[shortcutManager] refreshAll called, globalEnabled=' + this.#config?.globalEnabled)
    this.#unregisterAllGlobals()
    if (this.#config.globalEnabled) {
      this.#registerAllGlobals()
    }
  }

  // ── 媒体物理键注册（独立于 globalEnabled 开关） ──

  #registerMediaKeys() {
    for (const keyName of MEDIA_KEY_NAMES) {
      try {
        const registered = globalShortcut.register(keyName, () => {
          this.sendAction(MEDIA_KEY_MAP[keyName])
        })
        if (registered) {
          this.#registry.set('__media__' + keyName, () => {
            globalShortcut.unregister(keyName)
          })
        }
      } catch (e) {
        // 某些平台可能不支持某些媒体键，静默跳过
      }
    }
  }

  #unregisterMediaKeys() {
    for (const keyName of MEDIA_KEY_NAMES) {
      const key = '__media__' + keyName
      const unregister = this.#registry.get(key)
      if (unregister) {
        unregister()
        this.#registry.delete(key)
      }
    }
  }

  // ── IPC Handlers ──

  #registerIpcHandlers() {
    ipcMain.handle('shortcut:get-config', () => this.getConfig())

    ipcMain.handle('shortcut:save-config', (_event, config) => {
    console.log('[shortcutManager] save-config received, shortcuts=' + config?.shortcuts?.length)
      this.#config = config
      this.#persist()
      this.refreshAll()
      this.#broadcastConfig()
    })

    ipcMain.handle('shortcut:reset-defaults', () => {
      this.#config = {
        shortcuts: getDefaultShortcuts(this.#platform),
        globalEnabled: true,
        mediaKeysEnabled: true,
      }
      this.#persist()
      this.refreshAll()
      this.#broadcastConfig()
      return this.getConfig()
    })

    ipcMain.handle('shortcut:set-global-enabled', (_event, enabled) => {
      this.#config.globalEnabled = !!enabled
      this.#persist()
      if (enabled) {
        this.#registerAllGlobals()
      } else {
        this.#unregisterAllGlobals()
      }
      this.#broadcastConfig()
    })

    ipcMain.handle('shortcut:set-media-keys-enabled', (_event, enabled) => {
      this.#config.mediaKeysEnabled = !!enabled
      this.#persist()
      if (enabled) {
        this.#registerMediaKeys()
      } else {
        this.#unregisterMediaKeys()
      }
      this.#broadcastConfig()
    })
  }

  #broadcastConfig() {
    if (!this.#win || this.#win.isDestroyed()) return
    this.#win.webContents.send('shortcut:config-changed', this.getConfig())
  }

  // ── 公开 API ──

  /** 返回当前配置的深拷贝 */
  getConfig() {
    return JSON.parse(JSON.stringify(this.#config))
  }
}

/** 单例实例 */
let instance = null

export function getShortcutManager() {
  if (!instance) {
    instance = new ShortcutManager()
  }
  return instance
}
