export interface DtwOptions {
  /** 대각선에서 벗어날 수 있는 최대 프레임 수 (Sakoe-Chiba band) */
  band: number;
  /** 대각선이 아닌 이동(늘이기/줄이기)에 주는 추가 비용. 과도한 워핑 방지 */
  stepPenalty?: number;
  /**
   * true면 시작/끝을 band 안에서 자유롭게 잡는다.
   * (첫 행/첫 열 어디서든 시작, 마지막 행 어디서든 끝)
   * 내가 전체적으로 살짝 늦거나 빨라도 앞뒤 프레임 때문에 손해 보지 않게.
   */
  openEnds?: boolean;
}

export interface DtwResult {
  /** [refIndex, userIndex] 쌍. refIndex 오름차순 */
  path: [number, number][];
  distance: number;
}

const DIAG = 0;
const UP = 1; // (i-1, j)
const LEFT = 2; // (i, j-1)
const START = 3;

/**
 * Dynamic Time Warping. 같은 fps로 시간 정렬된 두 시퀀스를 가정하고
 * 대각선(i == j) 주변 band 안에서만 탐색한다. 메모리 O(n * band).
 *
 * @param n ref 길이
 * @param m user 길이
 * @param cost (i, j) 매칭 비용, 0 이상
 */
export function dtw(n: number, m: number, cost: (i: number, j: number) => number, opts: DtwOptions): DtwResult {
  if (n === 0 || m === 0) return { path: [], distance: Infinity };
  const band = Math.max(0, Math.floor(opts.band));
  const penalty = opts.stepPenalty ?? 0;
  const open = opts.openEnds ?? false;
  const width = 2 * band + 1;
  const acc = new Float64Array(n * width).fill(Infinity);
  const from = new Uint8Array(n * width);
  const idx = (i: number, j: number) => i * width + (j - i + band);
  const inBand = (i: number, j: number) => i >= 0 && j >= 0 && j < m && Math.abs(j - i) <= band;

  for (let i = 0; i < n; i++) {
    const jLo = Math.max(0, i - band);
    const jHi = Math.min(m - 1, i + band);
    for (let j = jLo; j <= jHi; j++) {
      const c = cost(i, j);
      const k = idx(i, j);
      if ((i === 0 && j === 0) || (open && (i === 0 || j === 0))) {
        acc[k] = c;
        from[k] = START;
        continue;
      }
      let best = Infinity;
      let dir = DIAG;
      if (inBand(i - 1, j - 1)) best = acc[idx(i - 1, j - 1)];
      if (inBand(i - 1, j)) {
        const v = acc[idx(i - 1, j)] + penalty;
        if (v < best) {
          best = v;
          dir = UP;
        }
      }
      if (inBand(i, j - 1)) {
        const v = acc[idx(i, j - 1)] + penalty;
        if (v < best) {
          best = v;
          dir = LEFT;
        }
      }
      acc[k] = best + c;
      from[k] = dir;
    }
  }

  let endJ = Math.min(m - 1, n - 1 + band);
  if (open || !inBand(n - 1, m - 1)) {
    let best = Infinity;
    for (let j = Math.max(0, n - 1 - band); j <= Math.min(m - 1, n - 1 + band); j++) {
      const v = acc[idx(n - 1, j)];
      if (v < best) {
        best = v;
        endJ = j;
      }
    }
  } else {
    endJ = m - 1;
  }
  if (!inBand(n - 1, endJ)) return { path: [], distance: Infinity };
  const distance = acc[idx(n - 1, endJ)];
  if (!Number.isFinite(distance)) return { path: [], distance: Infinity };

  const path: [number, number][] = [];
  let i = n - 1;
  let j = endJ;
  for (;;) {
    path.push([i, j]);
    const d = from[idx(i, j)];
    if (d === START) break;
    if (d === DIAG) {
      i--;
      j--;
    } else if (d === UP) {
      i--;
    } else {
      j--;
    }
  }
  path.reverse();
  return { path, distance };
}

/**
 * DTW 경로로 ref 프레임마다 매칭된 user 프레임(여러 개면 평균)을 구한다.
 * 경로에 안 걸린 ref 프레임(열린 시작으로 건너뛴 앞부분)은 NaN.
 */
export function matchIndices(path: [number, number][], n: number): number[] {
  const sum = new Float64Array(n);
  const count = new Uint32Array(n);
  for (const [i, j] of path) {
    sum[i] += j;
    count[i]++;
  }
  return Array.from({ length: n }, (_, i) => (count[i] > 0 ? sum[i] / count[i] : NaN));
}
