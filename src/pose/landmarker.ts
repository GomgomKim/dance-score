/**
 * MediaPipe PoseLandmarker 래퍼 (브라우저 전용).
 * wasm은 번들에 포함되고 모델(.task)만 구글 스토리지에서 받는다. 영상 자체는 어디로도 전송되지 않음.
 */
import { PoseLandmarker } from '@mediapipe/tasks-vision';
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import type { Pose } from './types';

export type PoseModel = 'lite' | 'full' | 'heavy';

export const MODEL_URLS: Record<PoseModel, string> = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
};

export interface PoseDetector {
  /** 프레임 하나에서 포즈 검출. 못 찾으면 null */
  detect(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap): Pose | null;
  close(): void;
}

export async function createPoseDetector(model: PoseModel = 'full'): Promise<PoseDetector> {
  const fileset = { wasmLoaderPath, wasmBinaryPath };
  const make = (delegate: 'GPU' | 'CPU') =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URLS[model], delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  let landmarker: PoseLandmarker;
  try {
    landmarker = await make('GPU');
  } catch (e) {
    console.warn('GPU delegate 실패, CPU로 재시도', e);
    landmarker = await make('CPU');
  }
  // VIDEO 모드는 타임스탬프가 계속 증가해야 해서 내부 카운터 사용
  let ts = 0;
  return {
    detect(source) {
      ts = Math.max(ts + 1, Math.floor(performance.now()));
      const result = landmarker.detectForVideo(source, ts);
      const lm = result.landmarks[0];
      if (!lm || lm.length === 0) return null;
      return lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility }));
    },
    close() {
      landmarker.close();
    },
  };
}
