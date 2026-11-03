/** 총점 카운트업 + 등급 이펙트 + 효과음 (릴스 핵심 장면) */
import { useEffect, useRef, useState } from 'react';
import { GRADE_COLORS } from '../pose/grading';
import type { Grade } from '../pose/types';
import { reveal as revealSfx, tick } from '../audio/sfx';
import { Confetti } from './Confetti';

interface Props {
  score: number;
  grade: Grade;
  /** 바뀌면 처음부터 다시 연출 */
  replayKey: number;
  durationMs?: number;
  onRevealed?: () => void;
}

const GRADE_TEXT: Record<Grade, string> = {
  PERFECT: '완벽 그 자체 🔥',
  GREAT: '꽤 추는데요? 👏',
  GOOD: '나쁘지 않아요 🙂',
  MISS: '연습이 필요해요… 🥲',
};

/** 처음엔 빠르게, 끝에서 천천히 (긴장감) */
const easeOutQuart = (x: number) => 1 - Math.pow(1 - x, 4);

export function ScoreReveal({ score, grade, replayKey, durationMs = 2600, onRevealed }: Props) {
  const [value, setValue] = useState(0);
  const [done, setDone] = useState(false);
  const [burst, setBurst] = useState(0);
  const cb = useRef(onRevealed);
  cb.current = onRevealed;

  useEffect(() => {
    setValue(0);
    setDone(false);
    let raf = 0;
    let lastInt = -1;
    let lastTick = 0;
    const startDelay = 500;
    const t0 = performance.now() + startDelay;
    const step = (now: number) => {
      const x = Math.max(0, Math.min(1, (now - t0) / durationMs));
      const v = score * easeOutQuart(x);
      setValue(v);
      const iv = Math.floor(v);
      if (iv !== lastInt && now - lastTick > 35 && x > 0) {
        tick(v / 100);
        lastTick = now;
        lastInt = iv;
      }
      if (x < 1) raf = requestAnimationFrame(step);
      else {
        setValue(score);
        setDone(true);
        revealSfx(grade);
        if (grade === 'PERFECT' || grade === 'GREAT') setBurst((b) => b + 1);
        cb.current?.();
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score, grade, replayKey, durationMs]);

  const color = GRADE_COLORS[grade];
  // 소수 첫째 자리 기준으로 반올림한 뒤 나눠야 결과 카드와 숫자가 일치
  const tenths = done ? Math.round(value * 10) : Math.floor(value * 10);
  const whole = Math.floor(tenths / 10);
  const dec = tenths % 10;
  const colors =
    grade === 'PERFECT' ? ['#ffd23f', '#ff3d81', '#3ddcff', '#ffffff'] : ['#3ddcff', '#5cff8f', '#ffffff'];

  return (
    <div className={`reveal ${done ? `done grade-${grade.toLowerCase()}` : ''}`} style={{ ['--grade' as string]: color }}>
      {done && grade !== 'MISS' && <div className="reveal-flash" key={`f${replayKey}`} />}
      <Confetti fire={burst} colors={colors} count={grade === 'PERFECT' ? 220 : 110} />
      <div className="reveal-label">TOTAL SCORE</div>
      <div className="reveal-score" aria-live="polite">
        <span className="whole">{whole}</span>
        <span className="dec">.{dec}</span>
      </div>
      <div className={`reveal-grade ${done ? 'show' : ''}`}>{done ? grade : ' '}</div>
      <div className={`reveal-sub ${done ? 'show' : ''}`}>{done ? GRADE_TEXT[grade] : ' '}</div>
    </div>
  );
}
