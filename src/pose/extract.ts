/**
 * 영상 파일에서 고정 fps로 포즈 시퀀스 추출 (브라우저 전용).
 * 재생 대신 seek 방식이라 느리지만 프레임이 정확하고 기기 성능과 무관하게 결과가 같다.
 */
import type { PoseDetector } from './landmarker';
import { mirrorPose } from './landmarks';
import type { Pose, PoseFrame, PoseSequence } from './types';

export interface ExtractOptions {
  fps: number;
  /** 영상 시간 = 원본 기준 시간 + timeOffset (내 영상 싱크용) */
  timeOffset?: number;
  /** 원본 기준 시작/끝 시간 */
  start?: number;
  end?: number;
  mirror?: boolean;
  onProgress?: (ratio: number, frame: PoseFrame) => void;
  signal?: AbortSignal;
}

export function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.src = url;
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('영상을 열 수 없어요'));
  });
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - t) < 1e-4 && video.readyState >= 2) {
      resolve();
      return;
    }
    const done = () => {
      video.removeEventListener('seeked', done);
      resolve();
    };
    video.addEventListener('seeked', done);
    video.currentTime = t;
  });
}

export async function extractPoseSequence(
  video: HTMLVideoElement,
  detector: PoseDetector,
  opts: ExtractOptions,
): Promise<PoseSequence> {
  const offset = opts.timeOffset ?? 0;
  const start = Math.max(opts.start ?? 0, -offset);
  const end = Math.min(opts.end ?? Infinity, video.duration - offset);
  const step = 1 / opts.fps;
  const frames: PoseFrame[] = [];
  // 원본 기준 시간 격자는 항상 0부터 k/fps — 두 영상의 프레임 시간이 정확히 일치하도록
  const firstK = Math.ceil(start * opts.fps - 1e-9);
  const lastK = Math.floor((end - 1e-6) * opts.fps);
  const total = Math.max(1, lastK - firstK + 1);
  for (let k = firstK; k <= lastK; k++) {
    if (opts.signal?.aborted) throw new DOMException('취소됨', 'AbortError');
    const t = k * step;
    await seek(video, t + offset);
    let pose: Pose | null = detector.detect(video);
    if (pose && opts.mirror) pose = mirrorPose(pose);
    const frame = { t, pose };
    frames.push(frame);
    opts.onProgress?.((k - firstK + 1) / total, frame);
  }
  return {
    fps: opts.fps,
    aspect: video.videoWidth / Math.max(1, video.videoHeight),
    frames,
  };
}
