/**
 * 가짜 랜드마크 생성기. 테스트와 데모 모드에서 사용.
 * 실제 카메라 없이도 "원본 안무"와 "내 춤"(시간 밀림, 팔 각도 오류, 체형 차이 등)을 만들 수 있다.
 */
import { LANDMARK_COUNT, LM } from './landmarks';
import type { BodyPart, Point, Pose, PoseFrame, PoseSequence } from './types';

export interface JointAngles {
  /** 위팔 각도(라디안). 0 = 아래로 차렷, π/2 = 옆으로, π = 위로 */
  lShoulder: number;
  rShoulder: number;
  /** 팔꿈치 굽힘(라디안). 0 = 쭉 폄 */
  lElbow: number;
  rElbow: number;
  /** 허벅지 각도. 0 = 수직 아래, 양수 = 바깥으로 */
  lHip: number;
  rHip: number;
  /** 무릎 굽힘 */
  lKnee: number;
  rKnee: number;
  /** 상체 기울기 (라디안, 양수 = 화면 오른쪽) */
  lean: number;
  /** 골반 상하 바운스 (몸통 길이 비율) */
  bounce: number;
}

export interface BodyShape {
  /** 화면 높이 대비 몸통 길이 */
  torso: number;
  /** 골반 중심 위치 (등방성 좌표, y는 화면 높이 기준 0~1) */
  cx: number;
  cy: number;
}

export const DEFAULT_BODY: BodyShape = { torso: 0.22, cx: 0.28, cy: 0.55 };

/** BPM에 맞춰 8카운트마다 동작이 바뀌는 간단한 안무 */
export function choreography(t: number, bpm: number, offset = 0): JointAngles {
  const beat = 60 / bpm;
  const p = Math.max(0, (t - offset) / beat); // 몇 박째인지 (연속값)
  const move = Math.floor(p / 8) % 4;
  const s = Math.sin(Math.PI * p); // 한 박마다 왕복
  const s2 = Math.sin((Math.PI * p) / 2); // 두 박마다 왕복
  const bounce = 0.04 * Math.abs(Math.sin(Math.PI * p));
  switch (move) {
    case 0: // 양팔 번갈아 위로
      return {
        lShoulder: Math.PI / 2 + 0.9 * s2,
        rShoulder: Math.PI / 2 - 0.9 * s2,
        lElbow: 0.3,
        rElbow: 0.3,
        lHip: 0.15,
        rHip: 0.15,
        lKnee: 0.2 + 0.2 * Math.abs(s),
        rKnee: 0.2 + 0.2 * Math.abs(s),
        lean: 0,
        bounce,
      };
    case 1: // 팔 접었다 펴기 + 사이드 스텝
      return {
        lShoulder: Math.PI / 2,
        rShoulder: Math.PI / 2,
        lElbow: 1.2 + 1.0 * s2,
        rElbow: 1.2 - 1.0 * s2,
        lHip: 0.15 + 0.3 * Math.max(0, s2),
        rHip: 0.15 + 0.3 * Math.max(0, -s2),
        lKnee: 0.3,
        rKnee: 0.3,
        lean: 0.15 * s2,
        bounce,
      };
    case 2: // 원투 펀치
      return {
        lShoulder: 1.2 + 0.8 * Math.max(0, s2),
        rShoulder: 1.2 + 0.8 * Math.max(0, -s2),
        lElbow: 1.6 * (1 - Math.max(0, s2)),
        rElbow: 1.6 * (1 - Math.max(0, -s2)),
        lHip: 0.2,
        rHip: 0.2,
        lKnee: 0.5,
        rKnee: 0.5,
        lean: -0.1 * s2,
        bounce,
      };
    default: // 웨이브 + 무릎 업
      return {
        lShoulder: 2.4 + 0.5 * s,
        rShoulder: 2.4 - 0.5 * s,
        lElbow: 0.5 + 0.4 * s2,
        rElbow: 0.5 - 0.4 * s2,
        lHip: 0.1 + 0.9 * Math.max(0, s2),
        rHip: 0.1 + 0.9 * Math.max(0, -s2),
        lKnee: 1.4 * Math.max(0, s2),
        rKnee: 1.4 * Math.max(0, -s2),
        lean: 0,
        bounce,
      };
  }
}

/** 관절 각도 → 33개 랜드마크 (정규화 이미지 좌표) */
export function poseFromAngles(a: JointAngles, body: BodyShape = DEFAULT_BODY, aspect = 9 / 16): Pose {
  const T = body.torso;
  const upperArm = T * 0.6;
  const foreArm = T * 0.55;
  const thigh = T * 0.8;
  const shin = T * 0.75;
  const pts: Point[] = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0, y: 0, visibility: 0.99 }));
  const set = (i: number, x: number, y: number) => {
    pts[i] = { x, y, z: 0, visibility: 0.99 };
  };
  // 사람이 카메라를 보고 있을 때 몸의 왼쪽 = 화면 오른쪽(+x)
  const hip = { x: body.cx, y: body.cy - a.bounce * T };
  const up = { x: Math.sin(a.lean), y: -Math.cos(a.lean) };
  const side = { x: -up.y, y: up.x }; // 몸의 왼쪽 방향
  const shoulderC = { x: hip.x + up.x * T, y: hip.y + up.y * T };
  const sw = T * 0.32;
  const hw = T * 0.22;
  const lSh = { x: shoulderC.x + side.x * sw, y: shoulderC.y + side.y * sw };
  const rSh = { x: shoulderC.x - side.x * sw, y: shoulderC.y - side.y * sw };
  const lHp = { x: hip.x + side.x * hw, y: hip.y + side.y * hw };
  const rHp = { x: hip.x - side.x * hw, y: hip.y - side.y * hw };

  // 방향각 θ(0 = 아래)와 좌우 부호로 단위벡터
  const dir = (theta: number, sign: 1 | -1) => ({ x: sign * Math.sin(theta), y: Math.cos(theta) });
  const add = (p: { x: number; y: number }, d: { x: number; y: number }, len: number) => ({
    x: p.x + d.x * len,
    y: p.y + d.y * len,
  });

  const lEl = add(lSh, dir(a.lShoulder, 1), upperArm);
  const lWr = add(lEl, dir(a.lShoulder + a.lElbow, 1), foreArm);
  const rEl = add(rSh, dir(a.rShoulder, -1), upperArm);
  const rWr = add(rEl, dir(a.rShoulder + a.rElbow, -1), foreArm);
  const lKn = add(lHp, dir(a.lHip, 1), thigh);
  const lAn = add(lKn, dir(a.lHip - a.lKnee, 1), shin);
  const rKn = add(rHp, dir(a.rHip, -1), thigh);
  const rAn = add(rKn, dir(a.rHip - a.rKnee, -1), shin);
  const nose = add(shoulderC, up, T * 0.45);

  const iso: [number, { x: number; y: number }][] = [
    [LM.nose, nose],
    [LM.leftShoulder, lSh],
    [LM.rightShoulder, rSh],
    [LM.leftElbow, lEl],
    [LM.rightElbow, rEl],
    [LM.leftWrist, lWr],
    [LM.rightWrist, rWr],
    [LM.leftHip, lHp],
    [LM.rightHip, rHp],
    [LM.leftKnee, lKn],
    [LM.rightKnee, rKn],
    [LM.leftAnkle, lAn],
    [LM.rightAnkle, rAn],
  ];
  for (const [i, p] of iso) set(i, p.x / aspect, p.y);

  // 얼굴, 손, 발 보조점
  const face = (i: number, dx: number, dy: number) => set(i, (nose.x + dx * T) / aspect, nose.y + dy * T);
  face(LM.leftEyeInner, 0.04, -0.06);
  face(LM.leftEye, 0.07, -0.06);
  face(LM.leftEyeOuter, 0.1, -0.06);
  face(LM.rightEyeInner, -0.04, -0.06);
  face(LM.rightEye, -0.07, -0.06);
  face(LM.rightEyeOuter, -0.1, -0.06);
  face(LM.leftEar, 0.16, -0.02);
  face(LM.rightEar, -0.16, -0.02);
  face(LM.mouthLeft, 0.05, 0.08);
  face(LM.mouthRight, -0.05, 0.08);
  const hand = (i: number, w: { x: number; y: number }, el: { x: number; y: number }) => {
    const d = { x: w.x - el.x, y: w.y - el.y };
    set(i, (w.x + d.x * 0.15) / aspect, w.y + d.y * 0.15);
  };
  for (const i of [LM.leftPinky, LM.leftIndex, LM.leftThumb]) hand(i, lWr, lEl);
  for (const i of [LM.rightPinky, LM.rightIndex, LM.rightThumb]) hand(i, rWr, rEl);
  set(LM.leftHeel, lAn.x / aspect, lAn.y + T * 0.05);
  set(LM.rightHeel, rAn.x / aspect, rAn.y + T * 0.05);
  set(LM.leftFootIndex, (lAn.x + T * 0.12) / aspect, lAn.y + T * 0.08);
  set(LM.rightFootIndex, (rAn.x - T * 0.12) / aspect, rAn.y + T * 0.08);
  return pts;
}

/** 시드 고정 난수 (mulberry32) */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface AngleError {
  part: BodyPart;
  /** 원본 기준 시간 구간 */
  start: number;
  end: number;
  /** 각도 오차(도) */
  deg: number;
}

export interface SyntheticOptions {
  duration: number;
  fps: number;
  bpm: number;
  offset?: number;
  aspect?: number;
  body?: BodyShape;
  /** 동작이 늦는 시간(초). 함수면 시간에 따라 다르게 */
  timeShift?: number | ((t: number) => number);
  /** 부위별 시간 밀림(초). 예: 왼팔만 반 박자 늦게 */
  partShift?: Partial<Record<BodyPart, number | ((t: number) => number)>>;
  errors?: AngleError[];
  /** 랜드마크 좌표 노이즈 (화면 비율) */
  noise?: number;
  seed?: number;
  /** 포즈 인식 실패 비율 */
  dropRate?: number;
}

const resolve = (v: number | ((t: number) => number) | undefined, t: number) =>
  typeof v === 'function' ? v(t) : (v ?? 0);

/** 가짜 춤 시퀀스 생성 */
export function syntheticSequence(opts: SyntheticOptions): PoseSequence {
  const aspect = opts.aspect ?? 9 / 16;
  const rand = seededRandom(opts.seed ?? 1);
  const gauss = () => {
    const u = Math.max(1e-12, rand());
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const frames: PoseFrame[] = [];
  const n = Math.floor(opts.duration * opts.fps);
  for (let k = 0; k < n; k++) {
    const t = k / opts.fps;
    if (opts.dropRate && rand() < opts.dropRate) {
      frames.push({ t, pose: null });
      continue;
    }
    const base = t - resolve(opts.timeShift, t);
    const a = { ...choreography(base, opts.bpm, opts.offset ?? 0) };
    if (opts.partShift) {
      for (const [part, shift] of Object.entries(opts.partShift) as [BodyPart, number][]) {
        const pa = choreography(base - resolve(shift, t), opts.bpm, opts.offset ?? 0);
        if (part === 'leftArm') Object.assign(a, { lShoulder: pa.lShoulder, lElbow: pa.lElbow });
        if (part === 'rightArm') Object.assign(a, { rShoulder: pa.rShoulder, rElbow: pa.rElbow });
        if (part === 'leftLeg') Object.assign(a, { lHip: pa.lHip, lKnee: pa.lKnee });
        if (part === 'rightLeg') Object.assign(a, { rHip: pa.rHip, rKnee: pa.rKnee });
      }
    }
    for (const e of opts.errors ?? []) {
      if (t < e.start || t >= e.end) continue;
      const r = (e.deg * Math.PI) / 180;
      if (e.part === 'leftArm') a.lShoulder += r;
      if (e.part === 'rightArm') a.rShoulder += r;
      if (e.part === 'leftLeg') a.lHip += r;
      if (e.part === 'rightLeg') a.rHip += r;
      if (e.part === 'torso') a.lean += r;
    }
    let pose = poseFromAngles(a, opts.body, aspect);
    if (opts.noise) {
      const sd = opts.noise;
      pose = pose.map((p) => ({ ...p, x: p.x + gauss() * sd, y: p.y + gauss() * sd }));
    }
    frames.push({ t, pose });
  }
  return { fps: opts.fps, aspect, frames };
}
