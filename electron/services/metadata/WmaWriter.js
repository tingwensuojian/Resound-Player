import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { AudioImageType, clearTags, writeTags } = require("@yortyrh/tagpilot-lib");

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeArtists(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function createImagePayload(artwork) {
  if (!artwork?.buffer) return undefined;
  return {
    data: Buffer.isBuffer(artwork.buffer) ? artwork.buffer : Buffer.from(artwork.buffer),
    picType: AudioImageType.CoverFront,
    mimeType: normalizeString(artwork.mime) || "image/jpeg",
    description: "Cover",
  };
}

function buildTagsFromFields(fields) {
  const tags = {};

  if (fields.title) tags.title = normalizeString(fields.title);

  const artists = normalizeArtists(fields.artists);
  if (artists.length) tags.artists = artists;

  if (fields.album) tags.album = normalizeString(fields.album);

  const albumArtists = normalizeArtists(
    Array.isArray(fields.albumArtists)
      ? fields.albumArtists
      : (fields.albumArtist ? [fields.albumArtist] : [])
  );
  if (albumArtists.length) tags.albumArtists = albumArtists;

  if (fields.genre) tags.genre = normalizeString(fields.genre);
  if (fields.year) tags.year = Number(fields.year);
  if (fields.trackNo) tags.track = { no: Number(fields.trackNo) };
  if (fields.discNo) tags.disc = { no: Number(fields.discNo) };
  if (fields.lyrics) tags.comment = normalizeString(fields.lyrics);

  const image = createImagePayload(fields.artwork);
  if (image) tags.image = image;

  return tags;
}

export class WmaWriter {
  async write(filePath, writePlan) {
    const fields = writePlan.fieldsToWrite || {};
    const tags = buildTagsFromFields(fields);
    await writeTags(filePath, tags);
  }

  async rewrite(filePath, values) {
    await clearTags(filePath);
    const tags = buildTagsFromFields({
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
    await writeTags(filePath, tags);
  }
}
