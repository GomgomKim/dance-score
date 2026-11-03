import { describe, expect, it } from 'vitest';
import { dtw, matchIndices } from './dtw';

const series = (n: number, shift = 0) => Array.from({ length: n }, (_, i) => Math.sin((i - shift) / 3));

describe('dtw', () => {
  it('같은 시퀀스는 대각선 경로, 거리 0', () => {
    const a = series(50);
    const { path, distance } = dtw(50, 50, (i, j) => Math.abs(a[i] - a[j]), { band: 5 });
    expect(distance).toBeCloseTo(0);
    expect(path.every(([i, j]) => i === j)).toBe(true);
  });

  it('밀린 시퀀스는 밀린 만큼 매칭된다', () => {
    const a = series(80);
    const b = series(80, 4); // b는 4프레임 늦음
    const { path } = dtw(80, 80, (i, j) => Math.abs(a[i] - b[j]), { band: 8, openEnds: true });
    const m = matchIndices(path, 80);
    const mid = m.slice(10, 70).map((j, k) => j - (k + 10));
    const avg = mid.reduce((s, v) => s + v, 0) / mid.length;
    expect(avg).toBeCloseTo(4, 0);
  });

  it('band 밖으로는 매칭하지 않는다', () => {
    const a = series(40);
    const b = series(40, 10);
    const { path } = dtw(40, 40, (i, j) => Math.abs(a[i] - b[j]), { band: 3, openEnds: true });
    expect(path.every(([i, j]) => Math.abs(i - j) <= 3)).toBe(true);
  });

  it('경로는 단조 증가하고 연속이다', () => {
    const a = series(30);
    const b = series(35, 2);
    const { path } = dtw(30, 35, (i, j) => Math.abs(a[i] - b[j]), { band: 6 });
    expect(path[0]).toEqual([0, 0]);
    expect(path[path.length - 1]).toEqual([29, 34]);
    for (let k = 1; k < path.length; k++) {
      const di = path[k][0] - path[k - 1][0];
      const dj = path[k][1] - path[k - 1][1];
      expect(di >= 0 && dj >= 0 && di <= 1 && dj <= 1 && di + dj > 0).toBe(true);
    }
  });

  it('빈 입력', () => {
    expect(dtw(0, 5, () => 0, { band: 2 }).path).toEqual([]);
  });
});
