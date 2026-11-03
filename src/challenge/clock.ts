/**
 * 유튜브 IFrame Player의 currentTime은 postMessage로 띄엄띄엄(약 100~250ms마다) 갱신돼서
 * 그대로 쓰면 시간이 계단처럼 튄다. 마지막으로 받은 값 + 경과한 실제 시간으로 보간하고,
 * 새 값이 오면 부드럽게 보정하는 시계. (웹캠 프레임 타임스탬프와 싱크 맞추는 용도)
 */
export interface MediaClockOptions {
  /** 이보다 크게 어긋나면 seek으로 보고 바로 맞춤(초) */
  jumpThreshold?: number;
  /** 작은 오차는 이 비율만큼만 반영 (0~1) */
  correction?: number;
}

export class MediaClock {
  private anchorMedia = 0;
  private anchorWall = 0;
  private playing = false;
  private lastReported = NaN;
  private lastOut = -Infinity;
  private readonly jump: number;
  private readonly k: number;
  rate = 1;

  constructor(opts: MediaClockOptions = {}) {
    this.jump = opts.jumpThreshold ?? 0.4;
    this.k = opts.correction ?? 0.35;
  }

  /** 플레이어에서 읽은 시간과 재생 상태를 알려준다 (매 프레임 호출해도 됨) */
  sync(reported: number, playing: boolean, nowMs: number) {
    if (!Number.isFinite(reported)) return;
    if (!playing) {
      this.playing = false;
      this.anchorMedia = reported;
      this.anchorWall = nowMs;
      this.lastReported = reported;
      this.lastOut = -Infinity;
      return;
    }
    if (!this.playing) {
      this.playing = true;
      this.anchor(reported, nowMs);
      return;
    }
    if (reported === this.lastReported) return; // 새 정보 없음
    this.lastReported = reported;
    const predicted = this.raw(nowMs);
    const err = reported - predicted;
    if (Math.abs(err) > this.jump) this.anchor(reported, nowMs);
    else {
      this.anchorMedia = predicted + err * this.k;
      this.anchorWall = nowMs;
    }
  }

  /** 현재 미디어 시간 추정값 (재생 중엔 단조 증가) */
  time(nowMs: number): number {
    const t = this.raw(nowMs);
    if (!this.playing) return t;
    const out = Math.max(t, this.lastOut);
    this.lastOut = out;
    return out;
  }

  isPlaying() {
    return this.playing;
  }

  private raw(nowMs: number) {
    return this.playing ? this.anchorMedia + ((nowMs - this.anchorWall) / 1000) * this.rate : this.anchorMedia;
  }

  private anchor(media: number, nowMs: number) {
    this.anchorMedia = media;
    this.anchorWall = nowMs;
    this.lastReported = media;
    this.lastOut = -Infinity;
  }
}
