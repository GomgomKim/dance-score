/**
 * 실시간 채점기 (라이브 모드, 챌린지 모드 공용). DOM 의존 없음 → 테스트 가능.
 * 원본/내 포즈 프레임을 쌓다가 8카운트 구간이 끝나면(DTW 여유 반 박 후) 그 구간을 채점한다.
 */
import { analyzeSequences } from '../pose/scoring';
import { beatDuration, splitEightCounts } from '../pose/segments';
import { resampleFrames } from '../pose/sequence';
import type { AnalysisResult, Pose, PoseFrame, PoseSequence, Segment, SegmentResult } from '../pose/types';

export interface LiveScorerOptions {
  bpm: number;
  offset: number;
  /** 원본 길이(초) */
  duration: number;
  refAspect: number;
  userAspect: number;
  fps?: number;
  /** 미리 뽑아둔 원본 포즈 (챌린지 모드). 없으면 addRef로 실시간 추가 */
  refFrames?: PoseFrame[];
}

export class LiveScorer {
  readonly segments: Segment[];
  readonly results: SegmentResult[] = [];
  combo = 0;
  private refFrames: PoseFrame[];
  private userFrames: PoseFrame[] = [];
  private next = 0;
  private readonly beat: number;
  private readonly fps: number;

  constructor(private opts: LiveScorerOptions) {
    this.segments = splitEightCounts({ bpm: opts.bpm, offset: opts.offset, duration: opts.duration });
    this.refFrames = opts.refFrames ? [...opts.refFrames] : [];
    this.beat = beatDuration(opts.bpm);
    this.fps = opts.fps ?? 15;
  }

  addRef(t: number, pose: Pose | null) {
    this.refFrames.push({ t, pose });
  }

  /** 내 포즈 추가. t는 원본 기준 시간. 시간이 거꾸로 가면(seek) 무시 */
  addUser(t: number, pose: Pose | null) {
    const last = this.userFrames[this.userFrames.length - 1];
    if (last && t < last.t) return;
    this.userFrames.push({ t, pose });
  }

  get userFrameCount() {
    return this.userFrames.length;
  }

  /** 시간 t까지 끝난 구간들을 채점해서 새로 나온 결과를 돌려준다 */
  poll(t: number): SegmentResult[] {
    const out: SegmentResult[] = [];
    while (this.next < this.segments.length && t >= this.segments[this.next].end + this.beat * 0.5) {
      const r = this.scoreSegment(this.segments[this.next++]);
      if (r) out.push(r);
    }
    return out;
  }

  /** 끝낼 때: 시간 t 전에 완전히 끝난 구간까지 마저 채점 */
  flush(t: number): SegmentResult[] {
    const out: SegmentResult[] = [];
    while (this.next < this.segments.length && this.segments[this.next].end <= t + 0.01) {
      const r = this.scoreSegment(this.segments[this.next++]);
      if (r) out.push(r);
    }
    return out;
  }

  /** 전체 결과 (결과 화면용). end까지의 구간만 */
  finalize(end: number): { result: AnalysisResult; ref: PoseSequence; user: PoseSequence } {
    const ref = resampleFrames(this.refFrames, this.fps, 0, end, this.opts.refAspect);
    const user = resampleFrames(this.userFrames, this.fps, 0, end, this.opts.userAspect);
    const result = analyzeSequences(ref, user, {
      bpm: this.opts.bpm,
      offset: this.opts.offset,
      segments: this.segments.filter((s) => s.end <= end + 0.01),
    });
    return { result, ref, user };
  }

  private scoreSegment(seg: Segment): SegmentResult | null {
    const t0 = Math.max(0, seg.start - this.beat);
    const t1 = seg.end + this.beat * 0.5;
    const ref = resampleFrames(this.refFrames, this.fps, t0, t1, this.opts.refAspect);
    const user = resampleFrames(this.userFrames, this.fps, t0, t1, this.opts.userAspect);
    const r = analyzeSequences(ref, user, { bpm: this.opts.bpm, offset: this.opts.offset, segments: [seg] });
    const sr = r.segments[0];
    if (!sr) return null;
    this.combo = sr.grade === 'PERFECT' || sr.grade === 'GREAT' ? this.combo + 1 : 0;
    this.results.push(sr);
    return sr;
  }
}
