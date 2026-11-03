import { describe, expect, it } from 'vitest';
import { MediaClock } from './clock';

/** 250ms마다만 갱신되는 가짜 유튜브 플레이어 */
function coarse(trueTime: number, step = 0.25) {
  return Math.floor(trueTime / step) * step;
}

describe('MediaClock', () => {
  it('띄엄띄엄 갱신돼도 부드럽게 보간한다', () => {
    const c = new MediaClock();
    const errors: number[] = [];
    let prev = -Infinity;
    for (let ms = 0; ms <= 5000; ms += 16) {
      const truth = ms / 1000;
      c.sync(coarse(truth), true, ms);
      const t = c.time(ms);
      expect(t).toBeGreaterThanOrEqual(prev); // 뒤로 안 감
      prev = t;
      if (ms > 1000) errors.push(Math.abs(t - truth));
    }
    // 계단 그대로 쓰면 최대 0.25초 오차. 보간하면 훨씬 작다
    expect(Math.max(...errors)).toBeLessThan(0.15);
    expect(errors.reduce((a, b) => a + b, 0) / errors.length).toBeLessThan(0.08);
  });

  it('일시정지하면 멈춘다', () => {
    const c = new MediaClock();
    c.sync(10, true, 0);
    c.sync(10.5, false, 500);
    expect(c.time(500)).toBe(10.5);
    expect(c.time(3000)).toBe(10.5);
    expect(c.isPlaying()).toBe(false);
  });

  it('seek하면 바로 그 시간으로 점프', () => {
    const c = new MediaClock();
    c.sync(0, true, 0);
    c.sync(0.25, true, 250);
    c.sync(30, true, 500);
    expect(c.time(500)).toBeCloseTo(30, 5);
  });

  it('뒤로 seek해도 따라간다', () => {
    const c = new MediaClock();
    c.sync(20, true, 0);
    c.time(100);
    c.sync(2, true, 200);
    expect(c.time(200)).toBeCloseTo(2, 5);
  });

  it('재생 속도 반영', () => {
    const c = new MediaClock();
    c.rate = 0.5;
    c.sync(0, true, 0);
    expect(c.time(1000)).toBeCloseTo(0.5, 5);
  });
});
