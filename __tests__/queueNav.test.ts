import { wrapIndex, planQueueSync } from '../lib/queueNav';

describe('wrapIndex', () => {
  it('마지막 곡에서 다음 → 첫 곡', () => { expect(wrapIndex(4, 1, 5)).toBe(0); });
  it('첫 곡에서 이전 → 마지막 곡', () => { expect(wrapIndex(0, -1, 5)).toBe(4); });
  it('중간에서는 한 칸 이동', () => {
    expect(wrapIndex(2, 1, 5)).toBe(3);
    expect(wrapIndex(2, -1, 5)).toBe(1);
  });
  it('곡이 1개면 제자리', () => {
    expect(wrapIndex(0, 1, 1)).toBe(0);
    expect(wrapIndex(0, -1, 1)).toBe(0);
  });
  it('빈 큐는 -1', () => { expect(wrapIndex(0, 1, 0)).toBe(-1); });
});

describe('planQueueSync', () => {
  it('현재 곡이 새 순서에 있으면 그 앞/뒤로 나눈다', () => {
    expect(planQueueSync(['a', 'b', 'c', 'd'], 'c')).toEqual({
      before: ['a', 'b'],
      after: ['d'],
      currentIndex: 2,
      currentInTarget: true,
    });
  });
  it('현재 곡이 첫 곡이면 before가 비어 있다', () => {
    expect(planQueueSync(['c', 'a'], 'c')).toEqual({
      before: [], after: ['a'], currentIndex: 0, currentInTarget: true,
    });
  });
  it('현재 곡이 새 목록에서 빠졌으면 현재 곡을 맨 앞에 두고 전체를 뒤에 붙인다', () => {
    expect(planQueueSync(['a', 'b'], 'z')).toEqual({
      before: [], after: ['a', 'b'], currentIndex: 0, currentInTarget: false,
    });
  });
});
