# 녹음 트리밍 (1단계: 가상 트림) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 보관함 녹음을 파일을 자르지 않고 "남길 구간"만 메타데이터로 저장(가상 트림)하고, 풀스크린 에디터에서 실제 파형 위 핸들로 구간을 고르고 그 구간만 미리듣기한 뒤 저장한다. 전역 재생도 trim 구간을 존중한다.

**Architecture:** 트림 결정 로직은 순수 함수(`lib/trim.ts`)와 파형 정규화(`lib/waveform.ts`)로 분리해 단위 테스트한다. 파형은 녹음 시 expo-audio 미터링을 샘플링해 `Version.waveform`에 저장한다. 에디터는 전용 `expo-audio` 플레이어로 구간만 재생하고, 저장은 새 버전/덮어쓰기를 지원한다. 전역 재생은 `PlayerContext`에서 trim을 적용한다.

**Tech Stack:** React Native + Expo, TypeScript strict, expo-audio(useAudioPlayer/recorder metering), react-native-track-player, Jest + RNTL v13.

## Global Constraints

- 함수형 컴포넌트만, async/await, `StyleSheet`(Tailwind 금지), 모든 비동기 try-catch. (CLAUDE.md)
- `lib/theme`의 `colors/spacing/borderRadius/typography` 사용.
- 외부 모듈(expo-audio, react-native-track-player, AsyncStorage, @expo/vector-icons)은 테스트에서 목 처리.
- 새 Version 필드(`waveform`,`trim`,`editedFrom`)는 모두 선택 — 기존 데이터 호환.
- 파형 캡처가 불가능한(기존) 녹음은 평탄 폴백 바로 처리하고 기능은 정상 동작해야 함.
- E2E로 잡을 요소엔 `testID` 부여(`trim-save-button` 등).

---

### Task 1: Version 데이터 모델 + DB 함수 확장

**Files:**
- Modify: `types/index.ts` (Version)
- Modify: `lib/database.ts` (addVersion, updateVersion, 신규 함수)
- Test: `__tests__/database.test.ts` (케이스 추가)

**Interfaces:**
- Produces:
  - `Version`에 `waveform?: number[]`, `trim?: { start: number; end: number }`, `editedFrom?: string`
  - `addVersion(songId, fileName, storageUrl, rating, duration?, memo?, extra?: { waveform?: number[]; trim?: TrimRange; editedFrom?: string }): Promise<string>`
  - `applyTrimToVersion(versionId: string, range: TrimRange): Promise<void>` — 원본 덮어쓰기(해당 버전에 trim 설정)
  - `createTrimmedVersion(sourceVersionId: string, range: TrimRange): Promise<string>` — 같은 파일을 가리키는 새 버전 생성(trim+editedFrom)
  - `TrimRange = { start: number; end: number }` (lib/trim.ts에서 export, 여기선 인라인 타입 사용)

- [ ] **Step 1: 실패하는 테스트 추가** — `__tests__/database.test.ts`

```typescript
import {
  addSong, addVersion, getVersion, getVersionsBySong,
  applyTrimToVersion, createTrimmedVersion,
} from '../lib/database';

describe('Version trim/waveform', () => {
  it('addVersion extra로 waveform/trim/editedFrom 저장', async () => {
    const songId = await addSong('곡');
    const vid = await addVersion(songId, 'f.m4a', 'file:///f.m4a', 4, 12, '메모', {
      waveform: [0.1, 0.5, 0.9], trim: { start: 1, end: 5 }, editedFrom: 'orig',
    });
    const v = await getVersion(vid);
    expect(v?.waveform).toEqual([0.1, 0.5, 0.9]);
    expect(v?.trim).toEqual({ start: 1, end: 5 });
    expect(v?.editedFrom).toBe('orig');
  });

  it('applyTrimToVersion은 기존 버전에 trim만 설정(덮어쓰기)', async () => {
    const songId = await addSong('곡');
    const vid = await addVersion(songId, 'f.m4a', 'file:///f.m4a', 3);
    await applyTrimToVersion(vid, { start: 2, end: 8 });
    const v = await getVersion(vid);
    expect(v?.trim).toEqual({ start: 2, end: 8 });
    expect(v?.storageUrl).toBe('file:///f.m4a'); // 파일 그대로
  });

  it('createTrimmedVersion은 같은 파일을 가리키는 새 버전을 만든다(원본 보존)', async () => {
    const songId = await addSong('곡');
    const src = await addVersion(songId, 'f.m4a', 'file:///f.m4a', 5, 30, '원본', { waveform: [0.2, 0.4] });
    const newId = await createTrimmedVersion(src, { start: 3, end: 10 });
    expect(newId).not.toBe(src);
    const nv = await getVersion(newId);
    const ov = await getVersion(src);
    expect(ov?.trim).toBeUndefined();             // 원본 보존
    expect(nv?.storageUrl).toBe('file:///f.m4a');  // 같은 파일
    expect(nv?.trim).toEqual({ start: 3, end: 10 });
    expect(nv?.editedFrom).toBe(src);
    expect(nv?.rating).toBe(5);                    // 원본 rating 승계
    expect(nv?.waveform).toEqual([0.2, 0.4]);      // 파형 승계
    const list = await getVersionsBySong(songId);
    expect(list).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- database` · Expected: FAIL (함수 없음/타입 에러)

- [ ] **Step 3: 타입 추가** — `types/index.ts` Version

```typescript
export interface Version {
  id: string;
  songId: string;
  fileName: string;
  storageUrl: string;
  rating: number;
  duration?: number;
  recordedAt: Date;
  memo?: string;
  waveform?: number[];
  trim?: { start: number; end: number };
  editedFrom?: string;
}
```

- [ ] **Step 4: addVersion 확장 + 신규 함수** — `lib/database.ts`

`addVersion`에 `extra` 매개변수 추가:

```typescript
export const addVersion = async (
  songId: string,
  fileName: string,
  storageUrl: string,
  rating: number,
  duration?: number,
  memo?: string,
  extra?: { waveform?: number[]; trim?: { start: number; end: number }; editedFrom?: string }
): Promise<string> => {
  const now = new Date();
  const versionId = generateId();

  const newVersion: Version = {
    id: versionId,
    songId,
    fileName,
    storageUrl,
    rating,
    duration: duration || undefined,
    recordedAt: now,
    memo: memo || undefined,
    waveform: extra?.waveform,
    trim: extra?.trim,
    editedFrom: extra?.editedFrom,
  };

  const versions = await getAllVersions();
  versions.push(newVersion);
  await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(versions));

  const songs = await getAllSongs();
  const songIndex = songs.findIndex((s) => s.id === songId);
  if (songIndex !== -1) {
    songs[songIndex].updatedAt = now;
    await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs));
  }

  return versionId;
};
```

같은 파일 하단에 추가:

```typescript
export const applyTrimToVersion = async (
  versionId: string,
  range: { start: number; end: number }
): Promise<void> => {
  const versions = await getAllVersions();
  const idx = versions.findIndex((v) => v.id === versionId);
  if (idx !== -1) {
    versions[idx].trim = range;
    await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(versions));
  }
};

export const createTrimmedVersion = async (
  sourceVersionId: string,
  range: { start: number; end: number }
): Promise<string> => {
  const source = await getVersion(sourceVersionId);
  if (!source) throw new Error('원본 버전을 찾을 수 없습니다.');
  return addVersion(
    source.songId,
    source.fileName,
    source.storageUrl,
    source.rating,
    range.end - range.start,
    source.memo,
    { waveform: source.waveform, trim: range, editedFrom: source.id }
  );
};
```

- [ ] **Step 5: getAllVersions가 새 필드를 보존하는지 확인** — `getAllVersions`의 map은 `...version` 스프레드이므로 `waveform/trim/editedFrom` 자동 보존(추가 작업 불필요).

- [ ] **Step 6: 통과 확인** — Run: `npm test -- database` · Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add types/index.ts lib/database.ts __tests__/database.test.ts
git commit -m "feat: Version trim/waveform 필드 + 가상 트림 DB 함수"
```

---

### Task 2: 순수 유틸 — 파형 정규화 + 트림 구간 계산

**Files:**
- Create: `lib/waveform.ts`
- Create: `lib/trim.ts`
- Test: `__tests__/waveform.test.ts`, `__tests__/trim.test.ts`

**Interfaces:**
- Produces:
  - `normalizeWaveform(samplesDb: number[], buckets?: number): number[]` (출력 0~1, 길이 buckets, 빈 입력→[])
  - `TrimRange = { start: number; end: number }`
  - `clampTrimRange(range: TrimRange, duration: number, minLen?: number): TrimRange`
  - `trimmedDuration(range: TrimRange): number`
  - `isPastTrimEnd(positionSec: number, trim?: TrimRange): boolean`

- [ ] **Step 1: 실패하는 테스트** — `__tests__/waveform.test.ts`

```typescript
import { normalizeWaveform } from '../lib/waveform';

describe('normalizeWaveform', () => {
  it('빈 입력은 빈 배열', () => {
    expect(normalizeWaveform([])).toEqual([]);
  });
  it('-60dB 이하는 0, 0dB는 1로 정규화', () => {
    const out = normalizeWaveform([-60, -60, 0, 0], 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(1, 5);
  });
  it('지정한 buckets 수로 다운샘플링', () => {
    const out = normalizeWaveform([-30, -30, -30, -30, -30, -30], 3);
    expect(out).toHaveLength(3);
    out.forEach((v) => { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); });
  });
});
```

- [ ] **Step 2: 실패하는 테스트** — `__tests__/trim.test.ts`

```typescript
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
```

- [ ] **Step 3: 실패 확인** — Run: `npm test -- waveform trim` · Expected: FAIL (모듈 없음)

- [ ] **Step 4: 구현** — `lib/waveform.ts`

```typescript
const DB_FLOOR = -60;

function dbToLevel(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const clamped = Math.max(DB_FLOOR, Math.min(0, db));
  return (clamped - DB_FLOOR) / -DB_FLOOR; // -60→0, 0→1
}

export function normalizeWaveform(samplesDb: number[], buckets = 80): number[] {
  if (!samplesDb || samplesDb.length === 0) return [];
  const levels = samplesDb.map(dbToLevel);
  if (levels.length <= buckets) return levels;
  const out: number[] = [];
  const size = levels.length / buckets;
  for (let i = 0; i < buckets; i++) {
    const startIdx = Math.floor(i * size);
    const endIdx = Math.floor((i + 1) * size);
    let sum = 0, n = 0;
    for (let j = startIdx; j < endIdx; j++) { sum += levels[j]; n++; }
    out.push(n > 0 ? sum / n : 0);
  }
  return out;
}
```

- [ ] **Step 5: 구현** — `lib/trim.ts`

```typescript
export interface TrimRange { start: number; end: number }

export function clampTrimRange(range: TrimRange, duration: number, minLen = 0.5): TrimRange {
  const max = Math.max(duration, minLen);
  let start = Math.max(0, Math.min(range.start, max));
  let end = Math.max(0, Math.min(range.end, max));
  if (end - start < minLen) {
    end = Math.min(max, start + minLen);
    start = Math.max(0, end - minLen);
  }
  return { start, end };
}

export function trimmedDuration(range: TrimRange): number {
  return range.end - range.start;
}

export function isPastTrimEnd(positionSec: number, trim?: TrimRange): boolean {
  if (!trim) return false;
  return positionSec >= trim.end;
}
```

- [ ] **Step 6: 통과 확인** — Run: `npm test -- waveform trim` · Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add lib/waveform.ts lib/trim.ts __tests__/waveform.test.ts __tests__/trim.test.ts
git commit -m "feat: 파형 정규화/트림 구간 순수 유틸 + 테스트"
```

---

### Task 3: 녹음 시 파형 캡처 → Version.waveform 저장

**Files:**
- Modify: `hooks/useRecording.ts`
- Modify: `components/RecorderModal.tsx` (onSave 시그니처)
- Modify: `screens/SongDetailScreen.tsx:227-236` (handleSaveRecording → addVersion extra)
- Test: `__tests__/useRecording.metering.test.tsx`

**Interfaces:**
- Consumes: `normalizeWaveform` (lib/waveform)
- Produces:
  - `UseRecordingReturn`에 `waveform: number[]` 추가(stop 후 정규화된 파형)
  - `RecorderModal` onSave: `(audioUri: string, rating: number, memo: string | undefined, waveform: number[]) => Promise<void>`

- [ ] **Step 1: 실패하는 테스트** — `__tests__/useRecording.metering.test.tsx` (자체 expo-audio 목)

```typescript
import { renderHook, act } from '@testing-library/react-native';

let recState: any = { canRecord: true, isRecording: false, durationMillis: 0, metering: undefined };
const listeners = new Set<() => void>();
const mockRecorder = {
  uri: 'file:///rec.m4a',
  prepareToRecordAsync: jest.fn(async () => {}),
  record: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(async () => {}),
};

jest.mock('expo-audio', () => {
  const React = require('react');
  return {
    RecordingPresets: { HIGH_QUALITY: {} },
    AudioModule: { requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })) },
    setAudioModeAsync: jest.fn(async () => {}),
    useAudioRecorder: () => mockRecorder,
    useAudioRecorderState: () => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const l = () => force((n: number) => n + 1);
        listeners.add(l);
        return () => { listeners.delete(l); };
      }, []);
      return recState;
    },
    __set: (p: any) => { recState = { ...recState, ...p }; listeners.forEach((l) => l()); },
  };
});

import { useRecording } from '../hooks/useRecording';
const ExpoAudio = require('expo-audio');

it('녹음 중 미터링 샘플을 모아 stop 후 정규화된 waveform을 제공', async () => {
  const { result } = renderHook(() => useRecording());
  await act(async () => { await result.current.startRecording(); });
  // 미터링 폴링 흉내
  act(() => { ExpoAudio.__set({ isRecording: true, metering: -60 }); });
  act(() => { ExpoAudio.__set({ metering: 0 }); });
  act(() => { ExpoAudio.__set({ metering: -30 }); });
  await act(async () => { await result.current.stopRecording(); });
  expect(result.current.waveform.length).toBeGreaterThan(0);
  result.current.waveform.forEach((v) => {
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- useRecording.metering` · Expected: FAIL (`waveform` 없음)

- [ ] **Step 3: useRecording 수정** — `hooks/useRecording.ts`

미터링 활성화 + 100ms 폴링 + 샘플 수집 + 정규화 파형 노출:

```typescript
import { normalizeWaveform } from '../lib/waveform';
// ...
const audioRecorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
const recorderState = useAudioRecorderState(audioRecorder, 100);

const meteringSamplesRef = useRef<number[]>([]);
const [waveform, setWaveform] = useState<number[]>([]);

// 녹음 중 미터링 샘플 수집
useEffect(() => {
  if (phase === 'recording' && typeof recorderState.metering === 'number') {
    meteringSamplesRef.current.push(recorderState.metering);
  }
}, [recorderState.metering, phase]);
```

`startRecording` 시작부에 샘플 초기화: `meteringSamplesRef.current = []; setWaveform([]);`
`stopRecording` 성공 후: `setWaveform(normalizeWaveform(meteringSamplesRef.current));`
`resetRecording`에: `meteringSamplesRef.current = []; setWaveform([]);`
반환 객체와 `UseRecordingReturn`에 `waveform` 추가. (`useRef` import 추가)

- [ ] **Step 4: 통과 확인** — Run: `npm test -- useRecording.metering` · Expected: PASS. 기존 `npm test -- useRecording`(일시정지/재개)도 PASS 유지 확인.

- [ ] **Step 5: RecorderModal onSave에 waveform 전달** — `components/RecorderModal.tsx`

`useRecording()` 구조분해에 `waveform` 추가. `RecorderModalProps.onSave` 시그니처를
`(audioUri: string, rating: number, memo?: string, waveform?: number[]) => Promise<void>`로 변경.
`handleSave`에서 `await onSave(audioUri, rating, memo.trim() || undefined, waveform);`

- [ ] **Step 6: SongDetail에서 addVersion에 waveform 저장** — `screens/SongDetailScreen.tsx`

```tsx
const handleSaveRecording = async (audioUri: string, rating: number, memo?: string, waveform?: number[]) => {
  try {
    const { fileName, localUri } = await saveAudioLocally(songId, audioUri);
    await addVersion(songId, fileName, localUri, rating, undefined, memo, { waveform });
    await fetchSong();
  } catch (error) {
    console.error('녹음 저장 실패:', error);
    throw error;
  }
};
```

- [ ] **Step 7: 타입체크/테스트**

Run: `npx tsc --noEmit && npm test` · Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add hooks/useRecording.ts components/RecorderModal.tsx screens/SongDetailScreen.tsx __tests__/useRecording.metering.test.tsx
git commit -m "feat: 녹음 시 미터링 파형 캡처 → Version.waveform 저장"
```

---

### Task 4: 파형+핸들 컴포넌트 (`components/WaveformView.tsx`)

**Files:**
- Create: `components/WaveformView.tsx`
- Test: `__tests__/WaveformView.test.tsx`

**Interfaces:**
- Produces: `function WaveformView(props: { samples: number[]; duration: number; range: TrimRange; playhead?: number; onChangeRange: (r: TrimRange) => void; width?: number; height?: number }): JSX.Element`
  - `samples` 비었으면 평탄 폴백 바(균일 높이) 렌더.
  - 시작/끝 핸들을 `PanResponder`로 드래그 → 초 단위 위치로 변환해 `onChangeRange` 호출(`clampTrimRange` 적용).
  - 선택 구간은 강조, 바깥은 흐리게. `playhead`(초) 위치 선 표시.

- [ ] **Step 1: 실패하는 테스트** — `__tests__/WaveformView.test.tsx`

```typescript
import React from 'react';
import { render } from '@testing-library/react-native';
import { WaveformView } from '../components/WaveformView';

describe('WaveformView', () => {
  it('samples가 있으면 막대들을 렌더한다', () => {
    const { getByTestId } = render(
      <WaveformView samples={[0.2, 0.8, 0.5]} duration={10} range={{ start: 0, end: 10 }} onChangeRange={jest.fn()} width={300} />
    );
    expect(getByTestId('waveform-bars')).toBeTruthy();
    expect(getByTestId('trim-handle-start')).toBeTruthy();
    expect(getByTestId('trim-handle-end')).toBeTruthy();
  });

  it('samples가 비면 평탄 폴백 바를 렌더한다', () => {
    const { getByTestId } = render(
      <WaveformView samples={[]} duration={10} range={{ start: 0, end: 10 }} onChangeRange={jest.fn()} width={300} />
    );
    expect(getByTestId('waveform-fallback')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- WaveformView` · Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `components/WaveformView.tsx`

```tsx
import React, { useRef } from 'react';
import { View, StyleSheet, PanResponder, LayoutChangeEvent } from 'react-native';
import { TrimRange, clampTrimRange } from '../lib/trim';
import { colors, borderRadius } from '../lib/theme';

interface Props {
  samples: number[];
  duration: number;
  range: TrimRange;
  playhead?: number;
  onChangeRange: (r: TrimRange) => void;
  width?: number;
  height?: number;
}

const HANDLE_W = 14;

export function WaveformView({ samples, duration, range, playhead, onChangeRange, width = 320, height = 120 }: Props) {
  const widthRef = useRef(width);
  const onLayout = (e: LayoutChangeEvent) => { widthRef.current = e.nativeEvent.layout.width; };

  const secToX = (sec: number) => (duration > 0 ? (sec / duration) * widthRef.current : 0);
  const xToSec = (x: number) => (widthRef.current > 0 ? (x / widthRef.current) * duration : 0);

  const makeResponder = (which: 'start' | 'end') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt, gesture) => {
        const x = which === 'start' ? secToX(range.start) + gesture.dx : secToX(range.end) + gesture.dx;
        const sec = xToSec(Math.max(0, Math.min(widthRef.current, x)));
        const next = which === 'start' ? { ...range, start: sec } : { ...range, end: sec };
        onChangeRange(clampTrimRange(next, duration));
      },
    });

  const startResponder = useRef(makeResponder('start')).current;
  const endResponder = useRef(makeResponder('end')).current;

  const bars = samples.length > 0 ? samples : null;
  const startX = secToX(range.start);
  const endX = secToX(range.end);

  return (
    <View style={[styles.container, { width, height }]} onLayout={onLayout}>
      {bars ? (
        <View testID="waveform-bars" style={styles.bars}>
          {bars.map((v, i) => {
            const sec = duration * (i / bars.length);
            const inRange = sec >= range.start && sec <= range.end;
            return (
              <View
                key={i}
                style={{
                  flex: 1,
                  marginHorizontal: 0.5,
                  height: Math.max(2, v * (height - 8)),
                  backgroundColor: inRange ? colors.primary : colors.border,
                  borderRadius: 1,
                }}
              />
            );
          })}
        </View>
      ) : (
        <View testID="waveform-fallback" style={styles.bars}>
          {Array.from({ length: 60 }).map((_, i) => {
            const sec = duration * (i / 60);
            const inRange = sec >= range.start && sec <= range.end;
            return (
              <View key={i} style={{ flex: 1, marginHorizontal: 0.5, height: (height - 8) * 0.4, backgroundColor: inRange ? colors.primary : colors.border, borderRadius: 1 }} />
            );
          })}
        </View>
      )}

      {/* 선택 구간 바깥 음영 */}
      <View pointerEvents="none" style={[styles.dim, { left: 0, width: startX }]} />
      <View pointerEvents="none" style={[styles.dim, { left: endX, right: 0 }]} />

      {/* playhead */}
      {typeof playhead === 'number' && (
        <View pointerEvents="none" style={[styles.playhead, { left: secToX(playhead) }]} />
      )}

      {/* 핸들 */}
      <View testID="trim-handle-start" {...startResponder.panHandlers} style={[styles.handle, { left: Math.max(0, startX - HANDLE_W / 2) }]} />
      <View testID="trim-handle-end" {...endResponder.panHandlers} style={[styles.handle, { left: Math.max(0, endX - HANDLE_W / 2) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, overflow: 'hidden' },
  bars: { flexDirection: 'row', alignItems: 'center', height: '100%', paddingHorizontal: 4 },
  dim: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.warning },
  handle: { position: 'absolute', top: 0, bottom: 0, width: HANDLE_W, backgroundColor: colors.primary, opacity: 0.9, borderRadius: 4 },
});
```

- [ ] **Step 4: 통과 확인** — Run: `npm test -- WaveformView` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add components/WaveformView.tsx __tests__/WaveformView.test.tsx
git commit -m "feat: 파형+트림 핸들 컴포넌트(WaveformView)"
```

---

### Task 5: 풀스크린 트림 에디터 + 라우트 + 진입점

**Files:**
- Modify: `types/index.ts` (RootStackParamList에 `TrimEditor`)
- Modify: `App.tsx` (HomeStack에 TrimEditor 스크린 등록)
- Create: `screens/TrimEditorScreen.tsx`
- Modify: `screens/SongDetailScreen.tsx` (버전 메뉴에 [구간 편집])
- Test: `__tests__/TrimEditorScreen.test.tsx`

**Interfaces:**
- Consumes: `getVersion`, `applyTrimToVersion`, `createTrimmedVersion` (db), `clampTrimRange`, `trimmedDuration`, `isPastTrimEnd` (trim), `WaveformView`, expo-audio `useAudioPlayer`/`useAudioPlayerStatus`.
- Produces: `RootStackParamList`에 `TrimEditor: { versionId: string }`

- [ ] **Step 1: 라우트 타입 추가** — `types/index.ts`

```typescript
export type RootStackParamList = {
  Home: undefined;
  SongDetail: { songId: string };
  Playlists: undefined;
  PlaylistDetail: { playlistId: string };
  TrimEditor: { versionId: string };
};
```

- [ ] **Step 2: 실패하는 테스트** — `__tests__/TrimEditorScreen.test.tsx` (expo-audio/db 목)

```typescript
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => {}) }),
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 10, playing: false, didJustFinish: false }),
}));
jest.mock('../lib/database', () => ({
  getVersion: jest.fn(),
  applyTrimToVersion: jest.fn(async () => {}),
  createTrimmedVersion: jest.fn(async () => 'new-v'),
}));

import TrimEditorScreen from '../screens/TrimEditorScreen';
import { getVersion, createTrimmedVersion } from '../lib/database';

const nav = { goBack: jest.fn(), navigate: jest.fn() } as any;
const route = { params: { versionId: 'v1' } } as any;

beforeEach(() => {
  (getVersion as jest.Mock).mockResolvedValue({
    id: 'v1', songId: 's1', fileName: 'f.m4a', storageUrl: 'file:///f.m4a',
    rating: 4, duration: 10, recordedAt: new Date(), waveform: [0.2, 0.6, 0.4],
  });
});

it('로드 후 저장 시 createTrimmedVersion 호출(새 버전 저장 기본)', async () => {
  const r = render(<TrimEditorScreen navigation={nav} route={route} />);
  await waitFor(() => r.getByTestId('trim-save-button'));
  await act(async () => { fireEvent.press(r.getByTestId('trim-save-button')); });
  await waitFor(() => expect(createTrimmedVersion).toHaveBeenCalled());
  expect(nav.goBack).toHaveBeenCalled();
});
```

- [ ] **Step 3: 실패 확인** — Run: `npm test -- TrimEditorScreen` · Expected: FAIL (모듈 없음)

- [ ] **Step 4: 구현** — `screens/TrimEditorScreen.tsx`

```tsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { RootStackParamList, Version } from '../types';
import { getVersion, applyTrimToVersion, createTrimmedVersion } from '../lib/database';
import { clampTrimRange, trimmedDuration, isPastTrimEnd, TrimRange } from '../lib/trim';
import { WaveformView } from '../components/WaveformView';
import { colors, spacing, borderRadius, typography } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TrimEditor'>;

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export default function TrimEditorScreen({ navigation, route }: Props) {
  const { versionId } = route.params;
  const [version, setVersion] = useState<Version | null>(null);
  const [range, setRange] = useState<TrimRange>({ start: 0, end: 0 });
  const [saving, setSaving] = useState(false);

  const player = useAudioPlayer(version ? { uri: version.storageUrl } : null);
  const status = useAudioPlayerStatus(player);
  const previewingRef = useRef(false);

  useEffect(() => {
    (async () => {
      const v = await getVersion(versionId);
      if (!v) { Alert.alert('오류', '녹음을 찾을 수 없습니다.'); navigation.goBack(); return; }
      setVersion(v);
      const dur = v.duration ?? 0;
      setRange(v.trim ?? { start: 0, end: dur });
    })();
  }, [versionId]);

  const duration = version?.duration ?? status.duration ?? 0;

  // 구간 끝 도달 시 미리듣기 정지
  useEffect(() => {
    if (previewingRef.current && isPastTrimEnd(status.currentTime, range)) {
      player.pause();
      previewingRef.current = false;
    }
  }, [status.currentTime, range]);

  const handlePreview = async () => {
    if (status.playing) { player.pause(); previewingRef.current = false; return; }
    await player.seekTo(range.start);
    previewingRef.current = true;
    player.play();
  };

  const finish = async (mode: 'new' | 'overwrite') => {
    if (!version) return;
    setSaving(true);
    try {
      const safe = clampTrimRange(range, duration);
      if (mode === 'overwrite') await applyTrimToVersion(version.id, safe);
      else await createTrimmedVersion(version.id, safe);
      navigation.goBack();
    } catch {
      Alert.alert('오류', '저장에 실패했습니다.');
    } finally { setSaving(false); }
  };

  const handleSave = () => {
    Alert.alert('저장', '어떻게 저장할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '새 버전으로 저장', onPress: () => finish('new') },
      { text: '원본 덮어쓰기', style: 'destructive', onPress: () =>
        Alert.alert('원본 덮어쓰기', '되돌릴 수 없어요. 계속할까요?', [
          { text: '취소', style: 'cancel' },
          { text: '덮어쓰기', style: 'destructive', onPress: () => finish('overwrite') },
        ]) },
    ]);
  };

  if (!version) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} testID="trim-close-button">
          <Ionicons name="chevron-down" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>구간 편집</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.lenText}>{fmt(trimmedDuration(range))} 선택됨</Text>
        <WaveformView
          samples={version.waveform ?? []}
          duration={duration}
          range={range}
          playhead={status.playing ? status.currentTime : undefined}
          onChangeRange={setRange}
          width={340}
          height={140}
        />
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{fmt(range.start)}</Text>
          <Text style={styles.timeText}>{fmt(range.end)}</Text>
        </View>

        <TouchableOpacity style={styles.previewButton} onPress={handlePreview} testID="trim-preview-button">
          <Ionicons name={status.playing ? 'pause' : 'play'} size={28} color={colors.background} />
          <Text style={styles.previewText}>{status.playing ? '일시정지' : '구간 미리듣기'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} onPress={handleSave} disabled={saving} testID="trim-save-button">
        {saving ? <ActivityIndicator color={colors.background} /> : <Text style={styles.saveText}>저장</Text>}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerTitle: { ...typography.h3, color: colors.textPrimary },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg },
  lenText: { ...typography.body, color: colors.textSecondary },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', width: 340 },
  timeText: { ...typography.bodySmall, color: colors.textTertiary, fontVariant: ['tabular-nums'] },
  previewButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: borderRadius.full, marginTop: spacing.lg },
  previewText: { ...typography.body, fontWeight: '600', color: colors.background },
  saveButton: { backgroundColor: colors.primary, margin: spacing.lg, paddingVertical: spacing.lg, borderRadius: borderRadius.md, alignItems: 'center' },
  saveText: { ...typography.body, fontWeight: '700', color: colors.background },
  disabled: { opacity: 0.5 },
});
```

- [ ] **Step 5: 통과 확인** — Run: `npm test -- TrimEditorScreen` · Expected: PASS

- [ ] **Step 6: 라우트 등록** — `App.tsx` HomeStack에 추가

```tsx
import TrimEditorScreen from './screens/TrimEditorScreen';
// HomeStack.Navigator 안, SongDetail 다음 줄:
<HomeStack.Screen name="TrimEditor" component={TrimEditorScreen} options={{ presentation: 'fullScreenModal' }} />
```

- [ ] **Step 7: 진입점 추가** — `screens/SongDetailScreen.tsx` 버전 드롭다운 메뉴에 [구간 편집] 항목 추가(평점 수정 위/아래)

```tsx
<TouchableOpacity
  style={styles.menuItem}
  onPress={() => {
    if (menuState.version) {
      const vId = menuState.version.id;
      closeMenu();
      navigation.navigate('TrimEditor', { versionId: vId });
    }
  }}
>
  <Ionicons name="cut-outline" size={20} color={colors.textPrimary} />
  <Text style={styles.menuItemText}>구간 편집</Text>
</TouchableOpacity>
```
(`SongDetailScreen` Props의 navigation은 이미 `TrimEditor`를 포함한 `RootStackParamList` 기반이라 타입 OK.)

- [ ] **Step 8: 타입체크/전체 테스트** — Run: `npx tsc --noEmit && npm test` · Expected: PASS

- [ ] **Step 9: 커밋**

```bash
git add types/index.ts App.tsx screens/TrimEditorScreen.tsx screens/SongDetailScreen.tsx __tests__/TrimEditorScreen.test.tsx
git commit -m "feat: 풀스크린 트림 에디터 + 구간 미리듣기 + 버전 메뉴 진입점"
```

---

### Task 6: 전역 재생이 trim 구간 존중

**Files:**
- Modify: `contexts/PlayerContext.tsx`
- Test: `__tests__/trim.test.ts` (이미 `isPastTrimEnd` 테스트 존재 — 추가 케이스만)

**Interfaces:**
- Consumes: `isPastTrimEnd` (lib/trim)

PlayerContext는 네이티브 TrackPlayer 의존이라 단위 테스트 대신 순수 로직(`isPastTrimEnd`)으로 결정을 분리하고, 배선은 tsc/수동으로 검증한다.

- [ ] **Step 1: import** — `contexts/PlayerContext.tsx`

```tsx
import { isPastTrimEnd } from '../lib/trim';
```

- [ ] **Step 2: 트랙 시작 시 trim.start로 seek** — `setCurrentTrack`의 `await TrackPlayer.play();` 다음에

```tsx
if (track.version.trim) { await TrackPlayer.seekTo(track.version.trim.start); }
```

`setPlaylist`의 `await TrackPlayer.play();` 다음에

```tsx
const startTrim = items[startIndex]?.version.trim;
if (startTrim) { await TrackPlayer.seekTo(startTrim.start); }
```

`PlaybackActiveTrackChanged` 리스너에서 새 트랙 적용 시:

```tsx
if (newTrack.version.trim) { await TrackPlayer.seekTo(newTrack.version.trim.start); }
```

- [ ] **Step 3: trim.end 도달 시 정지/다음 곡** — provider 본문에 effect 추가(`playNext` 정의 이후 위치)

```tsx
useEffect(() => {
  const trim = currentTrack?.version.trim;
  if (!trim || !isPlaying) return;
  if (isPastTrimEnd(progress.position, trim)) {
    if (playlistState && playlistState.items.length > 1) {
      playNext();
    } else {
      TrackPlayer.pause();
    }
  }
}, [progress.position, currentTrack, isPlaying, playlistState, playNext]);
```

- [ ] **Step 4: trim 구간 길이 단위 테스트 보강** — `__tests__/trim.test.ts`에 추가

```typescript
it('정확히 end 직전 위치는 멈추지 않는다(폴링 경계)', () => {
  expect(isPastTrimEnd(4.99, { start: 0, end: 5 })).toBe(false);
  expect(isPastTrimEnd(5.0, { start: 0, end: 5 })).toBe(true);
});
```

- [ ] **Step 5: 타입체크/테스트** — Run: `npx tsc --noEmit && npm test` · Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add contexts/PlayerContext.tsx __tests__/trim.test.ts
git commit -m "feat: 전역 재생이 trim 구간(start~end)을 존중"
```

---

## Self-Review

- **Spec 커버리지:** Version 모델/DB(T1), 순수 유틸(T2), 녹음 파형 캡처(T3), 파형+핸들 UI(T4), 풀스크린 에디터+구간 미리듣기+새버전/덮어쓰기(T5), 전역 재생 trim 존중(T6). 풀스크린 진입(스펙 2.2)·미터링 캡처(2.3)·전용 플레이어 미리듣기(2.4)·가상 트림(2.5) 모두 커버. ✔
- **플레이스홀더:** 없음. 모든 step에 실제 코드/명령/기대출력. ✔
- **타입 일관성:** `TrimRange{start,end}`, `addVersion(...,extra?)`, `applyTrimToVersion`, `createTrimmedVersion`, `normalizeWaveform`, `clampTrimRange/trimmedDuration/isPastTrimEnd`, `WaveformView`/`TrimEditorScreen` props, `RootStackParamList.TrimEditor` — 태스크 간 일치. ✔
- **알려진 한계:** 가상 트림 정지 정밀도는 progress 폴링 간격 의존(스펙 6 위험 항목과 일치). 정밀 컷은 네이티브(Plan 3). ✔
