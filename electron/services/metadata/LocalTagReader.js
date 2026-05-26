import fs from "fs";
import path from "path";
import * as mm from "music-metadata";

function firstValue(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function parseNumberish(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(String(value).split("/")[0]);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseLyricsFromNative(native = {}) {
  const blocks = [];
  for (const values of Object.values(native)) {
    if (!Array.isArray(values)) continue;
    for (const item of values) {
      const id = String(item?.id || "").toUpperCase();
      if (id === "USLT" && item?.value?.text) blocks.push(String(item.value.text).trim());
      if (id === "LYRICS" && item?.value) blocks.push(String(item.value).trim());
      if (id === "UNSYNCEDLYRICS" && item?.value?.text) blocks.push(String(item.value.text).trim());
    }
  }
  return blocks.find(Boolean) || "";
}

function normalizeArtwork(picture) {
  if (!picture?.data) return null;
  const buffer = Buffer.isBuffer(picture.data) ? picture.data : Buffer.from(picture.data);
  return {
    buffer,
    mime: String(picture.format || picture.mime || "").trim() || "image/jpeg",
  };
}

export class LocalTagReader {
  async read(filePath) {
    const stat = fs.statSync(filePath);
    const metadata = await mm.parseFile(filePath, { duration: false, skipPostHeaders: true });
    const common = metadata.common || {};
    const artwork = Array.isArray(common.picture) && common.picture.length ? normalizeArtwork(common.picture[0]) : null;
    return {
      filePath,
      ext: path.extname(filePath).toLowerCase(),
      fileSize: Number(stat.size || 0),
      mtime: Number(stat.mtimeMs || 0),
      title: String(common.title || "").trim(),
      artists: Array.isArray(common.artists) && common.artists.length
        ? common.artists.map((item) => String(item || "").trim()).filter(Boolean)
        : String(common.artist || "").split("/").map((item) => item.trim()).filter(Boolean),
      album: String(common.album || "").trim(),
      albumArtist: String(common.albumartist || common.albumArtist || "").trim(),
      genre: firstValue(common.genre),
      year: parseNumberish(common.year),
      trackNo: parseNumberish(common.track?.no),
      discNo: parseNumberish(common.disk?.no || common.disc?.no),
      lyrics: Array.isArray(common.lyrics) && common.lyrics.length ? String(common.lyrics[0] || "").trim() : parseLyricsFromNative(metadata.native),
      hasArtwork: Boolean(artwork),
      artwork,
    };
  }
}
