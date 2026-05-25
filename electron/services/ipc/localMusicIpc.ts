import { ipcMain, BrowserWindow, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import jschardet from 'jschardet'
import iconv from 'iconv-lite'
import { CoverCache } from '../CoverCache'
import { LocalMusicDB } from '../db/LocalMusicDB'
import type { IMusicScanner, IMetadataDB } from '../types'

/** 读取 LRC 文件并自动检测编码转为 UTF-8 */
function readLyricFile(lrcPath: string): string {
  const raw = fs.readFileSync(lrcPath)
  const detected = jschardet.detect(raw)
  const encoding = (detected.encoding === 'GB2312' || detected.encoding === 'GBK' || detected.encoding === 'gb2312' || detected.encoding === 'gbk')
    ? 'gbk' : detected.encoding?.toLowerCase() || 'utf-8'
  const text = iconv.decode(raw, encoding)
  // 去掉 BOM
  return text.replace(/^\uFEFF/, '')
}

// ── 模块级 IPC（在 import 时立即注册，不依赖 registerLocalMusicIpc 调用） ──
ipcMain.handle('select-directory', async () => {
  const { dialog } = await import('electron')
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

export function registerLocalMusicIpc(scanner: IMusicScanner, db: IMetadataDB) {
  const coverCache = new CoverCache()
  ipcMain.handle('local:scan', async (event, dirPath: string) => {
    if (dirPath && typeof (db as any).upsertScanDir === 'function') {
      await (db as any).upsertScanDir(dirPath)
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const send = (data: any) => {
      if (!win || win.isDestroyed()) return
      event.sender.send('local:scan-progress', data)
    }

    // 扫描前记录该目录下的已知路径（用于增量判断 + 清理）
    const dirPrefix = path.normalize(dirPath)
    const cachedMtimes = await db.getAllMtimes()

    for await (const evt of scanner.scanDir(dirPath, cachedMtimes)) {
      send(evt)
      if (evt.type === 'batch') await db.upsertTracks(evt.tracks)
    }

    // 扫描后清理：移除磁盘上已不存在的文件记录
    try {
      const allTracks = await db.getAllTracks()
      const toRemove: string[] = []
      for (const t of allTracks) {
        if (!t.path.startsWith(dirPrefix)) continue
        if (!fs.existsSync(t.path)) toRemove.push(t.path)
      }
      if (toRemove.length) {
        await db.removeTracks(toRemove)
        console.log(`[local:scan] 清理了 ${toRemove.length} 条已删除文件记录`)
      }
    } catch (e) {
      console.warn('[local:scan] cleanup error:', e)
    }

    return { success: true }
  })

  ipcMain.handle('local:clear-all', async () => {
    console.log('[local:clear-all] 开始清除所有歌曲数据')
    try {
      const deleted = await db.clearAllTracks()
      console.log('[local:clear-all] 清除完成, 共删除', deleted, '条')
      return { success: true, deleted }
    } catch (e) {
      console.error('[local:clear-all] 清除失败:', e)
      return { success: false, error: String(e) }
    }
  })

  ipcMain.handle('local:remove-tracks-by-dir', async (_event, dirPath: string) => {
    console.log('[local:remove-tracks-by-dir] 收到请求:', dirPath)
    const result = await db.removeTracksByDirectory(dirPath)
    if (typeof (db as any).removeScanDir === 'function') {
      await (db as any).removeScanDir(dirPath)
    }
    console.log('[local:remove-tracks-by-dir] 完成, 删除了', result, '行')
    return { success: true }
  })

  ipcMain.handle('local:remove-tracks', async (_event, paths: string[]) => {
    if (!paths.length) return { success: true, deleted: 0 }
    console.log('[local:remove-tracks] 收到请求, 数量:', paths.length)
    await db.removeTracks(paths)
    console.log('[local:remove-tracks] 完成')
    return { success: true }
  })

  ipcMain.handle('local:search', async (_event, query: string) => {
    return db.search(query || '')
  })

  ipcMain.handle('local:get-all', async () => {
    return db.getAllTracks()
  })

  ipcMain.handle('local:track-count', async () => {
    return db.getTrackCount()
  })

  ipcMain.handle('local:open-folder', async (_event, folderPath: string) => {
    if (!folderPath || !fs.existsSync(folderPath)) return { success: false, error: '目录不存在' }
    const stat = fs.statSync(folderPath)
    const target = stat.isDirectory() ? folderPath : path.dirname(folderPath)
    const error = await shell.openPath(target)
    return error ? { success: false, error } : { success: true }
  })

  ipcMain.handle('local:list-scan-dirs', async () => {
    if (typeof (db as any).listScanDirs !== 'function') return []
    return (db as any).listScanDirs()
  })

  ipcMain.handle('local:save-scan-dir', async (_event, dirPath: string) => {
    if (!dirPath || typeof (db as any).upsertScanDir !== 'function') return { success: false }
    await (db as any).upsertScanDir(dirPath)
    return { success: true }
  })

  ipcMain.handle('local:remove-scan-dir', async (_event, dirPath: string) => {
    if (!dirPath || typeof (db as any).removeScanDir !== 'function') return { success: false }
    await (db as any).removeScanDir(dirPath)
    return { success: true }
  })

  ipcMain.handle('local:get-lyric', async (_event, filePath: string) => {
    const base = path.dirname(filePath)
    const name = path.basename(filePath, path.extname(filePath))
    for (const ext of ['.lrc', '.yrc', '.ttml']) {
      const lrcPath = path.join(base, name + ext)
      if (fs.existsSync(lrcPath)) {
        return { text: readLyricFile(lrcPath), format: ext.slice(1) }
      }
    }
    return null
  })

  ipcMain.handle('local:get-cover', async (_event, filePath: string) => {
    return coverCache.getCover(filePath)
  })

  ipcMain.handle('local:read-file', async (_event, filePath: string) => {
    if (!fs.existsSync(filePath)) return null
    return fs.readFileSync(filePath).buffer
  })

  // ── 本地歌单 IPC ──
  const playlistDb = db as any as LocalMusicDB

  ipcMain.handle('local:playlist-create', async (_event, name: string, description?: string) => {
    return playlistDb.createPlaylist(name, description || '')
  })

  ipcMain.handle('local:playlist-list', async () => {
    return playlistDb.listPlaylists()
  })

  ipcMain.handle('local:playlist-get', async (_event, id: string) => {
    return playlistDb.getPlaylist(id)
  })

  ipcMain.handle('local:playlist-delete', async (_event, id: string) => {
    await playlistDb.deletePlaylist(id)
    return { success: true }
  })

  ipcMain.handle('local:playlist-rename', async (_event, id: string, name: string) => {
    await playlistDb.renamePlaylist(id, name)
    return { success: true }
  })

  ipcMain.handle('local:playlist-add-track', async (_event, playlistId: string, trackId: string) => {
    await playlistDb.addTrackToPlaylist(playlistId, trackId)
    return { success: true }
  })

  ipcMain.handle('local:playlist-remove-track', async (_event, playlistId: string, trackId: string) => {
    await playlistDb.removeTrackFromPlaylist(playlistId, trackId)
    return { success: true }
  })

  ipcMain.handle('local:playlist-tracks', async (_event, playlistId: string) => {
    return playlistDb.getPlaylistTracks(playlistId)
  })

  ipcMain.handle('local:get-recent', async (_event, limit?: number) => {
    return playlistDb.getRecentTracks(limit || 10)
  })

  ipcMain.handle('local:get-stats', async () => {
    return playlistDb.getTrackStats()
  })
}
