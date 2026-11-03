import { describe, expect, it } from 'vitest';
import { syntheticSequence } from '../pose/synthetic';
import { LiveScorer } from './liveScorer';

const BPM = 120; // 8카운트 = 4초
const duration = 16.5;
const ref = syntheticSequence({ duration, fps: 15, bpm: BPM });

/** 웹캠처럼 불규칙한 간격(약 20~40fps)으로 내 포즈를 넣는다 */
function feedUser(s: LiveScorer, user = ref, onTick?: (t: number) => void) {
  let t = 0;
  let k = 0;
  while (t < duration) {
    const f = user.frames[Math.min(user.frames.length - 1, Math.round(t * user.fps))];
    s.addUser(t, f.pose);
    onTick?.(t);
    t += 0.025 + ((k++ * 7) % 5) * 0.004;
  }
  return t;
}

describe('LiveScorer (챌린지 모드: 원본 포즈 미리 로드)', () => {
  it('구간이 끝날 때마다 하나씩 채점되고, 똑같이 추면 PERFECT', () => {
    const s = new LiveScorer({ bpm: BPM, offset: 0, duration, refAspect: ref.aspect, userAspect: ref.aspect, refFrames: ref.frames });
    const scoredAt: number[] = [];
    feedUser(s, ref, (t) => {
      for (const r of s.poll(t)) scoredAt.push(t - r.end);
    });
    s.flush(duration);
    expect(s.results).toHaveLength(4);
    // 구간 끝 + 반 박(0.25초) 직후에 채점 → 팝업이 늦지 않게
    scoredAt.forEach((d) => expect(d).toBeLessThan(0.35));
    s.results.forEach((r) => expect(r.grade).toBe('PERFECT'));
    expect(s.combo).toBe(4);
  });

  it('반 박자 늦게 추면 등급이 떨어지고 콤보가 끊긴다', () => {
    const late = syntheticSequence({ duration, fps: 15, bpm: BPM, timeShift: 0.3 });
    const s = new LiveScorer({ bpm: BPM, offset: 0, duration, refAspect: ref.aspect, userAspect: ref.aspect, refFrames: ref.frames });
    feedUser(s, late, (t) => s.poll(t));
    s.flush(duration);
    expect(s.results.some((r) => r.grade !== 'PERFECT')).toBe(true);
    const { result } = s.finalize(duration);
    expect(result.timingScore).toBeLessThan(80);
  });

  it('중간에 그만두면 끝난 구간까지만 결과에 포함', () => {
    const s = new LiveScorer({ bpm: BPM, offset: 0, duration, refAspect: ref.aspect, userAspect: ref.aspect, refFrames: ref.frames });
    for (let t = 0; t < 9; t += 0.03) s.addUser(t, ref.frames[Math.round(t * 15)].pose);
    s.flush(9);
    const { result } = s.finalize(9);
    expect(result.segments).toHaveLength(2);
    expect(result.totalScore).toBeGreaterThan(90);
  });

  it('시간이 거꾸로 가는 프레임(seek)은 무시', () => {
    const s = new LiveScorer({ bpm: BPM, offset: 0, duration, refAspect: ref.aspect, userAspect: ref.aspect, refFrames: ref.frames });
    s.addUser(5, null);
    s.addUser(3, null);
    expect(s.userFrameCount).toBe(1);
  });
});
