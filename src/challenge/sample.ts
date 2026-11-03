/**
 * 샘플 챌린지 (가짜 포즈 데이터). `npm run sample:challenge`로 public/challenges/sample.json 생성.
 * 유튜브 없이 스켈레톤 가이드 + 메트로놈으로 재생된다.
 * 유튜브 싱크까지 시험해보려면 /c/sample?yt=<영상ID>&ytOffset=<초>
 */
import { syntheticSequence } from '../pose/synthetic';
import { buildChallengeFile, type ChallengeFile } from './format';

export const SAMPLE_BPM = 120;
/** 4박 전주 후 첫 카운트 */
export const SAMPLE_OFFSET = 2;
const SEGMENTS = 6;

export function makeSampleChallenge(): ChallengeFile {
  const beat = 60 / SAMPLE_BPM;
  const duration = SAMPLE_OFFSET + SEGMENTS * 8 * beat + 0.5;
  const ref = syntheticSequence({
    duration,
    fps: 15,
    bpm: SAMPLE_BPM,
    offset: SAMPLE_OFFSET,
    // 실제 영상처럼 약간의 흔들림과 인식 실패를 넣음 (시드 고정이라 매번 같은 파일)
    noise: 0.002,
    dropRate: 0.01,
    seed: 2026,
  });
  return buildChallengeFile(
    {
      id: 'sample',
      title: '샘플 안무',
      artist: 'dance-score',
      description: '가짜 포즈 데이터로 만든 데모용 챌린지 · 6 × 8카운트',
      youtubeId: null,
      youtubeOffset: 0,
      bpm: SAMPLE_BPM,
      offset: SAMPLE_OFFSET,
      mirror: false,
    },
    ref,
    new Date('2026-11-03T00:00:00Z'),
  );
}
