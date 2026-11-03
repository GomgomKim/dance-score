/** 캔버스에 스켈레톤 그리기 (브라우저 전용) */
import { SKELETON_EDGES } from './landmarks';
import type { BodyPart, Pose } from './types';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PART_EDGES: Record<BodyPart, [number, number][]> = {
  leftArm: [[11, 13], [13, 15], [15, 19]],
  rightArm: [[12, 14], [14, 16], [16, 20]],
  leftLeg: [[23, 25], [25, 27], [27, 31], [27, 29]],
  rightLeg: [[24, 26], [26, 28], [28, 32], [28, 30]],
  torso: [[11, 12], [11, 23], [12, 24], [23, 24]],
  head: [],
};

export interface SkeletonStyle {
  color: string;
  width?: number;
  /** 강조할 부위 (가장 많이 틀린 부위) */
  highlight?: BodyPart | null;
  highlightColor?: string;
  alpha?: number;
  /** 그림 영역이 좌우 반전돼 있으면 true */
  flipX?: boolean;
}

export function drawSkeleton(ctx: CanvasRenderingContext2D, pose: Pose, rect: Rect, style: SkeletonStyle) {
  const px = (i: number) => rect.x + (style.flipX ? 1 - pose[i].x : pose[i].x) * rect.w;
  const py = (i: number) => rect.y + pose[i].y * rect.h;
  const lw = style.width ?? Math.max(3, rect.h / 120);
  const hl = style.highlight ? new Set(PART_EDGES[style.highlight].map((e) => e.join('-'))) : null;
  ctx.save();
  ctx.globalAlpha = style.alpha ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [a, b] of SKELETON_EDGES) {
    if ((pose[a].visibility ?? 1) < 0.2 || (pose[b].visibility ?? 1) < 0.2) continue;
    const isHl = hl?.has(`${a}-${b}`);
    ctx.strokeStyle = isHl ? (style.highlightColor ?? '#ff4d6d') : style.color;
    ctx.lineWidth = isHl ? lw * 1.8 : lw;
    if (isHl) {
      ctx.shadowColor = style.highlightColor ?? '#ff4d6d';
      ctx.shadowBlur = lw * 3;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.beginPath();
    ctx.moveTo(px(a), py(a));
    ctx.lineTo(px(b), py(b));
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = style.color;
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if ((pose[i].visibility ?? 1) < 0.2) continue;
    ctx.beginPath();
    ctx.arc(px(i), py(i), i === 0 ? lw * 2.2 : lw * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** object-fit: cover 처럼 영상을 영역에 꽉 채울 때 영상이 그려지는 사각형 */
export function coverRect(srcW: number, srcH: number, area: Rect): Rect {
  const scale = Math.max(area.w / srcW, area.h / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
}

/** object-fit: contain */
export function containRect(srcW: number, srcH: number, area: Rect): Rect {
  const scale = Math.min(area.w / srcW, area.h / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
}

/** 영상 프레임을 rect에 그림 (좌우 반전 옵션) */
export function drawVideoFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, rect: Rect, flipX = false) {
  ctx.save();
  if (flipX) {
    ctx.translate(rect.x * 2 + rect.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}
