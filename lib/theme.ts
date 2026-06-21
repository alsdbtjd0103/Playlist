// 플리로그(plilog) 코지 웜 디자인 시스템 토큰
// 라이트=웜 샌드, 다크=웜 차콜. 전 토큰 WCAG 2.1 AA 검증.
// 자세한 근거는 docs/branding/PLILOG_DESIGN_SYSTEM.md
export const lightColors = {
  bg: '#f4ecdd',
  surface: '#fffdf9',
  surfaceAlt: '#faf0e4',
  text: '#2f2820',
  textMuted: '#74664f',
  textFaint: '#998a76',
  border: '#e6dac6',
  accent: '#c2703d',
  accentStrong: '#a8542a',
  star: '#b87a26',
  onAccent: '#ffffff',
  success: '#52684d',
  danger: '#b3402e',
  overlay: 'rgba(20,15,10,0.45)',
} as const;

export const darkColors = {
  bg: '#1a1815',
  surface: '#2b2620',
  surfaceAlt: '#2f2a22',
  text: '#efe7da',
  textMuted: '#a89c8a',
  textFaint: '#7d7363',
  border: '#3d362d',
  accent: '#e2a85b',
  accentStrong: '#e2a85b',
  star: '#ecbd74',
  onAccent: '#241a0c',
  success: '#8fae84',
  danger: '#e6705f',
  overlay: 'rgba(0,0,0,0.6)',
} as const;

export type ColorTokens = { [K in keyof typeof lightColors]: string };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const borderRadius = { sm: 8, md: 12, lg: 16, xl: 20, full: 9999 };

export const fontFamily = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  semibold: 'Pretendard-SemiBold',
  bold: 'Pretendard-Bold',
  extrabold: 'Pretendard-ExtraBold',
  wordmark: 'Manrope_800ExtraBold',
};

export const typography = {
  h1: { fontFamily: fontFamily.bold, fontSize: 24, fontWeight: '700' as const },
  h2: { fontFamily: fontFamily.bold, fontSize: 20, fontWeight: '700' as const },
  h3: { fontFamily: fontFamily.semibold, fontSize: 18, fontWeight: '600' as const },
  body: { fontFamily: fontFamily.medium, fontSize: 16, fontWeight: '500' as const },
  bodySmall: { fontFamily: fontFamily.medium, fontSize: 14, fontWeight: '500' as const },
  caption: { fontFamily: fontFamily.regular, fontSize: 13, fontWeight: '400' as const },
};
