import { describe, expect, it } from 'vitest';
import { bpmFromTaps, estimateBpm, estimateSyncOffset, onsetEnvelope } from './tempo';

const SR = 22050;

/** 클릭 트랙 생성 */
function clickTrack(bpm: number, seconds: number, firstBeat = 0, seed = 1): Float32Array {
  const out = new Float32Array(Math.floor(seconds * SR));
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < out.length; i++) out[i] = rand() * 0.01; // 배경 노이즈
  const beat = 60 / bpm;
  for (let t = firstBeat; t < seconds; t += beat) {
    const start = Math.floor(t * SR);
    for (let i = 0; i < 800 && start + i < out.length; i++) {
      out[start + i] += Math.sin(i * 0.3) * Math.exp(-i / 150);
    }
  }
  return out;
}

describe('bpmFromTaps', () => {
  it('일정한 탭이면 정확한 BPM', () => {
    expect(bpmFromTaps([0, 500, 1000, 1500, 2000])).toBe(120);
    expect(bpmFromTaps([0, 600, 1200])).toBe(100);
  });
  it('흔들리는 탭은 중앙값', () => {
    expect(bpmFromTaps([0, 480, 1000, 1520, 2000, 2700])).toBeCloseTo(115.4, 0);
  });
  it('2초 이상 쉬면 새로 시작', () => {
    expect(bpmFromTaps([0, 300, 600, 5000, 5500, 6000])).toBe(120);
  });
  it('탭이 부족하면 null', () => {
    expect(bpmFromTaps([100])).toBeNull();
    expect(bpmFromTaps([0, 5000])).toBeNull();
  });
});

describe('estimateBpm', () => {
  it.each([90, 100, 120, 128, 140])('%s BPM 클릭 트랙', (bpm) => {
    const r = estimateBpm(clickTrack(bpm, 20, 0.3), SR)!;
    expect(Math.abs(r.bpm - bpm)).toBeLessThan(2);
  });
  it('첫 박 위치도 추정', () => {
    const r = estimateBpm(clickTrack(120, 20, 0.3), SR)!;
    const beat = 0.5;
    const phase = ((r.firstBeat - 0.3) % beat + beat) % beat;
    expect(Math.min(phase, beat - phase)).toBeLessThan(0.05);
  });
  it('무음이면 null', () => {
    expect(estimateBpm(new Float32Array(SR * 5), SR)).toBeNull();
  });
});

describe('estimateSyncOffset', () => {
  it('늦게 시작한 녹화본의 오프셋을 찾는다', () => {
    // 박자가 불규칙한 트랙이어야 상호상관이 유일하게 결정됨
    const make = (delay: number) => {
      const out = new Float32Array(SR * 20);
      const hits = [0.5, 1.1, 1.4, 2.6, 3.0, 4.2, 4.5, 5.9, 7.3, 7.6, 8.8, 10.1, 11.7, 12.0, 13.9];
      for (const h of hits) {
        const start = Math.floor((h + delay) * SR);
        for (let i = 0; i < 800 && start + i < out.length; i++) out[start + i] += Math.sin(i * 0.3) * Math.exp(-i / 150);
      }
      return out;
    };
    const a = onsetEnvelope(make(0), SR);
    const b = onsetEnvelope(make(1.75), SR);
    expect(estimateSyncOffset(a, b, 5)).toBeCloseTo(1.75, 1);
  });
});
