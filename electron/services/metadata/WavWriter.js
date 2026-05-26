import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const NodeID3 = require("node-id3");

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeArtists(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function normalizePositiveNumberString(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) && num > 0 ? String(Math.trunc(num)) : "";
}

function inferLyricLanguage(text) {
  return /[\u3400-\u9fff]/.test(String(text || "")) ? "zho" : "eng";
}

function hasImageValue(image) {
  return Boolean(image?.imageBuffer || image?.buffer);
}

function normalizeImage(image) {
  if (image?.imageBuffer) {
    return {
      mime: normalizeString(image.mime || image.format) || "image/jpeg",
      type: image.type || { id: 3, name: "front cover" },
      description: normalizeString(image.description) || "Cover",
      imageBuffer: Buffer.isBuffer(image.imageBuffer) ? image.imageBuffer : Buffer.from(image.imageBuffer),
    };
  }
  if (image?.buffer) {
    return {
      mime: normalizeString(image.mime || image.format) || "image/jpeg",
      type: { id: 3, name: "front cover" },
      description: normalizeString(image.description) || "Cover",
      imageBuffer: Buffer.isBuffer(image.buffer) ? image.buffer : Buffer.from(image.buffer),
    };
  }
  return null;
}

function parseRiffChunks(fileBuffer) {
  if (fileBuffer.length < 12) throw new Error("WAV 文件过小，无法解析");
  if (fileBuffer.toString("ascii", 0, 4) !== "RIFF" || fileBuffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("当前文件不是标准 RIFF/WAVE 结构");
  }

  const chunks = [];
  let offset = 12;
  while (offset + 8 <= fileBuffer.length) {
    const id = fileBuffer.toString("ascii", offset, offset + 4);
    const size = fileBuffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    if (dataEnd > fileBuffer.length) throw new Error(`WAV chunk 越界: ${id}`);
    const paddedEnd = dataEnd + (size % 2);
    chunks.push({ id, size, offset, dataStart, dataEnd, paddedEnd });
    offset = paddedEnd;
  }

  return chunks;
}

function extractId3Buffer(fileBuffer) {
  const id3Chunk = parseRiffChunks(fileBuffer).find((chunk) => chunk.id === "ID3 ");
  if (!id3Chunk) return null;
  return fileBuffer.slice(id3Chunk.dataStart, id3Chunk.dataEnd);
}

function readCurrentCanonicalTags(fileBuffer) {
  const id3Buffer = extractId3Buffer(fileBuffer);
  if (!id3Buffer) return {};

  const current = NodeID3.read(id3Buffer) || {};
  const tags = {};

  const title = normalizeString(current.title);
  if (title) tags.title = title;

  const artist = normalizeString(current.artist);
  if (artist) tags.artist = artist;

  const album = normalizeString(current.album);
  if (album) tags.album = album;

  const performerInfo = normalizeString(current.performerInfo);
  if (performerInfo) tags.performerInfo = performerInfo;

  const genre = normalizeString(current.genre);
  if (genre) tags.genre = genre;

  const year = normalizeString(current.year);
  if (year) tags.year = year;

  const trackNumber = normalizePositiveNumberString(current.trackNumber);
  if (trackNumber) tags.trackNumber = trackNumber;

  const partOfSet = normalizePositiveNumberString(current.partOfSet);
  if (partOfSet) tags.partOfSet = partOfSet;

  const lyricText = normalizeString(current.unsynchronisedLyrics?.text || current.comment?.text);
  if (lyricText) {
    tags.unsynchronisedLyrics = {
      language: normalizeString(current.unsynchronisedLyrics?.language) || inferLyricLanguage(lyricText),
      text: lyricText,
    };
  }

  const image = normalizeImage(current.image);
  if (image) tags.image = image;

  return tags;
}

function buildCanonicalTagsFromFields(fields = {}) {
  const tags = {};

  const title = normalizeString(fields.title);
  if (title) tags.title = title;

  const artists = normalizeArtists(fields.artists);
  if (artists.length) tags.artist = artists.join("/");

  const album = normalizeString(fields.album);
  if (album) tags.album = album;

  const albumArtist = normalizeString(fields.albumArtist || (Array.isArray(fields.albumArtists) ? fields.albumArtists[0] : ""));
  if (albumArtist) tags.performerInfo = albumArtist;

  const genre = normalizeString(fields.genre);
  if (genre) tags.genre = genre;

  const year = normalizePositiveNumberString(fields.year);
  if (year) tags.year = year;

  const trackNumber = normalizePositiveNumberString(fields.trackNo);
  if (trackNumber) tags.trackNumber = trackNumber;

  const discNumber = normalizePositiveNumberString(fields.discNo);
  if (discNumber) tags.partOfSet = discNumber;

  const lyrics = normalizeString(fields.lyrics);
  if (lyrics) {
    tags.unsynchronisedLyrics = {
      language: inferLyricLanguage(lyrics),
      text: lyrics,
    };
  }

  const image = normalizeImage(fields.artwork);
  if (image) tags.image = image;

  return tags;
}

function mergeCanonicalTags(baseTags, overrideTags) {
  const merged = { ...baseTags };

  for (const [key, value] of Object.entries(overrideTags)) {
    merged[key] = value;
  }

  return merged;
}

function buildId3ChunkBuffer(tags) {
  if (!Object.keys(tags).length) return null;

  const id3Buffer = NodeID3.create(tags);
  if (!Buffer.isBuffer(id3Buffer) || !id3Buffer.length) return null;

  const header = Buffer.alloc(8);
  header.write("ID3 ", 0, "ascii");
  header.writeUInt32LE(id3Buffer.length, 4);

  const padding = id3Buffer.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);
  return Buffer.concat([header, id3Buffer, padding]);
}

function rewriteWaveId3Chunk(filePath, tags) {
  const fileBuffer = fs.readFileSync(filePath);
  const chunks = parseRiffChunks(fileBuffer);

  const preservedChunks = chunks
    .filter((chunk) => chunk.id !== "ID3 ")
    .map((chunk) => fileBuffer.slice(chunk.offset, chunk.paddedEnd));

  const id3Chunk = buildId3ChunkBuffer(tags);
  if (id3Chunk) preservedChunks.push(id3Chunk);

  const waveBody = Buffer.concat([Buffer.from("WAVE", "ascii"), ...preservedChunks]);
  const riffHeader = Buffer.alloc(8);
  riffHeader.write("RIFF", 0, "ascii");
  riffHeader.writeUInt32LE(waveBody.length, 4);

  fs.writeFileSync(filePath, Buffer.concat([riffHeader, waveBody]));
}

export class WavWriter {
  async write(filePath, writePlan) {
    const currentBuffer = fs.readFileSync(filePath);
    const currentTags = readCurrentCanonicalTags(currentBuffer);
    const overrideTags = buildCanonicalTagsFromFields(writePlan.fieldsToWrite || {});
    const nextTags = mergeCanonicalTags(currentTags, overrideTags);
    rewriteWaveId3Chunk(filePath, nextTags);
  }

  async rewrite(filePath, values) {
    const nextTags = buildCanonicalTagsFromFields({
      title: values.title,
      artists: values.artists,
      album: values.album,
      albumArtist: values.albumArtist,
      albumArtists: values.albumArtists,
      genre: values.genre,
      year: values.year,
      trackNo: values.trackNo,
      discNo: values.discNo,
      lyrics: values.lyrics,
      artwork: values.artwork,
    });
    rewriteWaveId3Chunk(filePath, nextTags);
  }
}
