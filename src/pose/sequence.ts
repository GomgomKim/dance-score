import type { PoseFrame, PoseSequence } from './types';

/** t 이하의 마지막 프레임 인덱스 (frames는 t 오름차순) */
export function lowerIndex(frames: PoseFrame[], t: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  if (hi < 0 || t < frames[0].t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** 시간 t에 가장 가까운 프레임. tolerance 밖이면 null */
export function nearestFrame(frames: PoseFrame[], t: number, tolerance = Infinity): PoseFrame | null {
  if (frames.length === 0) return null;
  const i = lowerIndex(frames, t);
  const candidates = [frames[Math.max(0, i)], frames[Math.min(frames.length - 1, i + 1)]];
  let best: PoseFrame | null = null;
  for (const f of candidates) {
    if (!best || Math.abs(f.t - t) < Math.abs(best.t - t)) best = f;
  }
  return best && Math.abs(best.t - t) <= tolerance ? best : null;
}

/**
 * 불규칙한 시간의 프레임들(라이브 모드)을 고정 fps 격자로 리샘플링.
 * 격자 시간 근처(1.5프레임 이내)에 프레임이 없으면 pose = null.
 */
export function resampleFrames(frames: PoseFrame[], fps: number, t0: number, t1: number, aspect: number): PoseSequence {
  const out: PoseFrame[] = [];
  const step = 1 / fps;
  const n = Math.max(0, Math.floor((t1 - t0) * fps + 1e-9));
  for (let k = 0; k < n; k++) {
    const t = t0 + k * step;
    const f = nearestFrame(frames, t, 1.5 * step);
    out.push({ t, pose: f?.pose ?? null });
  }
  return { fps, aspect, frames: out };
}

/** 시퀀스를 ref 시퀀스의 시간 격자에 맞춘다 */
export function alignTo(seq: PoseSequence, times: number[]): PoseSequence {
  const tol = 0.75 / seq.fps;
  return {
    fps: seq.fps,
    aspect: seq.aspect,
    frames: times.map((t) => ({ t, pose: nearestFrame(seq.frames, t, tol)?.pose ?? null })),
  };
}

export function sliceSequence(seq: PoseSequence, t0: number, t1: number): PoseSequence {
  return { ...seq, frames: seq.frames.filter((f) => f.t >= t0 && f.t < t1) };
}

export function sequenceDuration(seq: PoseSequence): number {
  if (seq.frames.length === 0) return 0;
  return seq.frames[seq.frames.length - 1].t + 1 / seq.fps;
}
