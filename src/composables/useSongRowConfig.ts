import { usePlayerStore } from '../stores/player'
const playerStore = usePlayerStore();
import { isCurrentTrack as isCurrentTrackUtil } from '../utils/trackHelpers';

/**
 * 歌曲行共享逻辑：当前播放高亮 + 双击播放（跳过交互元素）
 *
 * @param playFn - 歌曲播放回调，由各页面提供自己的播放实现
 */
export function useSongRowConfig(playFn: (index: number) => Promise<void> | void) {
  function isCurrentTrack(song: any): boolean {
    return isCurrentTrackUtil(Number(song?.id || 0), Number(playerStore.state.currentSongId || 0));
  }

  function onSongItemDblClick(event: MouseEvent, index: number): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea, [role="button"]')) return;
    void playFn(index);
  }

  return { isCurrentTrack, onSongItemDblClick };
}