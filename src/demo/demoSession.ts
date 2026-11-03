/**
 * 데모 모드: 가짜 춤 데이터를 실제 채점 파이프라인에 넣어서 결과 화면을 바로 볼 수 있게.
 * (웹캠/영상 없이 결과 화면 디자인 확인, 릴스 촬영 리허설용)
 */
import { analyzeSequences } from '../pose/scoring';
import { syntheticSequence } from '../pose/synthetic';
import type { ScoreSession } from '../lib/session';

export const DEMO_BPM = 120;

export function createDemoSession(seed = Date.now()): ScoreSession {
  const bpm = DEMO_BPM;
  const beat = 60 / bpm;
  const seg = beat * 8;
  const segments = 8;
  const duration = seg * segments + 0.5;
  const fps = 15;
  const rand = (() => {
    let s = seed % 2147483647 || 1;
    return () => ((s = (s * 16807) % 2147483647) / 2147483647);
  })();

  // 랜덤하게 "망한 구간"과 "늦은 구간"을 섞어서 매번 다른 결과
  const badSeg = 2 + Math.floor(rand() * (segments - 3));
  let lateSeg = Math.floor(rand() * segments);
  if (lateSeg === badSeg) lateSeg = (lateSeg + 3) % segments;
  const lateBy = beat * (0.3 + rand() * 0.4);

  const ref = syntheticSequence({ duration, fps, bpm, offset: 0.5 });
  const user = syntheticSequence({
    duration,
    fps,
    bpm,
    offset: 0.5,
    body: { torso: 0.19, cx: 0.29, cy: 0.56 },
    noise: 0.003,
    seed,
    timeShift: (t) => {
      const i = Math.floor((t - 0.5) / seg);
      return i === lateSeg ? lateBy : 0.03;
    },
    partShift: { leftArm: (t) => (Math.floor((t - 0.5) / seg) === badSeg ? beat * 0.5 : 0) },
    errors: [
      { part: 'rightArm', start: 0.5 + badSeg * seg, end: 0.5 + (badSeg + 1) * seg, deg: 35 + rand() * 30 },
      { part: 'leftLeg', start: 0.5 + ((badSeg + 2) % segments) * seg, end: 0.5 + (((badSeg + 2) % segments) + 0.5) * seg, deg: 25 },
    ],
  });
  const result = analyzeSequences(ref, user, { bpm, offset: 0.5 });
  return { result, ref, user, userOffset: 0, mirror: false, source: 'demo' };
}
