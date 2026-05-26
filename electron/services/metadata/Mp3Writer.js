import { createRequire } from "module";
import fs from "fs";

const require = createRequire(import.meta.url);
const NodeID3 = require("node-id3");

export class Mp3Writer {
  async write(filePath, writePlan) {
    const tags = {};
    const fields = writePlan.fieldsToWrite || {};

    if (fields.title) tags.title = fields.title;
    if (fields.artists?.length) tags.artist = fields.artists.join("/");
    if (fields.album) tags.album = fields.album;
    if (fields.albumArtist) tags.performerInfo = fields.albumArtist;
    if (fields.genre) tags.genre = fields.genre;
    if (fields.year) tags.year = String(fields.year);
    if (fields.trackNo) tags.trackNumber = String(fields.trackNo);
    if (fields.discNo) tags.partOfSet = String(fields.discNo);
    if (fields.lyrics) {
      tags.unsynchronisedLyrics = {
        language: "eng",
        text: fields.lyrics,
      };
    }
    if (fields.artwork?.buffer) {
      tags.image = {
        mime: fields.artwork.mime,
        type: { id: 3, name: "front cover" },
        description: "Cover",
        imageBuffer: fields.artwork.buffer,
      };
    }

    const ok = NodeID3.update(tags, filePath);
    if (!ok) throw new Error("MP3 标签写入失败");
  }

  async rewrite(filePath, values) {
    const current = NodeID3.read(filePath) || {};
    const tags = {};

    const title = values.title !== undefined ? values.title : current.title;
    if (title) tags.title = title;

    const artists = Array.isArray(values.artists) ? values.artists : null;
    const artistText = artists ? artists.join("/") : String(current.artist || "").trim();
    if (artistText) tags.artist = artistText;

    const album = values.album !== undefined ? values.album : current.album;
    if (album) tags.album = album;

    const albumArtist = values.albumArtist !== undefined ? values.albumArtist : current.performerInfo;
    if (albumArtist) tags.performerInfo = albumArtist;

    const genre = values.genre !== undefined ? values.genre : current.genre;
    if (genre) tags.genre = genre;

    const year = values.year !== undefined ? values.year : current.year;
    if (year) tags.year = String(year);

    const trackNo = values.trackNo !== undefined ? values.trackNo : current.trackNumber;
    if (trackNo) tags.trackNumber = String(trackNo);

    const discNo = values.discNo !== undefined ? values.discNo : current.partOfSet;
    if (discNo) tags.partOfSet = String(discNo);

    const lyricValue = values.lyrics !== undefined
      ? values.lyrics
      : current.unsynchronisedLyrics?.text;
    if (lyricValue) {
      tags.unsynchronisedLyrics = {
        language: current.unsynchronisedLyrics?.language || "eng",
        text: lyricValue,
      };
    }

    const artworkValue = Object.prototype.hasOwnProperty.call(values, "artwork")
      ? values.artwork
      : current.image;
    if (artworkValue?.buffer) {
      tags.image = {
        mime: artworkValue.mime || artworkValue.format || "image/jpeg",
        type: { id: 3, name: "front cover" },
        description: "Cover",
        imageBuffer: Buffer.isBuffer(artworkValue.buffer) ? artworkValue.buffer : Buffer.from(artworkValue.buffer),
      };
    } else if (artworkValue?.imageBuffer) {
      tags.image = {
        mime: artworkValue.mime || "image/jpeg",
        type: artworkValue.type || { id: 3, name: "front cover" },
        description: artworkValue.description || "Cover",
        imageBuffer: artworkValue.imageBuffer,
      };
    }

    const fileBuffer = fs.readFileSync(filePath);
    const stripped = NodeID3.removeTagsFromBuffer(fileBuffer) || fileBuffer;
    const nextBuffer = NodeID3.update(tags, stripped);
    if (!Buffer.isBuffer(nextBuffer)) throw new Error("MP3 标签回滚失败");
    fs.writeFileSync(filePath, nextBuffer);
  }
}
