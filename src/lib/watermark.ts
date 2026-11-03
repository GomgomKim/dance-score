/**
 * 결과 카드와 비교 영상에 들어가는 워터마크.
 * 끄는 옵션 없음. 문구/로고는 src/config/brand.ts에서 관리.
 */
import { BRAND, watermarkLines, type BrandConfig } from '../config/brand';

/** 릴스 UI(상단 탭, 하단 캡션/버튼)에 가려지는 위아래 비율 */
export const SAFE_MARGIN_RATIO = 0.15;

export interface WatermarkLayout {
  /** 워터마크 전체 박스 (배경 pill) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 1줄(핸들), 2줄(문구+주소) 글자 크기 */
  handleSize: number;
  ctaSize: number;
  logoSize: number;
}

/**
 * 워터마크 위치/크기 계산 (순수 함수 → 테스트 가능).
 * 화면 짧은 변 기준으로 크기를 정하고, 하단 안전 영역 경계 바로 위에 붙인다.
 * @param textWidth 2줄 중 긴 줄의 폭을 재는 함수 (캔버스 measureText). 테스트에선 근사치.
 */
export function watermarkLayout(
  width: number,
  height: number,
  textWidth: (text: string, size: number, bold: boolean) => number,
  brand: BrandConfig = BRAND,
): WatermarkLayout {
  const unit = Math.min(width, height);
  // 점수(카드 기준 360px)보다 훨씬 작지만 폰에서 또렷하게 읽히는 크기
  const handleSize = Math.round(unit * 0.036);
  const ctaSize = Math.round(unit * 0.027);
  const logoSize = Math.round(handleSize * 1.9);
  const padX = Math.round(unit * 0.03);
  const padY = Math.round(unit * 0.016);
  const gap = Math.round(unit * 0.018);
  const [line1, line2] = watermarkLines(brand);
  const textW = Math.max(textWidth(line1, handleSize, true), textWidth(line2, ctaSize, false));
  const w = Math.min(width * 0.9, padX * 2 + logoSize + gap + textW);
  const h = padY * 2 + Math.max(logoSize, handleSize * 1.25 + ctaSize * 1.3);
  const safeBottom = height * (1 - SAFE_MARGIN_RATIO);
  const margin = Math.round(unit * 0.012);
  return {
    x: Math.round((width - w) / 2),
    y: Math.round(safeBottom - margin - h),
    w: Math.round(w),
    h: Math.round(h),
    handleSize,
    ctaSize,
    logoSize,
  };
}

const FONT = '"Noto Sans KR", system-ui, sans-serif';

let logoImage: HTMLImageElement | null = null;

/** 이미지 로고가 설정돼 있으면 미리 로드 (그리기 전에 한 번 await) */
export function preloadBrandLogo(brand: BrandConfig = BRAND): Promise<void> {
  if (!brand.logo.src || logoImage) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      logoImage = img;
      resolve();
    };
    img.onerror = () => resolve();
    img.src = brand.logo.src!;
  });
}

function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, brand: BrandConfig) {
  if (logoImage) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, size * 0.26);
    ctx.clip();
    ctx.drawImage(logoImage, x, y, size, size);
    ctx.restore();
    return;
  }
  ctx.fillStyle = brand.logo.background;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, size * 0.26);
  ctx.fill();
  ctx.fillStyle = brand.logo.color;
  ctx.font = `${Math.round(size * 0.62)}px "Black Han Sans", ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(brand.logo.mark, x + size / 2, y + size * 0.54);
}

/** 캔버스 하단 안전 영역 위에 워터마크를 그린다 */
export function drawWatermark(ctx: CanvasRenderingContext2D, width: number, height: number, brand: BrandConfig = BRAND) {
  const measure = (text: string, size: number, bold: boolean) => {
    ctx.font = `${bold ? 900 : 700} ${size}px ${FONT}`;
    return ctx.measureText(text).width;
  };
  const L = watermarkLayout(width, height, measure, brand);
  const [line1, line2] = watermarkLines(brand);
  ctx.save();
  ctx.shadowBlur = 0;
  // 영상 위에서도 읽히도록 반투명 어두운 배경
  ctx.fillStyle = 'rgba(8, 8, 14, 0.55)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = Math.max(1, L.handleSize * 0.06);
  ctx.beginPath();
  ctx.roundRect(L.x, L.y, L.w, L.h, L.h / 2);
  ctx.fill();
  ctx.stroke();

  const padX = (L.h - L.logoSize) / 2;
  const logoX = L.x + padX;
  const logoY = L.y + (L.h - L.logoSize) / 2;
  drawLogo(ctx, logoX, logoY, L.logoSize, brand);

  const textX = logoX + L.logoSize + L.handleSize * 0.5;
  const textBlockH = L.handleSize * 1.25 + L.ctaSize * 1.3;
  const top = L.y + (L.h - textBlockH) / 2;
  const maxTextW = L.x + L.w - textX - padX;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.font = `900 ${L.handleSize}px ${FONT}`;
  ctx.fillText(line1, textX, top, maxTextW);
  ctx.fillStyle = 'rgba(214, 212, 232, 0.85)';
  ctx.font = `700 ${L.ctaSize}px ${FONT}`;
  ctx.fillText(line2, textX, top + L.handleSize * 1.25, maxTextW);
  ctx.restore();
}
