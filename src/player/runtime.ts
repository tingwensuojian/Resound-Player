import { createAudioEngine } from './audioEngine';
import type { WindowRole } from './contracts';
import { createInitialRuntimeState, type RuntimeState } from './runtimeState';
import { setupMediaSession } from '../composables/useMediaSession';

type RuntimeListener = (state: RuntimeState) => void;

type PlayerRuntime = {
  audio: HTMLAudioElement;
  audioEngine: ReturnType<typeof createAudioEngine>;
  state: RuntimeState;
  subscribe: (listener: RuntimeListener) => () => void;
  notify: () => void;
  isReady: () => boolean;
};

let runtimeInstance: PlayerRuntime | null = null;
let runtimeInitBlocked = false;

function cloneListeners(listeners: Set<RuntimeListener>) {
  return Array.from(listeners);
}

export function initPlayerRuntime(windowRole: WindowRole = 'main') {
  if (runtimeInstance) return runtimeInstance;
  if (windowRole !== 'main') {
    runtimeInitBlocked = true;
    return null;
  }

  const audio = new Audio();
  const audioEngine = createAudioEngine(audio);
  const state = createInitialRuntimeState();
  const listeners = new Set<RuntimeListener>();

  const notify = () => {
    for (const listener of cloneListeners(listeners)) {
      listener(state);
    }
  };

  audio.ontimeupdate = () => {
    state.currentTime = audio.currentTime || 0;
    notify();
  };

  audio.onloadedmetadata = () => {
    state.duration = audio.duration || 0;
    notify();
  };

  audio.onended = () => {
    state.isPlaying = false;
    notify();
  };

  audio.onplay = () => {
    state.isPlaying = true;
    notify();
  };

  audio.onpause = () => {
    state.isPlaying = false;
    notify();
  };

  audioEngine.ensureReady();
  setupMediaSession();

  runtimeInstance = {
    audio,
    audioEngine,
    state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify,
    isReady() {
      return true;
    },
  };

  return runtimeInstance;
}

export function getPlayerRuntime() {
  if (!runtimeInstance) {
    if (runtimeInitBlocked) {
      throw new Error('[playerRuntime] runtime unavailable in non-main window');
    }
    throw new Error('[playerRuntime] runtime has not been initialized');
  }
  return runtimeInstance;
}
