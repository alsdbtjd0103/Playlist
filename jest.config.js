/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // tsconfig의 "@/*": ["./*"] 경로 별칭을 Jest에서도 동일하게 해석
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // RN / Expo 패키지는 ESM이라 변환 대상에 포함시켜야 함
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@react-native-async-storage|@react-native-community|react-native-track-player|react-native-reanimated|react-native-gesture-handler|react-native-draggable-flatlist))',
  ],
  // 테스트 파일 위치: __tests__ 폴더 또는 *.test.ts(x)
  testMatch: ['**/__tests__/**/*.(test|spec).[jt]s?(x)', '**/*.(test|spec).[jt]s?(x)'],
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    '!**/node_modules/**',
  ],
};
