import path from "path";
import { Mp3Writer } from "./Mp3Writer.js";
import { FlacWriter } from "./FlacWriter.js";

export class TagWriterAdapter {
  constructor() {
    this.mp3Writer = new Mp3Writer();
    this.flacWriter = new FlacWriter();
  }

  async write(filePath, writePlan) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".mp3") return this.mp3Writer.write(filePath, writePlan);
    if (ext === ".flac") return this.flacWriter.write(filePath, writePlan);
    throw new Error(`暂不支持该格式写入: ${ext || "unknown"}`);
  }

  async rewrite(filePath, values) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".mp3") return this.mp3Writer.rewrite(filePath, values);
    if (ext === ".flac") return this.flacWriter.rewrite(filePath, values);
    throw new Error(`暂不支持该格式回滚: ${ext || "unknown"}`);
  }
}
