import type { Point, Pose, PoseSequence } from './types';

/** MediaPipe Pose 랜드마크 인덱스 */
export const LM = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export const LANDMARK_COUNT = 33;

/** 좌우 대칭 쌍 (반전 시 서로 교환) */
const LR_PAIRS: [number, number][] = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
  [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];

const SWAP_INDEX: number[] = (() => {
  const map = Array.from({ length: LANDMARK_COUNT }, (_, i) => i);
  for (const [a, b] of LR_PAIRS) {
    map[a] = b;
    map[b] = a;
  }
  return map;
})();

/** 스켈레톤 그리기용 연결선 */
export const SKELETON_EDGES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 31], [28, 32], [27, 29], [28, 30],
  [15, 19], [16, 20],
];

export function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1),
  };
}

/**
 * 영상 좌우 반전. 이미지를 뒤집으면 MediaPipe가 좌/우 라벨도 바꿔서 인식하므로
 * x 좌표를 뒤집고 좌우 인덱스를 교환한다.
 */
export function mirrorPose(pose: Pose): Pose {
  return pose.map((_, i) => {
    const src = pose[SWAP_INDEX[i]];
    return { ...src, x: 1 - src.x };
  });
}

export function mirrorSequence(seq: PoseSequence): PoseSequence {
  return {
    ...seq,
    frames: seq.frames.map((f) => ({ t: f.t, pose: f.pose ? mirrorPose(f.pose) : null })),
  };
}
