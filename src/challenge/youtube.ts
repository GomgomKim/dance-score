/**
 * 유튜브 IFrame Player API 래퍼 (브라우저 전용).
 * https://developers.google.com/youtube/iframe_api_reference
 */

/** 필요한 만큼만 선언한 최소 타입 */
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  mute(): void;
  unMute(): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId: string;
      width?: string | number;
      height?: string | number;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(timeoutMs = 15000): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      apiPromise = null;
      reject(new Error('유튜브 플레이어를 불러오지 못했어요'));
    };
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('유튜브 플레이어 로딩 시간이 초과됐어요')), timeoutMs);
  });
  return apiPromise;
}

const YT_ERRORS: Record<number, string> = {
  2: '유튜브 영상 ID가 잘못됐어요',
  5: '이 브라우저에서 유튜브 영상을 재생할 수 없어요',
  100: '유튜브 영상이 삭제됐거나 비공개예요',
  101: '영상 주인이 다른 사이트 임베드를 막아뒀어요',
  150: '영상 주인이 다른 사이트 임베드를 막아뒀어요',
};

export interface YouTubeHandle {
  play(): void;
  pause(): void;
  seek(t: number): void;
  time(): number;
  state(): number;
  rate(): number;
  destroy(): void;
}

/** el 안에 유튜브 플레이어를 만들고 준비되면 핸들을 돌려준다 */
export async function createYouTubePlayer(
  el: HTMLElement,
  videoId: string,
  handlers: { onStateChange?: (state: number) => void; onError?: (message: string) => void } = {},
): Promise<YouTubeHandle> {
  const YT = await loadYouTubeApi();
  return new Promise((resolve, reject) => {
    new YT.Player(el, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        playsinline: 1, // iOS에서 전체화면으로 안 튀게
        rel: 0,
        modestbranding: 1,
        controls: 1,
        disablekb: 1,
        fs: 0,
        origin: location.origin,
      },
      events: {
        onReady: (e) => {
          const p = e.target;
          resolve({
            play: () => p.playVideo(),
            pause: () => p.pauseVideo(),
            seek: (t) => p.seekTo(Math.max(0, t), true),
            time: () => p.getCurrentTime(),
            state: () => p.getPlayerState(),
            rate: () => p.getPlaybackRate?.() ?? 1,
            destroy: () => p.destroy(),
          });
        },
        onStateChange: (e) => handlers.onStateChange?.(e.data),
        onError: (e) => {
          const msg = YT_ERRORS[e.data] ?? `유튜브 오류 (${e.data})`;
          handlers.onError?.(msg);
          reject(new Error(msg)); // 준비 전 오류면 생성 실패로
        },
      },
    });
  });
}
