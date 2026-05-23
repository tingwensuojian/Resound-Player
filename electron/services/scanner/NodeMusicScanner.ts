import * as mm from 'music-metadata'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import type { TrackRecord, ScanEvent, IMusicScanner } from '../types'

const SUPPORTED = new Set([
  '.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac',
  '.wma', '.ape', '.dsf', '.opus', '.aiff', '.alac',
])

function md5(str: string): string {
  return crypto.createHash('md5').update(str).digest('hex')
}

export class NodeMusicScanner implements IMusicScanner {
  readonly supportedExtensions = [...SUPPORTED]

  async *scanDir(dirPath: string, cachedMtimes?: Map<string, number>): AsyncIterable<ScanEvent> {
    const files: string[] = []
    try {
      await this.collectFiles(dirPath, files)
    } catch (err) {
      yield { type: 'error', path: dirPath, message: `无法读取目录: ${err}` }
      return
    }

    if (!files.length) {
      yield { type: 'complete', total: 0 }
      return
    }

    // 增量扫描：过滤出 mtime/fileSize 有变更的文件
    let scanFiles: string[]
    let skippedCount = 0
    if (cachedMtimes && cachedMtimes.size > 0) {
      scanFiles = []
      for (const fp of files) {
        const cachedMtime = cachedMtimes.get(fp)
        if (cachedMtime !== undefined) {
          try {
            const stat = await fs.stat(fp)
            if (stat.mtimeMs === cachedMtime) {
              skippedCount++
              continue // mtime 未变，跳过
            }
          } catch {
            // stat 失败则重新扫描
          }
        }
        scanFiles.push(fp)
      }
    } else {
      scanFiles = files
    }

    if (!scanFiles.length) {
      yield { type: 'complete', total: skippedCount }
      return
    }

    const total = scanFiles.length
    const concurrency = Math.min(8, Math.max(2, os.cpus().length - 1))
    let index = 0
    let completed = 0
    let resolveDone: ((value: boolean) => void) | null = null
    const donePromise = new Promise<boolean>(r => { resolveDone = r })

    const results: TrackRecord[] = []
    const scanErrors: ScanEvent[] = []

    const worker = async () => {
      while (index < scanFiles.length) {
        const filePath = scanFiles[index++]
        try {
          const track = await this.parseFile(filePath)
          if (track) results.push(track)
        } catch (err: any) {
          scanErrors.push({ type: 'error', path: filePath, message: err.message } as ScanEvent)
        }
        completed++
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker())
    Promise.all(workers).then(() => resolveDone!(true))

    let done = false
    while (!done) {
      const pollDone = await Promise.race([
        donePromise,
        new Promise<boolean>(r => setTimeout(() => r(false), 250)),
      ])

      done = pollDone === true

      while (scanErrors.length) yield scanErrors.shift()!

      if (results.length >= 20 || (done && results.length > 0)) {
        yield { type: 'batch', tracks: results.splice(0) }
      }

      if (completed > 0) {
        yield { type: 'progress', current: completed, total }
      }
    }

    yield { type: 'complete', total }
  }

  private async collectFiles(dirPath: string, result: string[]) {
    let entries
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        await this.collectFiles(fullPath, result)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (SUPPORTED.has(ext)) result.push(fullPath)
      }
    }
  }

  private async parseFile(filePath: string): Promise<TrackRecord | null> {
    let stat
    try {
      stat = await fs.stat(filePath)
    } catch { return null }

    const base = path.dirname(filePath)
    const name = path.basename(filePath, path.extname(filePath))
    // 检查同目录下是否有外部歌词文件
    const hasExternalLyric = ['.lrc', '.yrc', '.ttml'].some(ext =>
      existsSync(path.join(base, name + ext))
    )

    const fallback = (): TrackRecord => ({
      id: md5(filePath), path: filePath,
      title: name,
      artist: '未知艺术家', album: '未知专辑', albumArtist: '',
      duration: 0, bitrate: 0, sampleRate: 0,
      trackNo: 0, discNo: 0, genre: '', year: 0,
      coverPath: '', fileSize: stat.size, mtime: stat.mtimeMs,
      hasLyrics: hasExternalLyric, createdAt: '', updatedAt: '',
    })

    let meta: mm.IAudioMetadata
    try {
      meta = await mm.parseFile(filePath, { duration: true, skipPostHeaders: true })
    } catch { return fallback() }

    const { common, format } = meta
    return {
      id: md5(filePath), path: filePath,
      title: common.title || name,
      artist: common.artist || '未知艺术家',
      album: common.album || '未知专辑',
      albumArtist: common.albumartist || '',
      duration: format.duration || 0,
      bitrate: format.bitrate || 0,
      sampleRate: format.sampleRate || 0,
      trackNo: common.track?.no || 0,
      discNo: common.disk?.no || 0,
      genre: (common.genre || []).join(', '),
      year: common.year || 0,
      coverPath: '', fileSize: stat.size, mtime: stat.mtimeMs,
      hasLyrics: Boolean(common.lyrics?.length) || hasExternalLyric,
      createdAt: '', updatedAt: '',
    }
  }
}