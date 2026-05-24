export {};

declare global {
  interface Window {
    appEnv?: {
      apiBaseUrl: string;
      apiPort: number;
      unblockProxyUrl: string;
      unblockMatchUrl: string;
      isDesktop: boolean;
      platform: string;
      electronVersion: string;
      nodeVersion: string;
      cacheApi?: {
        getItem: () => Promise<string | null>;
        setItem: (data: string) => Promise<boolean>;
        clear: () => Promise<boolean>;
      };
      /** 系统托盘歌词 API（仅桌面端） */
      trayLyric?: {
        getConfig: () => Promise<{ enabled: boolean; mode: 'title' | 'popup'; bgColor?: string }>;
        setConfig: (config: { enabled: boolean; mode: 'title' | 'popup'; bgColor?: string }) => Promise<void>;
        updateLyric: (data: {
          line: string;
          trackName: string;
          artist: string;
          isPlaying: boolean;
        }) => void;
        onConfigChanged: (cb: (config: { enabled: boolean; mode: 'title' | 'popup'; bgColor?: string }) => void) => () => void;
      };
      /** 迷你播放器 API（仅桌面端） */
      miniMode?: {
        enter: (alwaysOnTop?: boolean) => void;
        exit: () => void;
        setAlwaysOnTop: (enabled: boolean) => void;
        resize: (height: number) => void;
        onStateChange: (cb: (isMini: boolean) => void) => () => void;
      };
      /** 桌面歌词 API（仅桌面端） */
      desktopLyric?: {
        getConfig: () => Promise<{
          enabled: boolean; highlightColor: string; textColor: string;
          fontSize: number; displayMode: 'scroll' | 'single' | 'double'; isLocked: boolean;
        }>;
        setConfig: (config: Partial<{
          enabled: boolean; highlightColor: string; textColor: string;
          fontSize: number; displayMode: 'scroll' | 'single' | 'double'; isLocked: boolean;
        }>) => Promise<void>;
        updateData: (data: {
          lrcArray: Array<{ t: number; text: string }>;
          currentTime: number;
          trackName: string;
          artist: string;
          isPlaying: boolean;
        }) => void;
        sendAction: (action: string) => void;
        onConfigChanged: (cb: (config: any) => void) => () => void;
      };
    };
  }
}
