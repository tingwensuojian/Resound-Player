import fs from "fs";
import path from "path";
import * as mm from "music-metadata";

function firstValue(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function isReadableText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text === "[object Object]") return false;
  const replacementCount = [...text].filter((char) => char === "\uFFFD").length;
  return replacementCount < Math.max(2, Math.ceil(text.length / 3));
}

function isPlaceholderLyricText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return [
    /^ExactAudioCopy\b/i,
    /^EAC\b/i,
    /^CUERipper\b/i,
    /^dBpoweramp\b/i,
    /^foobar2000\b/i,
    /^MusicBee\b/i,
    /^JRiver(?:\s+Media\s+Center)?\b/i,
    /^MediaMonkey\b/i,
    /^XLD\b/i,
    /^fre:ac\b/i,
    /^freac\b/i,
    /^iTunes\b/i,
    /^Windows Media Player\b/i,
    /^MusicBrainz Picard\b/i,
    /^Picard\b/i,
    /^Mp3tag\b/i,
    /^TagScanner\b/i,
    /^Kid3\b/i,
    /^MediaJukebox\b/i,
  ].some((pattern) => pattern.test(text));
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

function parseComment(common = {}) {
  if (Array.isArray(common.comment) && common.comment.length) {
    for (const item of common.comment) {
      if (typeof item === "string" && item.trim() && !isPlaceholderLyricText(item)) return item.trim();
      if (item && typeof item === "object") {
        const text = String(item.text || item.value || "").trim();
        if (text && !isPlaceholderLyricText(text)) return text;
      }
    }
    return "";
  }
  if (common.comment && typeof common.comment === "object") {
    const text = String(common.comment.text || common.comment.value || "").trim();
    return isPlaceholderLyricText(text) ? "" : text;
  }
  const text = String(common.comment || "").trim();
  return isPlaceholderLyricText(text) ? "" : text;
}

function normalizeArtists(common = {}) {
  const directArtist = String(common.artist || "").trim();
  if (isReadableText(directArtist)) {
    return directArtist
      .split(/[\/,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(common.artists) && common.artists.length) {
    const list = common.artists
      .map((item) => String(item || "").trim())
      .filter((item) => isReadableText(item));
    if (list.length) return list;
  }

  return [];
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
      artists: normalizeArtists(common),
      album: String(common.album || "").trim(),
      albumArtist: String(common.albumartist || common.albumArtist || "").trim(),
      genre: firstValue(common.genre),
      year: parseNumberish(common.year),
      trackNo: parseNumberish(common.track?.no),
      discNo: parseNumberish(common.disk?.no || common.disc?.no),
      lyrics: Array.isArray(common.lyrics) && common.lyrics.length
        ? String(common.lyrics[0] || "").trim()
        : (parseLyricsFromNative(metadata.native) || parseComment(common)),
      hasArtwork: Boolean(artwork),
      artwork,
    };
  }
}
