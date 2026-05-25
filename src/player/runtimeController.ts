import type { PlaybackCommand } from './contracts';
import { getPlayerRuntime } from './runtime';

export async function executePlaybackCommand(command: PlaybackCommand) {
  const runtime = getPlayerRuntime();
  const { audio, state, notify } = runtime;

  switch (command.type) {
    case 'seek':
      audio.currentTime = Math.max(0, Math.min(command.time, state.duration || 0));
      state.currentTime = audio.currentTime;
      notify();
      return;
    case 'setVolume':
      state.volume = Math.max(0, Math.min(command.volume, 1));
      if (!state.muted) {
        audio.volume = state.volume;
      }
      notify();
      return;
    case 'toggleMute':
      state.muted = !state.muted;
      audio.volume = state.muted ? 0 : state.volume;
      notify();
      return;
    default:
      return;
  }
}
