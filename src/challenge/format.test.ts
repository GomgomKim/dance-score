import { describe, expect, it } from 'vitest';
import { analyzeSequences } from '../pose/scoring';
import { syntheticSequence } from '../pose/synthetic';
import {
  buildChallengeFile,
  challengeUrl,
  decodePoses,
  encodePoses,
  isValidChallengeId,
  parseYouTubeId,
  slugify,
  toChallenge,
  validateChallengeFile,
} from './format';

const ref = syntheticSequence({ duration: 8, fps: 15, bpm: 120, dropRate: 0.05, seed: 4 });
const meta = {
  id: 'test-dance',
  title: '테스트 안무',
  youtubeId: 'dQw4w9WgXcQ',
  youtubeOffset: 1.5,
  bpm: 120,
  offset: 0,
  mirror: false,
};

describe('parseYouTubeId', () => {
  it.each([
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL123', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://example.com/watch?v=dQw4w9WgXcQ', null],
    ['https://www.youtube.com/watch?v=short', null],
    ['그냥 텍스트', null],
  ])('%s → %s', (input, id) => {
    expect(parseYouTubeId(input)).toBe(id);
  });
});

describe('챌린지 ID', () => {
  it('slugify', () => {
    expect(slugify('Super Shy 챌린지!')).toBe('super-shy');
    expect(slugify('  Hype  Boy  ')).toBe('hype-boy');
  });
  it('유효성', () => {
    expect(isValidChallengeId('super-shy')).toBe(true);
    expect(isValidChallengeId('Super')).toBe(false);
    expect(isValidChallengeId('../etc')).toBe(false);
    expect(isValidChallengeId('')).toBe(false);
  });
  it('공유 주소', () => {
    expect(challengeUrl('super-shy', 'https://dance-score.vercel.app/')).toBe('https://dance-score.vercel.app/c/super-shy');
  });
});

describe('포즈 인코딩', () => {
  it('왕복해도 좌표 오차 0.001 이하, 빈 프레임 유지', () => {
    const back = decodePoses(encodePoses(ref));
    expect(back.frames).toHaveLength(ref.frames.length);
    expect(back.fps).toBe(ref.fps);
    ref.frames.forEach((f, k) => {
      expect(back.frames[k].t).toBeCloseTo(f.t, 6);
      if (!f.pose) {
        expect(back.frames[k].pose).toBeNull();
        return;
      }
      f.pose.forEach((p, i) => {
        expect(Math.abs(back.frames[k].pose![i].x - p.x)).toBeLessThanOrEqual(0.0005);
        expect(Math.abs(back.frames[k].pose![i].y - p.y)).toBeLessThanOrEqual(0.0005);
      });
    });
  });

  it('인코딩된 포즈로 채점해도 원본과 같은 결과', () => {
    const back = decodePoses(encodePoses(ref));
    const a = analyzeSequences(ref, ref, { bpm: 120, offset: 0 });
    const b = analyzeSequences(back, ref, { bpm: 120, offset: 0 });
    expect(Math.abs(a.totalScore - b.totalScore)).toBeLessThan(0.5);
  });
});

describe('챌린지 파일', () => {
  const file = buildChallengeFile(meta, ref, new Date('2026-11-03T00:00:00Z'));

  it('JSON 직렬화 → 검증 → 디코딩', () => {
    const v = validateChallengeFile(JSON.parse(JSON.stringify(file)));
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const c = toChallenge(v.file);
    expect(c.title).toBe('테스트 안무');
    expect(c.youtubeOffset).toBe(1.5);
    expect(c.duration).toBeCloseTo(8, 3);
    expect(c.ref.frames).toHaveLength(ref.frames.length);
  });

  it('유튜브 없는 챌린지(스켈레톤 가이드)도 허용', () => {
    expect(validateChallengeFile({ ...file, youtubeId: null }).ok).toBe(true);
  });

  it.each([
    ['버전', { version: 99 }],
    ['ID', { id: 'Bad ID' }],
    ['제목', { title: ' ' }],
    ['유튜브 ID', { youtubeId: 'nope' }],
    ['BPM', { bpm: 0 }],
    ['오프셋', { offset: -1 }],
    ['포즈', { poses: { ...file.poses, data: [[1, 2, 3]] } }],
  ])('잘못된 %s는 거부', (_, patch) => {
    const v = validateChallengeFile({ ...file, ...patch });
    expect(v.ok).toBe(false);
  });
});
