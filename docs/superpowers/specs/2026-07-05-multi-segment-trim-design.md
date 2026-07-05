# 멀티 구간 잘라내기 편집 (비파괴 + 실제 렌더) — 설계서

> 작성 2026-07-05 · 브랜치 `feat/multi-segment-trim`
> 목표: 현재 "시작~끝 단일 구간"만 지원하는 트림을, **여러 개의 중간 구간을 잘라내고 남은
> 부분을 하나로 이어붙이는** 편집으로 고도화한다. 비파괴(메타데이터) 편집과 실제 잘린
> m4a 렌더(네이티브)를 **둘 다** 제공한다. (승인된 접근 = C안 하이브리드 2단계)

## 배경 / 현재 상태

- 현재 트림은 **비파괴**다: 오디오 파일을 자르지 않고 `Version.trim = {start, end}`만 저장하고,
  재생 시 `start`에서 시작해 `end`에서 멈춘다(`lib/trim.ts`의 `isPastTrimEnd`).
- `createTrimmedVersion`은 원본 `storageUrl`을 그대로 참조하고 `trim` 메타만 새 버전에 붙인다
  → 실제 파일은 안 잘린다. 따라서 공유/내보내기는 편집이 미반영된다(기존 한계).
- 녹음은 `.m4a`(AAC 압축). 의존성에 오디오를 자를 수 있는 라이브러리 없음
  (`expo-audio`=녹음/재생, `react-native-track-player`=재생). → 실제 자르기는 네이티브 필요.
- `components/WaveformView.tsx`는 PanResponder 기반 단일 `range`(start/end 핸들 2개)만 지원.

## 데이터 모델

`types/index.ts`의 `Version`에 필드 추가:

```ts
trim?: { start: number; end: number };   // (레거시, 읽기 호환 유지)
cuts?: TrimRange[];                        // 신규: 삭제할 구간들(정렬·비중첩)
editedFrom?: string;                       // 기존 유지
```

- **남길 구간 = `[0, duration]` − cuts** (여집합).
- **하위호환**: `getEffectiveCuts(version, duration)` 헬퍼가 `cuts` 우선, 없으면 레거시 `trim`을
  `legacyTrimToCuts`로 변환해 반환. 기존 녹음의 재생·편집이 그대로 동작한다.
- 새 편집 저장 시에는 `cuts`에 기록한다(`trim`은 새로 쓰지 않음).

## lib/trim.ts — 순수 함수 (Jest 100% 목표)

기존 `TrimRange`, `clampTrimRange`, `trimmedDuration`, `isPastTrimEnd` 유지. 추가:

| 함수 | 역할 |
|---|---|
| `normalizeCuts(cuts, duration, minKeep=0.3)` | 클램프·정렬·중첩/인접 병합·유효성. 남길 구간이 `minKeep` 미만이 되는 잘못된 cut 정리 |
| `keepSegments(cuts, duration): TrimRange[]` | 남길 구간 목록(여집합) |
| `editedDuration(cuts, duration): number` | 편집 후 총 길이(= keepSegments 합) |
| `nextKeepStart(pos, cuts, duration): number \| null` | 재생 위치가 cut 안이면 그 cut의 끝(다음 남길 지점) 반환, 끝이면 null |
| `legacyTrimToCuts(trim, duration): TrimRange[]` | `{start,end}` → `[{0,start},{end,duration}]` 중 유효한 것 |
| `getEffectiveCuts(version, duration): TrimRange[]` | cuts 우선, 없으면 레거시 변환 |

모두 순수·결정론적. 부동소수 비교는 작은 epsilon 사용.

## Phase 1 — 비파괴 멀티구간 편집 (순수 JS/UI, 헤드리스 테스트)

### components/WaveformView.tsx
- Props 확장: `range/onChangeRange` → **`cuts: TrimRange[]`, `onChangeCuts`, `selectedCutIndex`, `onSelectCut`**.
- 각 cut을 음영 사각형으로 렌더. 각 cut마다 좌/우 드래그 핸들(기존 PanResponder 패턴 복제).
  선택된 cut은 강조 표시.
- 파형 위 탭으로 cut 선택. `playhead`(재생헤드) 표시 유지.
- 무손실 리팩터: 단일 range 시절 로직을 cut 배열 순회로 일반화.

### screens/TrimEditorScreen.tsx
- 상태: `cuts: TrimRange[]`, `selectedCutIndex: number | null`. 초기값 = `getEffectiveCuts(version, duration)`.
- 액션 버튼:
  - **구간 추가**: 현재 재생헤드 위치에 기본 폭(예 2초, duration에 맞춰 클램프) cut 추가 → 선택 상태.
  - **선택 구간 삭제**: `selectedCutIndex`의 cut 제거.
  - 드래그로 각 cut 양끝 조정 → `normalizeCuts` 통과.
- 표시: "N개 구간 잘라냄 · 남은 길이 M:SS"(`editedDuration`).
- **미리듣기(건너뛰기 재생)**: 재생 중 `status.currentTime`이 cut에 진입하면 `nextKeepStart`로 `seekTo`.
  마지막 남길 구간의 끝에서 정지. (기존 단일 `isPastTrimEnd` 로직 대체)
- **저장 옵션**(하단):
  - **새 버전으로 저장(비파괴)** → `createEditedVersion(sourceId, cuts)`
  - **실제로 잘라 저장** → Phase 2 렌더(§Phase 2). 네이티브 미가용 시 이 버튼 숨김.
  - **원본 덮어쓰기(비파괴)** → `applyCutsToVersion(id, cuts)` (기존 덮어쓰기 UX 유지, 확인 다이얼로그)

### lib/database.ts
- `applyCutsToVersion(versionId, cuts)` — 버전에 `cuts` 저장(기존 `applyTrimToVersion` 자리 일반화, 레거시 함수는 유지).
- `createEditedVersion(sourceVersionId, cuts)` — 같은 `storageUrl` 참조 + `cuts` 메타로 새 버전(`editedFrom`).
- `addVersion` extra에 `cuts` 지원 추가.

### 재생 경로(에디터 밖)
- 상세화면/플레이어에서도 `cuts`(또는 레거시 trim)를 존중하도록 재생 로직에 `nextKeepStart` 스킵 반영.
  (현재 `isPastTrimEnd`만 쓰는 지점을 멀티구간 대응으로 확장)

## Phase 2 — 네이티브 실제 렌더 (dev build/에뮬레이터)

### modules/audio-edit (신규, denoise와 별개)
- ML·바이너리·모델 의존 **전혀 없음**. OS 표준 미디어 API만 사용 → 결정론적·무손실·빌드 안전.
- JS 진입: `renderCuts(inputUri: string, keepSegments: TrimRange[], outputUri: string): Promise<{ uri: string; duration: number }>`
  - 입력은 **남길 구간 목록**(keepSegments)을 받는다(cuts→keep 변환은 JS에서).
- **iOS (Swift, AVFoundation)**: `AVMutableComposition`에 각 keep 구간의 오디오 트랙 `timeRange`를
  순차 `insertTimeRange` → `AVAssetExportSession`(`AVAssetExportPresetAppleM4A`)로 `.m4a` 내보내기.
- **Android (Kotlin)**: `MediaExtractor`로 각 keep 구간의 샘플만 읽어(seek=이전 sync 프레임) `MediaMuxer`로
  재먹싱, PTS 재계산해 연속화. **재인코딩 없음(압축 도메인) → 고속·무손실.** AAC는 프레임마다 sync라 경계 안전.

### lib/nativeAudioEdit.ts (신규, nativeDenoise 패턴)
- `isAudioEditAvailable(): boolean` — 네이티브 모듈 링크 여부.
- `renderCutsToFile(inputUri, cuts, duration): Promise<{uri, duration}>` — keepSegments 계산 후 네이티브 호출,
  출력 경로는 `saveAudioLocally` 규칙 재사용(`lib/storage.ts`).
- 미가용(Expo Go 등) 시 `isAudioEditAvailable()=false` → UI에서 "실제로 잘라 저장/공유" 숨김.

### 연결
- **저장**: "실제로 잘라 새 버전 저장" → `renderCutsToFile` → 새 m4a → `addVersion`(cuts 메타 없이, 이미 물리적으로 잘림).
- **공유(⋯, SongDetailScreen)**: 버전에 cuts 있으면 공유 전 `renderCutsToFile`로 임시 렌더 후 그 파일을 공유
  (공유 파일에 편집 반영). cuts 없으면 기존대로 원본 공유.
- **autolinking**: `audio-edit`를 포함(제외 안 함). `app.json`/prebuild 반영. `expo prebuild` 후 에뮬레이터 빌드.

## 저장/공유 UX 요약 ("둘 다" 충족)

| 동작 | 결과 | 특징 |
|---|---|---|
| 새 버전으로 저장 | 같은 파일 + `cuts` 메타 | 즉시·빠름·재편집 가능·앱 내 건너뛰기 재생 |
| 실제로 잘라 저장 | 진짜 잘린 새 m4a | 영구·공유용·재인코딩 없음(무손실) |
| 공유(⋯) | cuts 있으면 렌더 후 공유 | 공유 파일에 편집 반영 |

## 테스트 전략

- **Phase 1 (헤드리스, `npm test`)**
  - `__tests__/trim.test.ts`(신규): `normalizeCuts`/`keepSegments`/`editedDuration`/`nextKeepStart`/`legacyTrimToCuts`/`getEffectiveCuts` 경계 케이스.
  - `__tests__/TrimEditorScreen.test.tsx`(확장): 구간 추가/조정/삭제, "남은 길이" 표시, 비파괴 저장 호출, 네이티브 미가용 시 렌더 버튼 숨김.
  - `__tests__/nativeAudioEdit.test.ts`(신규): 가용성 분기·keepSegments 변환·폴백(네이티브 목).
- **Phase 2 (에뮬레이터 실기, 헤드리스 불가)**
  - `expo prebuild` → Android 에뮬레이터 빌드/실행([android-emulator-run-setup] 메모리 참고).
  - 시나리오: 녹음/가져오기 → 중간 2개 구간 잘라내기 → 미리듣기가 구간 건너뜀 확인 → "실제로 잘라 저장" →
    결과 버전 재생하여 잘린 구간 사라짐 + 총 길이 = `editedDuration` 근사 확인 → 공유 파일에도 반영 확인.

## 마이그레이션 / 호환

- 기존 `trim`만 있는 버전: 재생·편집 모두 정상(`getEffectiveCuts`가 변환). 데이터 마이그레이션 스크립트 불필요.
- 새 저장은 `cuts` 사용. `trim`은 읽기 전용 레거시로 잔존.

## 영향 파일

- `types/index.ts` — `cuts` 필드.
- `lib/trim.ts` — 순수 함수 6종.
- `lib/database.ts` — `applyCutsToVersion`, `createEditedVersion`, `addVersion` extra.
- `components/WaveformView.tsx` — 멀티 cut 렌더/제스처/선택.
- `screens/TrimEditorScreen.tsx` — 멀티구간 에디터·건너뛰기 재생·저장 옵션.
- `screens/SongDetailScreen.tsx` — 공유 시 렌더 반영(cuts 있을 때).
- `modules/audio-edit/*` — 신규 네이티브 모듈(iOS Swift / Android Kotlin / JS).
- `lib/nativeAudioEdit.ts` — 신규 래퍼 + 가용성.
- `App.tsx` / `app.json` / autolinking — 모듈 등록·prebuild.
- `__tests__/*` — trim, 에디터, nativeAudioEdit.

## 비목표 (YAGNI)

- 하나를 여러 독립 녹음으로 **분할 저장**(split)은 이번 범위 아님(사용자가 "구간 삭제→이어붙임" 선택).
- 페이드/크로스페이드, 볼륨 조정, 구간 이동/재정렬 편집은 범위 아님.
- 잡음/화자 제거(denoise)는 별개 트랙(이번 작업과 무관, 미노출 유지).

## 리스크 / 한계

- **Phase 2는 dev build/기기 필요** — 헤드리스 검증 불가. 단 OS 표준 API라 품질 리스크 없음(denoise와 다름).
- 비파괴 건너뛰기 재생은 `seekTo` 지연으로 경계에서 미세 공백 가능 — 허용 범위. 완전 매끄러움이 필요하면
  "실제로 잘라 저장"본으로 재생 권장.
- Android MediaMuxer 경계 PTS/priming 처리 주의(구현 시 첫 샘플 PTS 0 정규화).
