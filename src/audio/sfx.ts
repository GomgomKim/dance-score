/**
 * 효과음 (Web Audio로 합성 — 별도 음원 파일 없음, 저작권 걱정 없음)
 */
import type { Grade } from '../pose/types';

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.2, slideTo?: number) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseBurst(start: number, dur: number, gain = 0.15) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + start;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 3000;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

/** 카운트업 틱 (점수에 따라 음이 올라감) */
export function tick(progress: number) {
  tone(500 + progress * 900, 0, 0.04, 'square', 0.04);
}

/** 오디오 컨텍스트 미리 깨우기 (사용자 클릭 시 호출) */
export function unlockAudio() {
  ac();
}

/** 총점 공개 */
export function reveal(grade: Grade) {
  switch (grade) {
    case 'PERFECT':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.5, 'triangle', 0.22));
      tone(1568, 0.36, 0.9, 'sine', 0.12);
      noiseBurst(0.36, 0.6, 0.12);
      break;
    case 'GREAT':
      [523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.45, 'triangle', 0.2));
      noiseBurst(0.27, 0.35, 0.08);
      break;
    case 'GOOD':
      [440, 554].forEach((f, i) => tone(f, i * 0.1, 0.4, 'triangle', 0.2));
      break;
    default:
      // 뿌우~ 실패 효과음
      tone(392, 0, 0.35, 'sawtooth', 0.12, 370);
      tone(370, 0.35, 0.35, 'sawtooth', 0.12, 349);
      tone(349, 0.7, 0.9, 'sawtooth', 0.12, 260);
  }
}

/** 라이브 모드 8카운트 팝업 */
export function popup(grade: Grade) {
  const base = { PERFECT: 988, GREAT: 784, GOOD: 587, MISS: 220 }[grade];
  if (grade === 'MISS') tone(base, 0, 0.25, 'sawtooth', 0.1, 150);
  else {
    tone(base, 0, 0.12, 'triangle', 0.2);
    tone(base * 1.5, 0.08, 0.2, 'triangle', 0.16);
  }
}

/** 라이브 시작 카운트다운 */
export function countdownBeep(final = false) {
  tone(final ? 1320 : 880, 0, final ? 0.3 : 0.12, 'sine', 0.2);
}
