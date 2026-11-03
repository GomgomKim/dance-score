import { LIMBS, PART_LABELS, partSimilarity, type PoseFeatures } from './similarity';
import type { BodyPart, Vec2 } from './types';

/**
 * 부위별 박자 지연 추정. 구간 안에서 user를 ±maxLag 프레임 밀어보며
 * 그 부위 유사도가 가장 높아지는 지연을 찾는다. (DTW는 몸 전체 기준이라
 * "왼팔만 늦음" 같은 건 부위별로 따로 봐야 함)
 *
 * @returns 지연 프레임 수. 양수 = 내가 늦음. 확실하지 않으면 0.
 */
export function partLagFrames(
  ref: (PoseFeatures | null)[],
  user: (PoseFeatures | null)[],
  i0: number,
  i1: number,
  part: BodyPart,
  maxLag: number,
  minGain = 0.03,
  minExplained = 0.85,
): number {
  const meanAt = (lag: number) => {
    let s = 0;
    let c = 0;
    for (let i = i0; i < i1; i++) {
      const j = i + lag;
      if (j < 0 || j >= user.length) continue;
      const v = partSimilarity(ref[i], user[j], part);
      if (Number.isNaN(v)) continue;
      s += v;
      c++;
    }
    return c > 0 ? s / c : NaN;
  };
  const base = meanAt(0);
  if (Number.isNaN(base)) return 0;
  let bestLag = 0;
  let best = base;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    if (lag === 0) continue;
    const v = meanAt(lag);
    // 같은 값이면 지연이 작은 쪽 선호
    if (v > best + 1e-9 || (Math.abs(v - best) < 1e-9 && Math.abs(lag) < Math.abs(bestLag))) {
      best = v;
      bestLag = lag;
    }
  }
  // 밀어봤더니 거의 똑같아질 때만 "타이밍 문제"로 판단.
  // 밀어도 여전히 다르면 동작 자체가 틀린 것 (반복 안무에서 엉뚱한 박에 걸리는 것 방지)
  return best - base >= minGain && best >= minExplained ? bestLag : 0;
}

export interface PartShapeDiff {
  /** 관절 굽힘 차이(도). 양수 = 내가 더 굽힘 */
  bendDeg: number;
  /** 끝점 높이 차이(몸통 길이 단위 근사). 양수 = 내가 더 낮음 */
  drop: number;
}

const angleBetween = (a: Vec2, b: Vec2) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y)));

/** 부위 모양 차이: 팔/다리를 덜 폈는지, 덜 올렸는지 */
export function partShapeDiff(
  ref: (PoseFeatures | null)[],
  user: (PoseFeatures | null)[],
  frames: number[],
  part: BodyPart,
): PartShapeDiff {
  const limbIdx = LIMBS.map((l, i) => (l.part === part ? i : -1)).filter((i) => i >= 0);
  let bend = 0;
  let bendN = 0;
  let drop = 0;
  let dropN = 0;
  for (const i of frames) {
    const r = ref[i];
    const u = user[i];
    if (!r || !u) continue;
    const rv = limbIdx.map((k) => r.vectors[k]);
    const uv = limbIdx.map((k) => u.vectors[k]);
    if (rv.some((v) => !v) || uv.some((v) => !v)) continue;
    if (limbIdx.length === 2) {
      bend += angleBetween(uv[0]!, uv[1]!) - angleBetween(rv[0]!, rv[1]!);
      bendN++;
    }
    const ry = rv.reduce((s, v) => s + v!.y, 0);
    const uy = uv.reduce((s, v) => s + v!.y, 0);
    drop += uy - ry;
    dropN++;
  }
  return {
    bendDeg: bendN ? ((bend / bendN) * 180) / Math.PI : 0,
    drop: dropN ? drop / dropN : 0,
  };
}

/** 받침 있으면 first, 없으면 second (이/가, 을/를) */
export function josa(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return word + withoutFinal;
  return word + ((last - 0xac00) % 28 > 0 ? withFinal : withoutFinal);
}

function lagAmount(absBeats: number): string {
  if (absBeats >= 0.75) return '한 박자';
  if (absBeats >= 0.375) return '반 박자';
  return '살짝';
}

/** "왼팔이 반 박자 늦어요" 같은 코멘트 생성 */
export function partComment(
  part: BodyPart,
  lagBeats: number,
  shape: PartShapeDiff,
  score?: number,
  partScore?: number,
  /** 몸 전체(DTW) 평균 지연(박). 부위 지연과 비슷하면 "전체적으로"라고 말한다 */
  bodyLagBeats?: number,
): string {
  const label = PART_LABELS[part];
  if (
    bodyLagBeats !== undefined &&
    Math.abs(bodyLagBeats) >= 0.2 &&
    (lagBeats === 0 || (Math.sign(lagBeats) === Math.sign(bodyLagBeats) && Math.abs(lagBeats - bodyLagBeats) < 0.25))
  ) {
    return `전체적으로 ${lagAmount(Math.abs(bodyLagBeats))} ${bodyLagBeats > 0 ? '늦어요' : '빨라요'}`;
  }
  if (partScore !== undefined && partScore >= 97 && Math.abs(lagBeats) < 0.2) {
    return '원본이랑 거의 똑같아요! 완벽해요';
  }
  const prefix = score !== undefined && score >= 90 ? '거의 완벽! 굳이 꼽자면 ' : '';
  if (Math.abs(lagBeats) >= 0.2) {
    return `${prefix}${josa(label, '이', '가')} ${lagAmount(Math.abs(lagBeats))} ${lagBeats > 0 ? '늦어요' : '빨라요'}`;
  }
  const isLimb = part === 'leftArm' || part === 'rightArm' || part === 'leftLeg' || part === 'rightLeg';
  if (isLimb && shape.bendDeg >= 20) return `${prefix}${josa(label, '을', '를')} 더 쭉 펴주세요`;
  if (isLimb && shape.bendDeg <= -20) return `${prefix}${josa(label, '을', '를')} 더 굽혀주세요`;
  if ((part === 'leftArm' || part === 'rightArm') && shape.drop >= 0.3) {
    return `${prefix}${josa(label, '을', '를')} 더 높이 올려주세요`;
  }
  if ((part === 'leftArm' || part === 'rightArm') && shape.drop <= -0.3) {
    return `${prefix}${josa(label, '을', '를')} 조금 더 내려주세요`;
  }
  if (part === 'torso') return `${prefix}상체 방향이 원본이랑 달라요`;
  if (part === 'head') return `${prefix}고개 방향이 원본이랑 달라요`;
  return `${prefix}${label} 각도가 원본이랑 달라요`;
}
