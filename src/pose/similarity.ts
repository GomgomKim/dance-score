import { LM, midpoint } from './landmarks';
import { normalizePose } from './normalize';
import type { BodyPart, Point, Pose, Vec2 } from './types';
import { BODY_PARTS } from './types';

type PointGetter = (p: Pose) => Point;

const at = (i: number): PointGetter => (p) => p[i];
const hipCenter: PointGetter = (p) => midpoint(p[LM.leftHip], p[LM.rightHip]);
const shoulderCenter: PointGetter = (p) => midpoint(p[LM.leftShoulder], p[LM.rightShoulder]);

interface Limb {
  part: BodyPart;
  from: PointGetter;
  to: PointGetter;
}

/** 비교에 쓰는 관절 벡터들 */
export const LIMBS: Limb[] = [
  { part: 'leftArm', from: at(LM.leftShoulder), to: at(LM.leftElbow) },
  { part: 'leftArm', from: at(LM.leftElbow), to: at(LM.leftWrist) },
  { part: 'rightArm', from: at(LM.rightShoulder), to: at(LM.rightElbow) },
  { part: 'rightArm', from: at(LM.rightElbow), to: at(LM.rightWrist) },
  { part: 'leftLeg', from: at(LM.leftHip), to: at(LM.leftKnee) },
  { part: 'leftLeg', from: at(LM.leftKnee), to: at(LM.leftAnkle) },
  { part: 'rightLeg', from: at(LM.rightHip), to: at(LM.rightKnee) },
  { part: 'rightLeg', from: at(LM.rightKnee), to: at(LM.rightAnkle) },
  { part: 'torso', from: hipCenter, to: shoulderCenter },
  { part: 'torso', from: at(LM.leftShoulder), to: at(LM.rightShoulder) },
  { part: 'torso', from: at(LM.leftHip), to: at(LM.rightHip) },
  { part: 'head', from: shoulderCenter, to: at(LM.nose) },
];

/** 부위별 가중치. 춤은 팔 동작 비중이 커서 팔 > 다리 > 몸통 > 머리 */
export const PART_WEIGHTS: Record<BodyPart, number> = {
  leftArm: 1,
  rightArm: 1,
  leftLeg: 0.9,
  rightLeg: 0.9,
  torso: 0.7,
  head: 0.3,
};

export const PART_LABELS: Record<BodyPart, string> = {
  leftArm: '왼팔',
  rightArm: '오른팔',
  leftLeg: '왼다리',
  rightLeg: '오른다리',
  torso: '상체',
  head: '머리',
};

/** 한 프레임의 비교용 특징: 관절별 단위 벡터와 신뢰도 */
export interface PoseFeatures {
  vectors: (Vec2 | null)[];
  confidence: number[];
}

const MIN_VISIBILITY = 0.2;

export function extractFeatures(pose: Pose | null, aspect = 1): PoseFeatures | null {
  if (!pose) return null;
  const norm = normalizePose(pose, aspect);
  if (!norm) return null;
  const vectors: (Vec2 | null)[] = [];
  const confidence: number[] = [];
  for (const limb of LIMBS) {
    const a = limb.from(norm);
    const b = limb.to(norm);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const vis = Math.min(a.visibility ?? 1, b.visibility ?? 1);
    if (len < 1e-6) {
      vectors.push(null);
      confidence.push(0);
    } else {
      vectors.push({ x: dx / len, y: dy / len });
      confidence.push(vis < MIN_VISIBILITY ? 0 : vis);
    }
  }
  return { vectors, confidence };
}

/** 두 벡터의 코사인 유사도 */
export function cosine(a: Vec2, b: Vec2): number {
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  if (la === 0 || lb === 0) return 0;
  return (a.x * b.x + a.y * b.y) / (la * lb);
}

/**
 * 관절 하나의 유사도 0~1. 코사인 유사도를 제곱해서 사용.
 * 0도 → 1, 30도 → 0.75, 45도 → 0.5, 70도 → 0.12, 90도 이상 → 0.
 * (cos 그대로 쓰면 45도 틀어져도 0.7이 나와서 너무 후해짐)
 */
export function limbSimilarity(a: Vec2, b: Vec2): number {
  const c = Math.max(0, cosine(a, b));
  return c * c;
}

export interface FrameSimilarity {
  /** 가중 평균 0~1 */
  total: number;
  /** 부위별 0~1. 판단 불가한 부위는 NaN */
  parts: Record<BodyPart, number>;
}

function emptyParts(value: number): Record<BodyPart, number> {
  return Object.fromEntries(BODY_PARTS.map((p) => [p, value])) as Record<BodyPart, number>;
}

/**
 * 프레임 유사도. 원본(ref)의 관절 신뢰도를 가중치로 사용.
 * 내 포즈를 못 찾았으면 0점.
 */
export function frameSimilarity(ref: PoseFeatures | null, user: PoseFeatures | null): FrameSimilarity {
  if (!ref) return { total: NaN, parts: emptyParts(NaN) };
  if (!user) return { total: 0, parts: emptyParts(0) };

  const sum = emptyParts(0);
  const wsum = emptyParts(0);
  LIMBS.forEach((limb, i) => {
    const a = ref.vectors[i];
    const b = user.vectors[i];
    const w = ref.confidence[i];
    if (!a || w <= 0) return;
    const s = b ? limbSimilarity(a, b) : 0;
    sum[limb.part] += s * w;
    wsum[limb.part] += w;
  });

  const parts = emptyParts(NaN);
  let total = 0;
  let totalW = 0;
  for (const part of BODY_PARTS) {
    if (wsum[part] <= 0) continue;
    parts[part] = sum[part] / wsum[part];
    total += parts[part] * PART_WEIGHTS[part];
    totalW += PART_WEIGHTS[part];
  }
  return { total: totalW > 0 ? total / totalW : NaN, parts };
}

/** 특정 부위만의 유사도 (부위별 타이밍 분석용) */
export function partSimilarity(ref: PoseFeatures | null, user: PoseFeatures | null, part: BodyPart): number {
  if (!ref) return NaN;
  if (!user) return 0;
  let s = 0;
  let w = 0;
  LIMBS.forEach((limb, i) => {
    if (limb.part !== part) return;
    const a = ref.vectors[i];
    const b = user.vectors[i];
    const c = ref.confidence[i];
    if (!a || c <= 0) return;
    s += (b ? limbSimilarity(a, b) : 0) * c;
    w += c;
  });
  return w > 0 ? s / w : NaN;
}
