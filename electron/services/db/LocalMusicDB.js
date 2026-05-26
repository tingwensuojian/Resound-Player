import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { app } from "electron";
import initSqlJs from "sql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = path.join(app.getPath("userData"), "local-music.sqlite");
const DB_TMP_PATH = DB_PATH + ".tmp";
const OLD_JSON_PATH = path.join(app.getPath("userData"), "local-music.json");

function now() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

const SCHEMA = `
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;

  CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    artist TEXT NOT NULL DEFAULT '',
    album TEXT NOT NULL DEFAULT '',
    albumArtist TEXT NOT NULL DEFAULT '',
    duration REAL NOT NULL DEFAULT 0,
    bitrate INTEGER NOT NULL DEFAULT 0,
    sampleRate INTEGER NOT NULL DEFAULT 0,
    trackNo INTEGER NOT NULL DEFAULT 0,
    discNo INTEGER NOT NULL DEFAULT 0,
    genre TEXT NOT NULL DEFAULT '',
    year INTEGER NOT NULL DEFAULT 0,
    coverPath TEXT NOT NULL DEFAULT '',
    fileSize INTEGER NOT NULL DEFAULT 0,
    mtime REAL NOT NULL DEFAULT 0,
    hasLyrics INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tracks_path ON tracks(path);
  CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS scan_dirs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL DEFAULT '',
    lastScan TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    coverPath TEXT NOT NULL DEFAULT '',
    customCoverUrl TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlistId TEXT NOT NULL,
    trackId TEXT NOT NULL,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    addedAt TEXT NOT NULL,
    PRIMARY KEY (playlistId, trackId),
    FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (trackId) REFERENCES tracks(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlistId);

  CREATE TABLE IF NOT EXISTS local_lyric_matches (
    localTrackId TEXT PRIMARY KEY,
    localPath TEXT NOT NULL,
    cloudSongId INTEGER NOT NULL,
    cloudSongName TEXT NOT NULL DEFAULT '',
    cloudArtists TEXT NOT NULL DEFAULT '',
    cloudAlbum TEXT NOT NULL DEFAULT '',
    cloudAlbumId INTEGER NOT NULL DEFAULT 0,
    cloudAlbumPicUrl TEXT NOT NULL DEFAULT '',
    cloudDuration REAL NOT NULL DEFAULT 0,
    cloudTrackNo INTEGER NOT NULL DEFAULT 0,
    cloudDiscNo INTEGER NOT NULL DEFAULT 0,
    cloudYear INTEGER NOT NULL DEFAULT 0,
    cloudGenre TEXT NOT NULL DEFAULT '',
    cloudLyrics TEXT NOT NULL DEFAULT '',
    cloudSyncedLyrics TEXT NOT NULL DEFAULT '',
    cloudTranslationLyrics TEXT NOT NULL DEFAULT '',
    cloudRomanizedLyrics TEXT NOT NULL DEFAULT '',
    sourceVersion TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 0,
    matchMode TEXT NOT NULL DEFAULT 'manual',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_local_lyric_matches_path ON local_lyric_matches(localPath);

  CREATE TABLE IF NOT EXISTS file_metadata_state (
    filePath TEXT PRIMARY KEY,
    localTrackId TEXT NOT NULL DEFAULT '',
    fileSize INTEGER NOT NULL DEFAULT 0,
    mtime REAL NOT NULL DEFAULT 0,
    matchSongId INTEGER NOT NULL DEFAULT 0,
    sourceVersion TEXT NOT NULL DEFAULT '',
    writeFingerprint TEXT NOT NULL DEFAULT '',
    lastStatus TEXT NOT NULL DEFAULT '',
    lastError TEXT NOT NULL DEFAULT '',
    lastWrittenAt TEXT NOT NULL DEFAULT '',
    completedFields TEXT NOT NULL DEFAULT '',
    revertSnapshot TEXT NOT NULL DEFAULT '',
    lastAppliedValues TEXT NOT NULL DEFAULT '',
    updatedAt TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_file_metadata_state_track ON file_metadata_state(localTrackId);
`;

class LocalMusicDB {
  #db = null;
  #sqlReady = false;
  #writeQueue = Promise.resolve();

  async init() {
    const SQL = await initSqlJs({
      locateFile: (file) => path.join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', file),
    });
    this.#sqlReady = true;

    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(DB_PATH)) {
      try {
        const buffer = fs.readFileSync(DB_PATH);
        this.#db = new SQL.Database(buffer);
      } catch (e) {
        console.error("[LocalMusicDB] failed to load SQLite, creating fresh:", e);
        this.#db = new SQL.Database();
      }
    } else {
      this.#db = new SQL.Database();
    }

    this.#db.run("PRAGMA foreign_keys=ON");
    this.#db.run("PRAGMA journal_mode=WAL");
    this.#execMulti(SCHEMA);
    // 迁移：为已有数据库添加 customCoverUrl 列
    try {
      this.#db.run("ALTER TABLE playlists ADD COLUMN customCoverUrl TEXT NOT NULL DEFAULT ''");
    } catch { /* 列已存在，忽略 */ }
    this.#migrateLocalLyricMatchColumns();
    await this.#migrateFromJson();
    this.#atomicPersist();
  }

  close() {
    if (this.#db) {
      this.#atomicPersist();
      this.#db.close();
      this.#db = null;
    }
    return Promise.resolve();
  }

  // ── 内部：SQL 执行 ──

  #exec(sql, params = []) {
    if (!this.#db) throw new Error("LocalMusicDB not initialized");
    return this.#db.exec(sql, params);
  }

  #run(sql, params = []) {
    if (!this.#db) throw new Error("LocalMusicDB not initialized");
    this.#db.run(sql, params);
  }

  #execMulti(sql) {
    this.#db.run(sql);
  }

  /** 从旧 JSON 文件迁移数据到 SQLite（仅首次运行） */
  #migrateFromJson() {
    const jsonPath = path.join(app.getPath("userData"), "local-music.json");
    if (!fs.existsSync(jsonPath)) return;
    // 检查 SQLite 是否已有数据（防止重复迁移）
    const count = this.#queryOne("SELECT COUNT(*) as cnt FROM tracks");
    if (count && count.cnt > 0) return;

    console.log("[LocalMusicDB] migrating from local-music.json...");
    let data;
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    } catch (e) {
      console.warn("[LocalMusicDB] failed to parse old JSON, skipping migration:", e);
      return;
    }

    if (!data || !data.tracks || !data.tracks.length) {
      console.log("[LocalMusicDB] no tracks to migrate");
      return;
    }

    // 批量导入 tracks
    const stmt = this.#db.prepare(`
      INSERT OR IGNORE INTO tracks (id, path, title, artist, album, albumArtist, duration,
        bitrate, sampleRate, trackNo, discNo, genre, year, coverPath,
        fileSize, mtime, hasLyrics, createdAt, updatedAt)
      VALUES ($id, $path, $title, $artist, $album, $albumArtist, $duration,
        $bitrate, $sampleRate, $trackNo, $discNo, $genre, $year, $coverPath,
        $fileSize, $mtime, $hasLyrics, $createdAt, $updatedAt)
    `);
    for (const t of data.tracks) {
      stmt.run({
        $id: t.id || crypto.randomUUID(),
        $path: t.path,
        $title: t.title || "",
        $artist: t.artist || "",
        $album: t.album || "",
        $albumArtist: t.albumArtist || "",
        $duration: t.duration || 0,
        $bitrate: t.bitrate || 0,
        $sampleRate: t.sampleRate || 0,
        $trackNo: t.trackNo || 0,
        $discNo: t.discNo || 0,
        $genre: t.genre || "",
        $year: t.year || 0,
        $coverPath: t.coverPath || "",
        $fileSize: t.fileSize || 0,
        $mtime: t.mtime || 0,
        $hasLyrics: t.hasLyrics ? 1 : 0,
        $createdAt: t.createdAt || now(),
        $updatedAt: t.updatedAt || now(),
      });
    }
    stmt.free();

    // 迁移 scanDirs
    if (data.scanDirs && data.scanDirs.length) {
      const dirStmt = this.#db.prepare(
        "INSERT OR IGNORE INTO scan_dirs (path, label, lastScan) VALUES ($path, $label, $lastScan)"
      );
      for (const d of data.scanDirs) {
        dirStmt.run({ $path: d.path, $label: d.label || "", $lastScan: d.lastScan || "" });
      }
      dirStmt.free();
    }

    // 迁移歌单
    if (data.playlists && data.playlists.length) {
      const plStmt = this.#db.prepare(
        "INSERT OR IGNORE INTO playlists (id, name, description, coverPath, createdAt, updatedAt) VALUES ($id, $name, $description, $coverPath, $createdAt, $updatedAt)"
      );
      for (const p of data.playlists) {
        plStmt.run({
          $id: p.id,
          $name: p.name,
          $description: p.description || "",
          $coverPath: p.coverPath || "",
          $createdAt: p.createdAt || now(),
          $updatedAt: p.updatedAt || now(),
        });
      }
      plStmt.free();
    }

    // 迁移歌单歌曲关联
    if (data.playlistTracks && data.playlistTracks.length) {
      const ptStmt = this.#db.prepare(
        "INSERT OR IGNORE INTO playlist_tracks (playlistId, trackId, sortOrder, addedAt) VALUES ($playlistId, $trackId, $sortOrder, $addedAt)"
      );
      for (const pt of data.playlistTracks) {
        ptStmt.run({
          $playlistId: pt.playlistId,
          $trackId: pt.trackId,
          $sortOrder: pt.sortOrder !== undefined ? pt.sortOrder : 0,
          $addedAt: pt.addedAt || now(),
        });
      }
      ptStmt.free();
    }

    console.log(`[LocalMusicDB] migration complete: ${data.tracks.length} tracks, ${data.playlists?.length || 0} playlists`);
  }

  /** 执行 SELECT 返回对象数组（每次独立 prepare/free） */
  #queryAll(sql, params = []) {
    const stmt = this.#db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    try {
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  /** 执行 SELECT 返回单行或 null */
  #queryOne(sql, params = []) {
    const rows = this.#queryAll(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  /** 将 TrackRecord 行转换为前端对象（hasLyrics: 0/1 → boolean） */
  #trackRow(row) {
    if (!row) return null;
    return {
      ...row,
      hasLyrics: Boolean(row.hasLyrics),
    };
  }

  #lyricMatchRow(row) {
    if (!row) return null;
    return {
      ...row,
      cloudSongId: Number(row.cloudSongId || 0),
      cloudAlbumId: Number(row.cloudAlbumId || 0),
      cloudDuration: Number(row.cloudDuration || 0),
      cloudTrackNo: Number(row.cloudTrackNo || 0),
      cloudDiscNo: Number(row.cloudDiscNo || 0),
      cloudYear: Number(row.cloudYear || 0),
      confidence: Number(row.confidence || 0),
    };
  }

  #fileMetadataStateRow(row) {
    if (!row) return null;
    return {
      ...row,
      fileSize: Number(row.fileSize || 0),
      mtime: Number(row.mtime || 0),
      matchSongId: Number(row.matchSongId || 0),
      completedFields: row.completedFields ? JSON.parse(row.completedFields) : [],
      revertSnapshot: row.revertSnapshot ? JSON.parse(row.revertSnapshot) : {},
      lastAppliedValues: row.lastAppliedValues ? JSON.parse(row.lastAppliedValues) : {},
    };
  }

  #migrateLocalLyricMatchColumns() {
    const alterStatements = [
      "ALTER TABLE local_lyric_matches ADD COLUMN cloudAlbumId INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE local_lyric_matches ADD COLUMN cloudAlbumPicUrl TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE local_lyric_matches ADD COLUMN cloudTrackNo INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE local_lyric_matches ADD COLUMN cloudDiscNo INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE local_lyric_matches ADD COLUMN cloudYear INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE local_lyric_matches ADD COLUMN cloudGenre TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE local_lyric_matches ADD COLUMN cloudLyrics TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE local_lyric_matches ADD COLUMN cloudSyncedLyrics TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE local_lyric_matches ADD COLUMN cloudTranslationLyrics TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE local_lyric_matches ADD COLUMN cloudRomanizedLyrics TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE local_lyric_matches ADD COLUMN sourceVersion TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE local_lyric_matches ADD COLUMN confidence REAL NOT NULL DEFAULT 0",
    ];
    for (const sql of alterStatements) {
      try {
        this.#db.run(sql);
      } catch {
        /* 列已存在，忽略 */
      }
    }
    const metadataStateAlterStatements = [
      "ALTER TABLE file_metadata_state ADD COLUMN revertSnapshot TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE file_metadata_state ADD COLUMN lastAppliedValues TEXT NOT NULL DEFAULT ''",
    ];
    for (const sql of metadataStateAlterStatements) {
      try {
        this.#db.run(sql);
      } catch {
        /* 列已存在，忽略 */
      }
    }
  }

  // ── 写队列 + 原子持久化 ──

  #enqueueWrite(fn) {
    this.#writeQueue = this.#writeQueue.then(fn).catch((e) => {
      console.error("[LocalMusicDB] write failed, recovering chain:", e);
    });
    return this.#writeQueue;
  }

  #atomicPersist() {
    if (!this.#db) return;
    try {
      const data = this.#db.export();
      fs.writeFileSync(DB_TMP_PATH, Buffer.from(data));
      fs.renameSync(DB_TMP_PATH, DB_PATH);
    } catch (e) {
      console.error("[LocalMusicDB] atomicPersist failed:", e);
    }
  }

  // ── 公开 API ──

  getAllTracks() {
    const rows = this.#queryAll(
      "SELECT id, path, title, artist, album, albumArtist, duration, hasLyrics, createdAt FROM tracks ORDER BY title COLLATE NOCASE"
    );
    return Promise.resolve(rows.map((r) => this.#trackRow(r)));
  }

  getTrackByPath(filePath) {
    if (!filePath) return Promise.resolve(null)
    const norm = filePath.replace(/\\\\/g, "/");
    const row = this.#queryOne(
      "SELECT * FROM tracks WHERE REPLACE(path, '\\\\', '/') = ?",
      [norm]
    );
    return Promise.resolve(this.#trackRow(row));
  }

  upsertTracks(tracks) {
    if (!tracks.length) return Promise.resolve();
    return this.#enqueueWrite(() => {
      const stmt = this.#db.prepare(`
        INSERT INTO tracks (id, path, title, artist, album, albumArtist, duration,
          bitrate, sampleRate, trackNo, discNo, genre, year, coverPath,
          fileSize, mtime, hasLyrics, createdAt, updatedAt)
        VALUES ($id, $path, $title, $artist, $album, $albumArtist, $duration,
          $bitrate, $sampleRate, $trackNo, $discNo, $genre, $year, $coverPath,
          $fileSize, $mtime, $hasLyrics, $createdAt, $updatedAt)
        ON CONFLICT(path) DO UPDATE SET
          title=excluded.title, artist=excluded.artist, album=excluded.album,
          albumArtist=excluded.albumArtist, duration=excluded.duration,
          bitrate=excluded.bitrate, sampleRate=excluded.sampleRate,
          trackNo=excluded.trackNo, discNo=excluded.discNo, genre=excluded.genre,
          year=excluded.year, coverPath=excluded.coverPath,
          fileSize=excluded.fileSize, mtime=excluded.mtime,
          hasLyrics=excluded.hasLyrics, updatedAt=excluded.updatedAt,
          id=CASE WHEN id IS NULL THEN excluded.id ELSE id END
      `);

      const ts = now();
      for (const t of tracks) {
        stmt.run({
          $id: t.id || crypto.randomUUID(),
          $path: t.path,
          $title: t.title || "",
          $artist: t.artist || "",
          $album: t.album || "",
          $albumArtist: t.albumArtist || "",
          $duration: t.duration || 0,
          $bitrate: t.bitrate || 0,
          $sampleRate: t.sampleRate || 0,
          $trackNo: t.trackNo || 0,
          $discNo: t.discNo || 0,
          $genre: t.genre || "",
          $year: t.year || 0,
          $coverPath: t.coverPath || "",
          $fileSize: t.fileSize || 0,
          $mtime: t.mtime || 0,
          $hasLyrics: t.hasLyrics ? 1 : 0,
          $createdAt: ts,
          $updatedAt: ts,
        });
      }
      stmt.free();
      this.#atomicPersist();
    });
  }

  removeTracks(paths) {
    if (!paths || !paths.length) return Promise.resolve();
    const validPaths = paths.filter(p => p)
    if (!validPaths.length) return Promise.resolve();
    return this.#enqueueWrite(() => {
      const placeholders = validPaths.map(() => "?").join(",");
      const normalized = validPaths.map((p) => p.replace(/\\\\/g, "/").toLowerCase());

      // 先获取要删除的 track IDs（用于清理 playlist_tracks）
      const toRemove = this.#queryAll(
        `SELECT id FROM tracks WHERE LOWER(REPLACE(path, '\\\\', '/')) IN (${placeholders})`,
        normalized
      );
      const ids = toRemove.map((r) => r.id);

      if (ids.length > 0) {
        const idPh = ids.map(() => "?").join(",");
        this.#run(
          `DELETE FROM local_lyric_matches WHERE localTrackId IN (${idPh})`,
          ids
        );
        this.#run(
          `DELETE FROM file_metadata_state WHERE localTrackId IN (${idPh})`,
          ids
        );
        this.#run(
          `DELETE FROM playlist_tracks WHERE trackId IN (${idPh})`,
          ids
        );
        this.#run(
          `DELETE FROM tracks WHERE LOWER(REPLACE(path, '\\\\', '/')) IN (${placeholders})`,
          normalized
        );
      }
      this.#atomicPersist();
    });
  }

  clearAllTracks() {
    return this.#enqueueWrite(() => {
      this.#run("DELETE FROM playlist_tracks");
      this.#run("DELETE FROM local_lyric_matches");
      this.#run("DELETE FROM file_metadata_state");
      this.#run("DELETE FROM scan_dirs");
      const count = this.#queryOne("SELECT COUNT(*) as cnt FROM tracks").cnt;
      this.#run("DELETE FROM tracks");
      this.#atomicPersist();
      return count;
    });
  }

  removeTracksByDirectory(dirPath) {
    if (!dirPath) return this.#enqueueWrite(() => 0)
    const prefix = dirPath.replace(/\/$/g, "").replace(/\\\\/g, "/").toLowerCase() + "/";
    return this.#enqueueWrite(() => {
      const toRemove = this.#queryAll(
        `SELECT id FROM tracks WHERE LOWER(REPLACE(path, '\\\\', '/')) LIKE ?`,
        [prefix + "%"]
      );
      const ids = toRemove.map((r) => r.id);

      if (ids.length > 0) {
        const ph = ids.map(() => "?").join(",");
        this.#run(`DELETE FROM local_lyric_matches WHERE localTrackId IN (${ph})`, ids);
        this.#run(`DELETE FROM file_metadata_state WHERE localTrackId IN (${ph})`, ids);
        this.#run(`DELETE FROM playlist_tracks WHERE trackId IN (${ph})`, ids);
        this.#run(
          `DELETE FROM tracks WHERE LOWER(REPLACE(path, '\\\\', '/')) LIKE ?`,
          [prefix + "%"]
        );
      }
      this.#atomicPersist();
      return ids.length;
    });
  }

  search(query) {
    if (!query) return this.getAllTracks();
    const q = `%${query.toLowerCase()}%`;
    const rows = this.#queryAll(
      `SELECT * FROM tracks WHERE
        LOWER(title) LIKE ? OR
        LOWER(artist) LIKE ? OR
        LOWER(album) LIKE ?
      ORDER BY title COLLATE NOCASE
      LIMIT 500`,
      [q, q, q]
    );
    return Promise.resolve(rows.map((r) => this.#trackRow(r)));
  }

  getTrackCount() {
    const row = this.#queryOne("SELECT COUNT(*) as cnt FROM tracks");
    return Promise.resolve(row ? row.cnt : 0);
  }

  getAllMtimes() {
    const rows = this.#queryAll("SELECT path, mtime FROM tracks");
    const map = new Map();
    for (const r of rows) map.set(r.path, r.mtime);
    return Promise.resolve(map);
  }

  upsertScanDir(dirPath) {
    if (!dirPath) return Promise.resolve();
    return this.#enqueueWrite(() => {
      this.#run(
        "INSERT INTO scan_dirs (path, label, lastScan) VALUES (?, '', ?) ON CONFLICT(path) DO UPDATE SET lastScan=excluded.lastScan",
        [dirPath, now()]
      );
      this.#atomicPersist();
    });
  }

  listScanDirs() {
    const rows = this.#queryAll("SELECT path FROM scan_dirs ORDER BY path COLLATE NOCASE");
    return Promise.resolve(rows.map((r) => r.path).filter(Boolean));
  }

  removeScanDir(dirPath) {
    if (!dirPath) return Promise.resolve();
    return this.#enqueueWrite(() => {
      this.#run("DELETE FROM scan_dirs WHERE path = ?", [dirPath]);
      this.#atomicPersist();
    });
  }

  // ── 本地歌曲云端歌词匹配 ──

  getLocalLyricMatch(localTrackId, localPath = "") {
    if (!localTrackId && !localPath) return Promise.resolve(null);
    const normalizedPath = (localPath || "").replace(/\\\\/g, "/");
    const row = localTrackId
      ? this.#queryOne("SELECT * FROM local_lyric_matches WHERE localTrackId = ?", [String(localTrackId)])
      : this.#queryOne("SELECT * FROM local_lyric_matches WHERE REPLACE(localPath, '\\\\', '/') = ?", [normalizedPath]);
    if (row) return Promise.resolve(this.#lyricMatchRow(row));
    if (!normalizedPath) return Promise.resolve(null);
    const pathRow = this.#queryOne("SELECT * FROM local_lyric_matches WHERE REPLACE(localPath, '\\\\', '/') = ?", [normalizedPath]);
    return Promise.resolve(this.#lyricMatchRow(pathRow));
  }

  saveLocalLyricMatch(payload) {
    if (!payload?.localTrackId || !payload?.localPath || !payload?.cloudSongId) {
      return Promise.resolve({ success: false, error: "invalid lyric match payload" });
    }
    return this.#enqueueWrite(() => {
      const ts = now();
      this.#run(`
        INSERT INTO local_lyric_matches (
          localTrackId, localPath, cloudSongId, cloudSongName, cloudArtists,
          cloudAlbum, cloudAlbumId, cloudAlbumPicUrl, cloudDuration, cloudTrackNo,
          cloudDiscNo, cloudYear, cloudGenre, cloudLyrics, cloudSyncedLyrics,
          cloudTranslationLyrics, cloudRomanizedLyrics, sourceVersion, confidence,
          matchMode, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(localTrackId) DO UPDATE SET
          localPath=excluded.localPath,
          cloudSongId=excluded.cloudSongId,
          cloudSongName=excluded.cloudSongName,
          cloudArtists=excluded.cloudArtists,
          cloudAlbum=excluded.cloudAlbum,
          cloudAlbumId=excluded.cloudAlbumId,
          cloudAlbumPicUrl=excluded.cloudAlbumPicUrl,
          cloudDuration=excluded.cloudDuration,
          cloudTrackNo=excluded.cloudTrackNo,
          cloudDiscNo=excluded.cloudDiscNo,
          cloudYear=excluded.cloudYear,
          cloudGenre=excluded.cloudGenre,
          cloudLyrics=excluded.cloudLyrics,
          cloudSyncedLyrics=excluded.cloudSyncedLyrics,
          cloudTranslationLyrics=excluded.cloudTranslationLyrics,
          cloudRomanizedLyrics=excluded.cloudRomanizedLyrics,
          sourceVersion=excluded.sourceVersion,
          confidence=excluded.confidence,
          matchMode=excluded.matchMode,
          updatedAt=excluded.updatedAt
      `, [
        String(payload.localTrackId),
        payload.localPath,
        Number(payload.cloudSongId),
        payload.cloudSongName || "",
        payload.cloudArtists || "",
        payload.cloudAlbum || "",
        Number(payload.cloudAlbumId || 0),
        payload.cloudAlbumPicUrl || "",
        Number(payload.cloudDuration || 0),
        Number(payload.cloudTrackNo || 0),
        Number(payload.cloudDiscNo || 0),
        Number(payload.cloudYear || 0),
        payload.cloudGenre || "",
        payload.cloudLyrics || "",
        payload.cloudSyncedLyrics || "",
        payload.cloudTranslationLyrics || "",
        payload.cloudRomanizedLyrics || "",
        payload.sourceVersion || "",
        Number(payload.confidence || 0),
        payload.matchMode || "manual",
        ts,
        ts,
      ]);
      this.#atomicPersist();
      return { success: true };
    });
  }

  getFileMetadataState(filePath) {
    if (!filePath) return Promise.resolve(null);
    const normalizedPath = String(filePath).replace(/\\\\/g, "/");
    const row = this.#queryOne(
      "SELECT * FROM file_metadata_state WHERE REPLACE(filePath, '\\\\', '/') = ?",
      [normalizedPath]
    );
    return Promise.resolve(this.#fileMetadataStateRow(row));
  }

  upsertFileMetadataState(payload) {
    if (!payload?.filePath) return Promise.resolve();
    return this.#enqueueWrite(() => {
      this.#run(`
        INSERT INTO file_metadata_state (
          filePath, localTrackId, fileSize, mtime, matchSongId, sourceVersion,
          writeFingerprint, lastStatus, lastError, lastWrittenAt, completedFields,
          revertSnapshot, lastAppliedValues, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(filePath) DO UPDATE SET
          localTrackId=excluded.localTrackId,
          fileSize=excluded.fileSize,
          mtime=excluded.mtime,
          matchSongId=excluded.matchSongId,
          sourceVersion=excluded.sourceVersion,
          writeFingerprint=excluded.writeFingerprint,
          lastStatus=excluded.lastStatus,
          lastError=excluded.lastError,
          lastWrittenAt=excluded.lastWrittenAt,
          completedFields=excluded.completedFields,
          revertSnapshot=excluded.revertSnapshot,
          lastAppliedValues=excluded.lastAppliedValues,
          updatedAt=excluded.updatedAt
      `, [
        payload.filePath,
        payload.localTrackId || "",
        Number(payload.fileSize || 0),
        Number(payload.mtime || 0),
        Number(payload.matchSongId || 0),
        payload.sourceVersion || "",
        payload.writeFingerprint || "",
        payload.lastStatus || "",
        payload.lastError || "",
        payload.lastWrittenAt || "",
        JSON.stringify(Array.isArray(payload.completedFields) ? payload.completedFields : []),
        JSON.stringify(payload.revertSnapshot && typeof payload.revertSnapshot === "object" ? payload.revertSnapshot : {}),
        JSON.stringify(payload.lastAppliedValues && typeof payload.lastAppliedValues === "object" ? payload.lastAppliedValues : {}),
        now(),
      ]);
      this.#atomicPersist();
    });
  }

  removeLocalLyricMatch(localTrackId, localPath = "") {
    if (!localTrackId && !localPath) return Promise.resolve({ success: true });
    return this.#enqueueWrite(() => {
      if (localTrackId) {
        this.#run("DELETE FROM local_lyric_matches WHERE localTrackId = ?", [String(localTrackId)]);
      } else {
        this.#run("DELETE FROM local_lyric_matches WHERE REPLACE(localPath, '\\\\', '/') = ?", [(localPath || "").replace(/\\\\/g, "/")]);
      }
      this.#atomicPersist();
      return { success: true };
    });
  }

  // ── 歌单 ──

  createPlaylist(name, description = "") {
    return this.#enqueueWrite(() => {
      const id = crypto.createHash("md5").update(`${name}|${Date.now()}`).digest("hex");
      const ts = now();
      this.#run(
        "INSERT INTO playlists (id, name, description, coverPath, createdAt, updatedAt) VALUES (?, ?, ?, '', ?, ?)",
        [id, name, description, ts, ts]
      );
      this.#atomicPersist();
      return { id };
    });
  }

  listPlaylists() {
    const rows = this.#queryAll(`
      SELECT p.*,
        (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlistId = p.id) as trackCount
      FROM playlists p
      ORDER BY p.updatedAt DESC
    `);
    return Promise.resolve(rows);
  }

  getPlaylist(id) {
    const row = this.#queryOne(`
      SELECT p.*,
        (SELECT COUNT(*) FROM playlist_tracks pt WHERE pt.playlistId = p.id) as trackCount
      FROM playlists p WHERE p.id = ?
    `, [id]);
    return Promise.resolve(row || null);
  }

  deletePlaylist(id) {
    return this.#enqueueWrite(() => {
      this.#run("DELETE FROM playlist_tracks WHERE playlistId = ?", [id]);
      this.#run("DELETE FROM playlists WHERE id = ?", [id]);
      this.#atomicPersist();
    });
  }

  renamePlaylist(id, name) {
    return this.#enqueueWrite(() => {
      this.#run("UPDATE playlists SET name = ?, updatedAt = ? WHERE id = ?", [name, now(), id]);
      this.#atomicPersist();
    });
  }

  updatePlaylist(id, updates) {
    return this.#enqueueWrite(() => {
      const fields = [];
      const values = [];
      if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
      if (updates.customCoverUrl !== undefined) { fields.push("customCoverUrl = ?"); values.push(updates.customCoverUrl); }
      if (updates.description !== undefined) { fields.push("description = ?"); values.push(updates.description); }
      if (fields.length) {
        fields.push("updatedAt = ?");
        values.push(now());
        values.push(id);
        this.#run(`UPDATE playlists SET ${fields.join(", ")} WHERE id = ?`, values);
        this.#atomicPersist();
      }
    });
  }

  addTrackToPlaylist(playlistId, trackId) {
    return this.#enqueueWrite(() => {
      const exists = this.#queryOne(
        "SELECT 1 FROM playlist_tracks WHERE playlistId = ? AND trackId = ?",
        [playlistId, trackId]
      );
      if (exists) return;

      const maxRow = this.#queryOne(
        "SELECT COALESCE(MAX(sortOrder), -1) as mx FROM playlist_tracks WHERE playlistId = ?",
        [playlistId]
      );
      this.#run(
        "INSERT INTO playlist_tracks (playlistId, trackId, sortOrder, addedAt) VALUES (?, ?, ?, ?)",
        [playlistId, trackId, maxRow.mx + 1, now()]
      );
      this.#run("UPDATE playlists SET updatedAt = ? WHERE id = ?", [now(), playlistId]);
      this.#atomicPersist();
    });
  }

  removeTrackFromPlaylist(playlistId, trackId) {
    return this.#enqueueWrite(() => {
      this.#run(
        "DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?",
        [playlistId, trackId]
      );
      this.#run("UPDATE playlists SET updatedAt = ? WHERE id = ?", [now(), playlistId]);
      this.#atomicPersist();
    });
  }

  getPlaylistTracks(playlistId) {
    const rows = this.#queryAll(`
      SELECT t.* FROM tracks t
      INNER JOIN playlist_tracks pt ON pt.trackId = t.id
      WHERE pt.playlistId = ?
      ORDER BY pt.sortOrder ASC
    `, [playlistId]);
    return Promise.resolve(rows.map((r) => this.#trackRow(r)));
  }

  getRecentTracks(limit = 10) {
    const rows = this.#queryAll(
      "SELECT * FROM tracks ORDER BY createdAt DESC LIMIT ?",
      [limit]
    );
    return Promise.resolve(rows.map((r) => this.#trackRow(r)));
  }

  getTrackStats() {
    const row = this.#queryOne(`
      SELECT
        COUNT(*) as totalTracks,
        COUNT(DISTINCT artist) as totalArtists,
        COUNT(DISTINCT album) as totalAlbums,
        COALESCE(SUM(duration), 0) as totalDuration,
        COALESCE(SUM(fileSize), 0) as totalSize
      FROM tracks
    `);
    return Promise.resolve(row || { totalTracks: 0, totalArtists: 0, totalAlbums: 0, totalDuration: 0, totalSize: 0 });
  }

  /** 返回所有歌单前 6 首 track 的 path（音频文件路径），用于加载封面 */
  getAllPlaylistCoverPaths() {
    const rows = this.#queryAll(`
      SELECT pt.playlistId, t.path
      FROM playlist_tracks pt
      INNER JOIN tracks t ON t.id = pt.trackId
      ORDER BY pt.playlistId, pt.sortOrder ASC
    `);
    // 手动分组取前 6 首（SQLite GROUP_CONCAT 不支持 LIMIT per group）
    const map = {};
    for (const r of rows) {
      if (!map[r.playlistId]) map[r.playlistId] = [];
      if (map[r.playlistId].length < 6) map[r.playlistId].push(r.path);
    }
    return Promise.resolve(map);
  }
}

export { LocalMusicDB };
