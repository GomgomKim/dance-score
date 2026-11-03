import type { PoseModel } from '../pose/landmarker';

export interface SetupState {
  refFile: File | null;
  userFile: File | null;
  bpm: number;
  offset: number;
  mirror: boolean;
  /** 내 영상 시간 = 원본 시간 + userOffset */
  userOffset: number;
  fps: number;
  model: PoseModel;
}

export const DEFAULT_SETUP: SetupState = {
  refFile: null,
  userFile: null,
  bpm: 120,
  offset: 0,
  mirror: false,
  userOffset: 0,
  fps: 15,
  model: 'full',
};
