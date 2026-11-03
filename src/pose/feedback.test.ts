import { describe, expect, it } from 'vitest';
import { josa, partComment } from './feedback';

const flat = { bendDeg: 0, drop: 0 };

describe('josa', () => {
  it('받침에 따라 조사', () => {
    expect(josa('왼팔', '이', '가')).toBe('왼팔이');
    expect(josa('왼다리', '이', '가')).toBe('왼다리가');
    expect(josa('상체', '을', '를')).toBe('상체를');
  });
});

describe('partComment', () => {
  it('타이밍', () => {
    expect(partComment('leftArm', 0.5, flat)).toBe('왼팔이 반 박자 늦어요');
    expect(partComment('rightLeg', -1, flat)).toBe('오른다리가 한 박자 빨라요');
    expect(partComment('rightArm', 0.25, flat)).toBe('오른팔이 살짝 늦어요');
  });
  it('모양', () => {
    expect(partComment('leftArm', 0, { bendDeg: 30, drop: 0 })).toBe('왼팔을 더 쭉 펴주세요');
    expect(partComment('leftLeg', 0, { bendDeg: -30, drop: 0 })).toBe('왼다리를 더 굽혀주세요');
    expect(partComment('rightArm', 0, { bendDeg: 0, drop: 0.5 })).toBe('오른팔을 더 높이 올려주세요');
    expect(partComment('torso', 0, flat)).toBe('상체 방향이 원본이랑 달라요');
  });
  it('몸 전체가 늦으면 전체적으로', () => {
    expect(partComment('leftArm', 0.5, flat, 80, 80, 0.55)).toBe('전체적으로 반 박자 늦어요');
    expect(partComment('leftArm', 0.5, flat, 80, 80, 0)).toBe('왼팔이 반 박자 늦어요');
  });
  it('부위 점수가 거의 만점이면 칭찬', () => {
    expect(partComment('leftArm', 0, flat, 99, 99)).toBe('원본이랑 거의 똑같아요! 완벽해요');
  });
  it('고득점이면 칭찬 먼저', () => {
    expect(partComment('leftArm', 0.5, flat, 95)).toBe('거의 완벽! 굳이 꼽자면 왼팔이 반 박자 늦어요');
  });
});
