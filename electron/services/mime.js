const MIME_MAP = {
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg; codecs=opus",
  ".m4a": "audio/mp4",
  ".aac": "audio/mp4",
  ".wma": "audio/x-ms-wma",
  ".ape": "audio/monkeys-audio",
  ".dsf": "audio/dsd",
  ".aiff": "audio/aiff",
  ".alac": "audio/alac",
};

export function mimeType(ext) {
  return MIME_MAP[ext.toLowerCase()] || "application/octet-stream";
}
