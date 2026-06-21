# 플리로그 디자인 시스템 앱 적용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 전체를 `docs/branding/PLILOG_DESIGN_SYSTEM.md`의 코지 웜 디자인 시스템(라이트=웜 샌드, 다크=웜 차콜)으로 교체하고, 시스템 추종 + 수동 토글 가능한 듀얼 테마와 Pretendard/Manrope 폰트를 적용한다.

**Architecture:** 색은 `lib/theme.ts`의 `lightColors`/`darkColors` 두 토큰 객체로 정의하고, `ThemeProvider`(React Context + `useColorScheme` + AsyncStorage override)가 현재 `colors`를 주입한다. 컴포넌트는 정적 `colors` import를 버리고 `useTheme()`로 색을 받아 `makeStyles(colors)` 패턴으로 스타일을 만든다. 폰트는 본문/UI에 Pretendard, `plilog` 워드마크에 Manrope를 쓴다.

**Tech Stack:** React Native 0.81 / Expo 54, TypeScript(strict), `@react-navigation`, `expo-font`, `@expo-google-fonts/manrope`, Pretendard 정적 ttf, AsyncStorage, Jest(jest-expo) + @testing-library/react-native v13.

## Global Constraints

- 이름: 앱 표시명 **플리로그**, 워드마크 `plilog`(소문자). 기존 "방구석 플레이리스트"/"Playlist" 문자열 전부 교체.
- 색 토큰(라이트): bg `#f4ecdd` · surface `#fffdf9` · surfaceAlt `#faf0e4` · text `#2f2820` · textMuted `#74664f` · textFaint `#998a76` · border `#e6dac6` · accent `#c2703d` · accentStrong `#a8542a` · star `#b87a26` · onAccent `#ffffff` · success `#52684d` · danger `#b3402e` · overlay `rgba(20,15,10,0.45)`.
- 색 토큰(다크): bg `#1a1815` · surface `#2b2620` · surfaceAlt `#2f2a22` · text `#efe7da` · textMuted `#a89c8a` · textFaint `#7d7363` · border `#3d362d` · accent `#e2a85b` · accentStrong `#e2a85b` · star `#ecbd74` · onAccent `#241a0c` · success `#8fae84` · danger `#e6705f` · overlay `rgba(0,0,0,0.6)`.
- `lightColors`/`darkColors`는 **동일한 키 집합**을 가져야 한다(타입 `ColorTokens` = `typeof lightColors`).
- 녹음(REC)·삭제·오류는 브랜드색이 아니라 시맨틱 `danger`를 쓴다. 별점 채움은 `star`. 솔리드 강조 버튼 채움은 `accentStrong`(라벨 `onAccent`).
- 컴포넌트는 HEX를 직접 쓰지 않는다. 반드시 `useTheme().colors` 토큰 참조.
- 폰트: 본문/UI = Pretendard(미로드 시 system 폴백), 워드마크 = Manrope. 혼용 정렬 리스크 때문에 한 `Text` 안 한/영 혼합은 Pretendard 단일로 처리.
- 검증 게이트(스타일 작업): `npm test` 그린 + `npx tsc --noEmit` 무에러. 각 작업 끝에 커밋.
- 작업 디렉터리: 저장소 루트 `/Users/ysyss/Desktop/Development/Playlist`.

---

## File Structure

- `lib/theme.ts` (Modify) — `lightColors`/`darkColors`/`ColorTokens` + 공유 `spacing`/`borderRadius`/`typography`(fontFamily 포함). 정적 `colors` export 제거.
- `contexts/ThemeContext.tsx` (Create) — `ThemeProvider`, `useTheme()`, 모드 영속화.
- `lib/fonts.ts` (Create) — 폰트 맵 + `useAppFonts()` 훅(useFonts 래핑).
- `components/Waveform.tsx` (Create) — 앰버 파형 로고/모티프(재사용).
- `components/ThemeToggle.tsx` (Create) — 시스템/라이트/다크 순환 토글 버튼.
- `components/ScreenHeader.tsx` (Modify) — `plilog` 워드마크 + 파형 + 토글, makeStyles.
- `App.tsx` (Modify) — Provider 래핑, 폰트 로드/스플래시, 네비/탭바/상태바 토큰화.
- `screens/HomeScreen.tsx`, `screens/SongDetailScreen.tsx`, `screens/PlaylistsScreen.tsx`, `screens/PlaylistDetailScreen.tsx` (Modify) — useTheme + makeStyles, 인라인 로고 → 컴포넌트, 빈 상태 카피.
- `components/AudioPlayer.tsx`, `components/MiniPlayer.tsx`, `components/NowPlayingScreen.tsx`, `components/RecorderModal.tsx` (Modify) — useTheme + makeStyles, 시맨틱 색.
- `app.json` (Modify) — 이름/ userInterfaceStyle automatic / 색.
- `scripts/generate-branding.js` (Modify) — 파형 + `plilog` 자산 생성. `assets/*` 재생성.
- `assets/fonts/` (Create) — Pretendard 정적 ttf.
- `__tests__/ThemeContext.test.tsx` (Create), `__tests__/ScreenHeader.test.tsx` (Modify), `jest.setup.js` (Modify) — 폰트/테마 목.

---

### Task 1: 색 토큰 재구성 (`lib/theme.ts`)

**Files:**
- Modify: `lib/theme.ts`
- Test: `__tests__/theme.test.ts` (Create)

**Interfaces:**
- Produces: `export const lightColors`, `export const darkColors`, `export type ColorTokens = typeof lightColors`, `export const spacing`, `export const borderRadius`, `export const fontFamily`, `export const typography`. `colors` 정적 export는 **제거**.

- [ ] **Step 1: 실패 테스트 작성** — `__tests__/theme.test.ts`

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- theme.test.ts`
Expected: FAIL (`lightColors` is not exported / undefined).

- [ ] **Step 3: `lib/theme.ts` 교체 구현**

```ts
// 플리로그 코지 웜 디자인 시스템 토큰
export const lightColors = {
  bg: '#f4ecdd', surface: '#fffdf9', surfaceAlt: '#faf0e4',
  text: '#2f2820', textMuted: '#74664f', textFaint: '#998a76',
  border: '#e6dac6',
  accent: '#c2703d', accentStrong: '#a8542a', star: '#b87a26',
  onAccent: '#ffffff', success: '#52684d', danger: '#b3402e',
  overlay: 'rgba(20,15,10,0.45)',
} as const;

export const darkColors = {
  bg: '#1a1815', surface: '#2b2620', surfaceAlt: '#2f2a22',
  text: '#efe7da', textMuted: '#a89c8a', textFaint: '#7d7363',
  border: '#3d362d',
  accent: '#e2a85b', accentStrong: '#e2a85b', star: '#ecbd74',
  onAccent: '#241a0c', success: '#8fae84', danger: '#e6705f',
  overlay: 'rgba(0,0,0,0.6)',
} as const;

export type ColorTokens = typeof lightColors;

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
```

> 주의: 기존 `colors`, `surfaceLight`, `primary`, `warning`, `record`, `success`, `error`, `ripple` 등을 참조하던 코드는 이후 Task들에서 토큰으로 치환된다. 이 Task 직후에는 `npx tsc --noEmit`가 다수 에러를 낼 수 있으나 정상(후속 Task에서 해소). 단 `theme.test.ts`는 통과해야 한다.

- [ ] **Step 4: 통과 확인**

Run: `npm test -- theme.test.ts`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add lib/theme.ts __tests__/theme.test.ts
git commit -m "feat(theme): 플리로그 코지 웜 라이트/다크 색 토큰 도입"
```

---

### Task 2: ThemeProvider + 영속화 (`contexts/ThemeContext.tsx`)

**Files:**
- Create: `contexts/ThemeContext.tsx`
- Modify: `jest.setup.js` (AsyncStorage 목이 없으면 추가 — 이미 있으면 생략)
- Test: `__tests__/ThemeContext.test.tsx`

**Interfaces:**
- Consumes: `lightColors`, `darkColors`, `ColorTokens` (Task 1).
- Produces:
  - `type ThemeMode = 'system' | 'light' | 'dark'`
  - `function ThemeProvider(props: { children: React.ReactNode }): JSX.Element`
  - `function useTheme(): { colors: ColorTokens; scheme: 'light' | 'dark'; mode: ThemeMode; setMode: (m: ThemeMode) => void; cycleMode: () => void }`
  - AsyncStorage 키 `@themeMode`에 모드 저장.

- [ ] **Step 1: 실패 테스트 작성** — `__tests__/ThemeContext.test.tsx`

```tsx
import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';

function Probe() {
  const { colors, mode, cycleMode } = useTheme();
  return (
    <>
      <Text testID="bg">{colors.bg}</Text>
      <Text testID="mode">{mode}</Text>
      <Pressable testID="cycle" onPress={cycleMode}><Text>x</Text></Pressable>
    </>
  );
}

describe('ThemeProvider', () => {
  it('기본 모드는 system 이고 색 토큰을 제공한다', async () => {
    const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>);
    await waitFor(() => expect(getByTestId('mode').props.children).toBe('system'));
    expect(['#f4ecdd', '#1a1815']).toContain(getByTestId('bg').props.children);
  });

  it('cycleMode 는 system→light→dark 로 순환한다', async () => {
    const { getByTestId } = render(<ThemeProvider><Probe /></ThemeProvider>);
    await waitFor(() => expect(getByTestId('mode').props.children).toBe('system'));
    fireEvent.press(getByTestId('cycle'));
    expect(getByTestId('mode').props.children).toBe('light');
    expect(getByTestId('bg').props.children).toBe('#f4ecdd');
    fireEvent.press(getByTestId('cycle'));
    expect(getByTestId('mode').props.children).toBe('dark');
    expect(getByTestId('bg').props.children).toBe('#1a1815');
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- ThemeContext.test.tsx`
Expected: FAIL (모듈 없음).

- [ ] **Step 3: 구현** — `contexts/ThemeContext.tsx`

```tsx
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, ColorTokens } from '../lib/theme';

export type ThemeMode = 'system' | 'light' | 'dark';
const STORAGE_KEY = '@themeMode';
const ORDER: ThemeMode[] = ['system', 'light', 'dark'];

interface ThemeContextValue {
  colors: ColorTokens;
  scheme: 'light' | 'dark';
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  cycleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') setModeState(saved);
      } catch (e) {
        console.error('테마 모드 로드 실패:', e);
      }
    })();
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch((e) => console.error('테마 모드 저장 실패:', e));
  }, []);

  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const next = ORDER[(ORDER.indexOf(prev) + 1) % ORDER.length];
      AsyncStorage.setItem(STORAGE_KEY, next).catch((e) => console.error('테마 모드 저장 실패:', e));
      return next;
    });
  }, []);

  const scheme: 'light' | 'dark' = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  const colors = scheme === 'dark' ? darkColors : lightColors;

  const value = useMemo(() => ({ colors, scheme, mode, setMode, cycleMode }), [colors, scheme, mode, setMode, cycleMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- ThemeContext.test.tsx`
Expected: PASS. (테스트 환경 `useColorScheme`는 기본 `light` 반환 → system 모드 bg `#f4ecdd`.)

- [ ] **Step 5: 커밋**

```bash
git add contexts/ThemeContext.tsx __tests__/ThemeContext.test.tsx
git commit -m "feat(theme): ThemeProvider + 모드 영속화(useTheme)"
```

---

### Task 3: 폰트 로딩 (`lib/fonts.ts` + assets)

**Files:**
- Create: `lib/fonts.ts`
- Create: `assets/fonts/Pretendard-{Regular,Medium,SemiBold,Bold,ExtraBold}.ttf`
- Modify: `package.json`(의존성), `jest.setup.js`(expo-font 목)
- Test: 없음(런타임 자원 — Task 4 통합에서 검증)

**Interfaces:**
- Produces: `export function useAppFonts(): boolean` (로드 완료 여부). 폰트 키: `Pretendard-Regular|Medium|SemiBold|Bold|ExtraBold`, `Manrope_800ExtraBold`(google 패키지 export).

- [ ] **Step 1: 의존성 설치**

```bash
npx expo install @expo-google-fonts/manrope
```

- [ ] **Step 2: Pretendard 정적 ttf 내려받기**

```bash
mkdir -p assets/fonts
base="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static"
for w in Regular Medium SemiBold Bold ExtraBold; do
  curl -fsSL "$base/Pretendard-$w.ttf" -o "assets/fonts/Pretendard-$w.ttf"
done
ls -la assets/fonts
```
Expected: 5개 ttf, 각 수백 KB~수 MB. (URL 실패 시 대체: `https://github.com/orioncactus/pretendard/releases` 에서 `Pretendard-*.ttf` 정적 파일 확보.)

- [ ] **Step 3: `lib/fonts.ts` 구현**

```ts
import { useFonts as useExpoFonts } from 'expo-font';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope';

export function useAppFonts(): boolean {
  const [loaded] = useExpoFonts({
    'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.ttf'),
    'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.ttf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.ttf'),
    'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.ttf'),
    'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.ttf'),
    Manrope_800ExtraBold,
  });
  return loaded;
}
```

- [ ] **Step 4: jest 에서 expo-font 목 추가** — `jest.setup.js` 에 다음이 없으면 추가

```js
jest.mock('expo-font', () => ({
  useFonts: () => [true],
  isLoaded: () => true,
  loadAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@expo-google-fonts/manrope', () => ({ Manrope_800ExtraBold: 'Manrope_800ExtraBold' }));
```

- [ ] **Step 5: 타입체크 + 기존 테스트 그린 확인**

Run: `npx tsc --noEmit && npm test`
Expected: 타입에러 없음(이 시점 다른 파일 에러가 남아있으면 Task 4~11에서 해소되므로, 최소한 `lib/fonts.ts` 자체 에러는 없어야 함), 기존 테스트 그린.

- [ ] **Step 6: 커밋**

```bash
git add lib/fonts.ts assets/fonts package.json package-lock.json jest.setup.js
git commit -m "feat(fonts): Pretendard + Manrope 임베드 및 useAppFonts"
```

---

### Task 4: App.tsx — Provider/폰트/네비/탭바/상태바 토큰화

**Files:**
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `ThemeProvider`/`useTheme` (Task 2), `useAppFonts` (Task 3).
- Produces: 앱 루트가 테마 토큰으로 렌더되고, 탭바 활성색 = `accent`(다크)/`accentStrong`(라이트), 스플래시는 폰트 로드까지 유지.

- [ ] **Step 1: 구현 변경**

다음을 적용한다(요지 — 정확 코드):

1. 상단 import 추가: `import * as SplashScreen from 'expo-splash-screen';`, `import { ThemeProvider, useTheme } from './contexts/ThemeContext';`, `import { useAppFonts } from './lib/fonts';`. (`expo-splash-screen` 미설치 시 `npx expo install expo-splash-screen`.)
2. 하드코딩 `#0f0f0f`/`#1f1f1f`/`#ffffff`/`#717171` 전부 제거하고, 내부 컴포넌트를 `useTheme()` 기반으로. 구조상 `App`을 `ThemeProvider`로 감싸고, 실제 UI는 `AppInner`(Provider 내부)로 분리해 `useTheme()` 사용.

```tsx
SplashScreen.preventAutoHideAsync().catch(() => {});

function AppInner() {
  const { colors, scheme } = useTheme();
  const fontsLoaded = useAppFonts();
  const navigationRef = useNavigationContainerRef();
  // ...기존 backPressed 로직 유지...

  const navTheme = {
    ...(scheme === 'dark' ? NavDarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? NavDarkTheme : DefaultTheme).colors,
      background: colors.bg, card: colors.bg, text: colors.text, border: colors.border, primary: colors.accent,
    },
  };

  const onLayout = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }} onLayout={onLayout}>
      <SafeAreaProvider>
        <PlayerProvider>
          <NavigationContainer ref={navigationRef} theme={navTheme}>
            {/* Tab.Navigator/Stacks 의 contentStyle/sceneContainerStyle backgroundColor 를 colors.bg 로 */}
            {/* CustomTabBar 는 colors 를 prop 또는 useTheme 로 받아 색 적용 */}
            ...
          </NavigationContainer>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        </PlayerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
```

3. `import { NavigationContainer, DefaultTheme, DarkTheme as NavDarkTheme, useNavigationContainerRef } from '@react-navigation/native';` 로 변경(기존 커스텀 `DarkTheme` 객체 제거).
4. `CustomTabBar` 내부에서 `const { colors } = useTheme();` 사용, `tabBarStyles`를 `makeStyles(colors)`로(아래 makeStyles 레시피). 활성 아이콘/라벨 색 = `colors.accent`(다크일 때) / `colors.accentStrong`(라이트일 때) — 간단히 `scheme==='dark'?colors.accent:colors.accentStrong`. 비활성 = `colors.textMuted`.
5. Stack `screenOptions.contentStyle.backgroundColor` = `colors.bg`, `Tab.Navigator` `sceneContainerStyle.backgroundColor` = `colors.bg`.

**makeStyles 레시피(이후 모든 컴포넌트 공통):**
```tsx
import { useMemo } from 'react';
const styles = useMemo(() => makeStyles(colors), [colors]);
// 파일 하단:
const makeStyles = (c: ColorTokens) => StyleSheet.create({ /* c.bg, c.surface ... 사용 */ });
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: `App.tsx` 관련 에러 없음(미전환 화면 에러는 후속 Task에서 해소).

- [ ] **Step 3: 부팅 스모크**

Run: `npm start` 후 시뮬레이터에서 로드, 또는 `npx expo export --platform ios --output-dir /tmp/plilog-export` 로 번들 에러 없는지 확인.
Expected: 번들 성공, 흰/검 하드코딩 없는 따뜻한 배경.

- [ ] **Step 4: 커밋**

```bash
git add App.tsx package.json package-lock.json
git commit -m "feat(app): ThemeProvider/폰트 게이트/네비·탭바 토큰화"
```

---

### Task 5: Waveform + ThemeToggle + ScreenHeader

**Files:**
- Create: `components/Waveform.tsx`, `components/ThemeToggle.tsx`
- Modify: `components/ScreenHeader.tsx`
- Test: `__tests__/ScreenHeader.test.tsx` (Modify)

**Interfaces:**
- Consumes: `useTheme` (Task 2).
- Produces:
  - `Waveform(props: { color?: string; size?: number; bars?: number[] }): JSX.Element` — 둥근 막대 행.
  - `ThemeToggle(): JSX.Element` — 누르면 `cycleMode()`. 아이콘: system=`contrast`, light=`sunny`, dark=`moon` (Ionicons), 색 `colors.text`.
  - `ScreenHeader` 는 좌측 `Waveform`+`plilog` 워드마크, 우측 `[ThemeToggle][+추가]`. 기존 props(`onAddPress`, `showAddButton`) 유지.

- [ ] **Step 1: 실패 테스트 갱신** — `__tests__/ScreenHeader.test.tsx`

기존 테스트를 `ThemeProvider`로 감싸고 문구를 `plilog`로 바꾼다.

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../contexts/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('ScreenHeader', () => {
  it('plilog 워드마크를 렌더한다', () => {
    const { getByText } = wrap(<ScreenHeader showAddButton={false} />);
    expect(getByText('plilog')).toBeTruthy();
  });
  it('추가 버튼 onPress 가 호출된다', () => {
    const onAdd = jest.fn();
    const { getByTestId } = wrap(<ScreenHeader onAddPress={onAdd} />);
    fireEvent.press(getByTestId('add-song-button'));
    expect(onAdd).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- ScreenHeader.test.tsx`
Expected: FAIL (`plilog` 미존재 / Provider 외 useTheme 에러).

- [ ] **Step 3: 구현**

`components/Waveform.tsx`:
```tsx
import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

const DEFAULT = [8, 15, 22, 13, 18, 7];
export default function Waveform({ color, size = 20, bars = DEFAULT }: { color?: string; size?: number; bars?: number[] }) {
  const { colors } = useTheme();
  const c = color ?? colors.accent;
  const scale = size / 22;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2.5 * scale, height: size }}>
      {bars.map((h, i) => (
        <View key={i} style={{ width: 3 * scale, height: h * scale, borderRadius: 3, backgroundColor: c }} />
      ))}
    </View>
  );
}
```

`components/ThemeToggle.tsx`:
```tsx
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

const ICON = { system: 'contrast-outline', light: 'sunny-outline', dark: 'moon-outline' } as const;
export default function ThemeToggle() {
  const { colors, mode, cycleMode } = useTheme();
  return (
    <TouchableOpacity onPress={cycleMode} accessibilityLabel="테마 전환" hitSlop={8}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={ICON[mode]} size={22} color={colors.text} />
    </TouchableOpacity>
  );
}
```

`components/ScreenHeader.tsx` (전체 교체):
```tsx
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, fontFamily } from '../lib/theme';
import Waveform from './Waveform';
import ThemeToggle from './ThemeToggle';

interface Props { onAddPress?: () => void; showAddButton?: boolean }

export default function ScreenHeader({ onAddPress, showAddButton = true }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const wordColor = scheme === 'dark' ? colors.accent : colors.accentStrong;
  return (
    <View style={styles.header}>
      <View style={styles.logo}>
        <Waveform size={20} />
        <Text style={[styles.logoText, { color: wordColor }]}>plilog</Text>
      </View>
      <View style={styles.right}>
        <ThemeToggle />
        {showAddButton && onAddPress ? (
          <TouchableOpacity style={styles.iconButton} onPress={onAddPress} testID="add-song-button" accessibilityLabel="곡 추가">
            <Ionicons name="add" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>
    </View>
  );
}

const makeStyles = (c: ColorTokens) => StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, height: 56, minHeight: 56 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 40 },
  logoText: { fontFamily: fontFamily.wordmark, fontSize: 20, letterSpacing: -0.8, lineHeight: 24 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconButton: { width: 40, height: 40, borderRadius: borderRadius.full, justifyContent: 'center', alignItems: 'center' },
});
```

- [ ] **Step 4: 통과 확인**

Run: `npm test -- ScreenHeader.test.tsx`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add components/Waveform.tsx components/ThemeToggle.tsx components/ScreenHeader.tsx __tests__/ScreenHeader.test.tsx
git commit -m "feat(ui): plilog 워드마크/파형 로고 + 테마 토글 헤더"
```

---

### Task 6: HomeScreen 토큰화 + 빈 상태

**Files:**
- Modify: `screens/HomeScreen.tsx`

**Interfaces:**
- Consumes: `useTheme`. 기존 `colors.*` 정적 참조를 `useTheme().colors`로 전환.

- [ ] **Step 1: 구현 변경**

1. `import { colors, spacing, borderRadius, typography } from "../lib/theme";` → `import { ColorTokens, spacing, borderRadius, typography } from "../lib/theme"; import { useTheme } from "../contexts/ThemeContext";`
2. `SongItem`과 `HomeScreen` 두 컴포넌트에서 각각 `const { colors } = useTheme(); const styles = useMemo(() => makeStyles(colors), [colors]);`. `SongItem`은 별도 컴포넌트이므로 그 안에서도 `useTheme()` 호출.
3. 파일 하단 `const styles = StyleSheet.create({...})` → `const makeStyles = (c: ColorTokens) => StyleSheet.create({...})` 로 바꾸고 모든 `colors.x` → `c.x`.
4. 색 매핑 교정:
   - 곡 카드 썸네일 음표 아이콘: `colors.accent`.
   - 별점 아이콘 `colors.warning`(삭제됨) → `colors.star`.
   - 빈 상태/추가 버튼 배경 `colors.primary`(삭제됨) → `colors.accentStrong`, 그 위 아이콘 `colors.onAccent`.
   - 곡 추가 모달 확인 버튼 배경 `colors.primary` → `colors.accentStrong`, 텍스트 `colors.onAccent`.
   - 삭제 메뉴/아이콘 `colors.error`(삭제됨) → `colors.danger`.
   - 로딩 인디케이터 `colors.primary` → `colors.accent`.
   - `surfaceLight`(삭제됨) 참조 → `colors.surfaceAlt` 또는 `colors.surface`.
5. 빈 상태 카피 따뜻하게: 타이틀 "아직 녹음한 곡이 없어요", 서브 "첫 곡을 추가하고 오늘의 목소리를 기록해볼까요?". (느낌표/이모지 금지.) 빈 상태 아이콘 자리에 `<Waveform size={34} />` 사용 가능(`import Waveform from "../components/Waveform";`).

- [ ] **Step 2: 타입체크 + 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: `HomeScreen.tsx` 에러 없음, 테스트 그린.

- [ ] **Step 3: 커밋**

```bash
git add screens/HomeScreen.tsx
git commit -m "feat(home): 디자인 토큰 적용 + 따뜻한 빈 상태"
```

---

### Task 7: SongDetailScreen 토큰화

**Files:**
- Modify: `screens/SongDetailScreen.tsx`

- [ ] **Step 1: 구현 변경**

1. `useTheme` 도입 + `makeStyles(colors)` 패턴(Task 6과 동일 레시피).
2. 인라인 로고(`<Ionicons name="musical-notes" .../><Text>Playlist</Text>`)를 `<Waveform size={20} /><Text style={styles.logoText}>plilog</Text>`로 교체, 워드마크 색 = `scheme==='dark'?colors.accent:colors.accentStrong`, `fontFamily.wordmark`.
3. 별점 `colors.warning` → `colors.star`. 재생/대표버전 강조 버튼 배경 → `colors.accentStrong`, 아이콘/텍스트 → `colors.onAccent`. 삭제/오류 → `colors.danger`. `surfaceLight`/`primary` 잔여 참조 → 토큰 치환.

- [ ] **Step 2: 타입체크 + 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 해당 파일 에러 없음, 테스트 그린.

- [ ] **Step 3: 커밋**

```bash
git add screens/SongDetailScreen.tsx
git commit -m "feat(song-detail): 디자인 토큰 적용 + plilog 헤더"
```

---

### Task 8: PlaylistsScreen 토큰화

**Files:**
- Modify: `screens/PlaylistsScreen.tsx`

- [ ] **Step 1: 구현 변경** — Task 6 레시피로 `useTheme`+`makeStyles`. 별점→`star`, 강조 버튼→`accentStrong`/`onAccent`, 오류/삭제→`danger`, 로딩→`accent`. 빈 상태 카피 따뜻하게("플레이리스트가 비어 있어요" 등).

- [ ] **Step 2: 타입체크 + 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 없음, 그린.

- [ ] **Step 3: 커밋**

```bash
git add screens/PlaylistsScreen.tsx
git commit -m "feat(playlists): 디자인 토큰 적용"
```

---

### Task 9: PlaylistDetailScreen 토큰화

**Files:**
- Modify: `screens/PlaylistDetailScreen.tsx`

- [ ] **Step 1: 구현 변경** — `useTheme`+`makeStyles`. 인라인 로고 → `Waveform`+`plilog`. 별점→`star`, 재생 버튼(`<Ionicons name="play" color={colors.background}>`의 `background`)→`colors.onAccent` + 버튼 배경 `accentStrong`. 드래그 활성/선택 상태 색 토큰화. 오류/삭제→`danger`.

- [ ] **Step 2: 타입체크 + 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 없음, 그린.

- [ ] **Step 3: 커밋**

```bash
git add screens/PlaylistDetailScreen.tsx
git commit -m "feat(playlist-detail): 디자인 토큰 적용 + plilog 헤더"
```

---

### Task 10: 플레이어 3종 토큰화 (AudioPlayer / MiniPlayer / NowPlayingScreen)

**Files:**
- Modify: `components/AudioPlayer.tsx`, `components/MiniPlayer.tsx`, `components/NowPlayingScreen.tsx`

- [ ] **Step 1: AudioPlayer.tsx** — `useTheme`+`makeStyles`. 하드코딩 치환:
   - Slider `minimumTrackTintColor="#fff"`→`colors.accent`, `maximumTrackTintColor="#888"`→`colors.border`, `thumbTintColor="#fff"`→`colors.accent`.
   - 재생 버튼 배경 `#ffffff`→`colors.accentStrong`, 아이콘 `#000`→`colors.onAccent`.
   - 컨트롤 아이콘 `#e5e5e5`/`#fff`/`#666`→ 활성 `colors.accent`, 일반 `colors.text`, 비활성 `colors.textMuted`.
   - 시간 텍스트 `#e5e5e5`→`colors.textMuted`. `repeatOneText` `#fff`→`colors.accent`.

- [ ] **Step 2: MiniPlayer.tsx** — `colors.surface`→`surfaceAlt`(미니플레이어 면), 재생 아이콘 `textPrimary`(삭제) → `colors.accent`, 닫기 `textSecondary`(삭제)→`colors.textMuted`, 썸네일 음표 → `colors.accent`. `typography`/`spacing` 유지.

- [ ] **Step 3: NowPlayingScreen.tsx** — 하드코딩(`#0a0a0a`,`#1a1a1a`,`#404040`,`#b3b3b3`,`#808080`,`#e5e5e5`,`#ffffff`) 전부 토큰화: 배경 `colors.bg`, 앨범아트 면 `colors.surface`, 핸들/보더 `colors.border`, 제목 `colors.text`, 아티스트/보조 `colors.textMuted`, 별점 아이콘 `#fbbf24`→`colors.star`, 메모 박스 `colors.surfaceAlt`. 헤더 chevron `colors.text`.

- [ ] **Step 4: 타입체크 + 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 없음, 그린.

- [ ] **Step 5: 커밋**

```bash
git add components/AudioPlayer.tsx components/MiniPlayer.tsx components/NowPlayingScreen.tsx
git commit -m "feat(player): 미니/풀 플레이어·오디오 컨트롤 토큰화"
```

---

### Task 11: RecorderModal 토큰화 + 시맨틱 색

**Files:**
- Modify: `components/RecorderModal.tsx`

- [ ] **Step 1: 구현 변경** — `useTheme`+`makeStyles`. 색 매핑:
   - 녹음 시작 버튼 배경 `colors.record`(삭제)→`colors.danger`, 그 위 마이크 아이콘 `colors.background`→`#fff`(danger 위 흰색, 대비 검증됨).
   - REC 점/텍스트 `colors.error`(삭제)→`colors.danger`. 정지 버튼 배경 `colors.error`→`colors.danger`.
   - 완료 체크 `colors.success`(유지 토큰 존재) 그대로. 별점 `colors.warning`→`colors.star`.
   - 저장(confirm) 버튼 배경 `colors.primary`→`colors.accentStrong`, 텍스트/스피너 `colors.background`→`colors.onAccent`.
   - 권한 거부 아이콘/배경 `colors.error`→`colors.danger`, 설정 버튼 배경 `colors.primary`→`colors.accentStrong`, 텍스트 `colors.onAccent`.
   - 취소/닫기 버튼 배경 `surfaceLight`→`colors.surfaceAlt`. 일시정지 버튼 보더 `colors.border`.

- [ ] **Step 2: 타입체크 + 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 에러 없음, 그린.

- [ ] **Step 3: 커밋**

```bash
git add components/RecorderModal.tsx
git commit -m "feat(recorder): 디자인 토큰 + 시맨틱(danger/accentStrong) 적용"
```

---

### Task 12: app.json + 브랜딩 자산 재생성

**Files:**
- Modify: `app.json`, `scripts/generate-branding.js`
- Regenerate: `assets/icon.png`, `assets/adaptive-icon.png`, `assets/splash.png`, `assets/favicon.png`

- [ ] **Step 1: app.json**
   - `expo.name`: `"방구석 플레이리스트"` → `"플리로그"`.
   - `expo.userInterfaceStyle`: `"dark"` → `"automatic"`.
   - `backgroundColor`/splash/adaptiveIcon backgroundColor: 라이트 기준 `#f4ecdd`로 통일(스플래시는 라이트 베이스). (다크 사용자도 스플래시는 1회성이라 무방.)
   - 마이크 권한 문구의 "녹음 기능" 유지(문제 없음). `ios.infoPlist`/`android.permissions` 그대로.

- [ ] **Step 2: `scripts/generate-branding.js` 교체** — 흰 마이크 SVG/"방구석 플레이리스트" 텍스트를 제거하고:
   - 배경 `#f4ecdd`(라이트), 중앙에 **앰버 파형**(막대 5~7개, 색 `#c2703d`) + 그 아래 `plilog` 워드마크(`#a8542a`).
   - `icon.png`(1024), `adaptive-icon.png`(1024, 안전영역 66%), `splash.png`(1242×2436, 중앙 파형+`plilog`), `favicon.png`(48) 생성. 파형은 둥근 사각(rx) 막대 `rect`로 그린다.
   - 파일 상단 주석의 "방구석 플레이리스트" → "플리로그(plilog)".

- [ ] **Step 3: 자산 생성 실행**

```bash
node scripts/generate-branding.js
ls -la assets/*.png
```
Expected: 4개 PNG 재생성, 따뜻한 크림 배경 + 앰버 파형 + plilog.

- [ ] **Step 4: 커밋**

```bash
git add app.json scripts/generate-branding.js assets/icon.png assets/adaptive-icon.png assets/splash.png assets/favicon.png
git commit -m "feat(branding): 플리로그 이름/automatic 테마 + 파형 아이콘·스플래시 재생성"
```

---

### Task 13: 전체 검증 + 잔여 하드코딩 스윕

**Files:**
- 점검 대상 전체

- [ ] **Step 1: 잔여 하드코딩/구토큰 스윕**

```bash
grep -rnoE "#[0-9a-fA-F]{3,6}" screens components App.tsx | grep -v node_modules
grep -rnE "colors\.(primary|warning|error|record|surfaceLight|surfaceLighter|textPrimary|textSecondary|textTertiary|primaryDark|ripple)\b" screens components App.tsx
grep -rnE "방구석|Playlist[\"'<]" screens components App.tsx app.json
```
Expected: 의미 있는 하드코딩 HEX 없음(파형 등 의도적 제외), 삭제된 구 토큰 참조 0건, "방구석"/"Playlist" 0건.

- [ ] **Step 2: 타입 + 단위/컴포넌트 테스트**

Run: `npx tsc --noEmit && npm test`
Expected: 타입 에러 0, 전체 테스트 그린.

- [ ] **Step 3: 번들/부팅 스모크 + 수동 확인**

Run: `npm start` (또는 `npm run ios`).
수동 확인 체크:
- 라이트/다크 토글(헤더 토글 버튼) 동작, 재시작 후 모드 유지(AsyncStorage).
- 폰 시스템 테마 변경 시 'system' 모드에서 추종.
- 곡 목록/상세/플레이리스트/녹음/미니·풀 플레이어 색이 토큰과 일치, 가독성 양호.
- `plilog` 워드마크·파형 로고 노출, 아이콘/스플래시 신규 반영.

- [ ] **Step 4: 최종 커밋**

```bash
git add -A
git commit -m "chore(design-system): 잔여 하드코딩 정리 및 전체 검증"
```

---

## Self-Review

- **Spec coverage:** 색(1·6~11)·접근성 보정값(1, Global Constraints)·타이포(1·3)·로고/파형(5·12)·모션은 기존 컴포넌트 유지+토큰 적용(10)·듀얼테마 아키텍처(2·4)·빈 상태(6·8)·녹음/별점/플레이어(10·11)·이름/자산(12) → 스펙 항목 모두 매핑됨. (질감/노이즈는 스펙상 "선택"이라 작업 제외 — 명시적 비범위.)
- **Placeholder scan:** 각 Task에 정확 파일·치환 규칙·코드·검증 명령 기재. 화면 리팩터는 전체 재인용 대신 정확한 토큰 치환 목록으로 명세(파일 300~600줄 재현은 오히려 오류 유발).
- **Type consistency:** `ColorTokens`/`lightColors`/`darkColors`(T1), `useTheme`/`ThemeMode`(T2), `useAppFonts`(T3), `makeStyles(c: ColorTokens)` 패턴, `fontFamily.wordmark`(T1·T5) 명칭 일관. 삭제 토큰(`primary/warning/error/record/surfaceLight`) 참조는 T6~T11에서 일괄 치환하고 T13에서 스윕 검증.
- **빈 상태 일러스트:** 스펙대로 "필수 아님" — `Waveform` 재사용으로 가볍게 처리(선택).
