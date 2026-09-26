import { formatKey, clampKey, KEY_MIN, KEY_MAX } from '@/lib/keyLabel';

describe('formatKey', () => {
  it('미설정(undefined)이면 null을 반환한다', () => {
    expect(formatKey(undefined)).toBeNull();
  });

  it('0은 "원키"로 표기한다', () => {
    expect(formatKey(0)).toBe('원키');
  });

  it('양수는 +N키로 표기한다', () => {
    expect(formatKey(1)).toBe('+1키');
    expect(formatKey(4)).toBe('+4키');
  });

  it('음수는 부호를 포함해 -N키로 표기한다', () => {
    expect(formatKey(-1)).toBe('-1키');
    expect(formatKey(-3)).toBe('-3키');
  });

  it('NaN은 null을 반환한다', () => {
    expect(formatKey(NaN)).toBeNull();
  });
});

describe('clampKey', () => {
  it('범위 안의 값은 그대로 둔다', () => {
    expect(clampKey(0)).toBe(0);
    expect(clampKey(3)).toBe(3);
    expect(clampKey(-2)).toBe(-2);
  });

  it('범위를 벗어나면 경계로 클램프한다', () => {
    expect(clampKey(99)).toBe(KEY_MAX);
    expect(clampKey(-99)).toBe(KEY_MIN);
  });

  it('소수는 반올림한다', () => {
    expect(clampKey(2.4)).toBe(2);
    expect(clampKey(-1.6)).toBe(-2);
  });
});
