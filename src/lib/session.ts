import type { AnalysisResult, PoseSequence } from '../pose/types';

/** 결과 화면에 필요한 모든 것 */
export interface ScoreSession {
  result: AnalysisResult;
  ref: PoseSequence;
  user: PoseSequence;
  /** 원본/내 영상 (데모 모드면 없음) */
  refUrl?: string;
  userUrl?: string;
  /** 내 영상 시간 = 원본 시간 + userOffset */
  userOffset: number;
  /** 원본 영상을 좌우 반전해서 보여줄지 */
  mirror: boolean;
  /** 내 영상이 웹캠 녹화본이면 true (seek 우회 필요) */
  liveRecording?: boolean;
  source: 'analysis' | 'live' | 'demo';
}
