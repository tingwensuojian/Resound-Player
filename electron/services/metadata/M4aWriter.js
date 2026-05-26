import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { AudioImageType, readTags, writeTags } = require("@yortyrh/tagpilot-lib");

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

export class M4aWriter {
  async write(filePath, writePlan) {
    const fields = writePlan.fieldsToWrite || {};
    const tags = buildTagsFromFields(fields);
    await writeTags(filePath, tags);
  }

  async rewrite(filePath, values) {
    const current = await readTags(filePath);
    const tags = {};

    const title = values.title !== undefined ? values.title : current.title;
    if (normalizeString(title)) tags.title = normalizeString(title);

    const artists = Array.isArray(values.artists) ? values.artists : current.artists;
    const normalizedArtists = normalizeArtists(artists);
    if (normalizedArtists.length) tags.artists = normalizedArtists;

    const album = values.album !== undefined ? values.album : current.album;
    if (normalizeString(album)) tags.album = normalizeString(album);

    const albumArtists = Array.isArray(values.albumArtists)
      ? values.albumArtists
      : (values.albumArtist !== undefined
        ? [values.albumArtist]
        : current.albumArtists);
    const normalizedAlbumArtists = normalizeArtists(albumArtists);
    if (normalizedAlbumArtists.length) tags.albumArtists = normalizedAlbumArtists;

    const genre = values.genre !== undefined ? values.genre : current.genre;
    if (normalizeString(genre)) tags.genre = normalizeString(genre);

    const year = values.year !== undefined ? Number(values.year || 0) : Number(current.year || 0);
    if (year > 0) tags.year = year;

    const trackNo = values.trackNo !== undefined ? Number(values.trackNo || 0) : Number(current.track?.no || 0);
    if (trackNo > 0) tags.track = { no: trackNo };

    const discNo = values.discNo !== undefined ? Number(values.discNo || 0) : Number(current.disc?.no || 0);
    if (discNo > 0) tags.disc = { no: discNo };

    const lyrics = values.lyrics !== undefined ? values.lyrics : current.comment;
    if (normalizeString(lyrics)) tags.comment = normalizeString(lyrics);

    const artworkValue = Object.prototype.hasOwnProperty.call(values, "artwork")
      ? values.artwork
      : current.image;
    if (artworkValue?.buffer) {
      tags.image = createImagePayload(artworkValue);
    } else if (artworkValue?.data) {
      tags.image = {
        data: Buffer.isBuffer(artworkValue.data) ? artworkValue.data : Buffer.from(artworkValue.data),
        picType: artworkValue.picType || AudioImageType.CoverFront,
        mimeType: normalizeString(artworkValue.mimeType) || "image/jpeg",
        description: normalizeString(artworkValue.description) || "Cover",
      };
    }

    await writeTags(filePath, tags);
  }
}
