import { describe, expect, it } from 'vitest';
import { analyzeSequences } from '../pose/scoring';
import { syntheticSequence } from '../pose/synthetic';
import { toChallenge, validateChallengeFile, type ChallengeFile } from './format';
import { makeSampleChallenge, SAMPLE_BPM, SAMPLE_OFFSET } from './sample';

import sampleJson from '../../public/challenges/sample.json';

const raw = sampleJson as unknown as ChallengeFile;

describe('public/challenges/sample.json', () => {
  it('유효한 챌린지 파일', () => {
    const v = validateChallengeFile(raw);
    expect(v.ok).toBe(true);
  });

  it('생성기와 내용이 같다 (npm run sample:challenge 로 갱신)', () => {
    expect(raw).toEqual(JSON.parse(JSON.stringify(makeSampleChallenge())));
  });

  it('샘플 포즈대로 추면 PERFECT, 틀리면 감점', () => {
    const c = toChallenge(raw);
    const opts = { bpm: c.bpm, offset: c.offset };
    const good = syntheticSequence({ duration: c.duration, fps: 15, bpm: SAMPLE_BPM, offset: SAMPLE_OFFSET });
    const bad = syntheticSequence({
      duration: c.duration,
      fps: 15,
      bpm: SAMPLE_BPM,
      offset: SAMPLE_OFFSET,
      errors: [{ part: 'leftArm', start: 6, end: 10, deg: 70 }],
    });
    const rGood = analyzeSequences(c.ref, good, opts);
    const rBad = analyzeSequences(c.ref, bad, opts);
    expect(rGood.segments).toHaveLength(6);
    expect(rGood.totalGrade).toBe('PERFECT');
    expect(rBad.totalScore).toBeLessThan(rGood.totalScore);
  });
});
