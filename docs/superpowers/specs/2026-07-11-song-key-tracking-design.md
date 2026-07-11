# 노래방 키 기록 기능 설계

## 목적

곡마다 "몇 키 올렸는지 / 원키인지"를 기록하고 한눈에 확인한다. 노래방 키 조절 습관(반음 단위 ±)을 앱에 남긴다.

## 확정 사항 (브레인스토밍)

- 저장 단위: **곡 + 버전 둘 다**. 곡에는 대표 "내 키", 버전마다 그 녹음의 키.
- 표기: **반음 단위 정수**. 원키 = `0`, 미설정 = `undefined`, 범위 `-6 ~ +6`.
- 표시 위치: 홈 곡 목록, 곡 상세 헤더, 녹음 저장 시, 버전 카드/메뉴.
- 관계: **버전 저장 시 곡 키 자동 갱신** (마지막으로 기록한 버전 키 = 곡의 내 키).

## 데이터 모델 (types/index.ts)

```ts
interface Song  { /* ... */ myKey?: number; }  // 반음, 원키=0, 미설정=undefined
interface Version { /* ... */ key?: number; }  // 이 녹음의 키
```

`undefined` → 아무것도 표시 안 함. `0` → "원키". 양수 → `+N키`. 음수 → `-N키`.

## 표시/포맷 (lib/keyLabel.ts)

- `KEY_MIN = -6`, `KEY_MAX = 6`.
- `formatKey(key?: number): string | null`
  - `undefined` → `null` (렌더 안 함)
  - `0` → `'원키'`
  - `n > 0` → `'+' + n + '키'`
  - `n < 0` → `n + '키'` (예: `-2키`)
- `clampKey(n)` → 범위로 클램프.

## 컴포넌트

- **KeyBadge** (`components/KeyBadge.tsx`): `value?: number`. `formatKey`가 `null`이면 렌더 안 함. 음표 아이콘(`musical-note`) + 라벨의 작은 pill. 원키/양수/음수에 따라 색 톤 구분(원키=중립, 그 외=accent).
- **KeyPickerModal** (`components/KeyPickerModal.tsx`): `−`/`+` 스텝퍼(범위 클램프) + "원키로" 버튼 + 저장/취소. 곡 키·버전 키 편집에 공용. `initialValue`, `onSave(key)`.

## 데이터베이스 (lib/database.ts)

- `addVersion(...)` extra에 `key?: number` 추가. 저장 후 `key`가 정의되면 해당 곡 `myKey = key`로 갱신.
- `updateVersion(id, { rating?, memo?, key? })`에 `key` 추가. `key`가 정의되면 곡 `myKey`도 갱신(가장 최근 의도 반영).
- `updateSongKey(songId, key?: number)` 신규: 곡 `myKey` 직접 설정(헤더에서 편집). `updatedAt` 갱신.
- 기존 저장 데이터는 `myKey`/`key` 없음 → `undefined`로 자연 처리(마이그레이션 불필요).

## 화면 동작

- **HomeScreen `SongItem`**: 별점 옆에 `<KeyBadge value={item.myKey} />`.
- **SongDetailScreen 헤더**: 곡 제목/별점 근처에 탭 가능한 `KeyBadge`(미설정 시 "키 설정" placeholder 배지) → `KeyPickerModal`로 곡 키 편집(`updateSongKey`).
- **SongDetailScreen `VersionItem`**: 날짜/대표 배지 줄에 `<KeyBadge value={version.key} />`.
- **버전 메뉴**: "키 수정" 항목 추가 → `KeyPickerModal`(`updateVersion({ key })`).
- **RecorderModal**: 리뷰 단계(별점/메모 옆)에 인라인 키 스텝퍼. 기본값 `defaultKey ?? 0`. `onSave` 시그니처에 `key` 추가. 곡 상세에서 `defaultKey={song.myKey}` 전달.

## 테스트

- `__tests__/keyLabel.test.ts`: `formatKey` 각 케이스, `clampKey` 경계.
- `__tests__/database.test.ts`에 추가: `addVersion` key → 곡 `myKey` 갱신, `updateVersion` key 갱신, `updateSongKey`.

## 비목표 (YAGNI)

- 실제 음이름(C/D…) 변환, 원곡 키 데이터 연동 없음(반음 오프셋만).
- 반음 미만/장식 표기 없음.
