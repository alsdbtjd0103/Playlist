import { clampTrimRange, trimmedDuration, isPastTrimEnd } from '../lib/trim';

describe('clampTrimRange', () => {
  it('범위를 0..duration으로 클램프', () => {
    expect(clampTrimRange({ start: -5, end: 100 }, 30)).toEqual({ start: 0, end: 30 });
  });
  it('start>=end면 최소 길이(minLen)를 보장', () => {
    const r = clampTrimRange({ start: 10, end: 10 }, 30, 0.5);
    expect(r.end - r.start).toBeCloseTo(0.5, 5);
  });
});
describe('trimmedDuration', () => {
  it('end-start', () => { expect(trimmedDuration({ start: 2, end: 7 })).toBe(5); });
});
describe('isPastTrimEnd', () => {
  it('trim 없으면 false', () => { expect(isPastTrimEnd(100, undefined)).toBe(false); });
  it('position >= end면 true', () => {
    expect(isPastTrimEnd(5, { start: 1, end: 5 })).toBe(true);
    expect(isPastTrimEnd(4.9, { start: 1, end: 5 })).toBe(false);
  });
});
