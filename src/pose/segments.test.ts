import { describe, expect, it } from 'vitest';
import { beatDuration, countAt, splitEightCounts } from './segments';

describe('splitEightCounts', () => {
  it('120BPM이면 8카운트 = 4초', () => {
    const segs = splitEightCounts({ bpm: 120, offset: 0, duration: 16 });
    expect(segs.map((s) => [s.start, s.end])).toEqual([
      [0, 4],
      [4, 8],
      [8, 12],
      [12, 16],
    ]);
    expect(segs.every((s) => s.beats === 8)).toBe(true);
  });

  it('시작 오프셋부터 나눈다', () => {
    const segs = splitEightCounts({ bpm: 100, offset: 1.5, duration: 11.1 });
    expect(segs[0].start).toBeCloseTo(1.5);
    expect(segs[0].end).toBeCloseTo(6.3);
    expect(segs[1].start).toBeCloseTo(6.3);
  });

  it('반 구간 미만 자투리는 버리고, 이상이면 짧은 구간으로 포함', () => {
    expect(splitEightCounts({ bpm: 120, offset: 0, duration: 5 })).toHaveLength(1); // 2박 자투리
    const segs = splitEightCounts({ bpm: 120, offset: 0, duration: 6.5 }); // 5박 자투리
    expect(segs).toHaveLength(2);
    expect(segs[1].beats).toBeCloseTo(5);
  });

  it('잘못된 BPM은 에러', () => {
    expect(() => splitEightCounts({ bpm: 0, offset: 0, duration: 10 })).toThrow();
    expect(() => beatDuration(-1)).toThrow();
  });
});

describe('countAt', () => {
  it('구간과 카운트(1~8)', () => {
    expect(countAt(0.4, 120, 0.5)).toBeNull();
    expect(countAt(0.5, 120, 0.5)).toEqual({ segment: 0, count: 1 });
    expect(countAt(4.4, 120, 0.5)).toEqual({ segment: 0, count: 8 });
    expect(countAt(4.5, 120, 0.5)).toEqual({ segment: 1, count: 1 });
  });
});
