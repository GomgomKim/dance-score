import type { Grade } from './types';

export const GRADE_THRESHOLDS: { grade: Grade; min: number }[] = [
  { grade: 'PERFECT', min: 90 },
  { grade: 'GREAT', min: 75 },
  { grade: 'GOOD', min: 55 },
  { grade: 'MISS', min: -Infinity },
];

export function gradeFor(score: number): Grade {
  if (!Number.isFinite(score)) return 'MISS';
  for (const { grade, min } of GRADE_THRESHOLDS) {
    if (score >= min) return grade;
  }
  return 'MISS';
}

export const GRADE_COLORS: Record<Grade, string> = {
  PERFECT: '#ffd23f',
  GREAT: '#3ddcff',
  GOOD: '#5cff8f',
  MISS: '#ff4d6d',
};

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * 평균 포즈 유사도(0~1)를 점수(0~1)로.
 * 유사도 0.5(대부분 관절이 45도 이상 틀어짐) 이하는 0점, 1이면 만점.
 */
export function poseSimilarityToScore(sim: number, floor = 0.5): number {
  if (!Number.isFinite(sim)) return 0;
  return clamp01((sim - floor) / (1 - floor));
}

/**
 * 평균 타이밍 오차(박자 단위, 절댓값)를 점수(0~1)로.
 * 1/8박 이내면 만점, 1박 이상 밀리면 0점.
 */
export function timingErrorToScore(absBeats: number, perfect = 0.125, zero = 1): number {
  if (!Number.isFinite(absBeats)) return 0;
  if (absBeats <= perfect) return 1;
  return clamp01(1 - (absBeats - perfect) / (zero - perfect));
}
