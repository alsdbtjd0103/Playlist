import {
  clampTrimRange,
  trimmedDuration,
  isPastTrimEnd,
  normalizeCuts,
  keepSegments,
  editedDuration,
  nextKeepStart,
  legacyTrimToCuts,
  getEffectiveCuts,
} from '../lib/trim';

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
  it('정확히 end 직전 위치는 멈추지 않는다(폴링 경계)', () => {
    expect(isPastTrimEnd(4.99, { start: 0, end: 5 })).toBe(false);
    expect(isPastTrimEnd(5.0, { start: 0, end: 5 })).toBe(true);
  });
});

describe('normalizeCuts', () => {
  it('빈 배열은 그대로', () => {
    expect(normalizeCuts([], 10)).toEqual([]);
  });
  it('정렬한다', () => {
    expect(normalizeCuts([{ start: 5, end: 6 }, { start: 1, end: 2 }], 10)).toEqual([
      { start: 1, end: 2 },
      { start: 5, end: 6 },
    ]);
  });
  it('중첩/인접 구간을 병합', () => {
    expect(normalizeCuts([{ start: 1, end: 3 }, { start: 2, end: 4 }], 10)).toEqual([
      { start: 1, end: 4 },
    ]);
  });
  it('경계를 [0,duration]으로 클램프', () => {
    expect(normalizeCuts([{ start: -2, end: 3 }, { start: 8, end: 20 }], 10)).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 10 },
    ]);
  });
  it('길이 0 이하 구간 제거', () => {
    expect(normalizeCuts([{ start: 4, end: 4 }, { start: 5, end: 4 }], 10)).toEqual([]);
  });
});

describe('keepSegments', () => {
  it('cut 없으면 전체가 남는다', () => {
    expect(keepSegments([], 10)).toEqual([{ start: 0, end: 10 }]);
  });
  it('중간 cut의 여집합', () => {
    expect(keepSegments([{ start: 2, end: 5 }], 10)).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 10 },
    ]);
  });
  it('여러 cut', () => {
    expect(keepSegments([{ start: 2, end: 3 }, { start: 6, end: 7 }], 10)).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 6 },
      { start: 7, end: 10 },
    ]);
  });
  it('맨 앞/맨 뒤 cut', () => {
    expect(keepSegments([{ start: 0, end: 2 }, { start: 8, end: 10 }], 10)).toEqual([
      { start: 2, end: 8 },
    ]);
  });
});

describe('editedDuration', () => {
  it('남는 길이 합', () => {
    expect(editedDuration([{ start: 2, end: 5 }], 10)).toBeCloseTo(7);
  });
  it('cut 없으면 duration', () => {
    expect(editedDuration([], 10)).toBeCloseTo(10);
  });
});

describe('nextKeepStart', () => {
  const cuts = [{ start: 2, end: 5 }];
  it('cut 안이면 cut 끝을 반환', () => {
    expect(nextKeepStart(3, cuts, 10)).toBeCloseTo(5);
  });
  it('cut 밖(남길 구간)이면 현재 위치', () => {
    expect(nextKeepStart(1, cuts, 10)).toBeCloseTo(1);
  });
  it('맨 끝 cut 안이면 null(정지)', () => {
    expect(nextKeepStart(9, [{ start: 8, end: 10 }], 10)).toBeNull();
  });
  it('duration 이후면 null', () => {
    expect(nextKeepStart(10, cuts, 10)).toBeNull();
  });
});

describe('legacyTrimToCuts', () => {
  it('trim {2,5} → 앞뒤 cut', () => {
    expect(legacyTrimToCuts({ start: 2, end: 5 }, 10)).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 10 },
    ]);
  });
  it('시작 0이면 앞 cut 없음', () => {
    expect(legacyTrimToCuts({ start: 0, end: 5 }, 10)).toEqual([{ start: 5, end: 10 }]);
  });
  it('undefined면 빈 배열', () => {
    expect(legacyTrimToCuts(undefined, 10)).toEqual([]);
  });
});

describe('getEffectiveCuts', () => {
  it('cuts가 있으면 정규화해서 우선', () => {
    expect(getEffectiveCuts({ cuts: [{ start: 6, end: 7 }, { start: 2, end: 3 }] }, 10)).toEqual([
      { start: 2, end: 3 },
      { start: 6, end: 7 },
    ]);
  });
  it('cuts 없고 레거시 trim이면 변환', () => {
    expect(getEffectiveCuts({ trim: { start: 2, end: 5 } }, 10)).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 10 },
    ]);
  });
  it('둘 다 없으면 빈 배열', () => {
    expect(getEffectiveCuts({}, 10)).toEqual([]);
  });
});
