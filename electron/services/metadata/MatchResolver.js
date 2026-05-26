import { createEmptyNormalizedMetadata } from "./types.js";

function splitArtists(value) {
  return String(value || "")
    .split(/[\/,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export class MatchResolver {
  resolve(matchRow) {
    if (!matchRow?.cloudSongId) {
      throw new Error("未找到已保存的云端匹配记录");
    }
    if (!matchRow.cloudSongName || !matchRow.cloudArtists) {
      throw new Error("当前匹配缓存不完整，请重新保存匹配后再试");
    }
    if (!matchRow.cloudAlbumPicUrl) {
      throw new Error("当前匹配缺少封面缓存，请重新保存匹配后再试");
    }
    if (!matchRow.cloudLyrics && !matchRow.cloudSyncedLyrics) {
      throw new Error("当前匹配缺少歌词缓存，请重新保存匹配后再试");
    }

    const normalized = createEmptyNormalizedMetadata();
    normalized.title = String(matchRow.cloudSongName || "").trim();
    normalized.artists = splitArtists(matchRow.cloudArtists);
    normalized.album = String(matchRow.cloudAlbum || "").trim();
    normalized.albumArtist = normalized.artists.join("/");
    normalized.genre = String(matchRow.cloudGenre || "").trim();
    normalized.year = Number(matchRow.cloudYear || 0);
    normalized.trackNo = Number(matchRow.cloudTrackNo || 0);
    normalized.discNo = Number(matchRow.cloudDiscNo || 0);
    normalized.lyrics = String(matchRow.cloudLyrics || matchRow.cloudSyncedLyrics || "").trim();
    normalized.syncedLyrics = String(matchRow.cloudSyncedLyrics || "").trim();
    normalized.translationLyrics = String(matchRow.cloudTranslationLyrics || "").trim();
    normalized.romanizedLyrics = String(matchRow.cloudRomanizedLyrics || "").trim();
    normalized.artwork = {
      url: String(matchRow.cloudAlbumPicUrl || "").trim(),
      albumId: Number(matchRow.cloudAlbumId || 0),
    };
    normalized.sourceVersion = String(matchRow.sourceVersion || "").trim();
    normalized.cloudSongId = Number(matchRow.cloudSongId || 0);
    return normalized;
  }
}
