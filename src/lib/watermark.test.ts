import { describe, expect, it } from 'vitest';
import { BRAND, displayUrl, footerParts, watermarkLines } from '../config/brand';
import { SAFE_MARGIN_RATIO, watermarkLayout } from './watermark';

// 글자 폭 근사: 한 글자 ≈ 글자 크기 * 0.6
const approx = (text: string, size: number) => text.length * size * 0.6;

describe('brand config', () => {
  it('워터마크 문구', () => {
    expect(watermarkLines()).toEqual(['@gomgom_kim', '나도 채점받기 dance-score.vercel.app']);
  });
  it('주소 표시는 프로토콜/끝 슬래시 제거', () => {
    expect(displayUrl('https://example.com/')).toBe('example.com');
    expect(displayUrl('http://a.b/c')).toBe('a.b/c');
  });
  it('푸터 문구', () => {
    expect(footerParts()).toEqual(['made by ', '@gomgom_kim', '']);
  });
  it('챌린지 결과면 "나도 도전하기 {챌린지 주소}"', () => {
    expect(watermarkLines(BRAND, 'super-shy')).toEqual(['@gomgom_kim', '나도 도전하기 dance-score.vercel.app/c/super-shy']);
  });
  it('챌린지 워터마크도 안전 영역 안', () => {
    const L = watermarkLayout(1080, 1920, approx, BRAND, 'a-very-long-challenge-name-for-testing');
    expect(L.y + L.h).toBeLessThanOrEqual(1920 * (1 - SAFE_MARGIN_RATIO));
    expect(L.x).toBeGreaterThanOrEqual(0);
    expect(L.x + L.w).toBeLessThanOrEqual(1080);
  });
  it('다른 브랜드로 바꿔 끼우기', () => {
    const other = { ...BRAND, handle: '@other', ctaText: 'Try it', siteUrl: 'https://other.app' };
    expect(watermarkLines(other)).toEqual(['@other', 'Try it other.app']);
  });
});

describe('watermarkLayout', () => {
  it.each([
    ['9:16 결과 카드/릴스 영상', 1080, 1920],
    ['16:9 가로 영상', 1920, 1080],
  ])('%s: 위아래 15%% 안전 영역 안, 하단 쪽', (_, w, h) => {
    const L = watermarkLayout(w, h, approx);
    expect(L.y + L.h).toBeLessThanOrEqual(h * (1 - SAFE_MARGIN_RATIO));
    expect(L.y).toBeGreaterThanOrEqual(h * SAFE_MARGIN_RATIO);
    // 하단 쪽: 화면 아래 1/3 안에서 시작
    expect(L.y).toBeGreaterThan(h * 0.6);
    // 가로 가운데 정렬, 화면 밖으로 안 나감
    expect(L.x).toBeGreaterThanOrEqual(0);
    expect(L.x + L.w).toBeLessThanOrEqual(w);
    expect(Math.abs(L.x + L.w / 2 - w / 2)).toBeLessThanOrEqual(1);
  });

  it('점수보다 작지만 폰에서 읽히는 크기 (1080 기준)', () => {
    const L = watermarkLayout(1080, 1920, approx);
    // 결과 카드 점수는 360px. 워터마크는 그 1/8 이하
    expect(L.handleSize).toBeLessThanOrEqual(360 / 8);
    // 1080px 영상에서 최소 28px 이상 (폰 화면에서 약 10pt 이상)
    expect(L.ctaSize).toBeGreaterThanOrEqual(28);
    expect(L.handleSize).toBeGreaterThan(L.ctaSize);
  });
});
