import type { PlaybackSnapshot } from './contracts';
import { getPlayerRuntime } from './runtime';
import { toPlaybackSnapshot } from './runtimeState';

export function getPlaybackSnapshot(): PlaybackSnapshot {
  return toPlaybackSnapshot(getPlayerRuntime().state);
}

export function subscribePlaybackSnapshot(listener: (snapshot: PlaybackSnapshot) => void) {
  const runtime = getPlayerRuntime();
  listener(toPlaybackSnapshot(runtime.state));
  return runtime.subscribe((state) => {
    listener(toPlaybackSnapshot(state));
  });
}
