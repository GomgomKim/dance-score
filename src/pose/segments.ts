import type { Segment } from './types';

export interface TempoOptions {
  bpm: number;
  /** 첫 카운트(1)의 원본 영상 기준 시간(초) */
  offset: number;
  /** 영상 길이(초) */
  duration: number;
  /** 한 구간 박 수. 기본 8 */
  beatsPerSegment?: number;
  /** 마지막 자투리 구간을 포함할 최소 박 수. 기본 4 (반 구간) */
  minTailBeats?: number;
}

export function beatDuration(bpm: number): number {
  if (!(bpm > 0)) throw new Error(`BPM은 0보다 커야 해요: ${bpm}`);
  return 60 / bpm;
}

/** BPM 기준으로 8카운트 구간 나누기 */
export function splitEightCounts(opts: TempoOptions): Segment[] {
  const beat = beatDuration(opts.bpm);
  const per = opts.beatsPerSegment ?? 8;
  const minTail = opts.minTailBeats ?? per / 2;
  const offset = Math.max(0, opts.offset);
  const segLen = beat * per;
  const segments: Segment[] = [];
  const eps = 1e-9;
  for (let start = offset, index = 0; start < opts.duration - eps; start += segLen, index++) {
    const end = Math.min(start + segLen, opts.duration);
    const beats = (end - start) / beat;
    if (beats + eps < per && beats + eps < minTail) break;
    segments.push({ index, start, end, beats: Math.round(beats * 1000) / 1000 });
  }
  return segments;
}

/** 시간 t가 몇 번째 구간의 몇 번째 카운트(1~8)인지. 첫 카운트 전이면 null */
export function countAt(t: number, bpm: number, offset: number, beatsPerSegment = 8): { segment: number; count: number } | null {
  const beat = beatDuration(bpm);
  if (t < offset) return null;
  const totalBeats = Math.floor((t - offset) / beat + 1e-9);
  return {
    segment: Math.floor(totalBeats / beatsPerSegment),
    count: (totalBeats % beatsPerSegment) + 1,
  };
}
