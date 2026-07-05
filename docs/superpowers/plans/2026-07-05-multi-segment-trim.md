# 멀티 구간 잘라내기 편집 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 트림을 "여러 중간 구간 삭제 → 이어붙임"으로 고도화하고, 비파괴 편집 + 실제 잘린 m4a 렌더(네이티브)를 제공한다.

**Architecture:** `Version.cuts: TrimRange[]`(삭제 구간) 비파괴 메타 + 순수함수(lib/trim) 기반 재생 건너뛰기. 실제 파일은 신규 네이티브 모듈 `audio-edit`(iOS AVMutableComposition / Android MediaExtractor+MediaMuxer)로 무손실 렌더.

**Tech Stack:** React Native/Expo, TypeScript, expo-audio, Jest(jest-expo), Expo Modules(Swift/Kotlin).

## Global Constraints

- 함수형 컴포넌트, async/await, try-catch 에러 핸들링, StyleSheet(테마 토큰 `lib/theme`), testID 부여.
- 외부 모듈은 jest.setup.js 또는 테스트 내 목 처리. `@testing-library/react-native` v13.
- 기존 라이브러리 우선 활용. 녹음 포맷 `.m4a`. 저장 경로 규칙 `lib/storage.ts` 재사용.
- 네이티브(Phase 2)는 헤드리스 불가 → Android 에뮬레이터로 검증.

---

## Phase 1 — 비파괴 멀티구간 편집 (순수 JS/UI)

### Task 1: lib/trim.ts 순수 함수 + 테스트

**Files:** Modify `lib/trim.ts`; Test `__tests__/trim.test.ts`(신규)

**Interfaces / Produces:**
- `normalizeCuts(cuts: TrimRange[], duration: number, minKeep?: number): TrimRange[]`
- `keepSegments(cuts: TrimRange[], duration: number): TrimRange[]`
- `editedDuration(cuts: TrimRange[], duration: number): number`
- `nextKeepStart(pos: number, cuts: TrimRange[], duration: number): number | null`
- `legacyTrimToCuts(trim: {start:number;end:number} | undefined, duration: number): TrimRange[]`
- `getEffectiveCuts(v: { cuts?: TrimRange[]; trim?: {start:number;end:number} }, duration: number): TrimRange[]`

- [ ] Step 1: 테스트 작성 `__tests__/trim.test.ts` — 케이스: 빈 cuts→keep 전체; 중첩/인접 병합; 정렬; 경계 클램프; keepSegments 여집합; editedDuration 합; nextKeepStart(cut 안→cut끝, 밖→pos, 끝→null); legacyTrimToCuts({start:2,end:5},10)→[{0,2},{5,10}]; getEffectiveCuts cuts 우선.
- [ ] Step 2: 실패 확인 `npx jest trim -t .`
- [ ] Step 3: 구현

```ts
const EPS = 1e-3;
export function normalizeCuts(cuts: TrimRange[], duration: number, minKeep = 0.3): TrimRange[] {
  const cleaned = cuts
    .map(c => ({ start: Math.max(0, Math.min(c.start, duration)), end: Math.max(0, Math.min(c.end, duration)) }))
    .filter(c => c.end - c.start > EPS)
    .sort((a, b) => a.start - b.start);
  const merged: TrimRange[] = [];
  for (const c of cleaned) {
    const last = merged[merged.length - 1];
    if (last && c.start <= last.end + EPS) last.end = Math.max(last.end, c.end);
    else merged.push({ ...c });
  }
  return merged;
}
export function keepSegments(cuts: TrimRange[], duration: number): TrimRange[] {
  const norm = normalizeCuts(cuts, duration);
  const keep: TrimRange[] = [];
  let cursor = 0;
  for (const c of norm) {
    if (c.start - cursor > EPS) keep.push({ start: cursor, end: c.start });
    cursor = Math.max(cursor, c.end);
  }
  if (duration - cursor > EPS) keep.push({ start: cursor, end: duration });
  return keep;
}
export function editedDuration(cuts: TrimRange[], duration: number): number {
  return keepSegments(cuts, duration).reduce((s, k) => s + (k.end - k.start), 0);
}
export function nextKeepStart(pos: number, cuts: TrimRange[], duration: number): number | null {
  const norm = normalizeCuts(cuts, duration);
  for (const c of norm) {
    if (pos >= c.start - EPS && pos < c.end - EPS) return c.end < duration - EPS ? c.end : null;
  }
  return pos < duration - EPS ? pos : null;
}
export function legacyTrimToCuts(trim: { start: number; end: number } | undefined, duration: number): TrimRange[] {
  if (!trim) return [];
  const out: TrimRange[] = [];
  if (trim.start > EPS) out.push({ start: 0, end: trim.start });
  if (duration - trim.end > EPS) out.push({ start: trim.end, end: duration });
  return out;
}
export function getEffectiveCuts(v: { cuts?: TrimRange[]; trim?: { start: number; end: number } }, duration: number): TrimRange[] {
  if (v.cuts && v.cuts.length) return normalizeCuts(v.cuts, duration);
  return legacyTrimToCuts(v.trim, duration);
}
```

- [ ] Step 4: `npx jest trim` PASS
- [ ] Step 5: Commit `feat(trim): 멀티구간 순수 함수(normalizeCuts/keepSegments/nextKeepStart 등)`

### Task 2: types + database cuts 저장 + 테스트

**Files:** Modify `types/index.ts`, `lib/database.ts`; Test `__tests__/database.test.ts`(확장) 또는 신규 `__tests__/database.cuts.test.ts`

**Interfaces / Produces:**
- `Version.cuts?: TrimRange[]`
- `applyCutsToVersion(versionId: string, cuts: TrimRange[]): Promise<void>`
- `createEditedVersion(sourceVersionId: string, cuts: TrimRange[]): Promise<string>`
- `addVersion(...extra)` extra에 `cuts?: TrimRange[]` 추가

- [ ] Step 1: `types/index.ts` Version에 `cuts?: { start:number; end:number }[];` 추가.
- [ ] Step 2: 테스트 신규 `__tests__/database.cuts.test.ts` — applyCutsToVersion 후 getVersion.cuts 일치; createEditedVersion가 원본 storageUrl 참조 + cuts/editedFrom 세팅 + editedDuration로 duration.
- [ ] Step 3: 실패 확인.
- [ ] Step 4: `lib/database.ts` 구현

```ts
export const applyCutsToVersion = async (versionId: string, cuts: { start:number; end:number }[]): Promise<void> => {
  const versions = await getAllVersions();
  const idx = versions.findIndex(v => v.id === versionId);
  if (idx !== -1) { versions[idx].cuts = cuts; await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(versions)); }
};
export const createEditedVersion = async (sourceVersionId: string, cuts: { start:number; end:number }[]): Promise<string> => {
  const source = await getVersion(sourceVersionId);
  if (!source) throw new Error('원본 버전을 찾을 수 없습니다.');
  const dur = source.duration ?? 0;
  const editedDur = editedDuration(cuts, dur); // import from lib/trim
  return addVersion(source.songId, source.fileName, source.storageUrl, source.rating, editedDur, source.memo,
    { waveform: source.waveform, cuts, editedFrom: source.id });
};
```
`addVersion` extra 타입에 `cuts?` 추가하고 `cuts: extra?.cuts` 저장. `applyTrimToVersion`/`createTrimmedVersion`은 레거시로 유지.

- [ ] Step 5: `npx jest database` PASS.
- [ ] Step 6: Commit `feat(db): cuts 비파괴 저장(applyCutsToVersion/createEditedVersion)`

### Task 3: WaveformView 멀티 cut 렌더/제스처

**Files:** Modify `components/WaveformView.tsx`; Test `__tests__/WaveformView.test.tsx`(신규, 있으면 확장)

**Interfaces / Produces:**
- Props: `{ samples, duration, cuts: TrimRange[], onChangeCuts:(c:TrimRange[])=>void, selectedIndex:number|null, onSelectCut:(i:number|null)=>void, playhead?, width?, height? }`

- [ ] Step 1: 테스트 — cuts 2개 렌더 시 각 구간 핸들 testID(`cut-<i>-start`,`cut-<i>-end`) 존재; 선택 인덱스 강조 스타일.
- [ ] Step 2: 실패 확인.
- [ ] Step 3: 구현 — 기존 단일 range 로직을 `cuts.map`으로 일반화. 각 cut마다 좌/우 PanResponder 핸들(기존 패턴 복제), 드래그 시 해당 cut 갱신 후 `normalizeCuts` 적용해 `onChangeCuts`. 파형 배경 탭 → 가장 가까운 cut 선택(`onSelectCut`). 음영 사각형은 cut 영역(삭제될 부분)으로 표시(남길 부분과 시각 구분).
- [ ] Step 4: `npx jest WaveformView` PASS.
- [ ] Step 5: Commit `feat(trim): WaveformView 멀티 cut 렌더·드래그·선택`

### Task 4: TrimEditorScreen 멀티구간 에디터

**Files:** Modify `screens/TrimEditorScreen.tsx`; Test `__tests__/TrimEditorScreen.test.tsx`(신규/확장)

**Interfaces / Consumes:** Task1 lib/trim, Task2 db, Task3 WaveformView, Task6 nativeAudioEdit(가용성만).

- [ ] Step 1: 테스트 — 초기 cuts=getEffectiveCuts; "구간 추가" 탭 시 cuts 1개 증가; "선택 구간 삭제" 시 감소; "남은 길이" 텍스트=editedDuration; "새 버전으로 저장" → createEditedVersion 호출; isAudioEditAvailable=false면 "실제로 잘라 저장" 버튼 없음.
- [ ] Step 2: 실패 확인.
- [ ] Step 3: 구현 — 상태 `cuts`,`selectedIndex`. 버튼: 구간 추가(재생헤드 위치±기본 2초, clamp), 선택 구간 삭제, 미리듣기(건너뛰기: currentTime이 cut 진입 시 nextKeepStart로 seekTo, null이면 정지), 저장 3옵션(새 버전=createEditedVersion / 실제로 잘라 저장=nativeAudioEdit.renderCutsToFile→addVersion, 가용시만 / 원본 덮어쓰기=applyCutsToVersion+확인). "N개 구간 잘라냄 · 남은 길이 M:SS" 표시.
- [ ] Step 4: `npx jest TrimEditorScreen` PASS.
- [ ] Step 5: Commit `feat(trim): 멀티구간 에디터 화면 + 건너뛰기 미리듣기 + 저장 옵션`

### Task 5: 에디터 밖 재생 건너뛰기 반영

**Files:** Modify `screens/SongDetailScreen.tsx`(및 공용 재생 지점) ; Test 해당 컴포넌트 테스트에 스킵 케이스 추가(가능 범위)

- [ ] Step 1: 재생 로직에서 단일 `isPastTrimEnd`만 쓰던 지점을 `getEffectiveCuts`+`nextKeepStart` 기반 스킵으로 확장(cut 진입 시 seekTo, 마지막 keep 끝에서 정지).
- [ ] Step 2: 수동/유닛 검증.
- [ ] Step 3: Commit `feat(trim): 상세화면 재생도 멀티 cut 건너뛰기 반영`

## Phase 2 — 네이티브 실제 렌더

### Task 6: lib/nativeAudioEdit.ts 래퍼 + 테스트

**Files:** Create `lib/nativeAudioEdit.ts`; Test `__tests__/nativeAudioEdit.test.ts`

**Interfaces / Produces:**
- `isAudioEditAvailable(): boolean`
- `renderCutsToFile(inputUri: string, cuts: TrimRange[], duration: number, songId: string): Promise<{ uri: string; duration: number }>`

- [ ] Step 1: 테스트(nativeDenoise 패턴) — 모듈 목: 가용 시 renderCuts 호출됨(keepSegments 변환 인자 확인); 미가용 시 isAudioEditAvailable=false, renderCutsToFile 호출 시 에러.
- [ ] Step 2: 실패 확인.
- [ ] Step 3: 구현 — `requireOptionalNativeModule('AudioEdit')`; keepSegments(cuts,duration) 계산; 출력 경로 saveAudioLocally 규칙; 네이티브 `renderCuts(inputUri, keepSegments, outputUri)` 호출.
- [ ] Step 4: `npx jest nativeAudioEdit` PASS.
- [ ] Step 5: Commit `feat(audio-edit): JS 래퍼 + 가용성 폴백`

### Task 7: modules/audio-edit 네이티브 모듈

**Files:** Create `modules/audio-edit/expo-module.config.json`, `index.ts`, `ios/AudioEdit.podspec`, `ios/AudioEditModule.swift`, `android/build.gradle`, `android/src/main/java/expo/modules/audioedit/AudioEditModule.kt`

- [ ] Step 1: Expo 모듈 스캐폴드(config/index.ts). `AsyncFunction("renderCuts")` 정의: `(inputUri, keepSegments: [{start,end}], outputUri) -> {uri, duration}`.
- [ ] Step 2: **iOS Swift** — AVURLAsset 로드, AVMutableComposition에 audio track 생성, 각 keep `CMTimeRange` `insertTimeRange` 순차, AVAssetExportSession(presetAppleM4A, outputFileType .m4a) export, 완료 시 {uri,duration} resolve. 에러 reject.
- [ ] Step 3: **Android Kotlin** — MediaExtractor(input), audio track 선택/포맷, MediaMuxer(output, MPEG_4). 각 keep 구간: `seekTo(startUs, SEEK_TO_PREVIOUS_SYNC)` 후 sampleTime<endUs 동안 readSampleData→writeSampleData(PTS를 누적 오프셋으로 정규화). 완료 muxer.stop/release. {uri,duration} resolve.
- [ ] Step 4: 빌드는 Task 9에서. 여기선 소스 완성 + `npm test`(JS 계층 영향 없음) green 확인.
- [ ] Step 5: Commit `feat(audio-edit): iOS/Android 네이티브 렌더(무손실 cut+concat)`

### Task 8: 저장/공유에 렌더 연결

**Files:** Modify `screens/TrimEditorScreen.tsx`(실제로 잘라 저장 실동작), `screens/SongDetailScreen.tsx`(공유 시 cuts 있으면 렌더 후 공유)

- [ ] Step 1: 저장 옵션 "실제로 잘라 새 버전 저장" → renderCutsToFile → addVersion(새 uri, cuts 메타 없이). 진행 인디케이터/에러 처리.
- [ ] Step 2: 공유(⋯) → 버전 getEffectiveCuts 있으면 renderCutsToFile로 임시 파일 렌더 후 expo-sharing, 없으면 기존 원본 공유. 가용성 체크.
- [ ] Step 3: 관련 컴포넌트 테스트 목으로 분기 검증.
- [ ] Step 4: Commit `feat(trim): 실제 렌더 저장 + 공유 편집 반영`

### Task 9: autolinking/prebuild/에뮬레이터 검증

**Files:** Modify `app.json`(필요 시 plugins), autolinking 포함 확인, `App.tsx`(라우팅 영향 없음)

- [ ] Step 1: audio-edit가 autolinking에 포함되는지 확인(package.json exclude에 audio-edit 없어야 함 — denoise만 제외).
- [ ] Step 2: `npx expo prebuild --clean`.
- [ ] Step 3: Android 에뮬레이터 실행/빌드([android-emulator-run-setup] 메모리 경로) `npx expo run:android`.
- [ ] Step 4: 시나리오 검증 — 녹음/가져오기 → 중간 2구간 잘라내기 → 미리듣기 건너뜀 → "실제로 잘라 저장" → 결과 재생·길이≈editedDuration → 공유 반영.
- [ ] Step 5: 결과 기록 + Commit `test(trim): 에뮬레이터 시나리오 검증 + 정리`

## Self-Review (spec 대비)

- 데이터 모델(cuts+레거시 호환) → Task1,2 ✓
- 순수 함수 6종 → Task1 ✓
- WaveformView 멀티 → Task3 ✓; 에디터/건너뛰기/저장옵션 → Task4 ✓; 에디터 밖 재생 → Task5 ✓
- 네이티브 렌더(JS 래퍼/네이티브/연결/빌드) → Task6~9 ✓
- 저장·공유 UX("둘 다") → Task4,8 ✓
- 테스트: Phase1 헤드리스 → Task1~4; Phase2 래퍼 → Task6; 에뮬 → Task9 ✓
- 비목표(split/페이드/denoise) 제외 유지 ✓
