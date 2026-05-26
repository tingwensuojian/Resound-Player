import { app } from "electron";
import fs from "fs";
import path from "path";
import { MetadataWriteService } from "../electron/services/metadata/MetadataWriteService.js";
import { LocalTagReader } from "../electron/services/metadata/LocalTagReader.js";

function now() {
  return new Date().toISOString();
}

async function main() {
  const fixtureDir = path.join(process.cwd(), "tmp-wav-e2e");
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  fs.mkdirSync(fixtureDir, { recursive: true });

  const sourceFile = "/Users/sangxuesheng/Downloads/2009 - 《我爱南京》WAV整分轨-歌词已更新/分轨/1990年的春天《我爱南京》.wav";
  const coverFile = "/Users/sangxuesheng/Downloads/2009 - 《我爱南京》WAV整分轨-歌词已更新/Cover.jpg";
  const testFile = path.join(fixtureDir, "1990年的春天-test.wav");
  fs.copyFileSync(sourceFile, testFile);
  const coverBuffer = fs.readFileSync(coverFile);

  const trackRow = {
    id: "wav-e2e-track",
    path: testFile,
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
    fileSize: fs.statSync(testFile).size,
    mtime: fs.statSync(testFile).mtimeMs,
    hasLyrics: 0,
    createdAt: now(),
    updatedAt: now(),
  };

  const db = {
    matchRow: {
      localTrackId: "wav-e2e-track",
      localPath: testFile,
      cloudSongId: 900001,
      cloudSongName: "1990年的春天",
      cloudArtists: "李志",
      cloudAlbum: "《我爱南京》",
      cloudAlbumId: 9000,
      cloudAlbumPicUrl: "https://example.com/wav-cover.jpg",
      cloudDuration: 0,
      cloudTrackNo: 9,
      cloudDiscNo: 1,
      cloudYear: 2009,
      cloudGenre: "Folk",
      cloudLyrics: "整链测试歌词\n第二行",
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
  const before = await reader.read(testFile);
  const preview = await service.preview({ filePath: testFile, localTrackId: "wav-e2e-track" });
  const writeResult = await service.writeOne({ filePath: testFile, localTrackId: "wav-e2e-track", mode: "fill-missing" });
  const afterWrite = await reader.read(testFile);
  const stateAfterWrite = await service.getStatus({ filePath: testFile, localTrackId: "wav-e2e-track" });
  const revertResult = await service.revertOne({ filePath: testFile, localTrackId: "wav-e2e-track" });
  const afterRevert = await reader.read(testFile);
  const stateAfterRevert = await service.getStatus({ filePath: testFile, localTrackId: "wav-e2e-track" });

  console.log(JSON.stringify({
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
      stateStatus: db.metadataState?.lastStatus || null,
      completedFields: db.metadataState?.completedFields || [],
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
  }, null, 2));

  fs.rmSync(fixtureDir, { recursive: true, force: true });
  await app.quit();
}

app.whenReady().then(main).catch(async (error) => {
  console.error(error);
  await app.quit();
  process.exitCode = 1;
});
