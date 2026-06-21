import { lightColors, darkColors } from '../lib/theme';

describe('theme tokens', () => {
  it('light/dark 키 집합이 동일하다', () => {
    expect(Object.keys(lightColors).sort()).toEqual(Object.keys(darkColors).sort());
  });
  it('확정 핵심 값이 일치한다', () => {
    expect(lightColors.bg).toBe('#f4ecdd');
    expect(lightColors.accentStrong).toBe('#a8542a');
    expect(darkColors.bg).toBe('#1a1815');
    expect(darkColors.accent).toBe('#e2a85b');
    expect(darkColors.onAccent).toBe('#241a0c');
  });
});
