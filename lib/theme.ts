// YouTube Music 스타일 테마
export const colors = {
  // 배경색
  background: '#0f0f0f',
  surface: '#1f1f1f',
  surfaceLight: '#282828',
  surfaceLighter: '#3d3d3d',

  // 텍스트
  textPrimary: '#ffffff',
  textSecondary: '#aaaaaa',
  textTertiary: '#717171',

  // 액센트 컬러
  primary: '#ffffff',
  primaryDark: '#e0e0e0',

  // 녹음 버튼 전용
  record: '#ff0000',

  // 상태 컬러
  success: '#2ecc71',
  warning: '#fbbf24',
  error: '#ef4444',

  // 기타
  border: '#3d3d3d',
  overlay: 'rgba(0,0,0,0.7)',
  ripple: 'rgba(255,255,255,0.1)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const typography = {
  h1: {
    fontSize: 28,
    fontWeight: 'bold' as const,
  },
  h2: {
    fontSize: 24,
    fontWeight: 'bold' as const,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 16,
    fontWeight: 'normal' as const,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: 'normal' as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: 'normal' as const,
  },
};
