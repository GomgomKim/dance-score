import { describe, expect, it } from 'vitest';
import { cosine, extractFeatures, frameSimilarity, limbSimilarity } from './similarity';
import { choreography, poseFromAngles } from './synthetic';

describe('cosine / limbSimilarity', () => {
  it('같은 방향 1, 수직 0, 반대 -1', () => {
    expect(cosine({ x: 1, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(1);
    expect(cosine({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(0);
    expect(cosine({ x: 1, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(-1);
  });
  it('90도 넘게 틀어지면 0으로 클램프', () => {
    expect(limbSimilarity({ x: 1, y: 0 }, { x: -1, y: 0.1 })).toBe(0);
    expect(limbSimilarity({ x: 1, y: 0 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 })).toBeCloseTo(0.5);
  });
});

describe('frameSimilarity', () => {
  const a = choreography(0.7, 120);
  const ref = extractFeatures(poseFromAngles(a));

  it('같은 포즈면 1', () => {
    const s = frameSimilarity(ref, extractFeatures(poseFromAngles(a, { torso: 0.15, cx: 0.4, cy: 0.5 })));
    expect(s.total).toBeCloseTo(1, 6);
    Object.values(s.parts).forEach((v) => expect(v).toBeCloseTo(1, 6));
  });

  it('왼팔만 틀리면 왼팔 점수가 제일 낮다', () => {
    const wrong = { ...a, lShoulder: a.lShoulder + Math.PI / 2 };
    const s = frameSimilarity(ref, extractFeatures(poseFromAngles(wrong)));
    expect(s.total).toBeLessThan(0.95);
    const min = Math.min(...Object.values(s.parts));
    expect(s.parts.leftArm).toBe(min);
    expect(s.parts.rightArm).toBeCloseTo(1, 6);
  });

  it('각도 오차가 클수록 유사도가 낮다', () => {
    const sims = [10, 30, 60, 90].map(
      (deg) => frameSimilarity(ref, extractFeatures(poseFromAngles({ ...a, rShoulder: a.rShoulder + (deg * Math.PI) / 180 }))).total,
    );
    for (let i = 1; i < sims.length; i++) expect(sims[i]).toBeLessThan(sims[i - 1]);
  });

  it('내 포즈를 못 찾으면 0, 원본 포즈가 없으면 NaN', () => {
    expect(frameSimilarity(ref, null).total).toBe(0);
    expect(frameSimilarity(null, ref).total).toBeNaN();
  });

  it('원본에서 안 보이는 관절은 채점에서 빠진다', () => {
    const pose = poseFromAngles(a).map((p, i) => (i === 15 ? { ...p, visibility: 0.05 } : p));
    const refHidden = extractFeatures(pose);
    const wrong = { ...a, lElbow: a.lElbow + 1.5 };
    const s = frameSimilarity(refHidden, extractFeatures(poseFromAngles(wrong)));
    // 팔꿈치~손목이 가려졌으니 아래팔 오류는 반영되지 않음
    expect(s.parts.leftArm).toBeCloseTo(1, 6);
  });
});
