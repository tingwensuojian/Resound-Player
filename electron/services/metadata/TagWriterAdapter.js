import path from "path";
import { Mp3Writer } from "./Mp3Writer.js";
import { FlacWriter } from "./FlacWriter.js";
import { M4aWriter } from "./M4aWriter.js";
import { OggWriter } from "./OggWriter.js";
import { WavWriter } from "./WavWriter.js";
import { WmaWriter } from "./WmaWriter.js";

export class TagWriterAdapter {
  constructor() {
    this.mp3Writer = new Mp3Writer();
    this.flacWriter = new FlacWriter();
    this.m4aWriter = new M4aWriter();
    this.oggWriter = new OggWriter();
    this.wavWriter = new WavWriter();
    this.wmaWriter = new WmaWriter();
  }

  async write(filePath, writePlan) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".mp3") return this.mp3Writer.write(filePath, writePlan);
    if (ext === ".flac") return this.flacWriter.write(filePath, writePlan);
    if (ext === ".m4a" || ext === ".aac") return this.m4aWriter.write(filePath, writePlan);
    if (ext === ".ogg" || ext === ".opus") return this.oggWriter.write(filePath, writePlan);
    if (ext === ".wav") return this.wavWriter.write(filePath, writePlan);
    if (ext === ".wma") return this.wmaWriter.write(filePath, writePlan);
    throw new Error(`暂不支持该格式写入: ${ext || "unknown"}`);
  }

  async rewrite(filePath, values) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".mp3") return this.mp3Writer.rewrite(filePath, values);
    if (ext === ".flac") return this.flacWriter.rewrite(filePath, values);
    if (ext === ".m4a" || ext === ".aac") return this.m4aWriter.rewrite(filePath, values);
    if (ext === ".ogg" || ext === ".opus") return this.oggWriter.rewrite(filePath, values);
    if (ext === ".wav") return this.wavWriter.rewrite(filePath, values);
    if (ext === ".wma") return this.wmaWriter.rewrite(filePath, values);
    throw new Error(`暂不支持该格式回滚: ${ext || "unknown"}`);
  }
}
