import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

const CONFIG_FILE = path.join(app.getPath('userData'), 'tray-lyric-config.json');

/** @type {import('./tray-lyric-store.js').TrayLyricConfig} */
const DEFAULT_CONFIG = {
  enabled: false,
};

/**
 * @typedef {Object} TrayLyricConfig
 * @property {boolean} enabled - Whether tray lyric is enabled
 */

/** @type {TrayLyricConfig} */
let _config = { ...DEFAULT_CONFIG };

export function loadTrayLyricConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      _config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // fall back to defaults
  }
  return { ..._config };
}

export function saveTrayLyricConfig() {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(_config), 'utf-8');
  } catch {
    // silently fail
  }
}

export function getTrayLyricConfig() {
  return { ..._config };
}

export function setTrayLyricConfig(/** @type {Partial<TrayLyricConfig>} */ patch) {
  _config = { ..._config, ...patch };
  saveTrayLyricConfig();
  return { ..._config };
}