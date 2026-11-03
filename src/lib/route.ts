/** 라우터 라이브러리 없이 경로만 해석 (Vercel rewrites로 모든 경로가 index.html) */
export type Route = { name: 'home' } | { name: 'challenge'; id: string } | { name: 'admin' };

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  const m = path.match(/^\/c\/([^/]+)$/);
  if (m) return { name: 'challenge', id: decodeURIComponent(m[1]) };
  if (path === '/admin') return { name: 'admin' };
  return { name: 'home' };
}
