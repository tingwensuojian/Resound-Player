const FIELD_LABELS = {
  title: "歌曲名称",
  artists: "歌手",
  album: "专辑",
  albumArtist: "专辑歌手",
  genre: "风格",
  year: "年份",
  trackNo: "音轨号",
  discNo: "碟号",
  lyrics: "歌词",
  artwork: "封面",
};

function hasText(value) {
  if (Array.isArray(value)) return value.some((item) => String(item || "").trim());
  return Boolean(String(value || "").trim());
}

function hasNumber(value) {
  return Number(value || 0) > 0;
}

function pushSkipped(skipped, key, reason) {
  skipped.push({ key, label: FIELD_LABELS[key] || key, reason });
}

function pushWrite(fieldsToWrite, key, label, value) {
  fieldsToWrite[key] = value;
  return { key, label, value };
}

export class MergePolicy {
  build(localSnapshot, normalizedMetadata) {
    const toWrite = [];
    const skipped = [];
    const fieldsToWrite = {};

    if (normalizedMetadata.title) {
      if (!hasText(localSnapshot.title)) toWrite.push(pushWrite(fieldsToWrite, "title", FIELD_LABELS.title, normalizedMetadata.title));
      else pushSkipped(skipped, "title", "文件已有标题");
    }

    if (normalizedMetadata.artists.length) {
      if (!hasText(localSnapshot.artists)) toWrite.push(pushWrite(fieldsToWrite, "artists", FIELD_LABELS.artists, normalizedMetadata.artists));
      else pushSkipped(skipped, "artists", "文件已有歌手");
    }

    if (normalizedMetadata.album) {
      if (!hasText(localSnapshot.album)) toWrite.push(pushWrite(fieldsToWrite, "album", FIELD_LABELS.album, normalizedMetadata.album));
      else pushSkipped(skipped, "album", "文件已有专辑");
    }

    if (normalizedMetadata.albumArtist) {
      if (!hasText(localSnapshot.albumArtist)) toWrite.push(pushWrite(fieldsToWrite, "albumArtist", FIELD_LABELS.albumArtist, normalizedMetadata.albumArtist));
      else pushSkipped(skipped, "albumArtist", "文件已有专辑歌手");
    }

    if (normalizedMetadata.genre) {
      if (!hasText(localSnapshot.genre)) toWrite.push(pushWrite(fieldsToWrite, "genre", FIELD_LABELS.genre, normalizedMetadata.genre));
      else pushSkipped(skipped, "genre", "文件已有风格");
    }

    if (normalizedMetadata.year > 0) {
      if (!hasNumber(localSnapshot.year)) toWrite.push(pushWrite(fieldsToWrite, "year", FIELD_LABELS.year, normalizedMetadata.year));
      else pushSkipped(skipped, "year", "文件已有年份");
    }

    if (normalizedMetadata.trackNo > 0) {
      if (!hasNumber(localSnapshot.trackNo)) toWrite.push(pushWrite(fieldsToWrite, "trackNo", FIELD_LABELS.trackNo, normalizedMetadata.trackNo));
      else pushSkipped(skipped, "trackNo", "文件已有音轨号");
    }

    if (normalizedMetadata.discNo > 0) {
      if (!hasNumber(localSnapshot.discNo)) toWrite.push(pushWrite(fieldsToWrite, "discNo", FIELD_LABELS.discNo, normalizedMetadata.discNo));
      else pushSkipped(skipped, "discNo", "文件已有碟号");
    }

    if (normalizedMetadata.lyrics) {
      if (!hasText(localSnapshot.lyrics)) toWrite.push(pushWrite(fieldsToWrite, "lyrics", FIELD_LABELS.lyrics, normalizedMetadata.lyrics));
      else pushSkipped(skipped, "lyrics", "文件已有歌词");
    }

    if (normalizedMetadata.artwork?.buffer) {
      if (!localSnapshot.hasArtwork) toWrite.push(pushWrite(fieldsToWrite, "artwork", FIELD_LABELS.artwork, normalizedMetadata.artwork));
      else pushSkipped(skipped, "artwork", "文件已有封面");
    } else if (normalizedMetadata.artwork?.url) {
      pushSkipped(skipped, "artwork", "封面尚未准备完成");
    }

    return {
      mode: "fill-missing",
      fieldsToWrite,
      toWrite,
      skipped,
      canWrite: toWrite.length > 0,
    };
  }
}

