/**
 * 브랜드 설정 — 워터마크, 결과 카드, 비교 영상, 헤더/푸터가 모두 여기만 본다.
 * 다른 브랜드용으로 바꿀 때는 이 파일만 수정하면 된다.
 */
export interface BrandConfig {
  /** 앱 이름 (헤더 로고 옆 텍스트) */
  appName: { prefix: string; accent: string };
  /** 크리에이터 핸들 (워터마크 1줄, 푸터) */
  handle: string;
  /** 핸들 클릭 시 이동할 프로필 링크 */
  profileUrl: string;
  /** 워터마크 2줄 앞부분 문구. 뒤에 사이트 주소가 붙는다 */
  ctaText: string;
  /** 챌린지 결과일 때 워터마크 2줄 문구. 뒤에 챌린지 주소가 붙는다 */
  challengeCtaText: string;
  /** 사이트 주소. 워터마크에는 https:// 없이 표시 */
  siteUrl: string;
  /** 웹 화면 하단 문구. {handle} 자리에 핸들이 들어간다 */
  footerText: string;
  logo: {
    /** 이미지 로고 경로 (public/ 기준, 예: '/logo.png'). 없으면 아래 글자 마크 사용 */
    src?: string;
    /** 글자 마크 */
    mark: string;
    background: string;
    color: string;
  };
  /** 포인트 색 */
  accent: string;
}

export const BRAND: BrandConfig = {
  appName: { prefix: 'dance', accent: 'score' },
  handle: '@gomgom_kim',
  profileUrl: 'https://www.instagram.com/gomgom_kim/',
  ctaText: '나도 채점받기',
  challengeCtaText: '나도 도전하기',
  siteUrl: 'https://dance-score.vercel.app',
  footerText: 'made by {handle}',
  logo: {
    mark: '8',
    background: '#ff3d81',
    color: '#ffffff',
  },
  accent: '#ff3d81',
};

/** "https://dance-score.vercel.app/" → "dance-score.vercel.app" */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

/** 챌린지 공유 주소 (https:// 포함) */
export function challengeLink(challengeId: string, brand: BrandConfig = BRAND): string {
  return `${brand.siteUrl.replace(/\/+$/, '')}/c/${challengeId}`;
}

/** 워터마크 두 줄. 챌린지 결과면 2줄이 "나도 도전하기 {챌린지 주소}" */
export function watermarkLines(brand: BrandConfig = BRAND, challengeId?: string): [string, string] {
  if (challengeId) return [brand.handle, `${brand.challengeCtaText} ${displayUrl(challengeLink(challengeId, brand))}`];
  return [brand.handle, `${brand.ctaText} ${displayUrl(brand.siteUrl)}`];
}

/** 푸터 문구를 핸들 앞/핸들/뒤로 나눔 (핸들만 링크로 만들기 위해) */
export function footerParts(brand: BrandConfig = BRAND): [string, string, string] {
  const [before, after = ''] = brand.footerText.split('{handle}');
  return [before, brand.handle, after];
}
