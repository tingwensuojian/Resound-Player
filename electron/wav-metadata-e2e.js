import fs from "node:fs";
import path from "node:path";
import { MetadataWriteService } from "./services/metadata/MetadataWriteService.js";
import { LocalTagReader } from "./services/metadata/LocalTagReader.js";
import { WavWriter } from "./services/metadata/WavWriter.js";

function now() {
  return new Date().toISOString();
}

export async function runWavMetadataE2E(app) {
  const overrideSourceFile = process.env.RESOUND_WAV_METADATA_SOURCE_FILE || "";
  const sourceFile = overrideSourceFile || "/Users/sangxuesheng/Downloads/2009 - 《我爱南京》WAV整分轨-歌词已更新/分轨/1990年的春天《我爱南京》.wav";
  const coverFile = process.env.RESOUND_WAV_METADATA_COVER_FILE || "/Users/sangxuesheng/Downloads/2009 - 《我爱南京》WAV整分轨-歌词已更新/Cover.jpg";
  const cloudSongName = process.env.RESOUND_WAV_METADATA_SONG_NAME || "1990年的春天";
  const cloudArtists = process.env.RESOUND_WAV_METADATA_ARTISTS || "李志";
  const cloudAlbum = process.env.RESOUND_WAV_METADATA_ALBUM || "《我爱南京》";
  const cloudGenre = process.env.RESOUND_WAV_METADATA_GENRE || "Folk";
  const cloudYear = Number(process.env.RESOUND_WAV_METADATA_YEAR || 2009);
  const cloudTrackNo = Number(process.env.RESOUND_WAV_METADATA_TRACK_NO || 9);
  const cloudDiscNo = Number(process.env.RESOUND_WAV_METADATA_DISC_NO || 1);
  const cloudLyrics = process.env.RESOUND_WAV_METADATA_LYRICS || "整链测试歌词\n第二行";

  const fixtureDir = path.join(process.cwd(), "tmp-wav-e2e");
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  fs.mkdirSync(fixtureDir, { recursive: true });

  const originalLikeFile = path.join(fixtureDir, "1990年的春天-original-like.wav");
  const missingFieldsFile = path.join(fixtureDir, "1990年的春天-missing-fields.wav");
  fs.copyFileSync(sourceFile, originalLikeFile);
  fs.copyFileSync(sourceFile, missingFieldsFile);
  const coverBuffer = fs.readFileSync(coverFile);
  const wavWriter = new WavWriter();

  await wavWriter.rewrite(missingFieldsFile, {
    title: "",
    artists: [],
    album: "",
    albumArtist: "",
    genre: "",
    year: 0,
    trackNo: 0,
    discNo: 0,
    lyrics: "",
    artwork: null,
  });

  const trackRow = {
    id: "wav-e2e-track",
    path: originalLikeFile,
    title: "1990年的春天-test",
    artist: "",
    album: "",
    albumArtist: "",
    duration: 0,
    bitrate: 0,
    sampleRate: 0,
    trackNo: 0,
    discNo: 0,
    genre: "",
    year: 0,
    coverPath: "",
    fileSize: fs.statSync(originalLikeFile).size,
    mtime: fs.statSync(originalLikeFile).mtimeMs,
    hasLyrics: 0,
    createdAt: now(),
    updatedAt: now(),
  };

  const db = {
    matchRow: {
      localTrackId: "wav-e2e-track",
      localPath: originalLikeFile,
      cloudSongId: 900001,
      cloudSongName: cloudSongName,
      cloudArtists: cloudArtists,
      cloudAlbum: cloudAlbum,
      cloudAlbumId: 9000,
      cloudAlbumPicUrl: "https://example.com/wav-cover.jpg",
      cloudDuration: 0,
      cloudTrackNo: cloudTrackNo,
      cloudDiscNo: cloudDiscNo,
      cloudYear: cloudYear,
      cloudGenre: cloudGenre,
      cloudLyrics: cloudLyrics,
      cloudSyncedLyrics: "",
      cloudTranslationLyrics: "",
      cloudRomanizedLyrics: "",
      sourceVersion: "wav-e2e-v1",
      confidence: 1,
      matchMode: "manual",
      createdAt: now(),
      updatedAt: now(),
    },
    metadataState: null,
    track: { ...trackRow },
    async getLocalLyricMatch(localTrackId, localPath) {
      if (localTrackId === this.matchRow.localTrackId || localPath === this.matchRow.localPath) {
        return { ...this.matchRow };
      }
      return null;
    },
    async getFileMetadataState(filePath) {
      if (!this.metadataState) return null;
      return this.metadataState.filePath === filePath ? structuredClone(this.metadataState) : null;
    },
    async upsertFileMetadataState(payload) {
      this.metadataState = structuredClone(payload);
    },
    async getTrackByPath(filePath) {
      if (this.track.path !== filePath) return null;
      return { ...this.track };
    },
    async upsertTracks(tracks) {
      if (Array.isArray(tracks) && tracks[0]) this.track = { ...tracks[0] };
    },
  };

  const service = new MetadataWriteService(db);
  service.coverCache = { clearCache() {} };
  service.artworkService.fetch = async () => ({
    buffer: coverBuffer,
    mime: "image/jpeg",
    hash: "wav-e2e-cover-hash",
  });

  const reader = new LocalTagReader();
  const before = await reader.read(originalLikeFile);
  const preview = await service.preview({ filePath: originalLikeFile, localTrackId: "wav-e2e-track" });
  const writeResult = await service.writeOne({ filePath: originalLikeFile, localTrackId: "wav-e2e-track", mode: "fill-missing" });
  const afterWrite = await reader.read(originalLikeFile);
  const stateAfterWrite = await service.getStatus({ filePath: originalLikeFile, localTrackId: "wav-e2e-track" });
  const revertResult = await service.revertOne({ filePath: originalLikeFile, localTrackId: "wav-e2e-track" });
  const afterRevert = await reader.read(originalLikeFile);
  const stateAfterRevert = await service.getStatus({ filePath: originalLikeFile, localTrackId: "wav-e2e-track" });

  const result = {
    originalLike: {
      before: {
        title: before.title,
        artists: before.artists,
        album: before.album,
        year: before.year,
        lyrics: before.lyrics,
        hasArtwork: before.hasArtwork,
      },
      preview: {
        duplicate: preview.duplicate,
        canWrite: preview.writePlan.canWrite,
        toWrite: preview.writePlan.toWrite.map((item) => item.key),
        skipped: preview.writePlan.skipped.map((item) => ({ key: item.key, reason: item.reason })),
      },
      writeResult: {
        success: writeResult.success,
        skipped: writeResult.skipped,
      },
      afterWrite: {
        title: afterWrite.title,
        artists: afterWrite.artists,
        album: afterWrite.album,
        albumArtist: afterWrite.albumArtist,
        genre: afterWrite.genre,
        year: afterWrite.year,
        trackNo: afterWrite.trackNo,
        discNo: afterWrite.discNo,
        lyrics: afterWrite.lyrics,
        hasArtwork: afterWrite.hasArtwork,
      },
      stateAfterWrite: {
        status: stateAfterWrite.status,
        canRevert: stateAfterWrite.canRevert,
        message: stateAfterWrite.message,
      },
      revertResult,
      afterRevert: {
        title: afterRevert.title,
        artists: afterRevert.artists,
        album: afterRevert.album,
        albumArtist: afterRevert.albumArtist,
        genre: afterRevert.genre,
        year: afterRevert.year,
        trackNo: afterRevert.trackNo,
        discNo: afterRevert.discNo,
        lyrics: afterRevert.lyrics,
        hasArtwork: afterRevert.hasArtwork,
      },
      stateAfterRevert: {
        status: stateAfterRevert.status,
        canRevert: stateAfterRevert.canRevert,
        message: stateAfterRevert.message,
      },
      trackAfterRefresh: {
        title: db.track.title,
        artist: db.track.artist,
        album: db.track.album,
        albumArtist: db.track.albumArtist,
        genre: db.track.genre,
        year: db.track.year,
        trackNo: db.track.trackNo,
        discNo: db.track.discNo,
        hasLyrics: db.track.hasLyrics,
      },
    },
  };

  db.matchRow.localPath = missingFieldsFile;
  db.track = {
    ...db.track,
    path: missingFieldsFile,
    title: "",
    artist: "",
    album: "",
    albumArtist: "",
    genre: "",
    year: 0,
    trackNo: 0,
    discNo: 0,
    fileSize: fs.statSync(missingFieldsFile).size,
    mtime: fs.statSync(missingFieldsFile).mtimeMs,
    hasLyrics: 0,
  };
  db.metadataState = null;

  const beforeMissing = await reader.read(missingFieldsFile);
  const previewMissing = await service.preview({ filePath: missingFieldsFile, localTrackId: "wav-e2e-track" });
  const writeMissing = await service.writeOne({ filePath: missingFieldsFile, localTrackId: "wav-e2e-track", mode: "fill-missing" });
  const afterWriteMissing = await reader.read(missingFieldsFile);
  const stateAfterWriteMissing = await service.getStatus({ filePath: missingFieldsFile, localTrackId: "wav-e2e-track" });
  const revertMissing = await service.revertOne({ filePath: missingFieldsFile, localTrackId: "wav-e2e-track" });
  const afterRevertMissing = await reader.read(missingFieldsFile);
  const stateAfterRevertMissing = await service.getStatus({ filePath: missingFieldsFile, localTrackId: "wav-e2e-track" });

  result.missingFields = {
    before: {
      title: beforeMissing.title,
      artists: beforeMissing.artists,
      album: beforeMissing.album,
      albumArtist: beforeMissing.albumArtist,
      genre: beforeMissing.genre,
      year: beforeMissing.year,
      trackNo: beforeMissing.trackNo,
      discNo: beforeMissing.discNo,
      lyrics: beforeMissing.lyrics,
      hasArtwork: beforeMissing.hasArtwork,
    },
    preview: {
      duplicate: previewMissing.duplicate,
      canWrite: previewMissing.writePlan.canWrite,
      toWrite: previewMissing.writePlan.toWrite.map((item) => item.key),
      skipped: previewMissing.writePlan.skipped.map((item) => ({ key: item.key, reason: item.reason })),
    },
    writeResult: {
      success: writeMissing.success,
      skipped: writeMissing.skipped,
      stateStatus: db.metadataState?.lastStatus || null,
      completedFields: db.metadataState?.completedFields || [],
    },
    afterWrite: {
      title: afterWriteMissing.title,
      artists: afterWriteMissing.artists,
      album: afterWriteMissing.album,
      albumArtist: afterWriteMissing.albumArtist,
      genre: afterWriteMissing.genre,
      year: afterWriteMissing.year,
      trackNo: afterWriteMissing.trackNo,
      discNo: afterWriteMissing.discNo,
      lyrics: afterWriteMissing.lyrics,
      hasArtwork: afterWriteMissing.hasArtwork,
    },
    stateAfterWrite: {
      status: stateAfterWriteMissing.status,
      canRevert: stateAfterWriteMissing.canRevert,
      message: stateAfterWriteMissing.message,
    },
    revertResult: revertMissing,
    afterRevert: {
      title: afterRevertMissing.title,
      artists: afterRevertMissing.artists,
      album: afterRevertMissing.album,
      albumArtist: afterRevertMissing.albumArtist,
      genre: afterRevertMissing.genre,
      year: afterRevertMissing.year,
      trackNo: afterRevertMissing.trackNo,
      discNo: afterRevertMissing.discNo,
      lyrics: afterRevertMissing.lyrics,
      hasArtwork: afterRevertMissing.hasArtwork,
    },
    stateAfterRevert: {
      status: stateAfterRevertMissing.status,
      canRevert: stateAfterRevertMissing.canRevert,
      message: stateAfterRevertMissing.message,
    },
    trackAfterRefresh: {
      title: db.track.title,
      artist: db.track.artist,
      album: db.track.album,
      albumArtist: db.track.albumArtist,
      genre: db.track.genre,
      year: db.track.year,
      trackNo: db.track.trackNo,
      discNo: db.track.discNo,
      hasLyrics: db.track.hasLyrics,
    },
  };

  console.log(JSON.stringify(result, null, 2));
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  app.exit(0);
}
