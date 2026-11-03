/** 라이브/챌린지 화면 공용 UI 조각 */
import { useCallback, useRef, useState } from 'react';
import { countdownBeep, popup } from '../audio/sfx';
import { drawSkeleton, type Rect } from '../pose/draw';
import { GRADE_COLORS } from '../pose/grading';
import type { Grade, Pose, SegmentResult } from '../pose/types';

/** <video>(object-fit: contain) 위 캔버스에 스켈레톤 */
export function drawPoseOverlay(
  canvas: HTMLCanvasElement | null,
  srcW: number,
  srcH: number,
  pose: Pose | null,
  color: string,
) {
  if (!canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  if (!pose || !srcW || !srcH) return;
  const scale = Math.min(w / srcW, h / srcH);
  const rect: Rect = { w: srcW * scale, h: srcH * scale, x: (w - srcW * scale) / 2, y: (h - srcH * scale) / 2 };
  drawSkeleton(ctx, pose, rect, { color });
}

interface Popup {
  id: number;
  grade: Grade;
  combo: number;
  comment: string;
}

/** 8카운트 등급 팝업 (효과음 포함) */
export function usePopups() {
  const [popups, setPopups] = useState<Popup[]>([]);
  const id = useRef(0);
  const show = useCallback((sr: SegmentResult, combo: number) => {
    popup(sr.grade);
    const pid = ++id.current;
    setPopups((p) => [...p.slice(-2), { id: pid, grade: sr.grade, combo, comment: sr.comment }]);
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== pid)), 1600);
  }, []);
  return { popups, show };
}

export function PopupStack({ popups }: { popups: Popup[] }) {
  return (
    <div className="popups">
      {popups.map((p) => (
        <div key={p.id} className={`popup grade-${p.grade.toLowerCase()}`} style={{ color: GRADE_COLORS[p.grade] }}>
          <div className="popup-grade">{p.grade}</div>
          {p.combo > 1 && <div className="popup-combo">{p.combo} COMBO</div>}
          <div className="popup-comment">{p.comment}</div>
        </div>
      ))}
    </div>
  );
}

export function CountDots({ count }: { count: number }) {
  return (
    <div className="live-count">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className={i + 1 === count ? 'on' : ''}>
          {i + 1}
        </span>
      ))}
    </div>
  );
}

/** 3-2-1 카운트다운 */
export async function runCountdown(set: (n: number) => void, from = 3, stepMs = 800) {
  for (let i = from; i >= 1; i--) {
    set(i);
    countdownBeep();
    await new Promise((r) => setTimeout(r, stepMs));
  }
  set(0);
  countdownBeep(true);
}

export function cameraErrorMessage(e: unknown): string {
  const err = e as Error;
  if (err?.name === 'NotAllowedError') return '웹캠 권한이 필요해요. 브라우저 주소창에서 카메라를 허용해주세요.';
  if (err?.name === 'NotFoundError') return '웹캠을 찾지 못했어요.';
  return `준비 중 오류: ${err?.message ?? String(e)}`;
}

export function openWebcam(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
}
