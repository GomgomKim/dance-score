/**
 * 챌린지 JSON 포맷 (public/challenges/<id>.json).
 * 원본 영상은 사이트에 올리지 않고, 관리자 페이지에서 로컬로 뽑은 포즈 데이터 + 박자 정보 +
 * 유튜브 영상 ID만 저장한다. 챌린지 페이지는 원본을 유튜브 임베드로 재생하고 이 포즈로 채점.
 */
import { challengeLink } from '../config/brand';
import { LANDMARK_COUNT } from '../pose/landmarks';
import type { Pose, PoseSequence } from '../pose/types';

export const CHALLENGE_VERSION = 1;

/** 좌표/신뢰도를 정수로 저장할 때의 배율 (0.001 단위, 화면 1080px 기준 1px 오차) */
const SCALE = 1000;
/** 랜드마크 하나당 저장 값: x, y, visibility */
const STRIDE = 3;

export interface ChallengeFile {
  version: number;
  id: string;
  title: string;
  artist?: string;
  description?: string;
  /** 유튜브 영상 ID. null이면 유튜브 없이 스켈레톤 가이드로 재생 (샘플/테스트용) */
  youtubeId: string | null;
  /** 유튜브 시간 = 원본(포즈) 시간 + youtubeOffset. 유튜브 버전에 인트로가 더 있으면 + */
  youtubeOffset: number;
  bpm: number;
  /** 첫 카운트 위치 (원본 기준 초) */
  offset: number;
  /** 원본이 거울 모드라 반전해서 분석했는지 (포즈는 이미 반전된 상태로 저장됨) */
  mirror: boolean;
  /** 원본 길이(초) */
  duration: number;
  createdAt: string;
  poses: {
    fps: number;
    aspect: number;
    /** 첫 프레임 시간(초) */
    start: number;
    /** 프레임별 [x, y, visibility] × 33 정수 배열. 포즈 없으면 null */
    data: (number[] | null)[];
  };
}

export interface Challenge extends Omit<ChallengeFile, 'poses'> {
  /** 디코딩된 원본 포즈 시퀀스 */
  ref: PoseSequence;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidChallengeId(id: string): boolean {
  return ID_RE.test(id);
}

/** 제목 → 챌린지 ID 후보 ("Super Shy 챌린지!" → "super-shy") */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/**
 * 유튜브 URL/ID에서 영상 ID 추출.
 * watch?v=, youtu.be/, shorts/, embed/, live/, m.youtube.com, 그냥 ID 모두 지원.
 */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let url: URL;
  try {
    url = new URL(s.includes('://') ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/);
      id = m?.[1] ?? null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** PoseSequence → 저장용 compact 포맷 */
export function encodePoses(seq: PoseSequence): ChallengeFile['poses'] {
  return {
    fps: seq.fps,
    aspect: Math.round(seq.aspect * 10000) / 10000,
    start: seq.frames.length ? Math.round(seq.frames[0].t * 1000) / 1000 : 0,
    data: seq.frames.map((f) => {
      if (!f.pose) return null;
      const out = new Array<number>(LANDMARK_COUNT * STRIDE);
      for (let i = 0; i < LANDMARK_COUNT; i++) {
        const p = f.pose[i];
        out[i * STRIDE] = Math.round(p.x * SCALE);
        out[i * STRIDE + 1] = Math.round(p.y * SCALE);
        out[i * STRIDE + 2] = Math.round((p.visibility ?? 1) * SCALE);
      }
      return out;
    }),
  };
}

/** compact 포맷 → PoseSequence */
export function decodePoses(p: ChallengeFile['poses']): PoseSequence {
  return {
    fps: p.fps,
    aspect: p.aspect,
    frames: p.data.map((row, k) => {
      const t = Math.round((p.start + k / p.fps) * 1e6) / 1e6;
      if (!row) return { t, pose: null };
      const pose: Pose = [];
      for (let i = 0; i < LANDMARK_COUNT; i++) {
        pose.push({
          x: row[i * STRIDE] / SCALE,
          y: row[i * STRIDE + 1] / SCALE,
          visibility: row[i * STRIDE + 2] / SCALE,
        });
      }
      return { t, pose };
    }),
  };
}

export interface ChallengeMeta {
  id: string;
  title: string;
  artist?: string;
  description?: string;
  youtubeId: string | null;
  youtubeOffset: number;
  bpm: number;
  offset: number;
  mirror: boolean;
}

export function buildChallengeFile(meta: ChallengeMeta, ref: PoseSequence, createdAt = new Date()): ChallengeFile {
  const last = ref.frames[ref.frames.length - 1];
  return {
    version: CHALLENGE_VERSION,
    ...meta,
    duration: last ? Math.round((last.t + 1 / ref.fps) * 1000) / 1000 : 0,
    createdAt: createdAt.toISOString(),
    poses: encodePoses(ref),
  };
}

/** JSON 검증. 문제가 있으면 사람이 읽을 수 있는 에러 메시지 */
export function validateChallengeFile(raw: unknown): { ok: true; file: ChallengeFile } | { ok: false; error: string } {
  const f = raw as Partial<ChallengeFile> | null;
  if (!f || typeof f !== 'object') return { ok: false, error: 'JSON 객체가 아니에요' };
  if (f.version !== CHALLENGE_VERSION) return { ok: false, error: `지원하지 않는 버전: ${String(f.version)}` };
  if (typeof f.id !== 'string' || !isValidChallengeId(f.id)) return { ok: false, error: '챌린지 ID가 잘못됐어요' };
  if (typeof f.title !== 'string' || !f.title.trim()) return { ok: false, error: '제목이 없어요' };
  if (f.youtubeId !== null && (typeof f.youtubeId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(f.youtubeId))) {
    return { ok: false, error: '유튜브 영상 ID가 잘못됐어요' };
  }
  if (typeof f.bpm !== 'number' || !(f.bpm > 0)) return { ok: false, error: 'BPM이 잘못됐어요' };
  if (typeof f.offset !== 'number' || f.offset < 0) return { ok: false, error: '시작 오프셋이 잘못됐어요' };
  if (typeof f.youtubeOffset !== 'number') return { ok: false, error: '유튜브 오프셋이 없어요' };
  const p = f.poses;
  if (!p || typeof p.fps !== 'number' || !(p.fps > 0) || !Array.isArray(p.data)) {
    return { ok: false, error: '포즈 데이터가 없어요' };
  }
  const bad = p.data.findIndex((row) => row !== null && (!Array.isArray(row) || row.length !== LANDMARK_COUNT * STRIDE));
  if (bad >= 0) return { ok: false, error: `${bad}번째 프레임 포즈 데이터가 잘못됐어요` };
  return { ok: true, file: f as ChallengeFile };
}

export function toChallenge(file: ChallengeFile): Challenge {
  const { poses, ...rest } = file;
  return { ...rest, ref: decodePoses(poses) };
}

export function challengePath(id: string): string {
  return `/c/${id}`;
}

/** 공유용 챌린지 주소 (https:// 포함) */
export function challengeUrl(id: string, siteUrl?: string): string {
  return siteUrl ? `${siteUrl.replace(/\/+$/, '')}${challengePath(id)}` : challengeLink(id);
}

export async function fetchChallenge(id: string, base = ''): Promise<Challenge> {
  if (!isValidChallengeId(id)) throw new Error('챌린지 주소가 잘못됐어요');
  const res = await fetch(`${base}/challenges/${id}.json`);
  if (!res.ok) throw new Error(res.status === 404 ? '없는 챌린지예요' : `챌린지를 불러오지 못했어요 (${res.status})`);
  // SPA 서버는 없는 파일에도 index.html을 200으로 돌려줄 수 있음
  if (!(res.headers.get('content-type') ?? '').includes('json')) throw new Error('없는 챌린지예요');
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new Error('챌린지 파일을 읽지 못했어요');
  }
  const v = validateChallengeFile(raw);
  if (!v.ok) throw new Error(`챌린지 파일 오류: ${v.error}`);
  return toChallenge(v.file);
}
