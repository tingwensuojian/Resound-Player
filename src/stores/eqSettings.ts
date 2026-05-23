import { defineStore } from 'pinia';
import { reactive } from 'vue';

// 10 段 EQ 标准 ISO 频率（单位 Hz）
export const EQ_FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_FREQ_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];

export type EqPreset = {
  name: string;
  gains: number[];
};

export type EqSaveResult = {
  ok: boolean;
  reason?: string;
};

/** 内置预设列表 */
const BUILTIN_PRESETS: EqPreset[] = [
  { name: '原声',       gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: '流行',       gains: [3, 4, 2, 1, 0, 1, 2, 3, 4, 3] },
  { name: '摇滚',       gains: [5, 4, 3, 2, 1, 0, 1, 3, 4, 5] },
  { name: '古典',       gains: [4, 3, 1, 0, 0, 0, 0, 1, 3, 4] },
  { name: '爵士',       gains: [3, 4, 3, 2, 1, 2, 3, 2, 1, 0] },
  { name: '舞曲',       gains: [6, 5, 3, 1, 0, 1, 2, 3, 4, 5] },
  { name: '人声',       gains: [0, 1, 2, 4, 5, 5, 4, 2, 1, 0] },
  { name: '自定义',     gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
];

export const DEFAULT_PRESETS = BUILTIN_PRESETS;

export type EqSettings = {
  enabled: boolean;
  gains: number[];
  currentPreset: string;
  customPresets: EqPreset[];
};

const STORAGE_KEY = 'gm_eq_settings_v1';
const MAX_PRESET_NAME_LENGTH = 24;

const defaults: EqSettings = {
  enabled: false,
  gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  currentPreset: '原声',
  customPresets: [],
};

function normalizeGains(input: unknown): number[] {
  if (!Array.isArray(input) || input.length !== 10) return [...defaults.gains];
  return input.map((g) =>
    typeof g === 'number' && Number.isFinite(g)
      ? Math.max(-12, Math.min(12, Math.round(g * 2) / 2))
      : 0
  );
}

function sanitizePresetName(name: unknown): string {
  return typeof name === 'string' ? name.trim().slice(0, MAX_PRESET_NAME_LENGTH) : '';
}

function isBuiltinPresetName(name: string): boolean {
  return BUILTIN_PRESETS.some((preset) => preset.name === name);
}

function normalizePreset(input: unknown): EqPreset | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Partial<EqPreset>;
  const name = sanitizePresetName(record.name);
  if (!name || isBuiltinPresetName(name)) return null;
  return { name, gains: normalizeGains(record.gains) };
}

function normalizeCustomPresets(input: unknown): EqPreset[] {
  if (!Array.isArray(input)) return [];
  const presets = new Map<string, EqPreset>();
  for (const item of input) {
    const preset = normalizePreset(item);
    if (preset) presets.set(preset.name, preset);
  }
  return [...presets.values()];
}

export const useEqSettingsStore = defineStore('eqSettings', () => {
  const state = reactive<EqSettings>({ ...defaults });

  // hydrate from localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.enabled = parsed.enabled ?? defaults.enabled;
      state.gains = normalizeGains(parsed?.gains);
      state.currentPreset = sanitizePresetName(parsed?.currentPreset) || defaults.currentPreset;
      state.customPresets = normalizeCustomPresets(parsed?.customPresets);
    }
  } catch { /* ignore */ }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* silently fail */ }
  }

  function save() {
    persist();
  }

  function getAllPresets(): EqPreset[] {
    return [...BUILTIN_PRESETS, ...state.customPresets];
  }

  function isCustomPreset(name: string): boolean {
    return state.customPresets.some((preset) => preset.name === name);
  }

  function upsertCustomPreset(name: string, gains = state.gains): EqSaveResult {
    const presetName = sanitizePresetName(name);
    if (!presetName) return { ok: false, reason: '预设名称不能为空' };
    if (isBuiltinPresetName(presetName)) return { ok: false, reason: '不能覆盖内置预设' };

    const nextPreset: EqPreset = { name: presetName, gains: normalizeGains(gains) };
    const index = state.customPresets.findIndex((preset) => preset.name === presetName);
    if (index >= 0) {
      state.customPresets[index] = nextPreset;
    } else {
      state.customPresets.push(nextPreset);
    }
    state.currentPreset = presetName;
    state.gains = [...nextPreset.gains];
    persist();
    return { ok: true };
  }

  function removeCustomPreset(name: string) {
    state.customPresets = state.customPresets.filter((preset) => preset.name !== name);
    if (state.currentPreset === name) {
      state.currentPreset = '自定义';
    }
    persist();
  }

  return {
    state,
    save,
    getAllPresets,
    isCustomPreset,
    upsertCustomPreset,
    removeCustomPreset,
  };
});