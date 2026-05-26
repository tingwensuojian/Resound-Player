export const METADATA_POLICY_VERSION = "v1-fill-missing";

export const SUPPORTED_METADATA_EXTENSIONS = new Set([".mp3", ".flac", ".m4a", ".aac", ".wav", ".ogg", ".opus", ".wma"]);

export function createEmptyNormalizedMetadata() {
  return {
    title: "",
    artists: [],
    album: "",
    albumArtist: "",
    genre: "",
    year: 0,
    trackNo: 0,
    discNo: 0,
    lyrics: "",
    syncedLyrics: "",
    translationLyrics: "",
    romanizedLyrics: "",
    artwork: null,
    sourceVersion: "",
    cloudSongId: 0,
  };
}
