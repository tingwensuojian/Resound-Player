import crypto from "crypto";
import { METADATA_POLICY_VERSION } from "./types.js";

export class WriteFingerprint {
  create(input) {
    const payload = {
      filePath: input.filePath || "",
      mtime: Number(input.mtime || 0),
      fileSize: Number(input.fileSize || 0),
      matchSongId: Number(input.matchSongId || 0),
      sourceVersion: input.sourceVersion || "",
      fieldsToWrite: Object.keys(input.fieldsToWrite || {}).sort(),
      artworkHash: input.artworkHash || "",
      mergePolicyVersion: METADATA_POLICY_VERSION,
    };
    return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
  }
}

