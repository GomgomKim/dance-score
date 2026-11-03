import { describe, expect, it } from 'vitest';
import { gradeFor, poseSimilarityToScore, timingErrorToScore } from './grading';

describe('gradeFor', () => {
  it.each([
    [100, 'PERFECT'],
    [90, 'PERFECT'],
    [89.9, 'GREAT'],
    [75, 'GREAT'],
    [74.9, 'GOOD'],
    [55, 'GOOD'],
    [54.9, 'MISS'],
    [0, 'MISS'],
    [NaN, 'MISS'],
  ])('%s점 → %s', (score, grade) => {
    expect(gradeFor(score)).toBe(grade);
  });
});

describe('점수 변환', () => {
  it('포즈 유사도', () => {
    expect(poseSimilarityToScore(1)).toBe(1);
    expect(poseSimilarityToScore(0.5)).toBe(0);
    expect(poseSimilarityToScore(0.2)).toBe(0);
    expect(poseSimilarityToScore(0.75)).toBeCloseTo(0.5);
  });
  it('타이밍 오차', () => {
    expect(timingErrorToScore(0)).toBe(1);
    expect(timingErrorToScore(0.1)).toBe(1);
    expect(timingErrorToScore(1)).toBe(0);
    expect(timingErrorToScore(0.5)).toBeGreaterThan(0.4);
    expect(timingErrorToScore(0.5)).toBeLessThan(0.6);
  });
});
