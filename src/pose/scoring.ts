import { dtw, matchIndices } from './dtw';
import { partComment, partLagFrames, partShapeDiff } from './feedback';
import { gradeFor, poseSimilarityToScore, timingErrorToScore } from './grading';
import { beatDuration, splitEightCounts } from './segments';
import { alignTo, sequenceDuration } from './sequence';
import { extractFeatures, frameSimilarity, partSimilarity, type PoseFeatures } from './similarity';
import type { AnalysisResult, BodyPart, PoseSequence, Segment, SegmentResult } from './types';
import { BODY_PARTS } from './types';

export interface ScoringOptions {
  bpm: number;
  /** 첫 카운트 위치(초, 원본 기준) */
  offset: number;
  /** 직접 지정한 구간 (라이브 모드에서 한 구간씩 채점할 때) */
  segments?: Segment[];
  /** 포즈 점수 비중. 기본 0.7 */
  poseWeight?: number;
  /** 타이밍 점수 비중. 기본 0.3 */
  timingWeight?: number;
  /** DTW가 허용하는 최대 시간 어긋남(박). 기본 1박 */
  dtwBandBeats?: number;
  /** DTW 늘이기/줄이기 패널티. 기본 0.02 */
  stepPenalty?: number;
  /** 부위별 지연 탐색 범위(박). 기본 1박 */
  partLagBeats?: number;
}

interface FrameMatch {
  /** 프레임 유사도 0~1. ref 포즈가 없으면 NaN */
  sim: number;
  parts: Record<BodyPart, number>;
  /** 매칭된 user 프레임과의 시간 차(초). 양수 = 내가 늦음 */
  offsetSec: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

function mean(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

function smooth(values: number[], radius: number): number[] {
  return values.map((_, i) => mean(values.slice(Math.max(0, i - radius), i + radius + 1)));
}

/**
 * ref 프레임마다 DTW로 매칭한 user 프레임과의 유사도/시간차 계산.
 * user는 ref와 같은 시간 격자에 정렬돼 있어야 한다.
 */
export function matchFrames(
  refF: (PoseFeatures | null)[],
  userF: (PoseFeatures | null)[],
  fps: number,
  bandFrames: number,
  stepPenalty: number,
): FrameMatch[] {
  const n = refF.length;
  const cache = new Map<number, number>();
  const cost = (i: number, j: number) => {
    const key = i * 100003 + j;
    let c = cache.get(key);
    if (c === undefined) {
      const s = frameSimilarity(refF[i], userF[j]).total;
      // ref 포즈가 없는 프레임은 어디에 붙어도 상관없게 중간 비용
      c = Number.isNaN(s) ? 0.5 : 1 - s;
      cache.set(key, c);
    }
    return c;
  };
  const { path } = dtw(n, userF.length, cost, { band: bandFrames, stepPenalty, openEnds: true });
  const matches = matchIndices(path, n);
  return refF.map((rf, i) => {
    const m = matches[i];
    const j = Number.isNaN(m) ? i : Math.min(userF.length - 1, Math.max(0, Math.round(m)));
    const fs = frameSimilarity(rf, userF[j]);
    return { sim: fs.total, parts: fs.parts, offsetSec: Number.isNaN(m) ? NaN : (m - i) / fps };
  });
}

/**
 * 두 포즈 시퀀스 비교 → 8카운트 구간별 점수/등급/코멘트.
 * ref와 user는 같은 시간축(원본 영상 기준)이어야 한다.
 */
export function analyzeSequences(ref: PoseSequence, user: PoseSequence, opts: ScoringOptions): AnalysisResult {
  const fps = ref.fps;
  const beat = beatDuration(opts.bpm);
  const wp = opts.poseWeight ?? 0.7;
  const wt = opts.timingWeight ?? 0.3;
  const times = ref.frames.map((f) => f.t);
  const aligned = alignTo(user, times);

  const refF = ref.frames.map((f) => extractFeatures(f.pose, ref.aspect));
  const userF = aligned.frames.map((f) => extractFeatures(f.pose, user.aspect));
  const band = Math.max(1, Math.round((opts.dtwBandBeats ?? 1) * beat * fps));
  const matches = matchFrames(refF, userF, fps, band, opts.stepPenalty ?? 0.02);
  const smoothedOffsets = smooth(
    matches.map((m) => m.offsetSec),
    2,
  );
  const maxLag = Math.max(1, Math.round((opts.partLagBeats ?? 1) * beat * fps));

  const segments =
    opts.segments ?? splitEightCounts({ bpm: opts.bpm, offset: opts.offset, duration: sequenceDuration(ref) });

  const results: SegmentResult[] = [];
  for (const seg of segments) {
    const idx: number[] = [];
    for (let i = 0; i < times.length; i++) {
      if (times[i] >= seg.start - 1e-9 && times[i] < seg.end - 1e-9 && Number.isFinite(matches[i].sim)) idx.push(i);
    }
    if (idx.length === 0) continue;

    const poseSim = mean(idx.map((i) => matches[i].sim));
    const signedOffset = mean(idx.map((i) => matches[i].offsetSec));
    const absOffset = mean(idx.map((i) => Math.abs(smoothedOffsets[i])));
    const poseScore = poseSimilarityToScore(poseSim);
    const timingScore = timingErrorToScore(Number.isFinite(absOffset) ? absOffset / beat : 0);
    const score = 100 * (wp * poseScore + wt * timingScore) / (wp + wt);

    const partScores = Object.fromEntries(
      BODY_PARTS.map((p) => [p, round1(100 * mean(idx.map((i) => matches[i].parts[p])))]),
    ) as Record<BodyPart, number>;
    const worstPart = worstOf(partScores);
    const bodyLag = Number.isFinite(signedOffset) ? signedOffset / beat : 0;
    const { lagBeats, comment } = describePart(refF, userF, idx, worstPart, maxLag, fps, beat, score, bodyLag);

    results.push({
      ...seg,
      score: round1(score),
      poseScore: round1(poseScore * 100),
      timingScore: round1(timingScore * 100),
      grade: gradeFor(score),
      meanOffsetSec: Number.isFinite(signedOffset) ? Math.round(signedOffset * 1000) / 1000 : 0,
      meanOffsetBeats: Number.isFinite(signedOffset) ? Math.round((signedOffset / beat) * 100) / 100 : 0,
      partScores,
      worstPart,
      worstPartLagBeats: lagBeats,
      comment,
    });
  }

  return summarize(results, opts, fps, refF, userF, times, maxLag, beat);
}

function worstOf(partScores: Record<BodyPart, number>): BodyPart {
  let worst: BodyPart = 'leftArm';
  let min = Infinity;
  for (const p of BODY_PARTS) {
    const v = partScores[p];
    if (Number.isFinite(v) && v < min) {
      min = v;
      worst = p;
    }
  }
  return worst;
}

function describePart(
  refF: (PoseFeatures | null)[],
  userF: (PoseFeatures | null)[],
  idx: number[],
  part: BodyPart,
  maxLag: number,
  fps: number,
  beat: number,
  score: number,
  bodyLagBeats: number,
) {
  const lag = partLagFrames(refF, userF, idx[0], idx[idx.length - 1] + 1, part, maxLag);
  const lagBeats = Math.round((lag / fps / beat) * 100) / 100;
  const shape = partShapeDiff(refF, userF, idx, part);
  const partScore = 100 * mean(idx.map((i) => partSimilarity(refF[i], userF[i], part)));
  return { lagBeats, comment: partComment(part, lagBeats, shape, score, partScore, bodyLagBeats) };
}

function summarize(
  segments: SegmentResult[],
  opts: ScoringOptions,
  fps: number,
  refF: (PoseFeatures | null)[],
  userF: (PoseFeatures | null)[],
  times: number[],
  maxLag: number,
  beat: number,
): AnalysisResult {
  const base = {
    bpm: opts.bpm,
    offset: opts.offset,
    fps,
    createdAt: new Date().toISOString(),
  };
  if (segments.length === 0) {
    return {
      ...base,
      totalScore: 0,
      totalGrade: 'MISS',
      poseScore: 0,
      timingScore: 0,
      segments: [],
      worstSegmentIndex: -1,
      worstPart: 'leftArm',
      comment: '포즈를 찾지 못했어요. 전신이 다 나오게 찍어주세요!',
    };
  }
  const wsum = segments.reduce((s, r) => s + r.beats, 0);
  const wmean = (f: (r: SegmentResult) => number) => segments.reduce((s, r) => s + f(r) * r.beats, 0) / wsum;
  const totalScore = round1(wmean((r) => r.score));

  let worstSegmentIndex = segments[0].index;
  let worstScore = Infinity;
  for (const r of segments) {
    if (r.score < worstScore) {
      worstScore = r.score;
      worstSegmentIndex = r.index;
    }
  }

  // 전체에서 가장 많이 틀린 부위: 구간별 부위 점수 가중 평균이 가장 낮은 부위
  const partAvg = Object.fromEntries(
    BODY_PARTS.map((p) => {
      const valid = segments.filter((r) => Number.isFinite(r.partScores[p]));
      const w = valid.reduce((s, r) => s + r.beats, 0);
      return [p, w ? valid.reduce((s, r) => s + r.partScores[p] * r.beats, 0) / w : NaN];
    }),
  ) as Record<BodyPart, number>;
  const worstPart = worstOf(partAvg);

  // 그 부위가 제일 못한 구간 기준으로 코멘트
  const target = segments.reduce((a, b) =>
    (b.partScores[worstPart] ?? Infinity) < (a.partScores[worstPart] ?? Infinity) ? b : a,
  );
  const idx: number[] = [];
  for (let i = 0; i < times.length; i++) {
    if (times[i] >= target.start - 1e-9 && times[i] < target.end - 1e-9 && refF[i]) idx.push(i);
  }
  const comment = idx.length
    ? describePart(refF, userF, idx, worstPart, maxLag, fps, beat, totalScore, 0).comment
    : target.comment;

  return {
    ...base,
    totalScore,
    totalGrade: gradeFor(totalScore),
    poseScore: round1(wmean((r) => r.poseScore)),
    timingScore: round1(wmean((r) => r.timingScore)),
    segments,
    worstSegmentIndex,
    worstPart,
    comment,
  };
}
