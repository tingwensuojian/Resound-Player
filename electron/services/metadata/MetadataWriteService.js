import path from "path";
import { CoverCache } from "../CoverCache.js";
import { LocalTagReader } from "./LocalTagReader.js";
import { MatchResolver } from "./MatchResolver.js";
import { MergePolicy } from "./MergePolicy.js";
import { ArtworkService } from "./ArtworkService.js";
import { WriteFingerprint } from "./WriteFingerprint.js";
import { TagWriterAdapter } from "./TagWriterAdapter.js";
import { SUPPORTED_METADATA_EXTENSIONS } from "./types.js";

function normalizePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function bufferToBase64(buffer) {
  if (!buffer) return "";
  return Buffer.isBuffer(buffer) ? buffer.toString("base64") : Buffer.from(buffer).toString("base64");
}

function artworkSnapshot(artwork) {
  if (!artwork?.buffer) return null;
  return {
    mime: artwork.mime || "image/jpeg",
    base64: bufferToBase64(artwork.buffer),
  };
}

function normalizeComparableValue(key, value) {
  if (key === "artists") {
    return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean).join("/") : "";
  }
  if (key === "artwork") {
    return value?.base64 || "";
  }
  if (typeof value === "number") return Number(value || 0);
  return String(value || "").trim();
}

function hasSnapshotValues(snapshot) {
  return Boolean(snapshot && typeof snapshot === "object" && Object.keys(snapshot).length > 0);
}

function normalizeOverrideArtists(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[\/,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function applyOverridesToMetadata(normalizedMetadata, overrides) {
  const next = {
    ...normalizedMetadata,
    artists: Array.isArray(normalizedMetadata.artists) ? [...normalizedMetadata.artists] : [],
    artwork: normalizedMetadata.artwork ? { ...normalizedMetadata.artwork } : normalizedMetadata.artwork,
  };
  if (!overrides || typeof overrides !== "object") return next;

  if (Object.prototype.hasOwnProperty.call(overrides, "title")) {
    next.title = String(overrides.title || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(overrides, "artists")) {
    next.artists = normalizeOverrideArtists(overrides.artists);
    if (!Object.prototype.hasOwnProperty.call(overrides, "albumArtist")) {
      next.albumArtist = next.artists.join("/");
    }
  }
  if (Object.prototype.hasOwnProperty.call(overrides, "album")) {
    next.album = String(overrides.album || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(overrides, "albumArtist")) {
    next.albumArtist = String(overrides.albumArtist || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(overrides, "genre")) {
    next.genre = String(overrides.genre || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(overrides, "year")) {
    next.year = Number(overrides.year || 0);
  }
  if (Object.prototype.hasOwnProperty.call(overrides, "trackNo")) {
    next.trackNo = Number(overrides.trackNo || 0);
  }
  if (Object.prototype.hasOwnProperty.call(overrides, "discNo")) {
    next.discNo = Number(overrides.discNo || 0);
  }
  if (Object.prototype.hasOwnProperty.call(overrides, "lyrics")) {
    next.lyrics = String(overrides.lyrics || "").trim();
  }
  return next;
}

export class MetadataWriteService {
  constructor(db) {
    this.db = db;
    this.coverCache = new CoverCache();
    this.localTagReader = new LocalTagReader();
    this.matchResolver = new MatchResolver();
    this.mergePolicy = new MergePolicy();
    this.artworkService = new ArtworkService();
    this.writeFingerprint = new WriteFingerprint();
    this.tagWriterAdapter = new TagWriterAdapter();
  }

  async preview({ filePath, localTrackId, overrides }) {
    if (!filePath) throw new Error("文件路径不能为空");
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_METADATA_EXTENSIONS.has(ext)) {
      throw new Error(`当前仅支持 mp3/flac/m4a/aac/wav/ogg/opus/wma，暂不支持 ${ext || "该格式"}`);
    }

    const localSnapshot = await this.localTagReader.read(filePath);
    const matchRow = await this.db.getLocalLyricMatch(localTrackId || "", filePath);
    const normalizedMetadata = applyOverridesToMetadata(this.matchResolver.resolve(matchRow), overrides);
    const artwork = await this.artworkService.fetch(normalizedMetadata.artwork.url);
    normalizedMetadata.artwork = { ...normalizedMetadata.artwork, ...artwork };

    const writePlan = this.mergePolicy.build(localSnapshot, normalizedMetadata);
    const fingerprint = this.writeFingerprint.create({
      filePath,
      mtime: localSnapshot.mtime,
      fileSize: localSnapshot.fileSize,
      matchSongId: normalizedMetadata.cloudSongId,
      sourceVersion: normalizedMetadata.sourceVersion,
      fieldsToWrite: writePlan.fieldsToWrite,
      artworkHash: artwork.hash,
    });
    const stateRow = await this.db.getFileMetadataState(filePath);
    const duplicate = Boolean(stateRow?.writeFingerprint && stateRow.writeFingerprint === fingerprint && stateRow.lastStatus === "success");

    return {
      success: true,
      filePath: normalizePath(filePath),
      localTrackId: String(localTrackId || ""),
      mode: "fill-missing",
      supported: true,
      duplicate,
      fingerprint,
      matchSongId: normalizedMetadata.cloudSongId,
      sourceVersion: normalizedMetadata.sourceVersion,
      existingState: stateRow,
      localSnapshot,
      normalizedMetadata: {
        title: normalizedMetadata.title,
        artists: normalizedMetadata.artists,
        album: normalizedMetadata.album,
        albumArtist: normalizedMetadata.albumArtist,
        genre: normalizedMetadata.genre,
        year: normalizedMetadata.year,
        trackNo: normalizedMetadata.trackNo,
        discNo: normalizedMetadata.discNo,
        lyrics: normalizedMetadata.lyrics,
        hasLyrics: Boolean(normalizedMetadata.lyrics),
        hasArtwork: Boolean(normalizedMetadata.artwork?.buffer),
      },
      writePlan,
    };
  }

  async writeOne({ filePath, localTrackId, mode, overrides }) {
    if (mode && mode !== "fill-missing") throw new Error("当前仅支持 fill-missing 模式");
    const previewResult = await this.preview({ filePath, localTrackId, overrides });
    if (previewResult.duplicate) {
      return { ...previewResult, success: true, skipped: true, reason: "文件未变化，已跳过重复写入" };
    }
    if (!previewResult.writePlan.canWrite) {
      await this.#persistState(
        previewResult,
        "skipped",
        "",
        previewResult.writePlan.skipped.map((item) => item.key),
        previewResult.existingState?.revertSnapshot || {},
        previewResult.existingState?.lastAppliedValues || {}
      );
      return { ...previewResult, success: true, skipped: true, reason: "没有可补全的缺失字段" };
    }

    await this.tagWriterAdapter.write(filePath, previewResult.writePlan);
    this.coverCache.clearCache();
    await this.#refreshTrackFromFile(filePath, localTrackId);
    const nextSnapshot = await this.localTagReader.read(filePath);
    const { revertSnapshot, lastAppliedValues } = this.#buildRevertState(previewResult, nextSnapshot);
    await this.#persistState(
      { ...previewResult, localSnapshot: nextSnapshot },
      "success",
      "",
      previewResult.writePlan.toWrite.map((item) => item.key),
      revertSnapshot,
      lastAppliedValues
    );
    return { ...previewResult, success: true, skipped: false };
  }

  async revertOne({ filePath, localTrackId }) {
    if (!filePath) throw new Error("文件路径不能为空");
    const stateRow = await this.db.getFileMetadataState(filePath);
    if (!stateRow?.revertSnapshot || !Object.keys(stateRow.revertSnapshot).length) {
      return { success: true, skipped: true, reason: "没有可回滚的标签改动" };
    }

    const currentSnapshot = await this.localTagReader.read(filePath);
    const revertPlan = this.#buildRevertPlan(stateRow, currentSnapshot);
    if (!revertPlan.canRevert) {
      return {
        success: true,
        skipped: true,
        reason: "文件标签已被后续修改，未执行回滚",
        revertedFields: [],
        skippedFields: revertPlan.skipped,
      };
    }

    const rewriteValues = this.#buildRewriteValues(currentSnapshot, revertPlan.revertSnapshot);
    await this.tagWriterAdapter.rewrite(filePath, rewriteValues);
    this.coverCache.clearCache();
    await this.#refreshTrackFromFile(filePath, localTrackId);
    const nextSnapshot = await this.localTagReader.read(filePath);
    await this.#persistState(
      {
        filePath: normalizePath(filePath),
        localTrackId: String(localTrackId || stateRow.localTrackId || ""),
        localSnapshot: nextSnapshot,
        matchSongId: stateRow.matchSongId,
        sourceVersion: stateRow.sourceVersion || "",
        fingerprint: "",
      },
      revertPlan.skipped.length ? "partial-reverted" : "reverted",
      "",
      [],
      {},
      {}
    );
    return {
      success: true,
      skipped: false,
      revertedFields: revertPlan.revertedFields,
      skippedFields: revertPlan.skipped,
      partial: revertPlan.skipped.length > 0,
      reason: revertPlan.skipped.length ? "部分字段因文件已变更而跳过回滚" : "已回滚本次补全写入的标签",
    };
  }

  async getStatus({ filePath, localTrackId }) {
    if (!filePath) throw new Error("文件路径不能为空");
    const normalizedFilePath = normalizePath(filePath);
    const matchRow = await this.db.getLocalLyricMatch(localTrackId || "", normalizedFilePath);
    const stateRow = await this.db.getFileMetadataState(normalizedFilePath);
    const localSnapshot = await this.localTagReader.read(normalizedFilePath);
    const coverSource = await this.#resolveCoverSource(localSnapshot, matchRow);
    const conflict = this.#hasConflict(stateRow, localSnapshot);
    const status = this.#resolveStatus({ matchRow, stateRow, conflict });
    const message = this.#statusMessage(status, coverSource);

    return {
      success: true,
      filePath: normalizedFilePath,
      localTrackId: String(localTrackId || ""),
      status,
      hasMatch: Boolean(matchRow?.cloudSongId),
      hasWrittenMetadata: Boolean(stateRow?.lastStatus === "success"),
      canRevert: Boolean(stateRow?.lastStatus === "success" && hasSnapshotValues(stateRow?.revertSnapshot) && !conflict),
      hasEmbeddedArtwork: Boolean(localSnapshot?.hasArtwork),
      coverSource,
      message,
      matchSongId: Number(matchRow?.cloudSongId || 0),
      stateRow: stateRow || null,
    };
  }

  async getStatusBatch({ items }) {
    const result = {};
    for (const item of Array.isArray(items) ? items : []) {
      const filePath = normalizePath(item?.filePath || "");
      if (!filePath) continue;
      result[filePath] = await this.getStatus({
        filePath,
        localTrackId: item?.localTrackId || "",
      });
    }
    return result;
  }

  async #persistState(previewResult, lastStatus, lastError, completedFields, revertSnapshot = {}, lastAppliedValues = {}) {
    await this.db.upsertFileMetadataState({
      filePath: previewResult.filePath,
      localTrackId: previewResult.localTrackId,
      fileSize: previewResult.localSnapshot.fileSize,
      mtime: previewResult.localSnapshot.mtime,
      matchSongId: previewResult.matchSongId || previewResult.existingState?.matchSongId || 0,
      sourceVersion: previewResult.sourceVersion || previewResult.existingState?.sourceVersion || "",
      writeFingerprint: previewResult.fingerprint,
      lastStatus,
      lastError,
      lastWrittenAt: lastStatus === "success" ? new Date().toISOString() : "",
      completedFields,
      revertSnapshot,
      lastAppliedValues,
    });
  }

  #buildRevertState(previewResult, nextSnapshot) {
    const revertSnapshot = {};
    const lastAppliedValues = {};
    const original = previewResult.localSnapshot || {};
    for (const item of previewResult.writePlan?.toWrite || []) {
      const key = item.key;
      if (key === "artwork") {
        revertSnapshot[key] = artworkSnapshot(original.artwork);
        lastAppliedValues[key] = artworkSnapshot(nextSnapshot.artwork);
        continue;
      }
      revertSnapshot[key] = key === "artists" ? [...(original.artists || [])] : original[key];
      lastAppliedValues[key] = key === "artists" ? [...(nextSnapshot.artists || [])] : nextSnapshot[key];
    }
    return { revertSnapshot, lastAppliedValues };
  }

  #buildRevertPlan(stateRow, currentSnapshot) {
    const revertSnapshot = stateRow.revertSnapshot || {};
    const lastAppliedValues = stateRow.lastAppliedValues || {};
    const revertedFields = [];
    const skipped = [];
    const safeSnapshot = {};

    for (const key of Object.keys(revertSnapshot)) {
      const currentValue = key === "artwork"
        ? artworkSnapshot(currentSnapshot.artwork)
        : currentSnapshot[key];
      const expectedValue = lastAppliedValues[key];
      if (normalizeComparableValue(key, currentValue) !== normalizeComparableValue(key, expectedValue)) {
        skipped.push({ key, reason: "文件标签已被修改，跳过回滚" });
        continue;
      }
      safeSnapshot[key] = revertSnapshot[key];
      revertedFields.push(key);
    }

    return {
      canRevert: revertedFields.length > 0,
      revertSnapshot: safeSnapshot,
      revertedFields,
      skipped,
    };
  }

  #buildRewriteValues(currentSnapshot, revertSnapshot) {
    return {
      title: Object.prototype.hasOwnProperty.call(revertSnapshot, "title") ? revertSnapshot.title : currentSnapshot.title,
      artists: Object.prototype.hasOwnProperty.call(revertSnapshot, "artists") ? (revertSnapshot.artists || []) : currentSnapshot.artists,
      album: Object.prototype.hasOwnProperty.call(revertSnapshot, "album") ? revertSnapshot.album : currentSnapshot.album,
      albumArtist: Object.prototype.hasOwnProperty.call(revertSnapshot, "albumArtist") ? revertSnapshot.albumArtist : currentSnapshot.albumArtist,
      genre: Object.prototype.hasOwnProperty.call(revertSnapshot, "genre") ? revertSnapshot.genre : currentSnapshot.genre,
      year: Object.prototype.hasOwnProperty.call(revertSnapshot, "year") ? Number(revertSnapshot.year || 0) : currentSnapshot.year,
      trackNo: Object.prototype.hasOwnProperty.call(revertSnapshot, "trackNo") ? Number(revertSnapshot.trackNo || 0) : currentSnapshot.trackNo,
      discNo: Object.prototype.hasOwnProperty.call(revertSnapshot, "discNo") ? Number(revertSnapshot.discNo || 0) : currentSnapshot.discNo,
      lyrics: Object.prototype.hasOwnProperty.call(revertSnapshot, "lyrics") ? String(revertSnapshot.lyrics || "") : currentSnapshot.lyrics,
      artwork: Object.prototype.hasOwnProperty.call(revertSnapshot, "artwork")
        ? (revertSnapshot.artwork?.base64
          ? { mime: revertSnapshot.artwork.mime || "image/jpeg", buffer: Buffer.from(revertSnapshot.artwork.base64, "base64") }
          : null)
        : currentSnapshot.artwork,
    };
  }

  async #resolveCoverSource(localSnapshot, matchRow) {
    if (localSnapshot?.hasArtwork) return "embedded";
    if (String(matchRow?.cloudAlbumPicUrl || "").trim()) return "match-cache";
    return "placeholder";
  }

  #hasConflict(stateRow, localSnapshot) {
    if (!stateRow?.lastAppliedValues || !hasSnapshotValues(stateRow.lastAppliedValues)) return false;
    const revertPlan = this.#buildRevertPlan(stateRow, localSnapshot);
    return revertPlan.skipped.length > 0;
  }

  #resolveStatus({ matchRow, stateRow, conflict }) {
    const hasMatch = Boolean(matchRow?.cloudSongId);
    const lastStatus = String(stateRow?.lastStatus || "");
    const hasRevertSnapshot = hasSnapshotValues(stateRow?.revertSnapshot);
    const lastError = String(stateRow?.lastError || "");

    if (conflict) return "conflicted";
    if (lastStatus === "partial-reverted") return "partially_reverted";
    if (lastStatus === "reverted") return "reverted";
    if (lastStatus === "success" && hasRevertSnapshot) return "revertible";
    if (lastStatus === "success") return "written";
    if (lastStatus === "skipped" && (lastError.includes("没有可补全的缺失字段") || Array.isArray(stateRow?.completedFields))) {
      return "no_missing_fields";
    }
    if (hasMatch) return "matched_not_written";
    return "unmatched";
  }

  #statusMessage(status, coverSource) {
    if (status === "matched_not_written") return "已匹配云端信息，尚未写入文件";
    if (status === "revertible") return "缺失标签已写入文件，可安全回滚";
    if (status === "written") return "缺失标签已写入文件";
    if (status === "partially_reverted") return "标签已部分回滚，部分字段因文件变化被保留";
    if (status === "reverted") return "本次补全写入的标签已回滚";
    if (status === "conflicted") return "文件标签已被后续修改，当前不可自动回滚";
    if (status === "no_missing_fields") return "文件标签已完整，无需补全";
    if (coverSource === "match-cache") return "当前封面来自匹配缓存";
    return "当前未匹配云端信息";
  }

  async #refreshTrackFromFile(filePath, localTrackId) {
    const dbTrack = await this.db.getTrackByPath(filePath);
    if (!dbTrack) return;
    const snapshot = await this.localTagReader.read(filePath);
    await this.db.upsertTracks([{
      ...dbTrack,
      id: localTrackId || dbTrack.id,
      path: filePath,
      title: snapshot.title || "",
      artist: snapshot.artists.join("/"),
      album: snapshot.album || "",
      albumArtist: snapshot.albumArtist || "",
      genre: snapshot.genre || "",
      year: Number(snapshot.year || 0),
      trackNo: Number(snapshot.trackNo || 0),
      discNo: Number(snapshot.discNo || 0),
      fileSize: Number(snapshot.fileSize || 0),
      mtime: Number(snapshot.mtime || 0),
      hasLyrics: Boolean(snapshot.lyrics),
    }]);
  }
}
