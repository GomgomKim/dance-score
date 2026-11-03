import { describe, expect, it } from 'vitest';
import { mirrorSequence } from './landmarks';
import { analyzeSequences } from './scoring';
import { syntheticSequence, type SyntheticOptions } from './synthetic';

const BPM = 120; // 1박 0.5초, 8카운트 4초
const base: SyntheticOptions = { duration: 16, fps: 15, bpm: BPM };
const ref = syntheticSequence(base);
const opts = { bpm: BPM, offset: 0 };

describe('analyzeSequences', () => {
  it('같은 시퀀스끼리 비교하면 100점 근처', () => {
    const r = analyzeSequences(ref, ref, opts);
    expect(r.segments).toHaveLength(4);
    expect(r.totalScore).toBeGreaterThanOrEqual(98);
    expect(r.totalGrade).toBe('PERFECT');
    r.segments.forEach((s) => expect(s.grade).toBe('PERFECT'));
  });

  it('체형/위치가 다르고 노이즈가 조금 있어도 높은 점수', () => {
    const user = syntheticSequence({ ...base, body: { torso: 0.15, cx: 0.35, cy: 0.5 }, noise: 0.002, seed: 7 });
    const r = analyzeSequences(ref, user, opts);
    expect(r.totalScore).toBeGreaterThanOrEqual(90);
  });

  it('시간을 밀면 타이밍 점수와 총점이 떨어진다', () => {
    const same = analyzeSequences(ref, ref, opts);
    const half = analyzeSequences(ref, syntheticSequence({ ...base, timeShift: 0.25 }), opts); // 반 박자 늦음
    const full = analyzeSequences(ref, syntheticSequence({ ...base, timeShift: 0.5 }), opts); // 한 박자 늦음
    expect(half.timingScore).toBeLessThan(same.timingScore);
    expect(full.timingScore).toBeLessThan(half.timingScore);
    expect(half.totalScore).toBeLessThan(same.totalScore);
    expect(full.totalScore).toBeLessThan(half.totalScore);
    // DTW가 늦은 걸 감지: 평균 오프셋이 양수, 대략 반 박자
    const mid = half.segments[1];
    expect(mid.meanOffsetBeats).toBeGreaterThan(0.3);
    expect(mid.meanOffsetBeats).toBeLessThan(0.7);
    expect(half.segments[1].comment).toBe('전체적으로 반 박자 늦어요');
  });

  it('DTW 덕분에 시간이 밀려도 포즈 점수는 유지된다', () => {
    const r = analyzeSequences(ref, syntheticSequence({ ...base, timeShift: 0.2 }), opts);
    expect(r.poseScore).toBeGreaterThan(85);
  });

  it('팔 각도를 틀면 그 구간 점수가 떨어지고 왼팔이 지적된다', () => {
    const user = syntheticSequence({ ...base, errors: [{ part: 'leftArm', start: 4, end: 8, deg: 70 }] });
    const r = analyzeSequences(ref, user, opts);
    const bad = r.segments[1];
    expect(bad.score).toBeLessThan(r.segments[0].score - 10);
    expect(bad.score).toBeLessThan(r.segments[2].score - 10);
    expect(bad.grade).not.toBe('PERFECT');
    expect(bad.worstPart).toBe('leftArm');
    expect(r.worstSegmentIndex).toBe(1);
    expect(r.worstPart).toBe('leftArm');
    expect(r.comment).toContain('왼팔');
  });

  it('각도 오차가 클수록 점수가 더 떨어진다', () => {
    const scores = [20, 45, 90].map(
      (deg) =>
        analyzeSequences(ref, syntheticSequence({ ...base, errors: [{ part: 'rightArm', start: 0, end: 16, deg }] }), opts)
          .totalScore,
    );
    expect(scores[1]).toBeLessThan(scores[0]);
    expect(scores[2]).toBeLessThan(scores[1]);
  });

  it('왼팔만 반 박자 늦으면 "왼팔이 반 박자 늦어요"', () => {
    const user = syntheticSequence({ ...base, partShift: { leftArm: 0.25 } });
    const r = analyzeSequences(ref, user, opts);
    expect(r.worstPart).toBe('leftArm');
    expect(r.comment).toContain('왼팔이 반 박자 늦어요');
  });

  it('포즈를 못 찾은 프레임은 감점', () => {
    const r = analyzeSequences(ref, syntheticSequence({ ...base, dropRate: 0.4, seed: 3 }), opts);
    expect(r.totalScore).toBeLessThan(90);
  });

  it('거울 모드 원본은 반전하면 정상 채점된다', () => {
    const mirrored = mirrorSequence(ref);
    const wrong = analyzeSequences(mirrored, ref, opts);
    const fixed = analyzeSequences(mirrorSequence(mirrored), ref, opts);
    expect(fixed.totalScore).toBeGreaterThan(wrong.totalScore);
    expect(fixed.totalScore).toBeGreaterThanOrEqual(98);
  });

  it('구간을 직접 지정할 수 있다 (라이브 모드)', () => {
    const r = analyzeSequences(ref, ref, { ...opts, segments: [{ index: 2, start: 8, end: 12, beats: 8 }] });
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].index).toBe(2);
  });

  it('포즈가 하나도 없으면 0점', () => {
    const empty = syntheticSequence({ ...base, dropRate: 1 });
    const r = analyzeSequences(empty, empty, opts);
    expect(r.totalScore).toBe(0);
    expect(r.segments).toHaveLength(0);
  });
});
