import { LM, midpoint } from './landmarks';
import type { Point, Pose } from './types';

export interface BodyFrame {
  /** 골반 중심(등방성 좌표) */
  origin: Point;
  /** 몸통 길이(골반 중심 ~ 어깨 중심) */
  scale: number;
}

const MIN_SCALE = 1e-6;

/** x를 영상 비율만큼 늘려서 x, y가 같은 단위가 되게 한다 */
export function toIsotropic(pose: Pose, aspect: number): Pose {
  return pose.map((p) => ({ ...p, x: p.x * aspect }));
}

/** 등방성 좌표 기준 골반 중심과 몸통 길이 */
export function bodyFrame(pose: Pose, aspect = 1): BodyFrame | null {
  const iso = toIsotropic(pose, aspect);
  const hip = midpoint(iso[LM.leftHip], iso[LM.rightHip]);
  const shoulder = midpoint(iso[LM.leftShoulder], iso[LM.rightShoulder]);
  const scale = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y);
  if (!Number.isFinite(scale) || scale < MIN_SCALE) return null;
  return { origin: hip, scale };
}

/**
 * 정규화: 골반 중심을 원점으로 옮기고 몸통 길이가 1이 되도록 스케일링.
 * 키나 카메라 거리, 화면 속 위치가 달라도 같은 자세면 같은 좌표가 된다.
 */
export function normalizePose(pose: Pose, aspect = 1): Pose | null {
  const frame = bodyFrame(pose, aspect);
  if (!frame) return null;
  const { origin, scale } = frame;
  return toIsotropic(pose, aspect).map((p) => ({
    ...p,
    x: (p.x - origin.x) / scale,
    y: (p.y - origin.y) / scale,
    z: p.z !== undefined ? p.z / scale : undefined,
  }));
}

/**
 * 정규화된 포즈를 다른 사람 몸(target)의 위치/크기에 맞춰 이미지 좌표로 되돌린다.
 * 내 영상 위에 원본 스켈레톤을 "고스트"로 겹쳐 그릴 때 사용.
 */
export function projectOnto(normalized: Pose, target: BodyFrame, aspect = 1): Pose {
  return normalized.map((p) => ({
    ...p,
    x: (p.x * target.scale + target.origin.x) / aspect,
    y: p.y * target.scale + target.origin.y,
  }));
}
