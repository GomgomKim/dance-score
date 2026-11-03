/** 정규화된 이미지 좌표(0~1) 기준 랜드마크. MediaPipe NormalizedLandmark와 호환. */
export interface Point {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/** MediaPipe Pose 33개 랜드마크 */
export type Pose = Point[];

export interface PoseFrame {
  /** 원본 영상 기준 시간(초) */
  t: number;
  /** 포즈를 못 찾은 프레임은 null */
  pose: Pose | null;
}

export interface PoseSequence {
  fps: number;
  /** 영상 가로/세로 비율. x 좌표를 등방성 단위로 바꿀 때 사용 */
  aspect: number;
  frames: PoseFrame[];
}

export interface Vec2 {
  x: number;
  y: number;
}

export type BodyPart = 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg' | 'torso' | 'head';

export const BODY_PARTS: BodyPart[] = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'torso', 'head'];

export type Grade = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export interface Segment {
  index: number;
  /** 원본 영상 기준 시작/끝 시간(초) */
  start: number;
  end: number;
  /** 구간에 포함된 박 수 (보통 8, 마지막 구간은 더 짧을 수 있음) */
  beats: number;
}

export interface SegmentResult extends Segment {
  /** 0~100 */
  score: number;
  /** 포즈(각도) 점수 0~100 */
  poseScore: number;
  /** 타이밍 점수 0~100 */
  timingScore: number;
  grade: Grade;
  /** DTW로 구한 평균 시간 오차(초). 양수 = 내가 늦음 */
  meanOffsetSec: number;
  /** 같은 값을 박자 단위로 */
  meanOffsetBeats: number;
  /** 부위별 유사도 0~100 */
  partScores: Record<BodyPart, number>;
  worstPart: BodyPart;
  /** worstPart의 박자 지연(양수 = 늦음) */
  worstPartLagBeats: number;
  comment: string;
}

export interface AnalysisResult {
  totalScore: number;
  totalGrade: Grade;
  poseScore: number;
  timingScore: number;
  segments: SegmentResult[];
  worstSegmentIndex: number;
  worstPart: BodyPart;
  comment: string;
  bpm: number;
  offset: number;
  fps: number;
  createdAt: string;
}
