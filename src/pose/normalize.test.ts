import { describe, expect, it } from 'vitest';
import { LM, mirrorPose } from './landmarks';
import { bodyFrame, normalizePose, projectOnto } from './normalize';
import { choreography, poseFromAngles } from './synthetic';

const angles = choreography(1.3, 120);

describe('normalizePose', () => {
  it('골반 중심이 원점, 몸통 길이가 1이 된다', () => {
    const pose = poseFromAngles(angles);
    const n = normalizePose(pose, 9 / 16)!;
    const hipX = (n[LM.leftHip].x + n[LM.rightHip].x) / 2;
    const hipY = (n[LM.leftHip].y + n[LM.rightHip].y) / 2;
    const shX = (n[LM.leftShoulder].x + n[LM.rightShoulder].x) / 2;
    const shY = (n[LM.leftShoulder].y + n[LM.rightShoulder].y) / 2;
    expect(hipX).toBeCloseTo(0, 6);
    expect(hipY).toBeCloseTo(0, 6);
    expect(Math.hypot(shX - hipX, shY - hipY)).toBeCloseTo(1, 6);
  });

  it('키/카메라 거리/화면 위치가 달라도 같은 자세면 같은 좌표', () => {
    const big = normalizePose(poseFromAngles(angles, { torso: 0.3, cx: 0.2, cy: 0.6 }), 9 / 16)!;
    const small = normalizePose(poseFromAngles(angles, { torso: 0.12, cx: 0.4, cy: 0.5 }), 9 / 16)!;
    big.forEach((p, i) => {
      expect(p.x).toBeCloseTo(small[i].x, 6);
      expect(p.y).toBeCloseTo(small[i].y, 6);
    });
  });

  it('가로 영상과 세로 영상도 aspect 보정으로 같은 결과', () => {
    const portrait = normalizePose(poseFromAngles(angles, undefined, 9 / 16), 9 / 16)!;
    const landscape = normalizePose(poseFromAngles(angles, { torso: 0.22, cx: 0.8, cy: 0.55 }, 16 / 9), 16 / 9)!;
    portrait.forEach((p, i) => {
      expect(p.x).toBeCloseTo(landscape[i].x, 6);
      expect(p.y).toBeCloseTo(landscape[i].y, 6);
    });
  });

  it('골반과 어깨가 겹치면 null', () => {
    const pose = poseFromAngles(angles).map(() => ({ x: 0.5, y: 0.5 }));
    expect(normalizePose(pose)).toBeNull();
  });

  it('projectOnto는 다른 몸 위치/크기로 되돌린다', () => {
    const src = poseFromAngles(angles, { torso: 0.3, cx: 0.2, cy: 0.6 });
    const target = poseFromAngles(angles, { torso: 0.15, cx: 0.35, cy: 0.5 });
    const projected = projectOnto(normalizePose(src, 9 / 16)!, bodyFrame(target, 9 / 16)!, 9 / 16);
    projected.forEach((p, i) => {
      expect(p.x).toBeCloseTo(target[i].x, 6);
      expect(p.y).toBeCloseTo(target[i].y, 6);
    });
  });
});

describe('mirrorPose', () => {
  it('x를 뒤집고 좌우 라벨을 바꾼다', () => {
    const pose = poseFromAngles(angles);
    const m = mirrorPose(pose);
    expect(m[LM.leftWrist].x).toBeCloseTo(1 - pose[LM.rightWrist].x);
    expect(m[LM.leftWrist].y).toBeCloseTo(pose[LM.rightWrist].y);
    expect(m[LM.nose].x).toBeCloseTo(1 - pose[LM.nose].x);
    mirrorPose(m).forEach((q, i) => {
      expect(q.x).toBeCloseTo(pose[i].x, 9);
      expect(q.y).toBeCloseTo(pose[i].y, 9);
    });
  });
});
