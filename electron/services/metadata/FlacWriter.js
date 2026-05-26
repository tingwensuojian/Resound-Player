import { readFlacTags, writeFlacTags } from "flac-tagger";

export class FlacWriter {
  async write(filePath, writePlan) {
    const current = await readFlacTags(filePath);
    const tagMap = { ...(current?.tagMap || {}) };
    const fields = writePlan.fieldsToWrite || {};

    if (fields.title) tagMap.TITLE = fields.title;
    if (fields.artists?.length) tagMap.ARTIST = fields.artists;
    if (fields.album) tagMap.ALBUM = fields.album;
    if (fields.albumArtist) tagMap.ALBUMARTIST = fields.albumArtist;
    if (fields.genre) tagMap.GENRE = fields.genre;
    if (fields.year) tagMap.DATE = String(fields.year);
    if (fields.trackNo) tagMap.TRACKNUMBER = String(fields.trackNo);
    if (fields.discNo) tagMap.DISCNUMBER = String(fields.discNo);
    if (fields.lyrics) tagMap.LYRICS = fields.lyrics;

    const payload = { tagMap };
    if (fields.artwork?.buffer) {
      payload.picture = {
        mime: fields.artwork.mime,
        description: "Cover",
        buffer: fields.artwork.buffer,
      };
    } else if (current?.picture) {
      payload.picture = current.picture;
    }

    await writeFlacTags(payload, filePath);
  }

  async rewrite(filePath, values) {
    const current = await readFlacTags(filePath);
    const currentMap = { ...(current?.tagMap || {}) };
    const tagMap = { ...currentMap };

    const assignOrDelete = (key, value, multiple = false) => {
      if (value === undefined) return;
      if (multiple) {
        if (Array.isArray(value) && value.length) tagMap[key] = value;
        else delete tagMap[key];
        return;
      }
      if (value === null || value === "") delete tagMap[key];
      else tagMap[key] = value;
    };

    assignOrDelete("TITLE", values.title);
    assignOrDelete("ARTIST", Array.isArray(values.artists) ? values.artists : [], true);
    assignOrDelete("ALBUM", values.album);
    assignOrDelete("ALBUMARTIST", values.albumArtist);
    assignOrDelete("GENRE", values.genre);
    assignOrDelete("DATE", values.year ? String(values.year) : "");
    assignOrDelete("TRACKNUMBER", values.trackNo ? String(values.trackNo) : "");
    assignOrDelete("DISCNUMBER", values.discNo ? String(values.discNo) : "");
    assignOrDelete("LYRICS", values.lyrics);

    const payload = { tagMap };
    if (Object.prototype.hasOwnProperty.call(values, "artwork")) {
      if (values.artwork?.buffer) {
        payload.picture = {
          mime: values.artwork.mime || "image/jpeg",
          description: "Cover",
          buffer: Buffer.isBuffer(values.artwork.buffer) ? values.artwork.buffer : Buffer.from(values.artwork.buffer),
        };
      }
    } else if (current?.picture) {
      payload.picture = current.picture;
    }

    await writeFlacTags(payload, filePath);
  }
}
