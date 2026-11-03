/**
 * 템포 관련 순수 함수: 탭 템포, 오디오 BPM 추정, 두 오디오 싱크 맞추기.
 * DOM 의존 없음 → 유닛 테스트 가능.
 */

/** 탭 시간(ms)들로 BPM 계산. 마지막 탭 기준 maxGapMs 이상 끊기면 그 이후만 사용 */
export function bpmFromTaps(tapsMs: number[], maxGapMs = 2000, maxTaps = 12): number | null {
  if (tapsMs.length < 2) return null;
  let start = tapsMs.length - 1;
  while (start > 0 && tapsMs[start] - tapsMs[start - 1] < maxGapMs) start--;
  const taps = tapsMs.slice(Math.max(start, tapsMs.length - maxTaps));
  if (taps.length < 2) return null;
  const intervals = taps.slice(1).map((t, i) => t - taps[i]).sort((a, b) => a - b);
  const mid = intervals.length >> 1;
  const median = intervals.length % 2 ? intervals[mid] : (intervals[mid - 1] + intervals[mid]) / 2;
  if (median <= 0) return null;
  return Math.round((60000 / median) * 10) / 10;
}

export interface OnsetEnvelope {
  values: Float32Array;
  /** 한 칸의 길이(초) */
  hop: number;
}

/** 오디오 샘플 → 온셋(소리 세기 증가량) 곡선 */
export function onsetEnvelope(samples: Float32Array, sampleRate: number, hopSize = 512): OnsetEnvelope {
  const n = Math.floor(samples.length / hopSize);
  const energy = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0;
    const off = k * hopSize;
    for (let i = 0; i < hopSize; i++) {
      const v = samples[off + i];
      s += v * v;
    }
    energy[k] = Math.log(1e-10 + s / hopSize);
  }
  const values = new Float32Array(n);
  for (let k = 1; k < n; k++) values[k] = Math.max(0, energy[k] - energy[k - 1]);
  // 평균 빼기 (상수 성분 제거)
  let m = 0;
  for (let k = 0; k < n; k++) m += values[k];
  m /= n || 1;
  for (let k = 0; k < n; k++) values[k] = Math.max(0, values[k] - m);
  return { values, hop: hopSize / sampleRate };
}

export interface BpmEstimate {
  bpm: number;
  /** 첫 박 위치(초) 추정 */
  firstBeat: number;
  /** 0~1, 클수록 확실 */
  confidence: number;
}

/**
 * 자기상관으로 BPM 추정. 춤 음악 기준 minBpm~maxBpm 범위로 접어서 반환.
 */
export function estimateBpm(samples: Float32Array, sampleRate: number, minBpm = 70, maxBpm = 180): BpmEstimate | null {
  const env = onsetEnvelope(samples, sampleRate);
  const x = env.values;
  if (x.length < 16) return null;
  const lagMin = Math.max(1, Math.floor(60 / maxBpm / env.hop));
  const lagMax = Math.min(x.length - 1, Math.ceil(60 / minBpm / env.hop));
  let zero = 0;
  for (let i = 0; i < x.length; i++) zero += x[i] * x[i];
  if (zero <= 0) return null;

  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag];
    return s / (x.length - lag);
  };
  let bestLag = lagMin;
  let best = -Infinity;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    // 2배 lag(반 템포)도 같이 보면 박이 더 안정적으로 잡힘
    const v = ac(lag) + 0.5 * (2 * lag < x.length ? ac(2 * lag) : 0);
    if (v > best) {
      best = v;
      bestLag = lag;
    }
  }
  // 포물선 보간으로 lag 정밀화
  const y0 = ac(bestLag - 1);
  const y1 = ac(bestLag);
  const y2 = ac(bestLag + 1);
  const denom = y0 - 2 * y1 + y2;
  const refined = denom !== 0 ? bestLag + (0.5 * (y0 - y2)) / denom : bestLag;
  let bpm = 60 / (refined * env.hop);
  while (bpm < minBpm) bpm *= 2;
  while (bpm > maxBpm) bpm /= 2;

  // 박 위상: 박 격자 위 온셋 합이 최대가 되는 시작점
  const period = 60 / bpm / env.hop;
  let bestPhase = 0;
  let bestSum = -Infinity;
  for (let p = 0; p < Math.ceil(period); p++) {
    let s = 0;
    for (let k = p; k < x.length; k += period) s += x[Math.round(k)] ?? 0;
    if (s > bestSum) {
      bestSum = s;
      bestPhase = p;
    }
  }
  const confidence = Math.max(0, Math.min(1, (y1 * x.length) / zero));
  return { bpm: Math.round(bpm * 10) / 10, firstBeat: bestPhase * env.hop, confidence };
}

/**
 * 두 오디오의 온셋 곡선을 상호상관해서 싱크 오프셋 계산.
 * @returns b가 a보다 몇 초 늦게 시작하는지 (b 시간 = a 시간 + offset)
 */
export function estimateSyncOffset(a: OnsetEnvelope, b: OnsetEnvelope, maxLagSec = 30): number {
  const hop = a.hop;
  const maxLag = Math.round(maxLagSec / hop);
  let best = -Infinity;
  let bestLag = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let s = 0;
    let c = 0;
    for (let i = 0; i < a.values.length; i++) {
      const j = i + lag;
      if (j < 0 || j >= b.values.length) continue;
      s += a.values[i] * b.values[j];
      c++;
    }
    if (c < 50) continue;
    const v = s / c;
    if (v > best) {
      best = v;
      bestLag = lag;
    }
  }
  return bestLag * hop;
}
