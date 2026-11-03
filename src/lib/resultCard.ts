/** 9:16 결과 카드 이미지 (1080x1920) */
import { GRADE_COLORS } from '../pose/grading';
import { PART_LABELS } from '../pose/similarity';
import type { AnalysisResult } from '../pose/types';
import { formatDate } from './download';
import { drawWatermark, preloadBrandLogo } from './watermark';

export const CARD_W = 1080;
export const CARD_H = 1920;

const FONT_DISPLAY = '"Black Han Sans", "Noto Sans KR", sans-serif';
const FONT_BODY = '"Noto Sans KR", system-ui, sans-serif';

export async function ensureFonts() {
  if (!document.fonts) return;
  await Promise.allSettled([
    document.fonts.load(`200px ${FONT_DISPLAY}`, '0123456789점'),
    document.fonts.load(`900 40px ${FONT_BODY}`, '가나다'),
    document.fonts.load(`700 40px ${FONT_BODY}`, '가나다'),
    preloadBrandLogo(),
  ]);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight: string, family: string) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    s -= 2;
  } while (ctx.measureText(text).width > maxW && s > 20);
}

export interface CardOptions {
  title: string;
  /** 표시 이름(선택) */
  handle?: string;
}

export function drawResultCard(canvas: HTMLCanvasElement, result: AnalysisResult, opts: CardOptions) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  const gradeColor = GRADE_COLORS[result.totalGrade];

  // 배경
  const bg = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bg.addColorStop(0, '#120a24');
  bg.addColorStop(0.55, '#0b0b12');
  bg.addColorStop(1, '#05050a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(CARD_W / 2, 620, 40, CARD_W / 2, 620, 620);
  glow.addColorStop(0, `${gradeColor}55`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // 상단 태그
  ctx.fillStyle = '#ff3d81';
  roundRect(ctx, CARD_W / 2 - 300, 120, 600, 76, 38);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `900 38px ${FONT_BODY}`;
  ctx.fillText('AI한테 내 춤 채점 맡겨봄', CARD_W / 2, 172);

  // 곡 제목
  ctx.fillStyle = '#fff';
  fitText(ctx, opts.title || '제목 없는 안무', CARD_W - 140, 72, '900', FONT_BODY);
  ctx.fillText(opts.title || '제목 없는 안무', CARD_W / 2, 300);
  ctx.fillStyle = '#9a98b0';
  ctx.font = `700 34px ${FONT_BODY}`;
  ctx.fillText(`${formatDate(result.createdAt)}${opts.handle ? `  ·  ${opts.handle}` : ''}`, CARD_W / 2, 352);

  // 총점
  const tenths = Math.round(result.totalScore * 10);
  const whole = Math.floor(tenths / 10);
  const dec = tenths % 10;
  ctx.font = `360px ${FONT_DISPLAY}`;
  ctx.fillStyle = '#fff';
  ctx.shadowColor = gradeColor;
  ctx.shadowBlur = 60;
  const wholeW = ctx.measureText(String(whole)).width;
  ctx.font = `120px ${FONT_DISPLAY}`;
  const decStr = `.${dec}`;
  const decW = ctx.measureText(decStr).width;
  const startX = CARD_W / 2 - (wholeW + decW) / 2;
  ctx.textAlign = 'left';
  ctx.font = `360px ${FONT_DISPLAY}`;
  ctx.fillText(String(whole), startX, 700);
  ctx.font = `120px ${FONT_DISPLAY}`;
  ctx.fillText(decStr, startX + wholeW, 700);
  ctx.shadowBlur = 0;
  ctx.textAlign = 'center';

  // 등급
  ctx.font = `130px ${FONT_DISPLAY}`;
  ctx.fillStyle = gradeColor;
  ctx.shadowColor = gradeColor;
  ctx.shadowBlur = 40;
  ctx.fillText(result.totalGrade, CARD_W / 2, 850);
  ctx.shadowBlur = 0;

  // 서브 점수
  const sub = [
    ['포즈', result.poseScore],
    ['타이밍', result.timingScore],
    ['구간', result.segments.length],
  ] as const;
  sub.forEach(([label, value], i) => {
    const cx = CARD_W / 2 + (i - 1) * 300;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, cx - 130, 890, 260, 120, 28);
    ctx.fill();
    ctx.fillStyle = '#9a98b0';
    ctx.font = `700 28px ${FONT_BODY}`;
    ctx.fillText(label, cx, 932);
    ctx.fillStyle = '#fff';
    ctx.font = `56px ${FONT_DISPLAY}`;
    ctx.fillText(i === 2 ? `${value}개` : String(Math.round(value)), cx, 992);
  });

  // 코멘트
  ctx.fillStyle = '#ff3d81';
  ctx.font = `900 34px ${FONT_BODY}`;
  ctx.fillText(`가장 많이 틀린 부위 · ${PART_LABELS[result.worstPart]}`, CARD_W / 2, 1068);
  ctx.fillStyle = '#fff';
  fitText(ctx, `“${result.comment}”`, CARD_W - 140, 48, '900', FONT_BODY);
  ctx.fillText(`“${result.comment}”`, CARD_W / 2, 1124);

  // 8카운트 막대 그래프
  const chartX = 90;
  const chartY = 1195;
  const chartW = CARD_W - 180;
  const chartH = 240;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  roundRect(ctx, chartX - 30, chartY - 45, chartW + 60, chartH + 90, 32);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9a98b0';
  ctx.font = `700 28px ${FONT_BODY}`;
  ctx.fillText('8카운트별 점수', chartX, chartY);
  const segs = result.segments;
  const n = Math.max(1, segs.length);
  const gap = Math.min(16, (chartW / n) * 0.2);
  const bw = (chartW - gap * (n - 1)) / n;
  const top = chartY + 22;
  const barArea = chartH - 60;
  segs.forEach((s, i) => {
    const h = Math.max(6, (s.score / 100) * barArea);
    const x = chartX + i * (bw + gap);
    ctx.fillStyle = GRADE_COLORS[s.grade];
    ctx.globalAlpha = s.index === result.worstSegmentIndex ? 1 : 0.85;
    roundRect(ctx, x, top + barArea - h, bw, h, Math.min(12, bw / 3));
    ctx.fill();
    ctx.globalAlpha = 1;
    if (bw > 34) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#6f6d85';
      ctx.font = `700 ${Math.min(26, bw * 0.45)}px ${FONT_BODY}`;
      ctx.fillText(String(i + 1), x + bw / 2, top + barArea + 32);
    }
  });
  ctx.textAlign = 'center';

  // 워터마크: 하단 15% 안전 영역 바로 위 (항상 표시)
  drawWatermark(ctx, CARD_W, CARD_H);
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 생성 실패'))), type),
  );
}
