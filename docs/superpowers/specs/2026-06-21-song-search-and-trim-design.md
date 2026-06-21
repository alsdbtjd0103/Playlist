# 설계 스펙 — 곡 검색 기반 추가 + 녹음 트리밍

> 작성: 2026-06-21 · 대상: 플리로그(Playlist) RN 앱
> 범위: `SOCIAL_FEATURES_ROADMAP.md`의 Phase 1 중 **기능 A(곡 검색)** 와 **기능 C(녹음 트리밍)**.
> "오늘의 추천곡" 기능은 **제외**한다(미구현 상태 → 코드 삭제 없음, 로드맵에서만 제거).
> 둘 다 백엔드 불필요, 단독 출시 가능.

---

## 1. 기능 A — 곡 검색 기반 추가

### 1.1 목적
곡 추가 시 제목/아티스트를 직접 타이핑하는 대신 **검색해서 고른다.** iTunes Search API
결과뿐 아니라 **내가 전에 추가한 로컬 곡도 함께 검색**되어 재사용된다. 검색에 없으면
**직접 추가** 폼으로 떨어진다.

### 1.2 진입점 변경
- 홈(`HomeScreen`)의 `+` 버튼 → 기존 "제목/아티스트 직접 입력 모달"을 **검색 모달**로 교체.
- 빈 상태(곡 없음)의 추가 버튼도 동일하게 검색 모달을 연다.

### 1.3 검색 모달 동작
- 상단 검색 입력(자동 포커스), 입력 **디바운스 ~300ms**.
- 결과는 두 섹션:
  - **내 곡**: 로컬 라이브러리에서 `matchesSearch(제목+아티스트, query)`로 매칭. 초성 검색 유지.
    - 선택 시 → **기존 `SongDetail`로 이동(중복 곡 생성 안 함).** = "재사용"
  - **검색 결과**: iTunes Search API 결과(제목·아티스트·앨범아트 썸네일).
    - 선택 시 → `addSong`으로 메타데이터까지 저장 후 새 `SongDetail`로 이동.
    - **30초 미리듣기(▶)는 넣지 않는다.** `previewUrl`은 저장만 하고 UI 노출 안 함.
- **직접 추가 버튼**: 항상 하단에 노출(결과 0건일 때 특히 강조) → 기존 제목/아티스트 수동 입력 폼.
- 상태 처리: 로딩 스피너 / 오프라인·API 실패 시 "검색 결과를 불러오지 못했어요"(내 곡 섹션과 직접 추가는 계속 동작) / 빈 결과.

### 1.4 신규 모듈 `lib/itunes.ts`
```typescript
export interface ITunesTrack {
  itunesTrackId: number;
  trackName: string;
  artistName: string;
  artworkUrl?: string;   // artworkUrl100 → 필요 시 100x100
  previewUrl?: string;   // 30초 m4a (저장만)
}

// country=kr&media=music&limit=20, fetch 타임아웃, 에러 시 throw → 호출부 try-catch
export async function searchTracks(term: string): Promise<ITunesTrack[]>;
```
- 인증/키 불필요. `https://itunes.apple.com/search?term={term}&country=kr&media=music&limit=20`
- 네트워크 타임아웃(예: 8s) + 응답 파싱 방어 코드.

### 1.5 데이터 모델 — `Song` 확장
로드맵 문서는 메타데이터를 `Version.track`에 뒀으나, **추가 시점에 곡 단위로 붙으므로 `Song`에 둔다**
(이미 `title`/`artist`가 `Song`에 있음). 모두 선택 필드 → 기존 데이터 호환.
```typescript
interface Song {
  // ...기존 필드
  artworkUrl?: string;
  itunesTrackId?: number;
  previewUrl?: string;   // 저장만, 현재 UI 미사용
}
```
- `addSong` 시그니처를 `addSong(title, artist?, meta?: { artworkUrl?; itunesTrackId?; previewUrl? })`로 확장
  (기존 호출 호환 — meta 생략 가능).
- 앨범아트 표시: 값이 있으면 홈 카드 썸네일/상세 헤더 albumArt의 음표 아이콘 자리에 `Image`로 표시,
  없으면 기존 아이콘 폴백.

### 1.6 홈 검색 보강(작은 개선)
홈 화면의 기존 라이브러리 검색은 현재 제목만 매칭한다. 메타데이터가 풍부해지므로
**제목+아티스트** 모두 매칭하도록 `matchesSearch` 사용처를 보강한다(아티스트 없으면 제목만).

---

## 2. 기능 C — 녹음 트리밍

### 2.1 목적
보관함 녹음(Version)에서 앞/뒤 군더더기를 잘라낸다. 사용자는 **남길 구간을 고르고,
그 구간만 먼저 재생해 확인**한 뒤 저장한다. 1차는 앞/뒤 트림만(중간 삭제·합치기 등 제외).

### 2.2 진입점
- `SongDetailScreen`의 버전 메뉴(현재 대표 설정/평점 수정/삭제)에 **[구간 편집]** 항목 추가.
- 선택 시 **풀스크린 트림 에디터**로 진입(확장 재생 화면과 같은 풀스크린 톤).

### 2.3 파형 — 녹음 시점 미터링 캡처
RN에서 임의 m4a의 진짜 파형은 디코딩이 필요하나 표준 수단이 없다. 따라서 **녹음 시점에
미터링(amplitude)을 캡처**해 저장하는 방식을 "실제 파형"으로 채택한다.
- 녹음 중 expo-audio 미터링 값을 **~15회/초** 샘플링해 배열로 누적 → 저장 시 `Version.waveform: number[]`.
- 미터링 활성화: 레코더 옵션에 미터링 on(`useRecording` 훅 보강).
- **폴백**: 이 기능 도입 *이전* 녹음(또는 미터링 미지원 환경)은 `waveform`이 없으므로
  에디터에서 **평탄/균일 바**로 렌더(구간 선택·미리듣기는 그대로 동작).
- 정규화: 표시 직전 0~1 범위로 정규화(저장은 원시 dB/선형 값 중 구현 시 택1, 일관 유지).

### 2.4 트림 에디터(풀스크린)
- 곡/버전 정보 헤더 + 닫기.
- **파형 그래프**: `Version.waveform`(없으면 폴백 바)로 렌더.
- **시작/끝 두 핸들**을 파형 위에서 드래그해 남길 구간 지정. 현재 재생 위치(playhead) 표시.
- 시간 표시: 선택 구간 길이 / 시작·끝 시각.
- **구간만 미리듣기**: 전용 `expo-audio` `useAudioPlayer` 인스턴스 사용.
  - 재생 시 `start`로 seek → 폴링으로 `position >= end` 도달 시 자동 정지.
  - **전역 TrackPlayer는 건드리지 않는다**(에디터 자족적).
- 저장 옵션:
  - **새 버전으로 저장**(기본): 원본 보존.
  - **원본 덮어쓰기**: 되돌릴 수 없음 → 저장 전 경고 Alert.

### 2.5 1단계 — 가상 트림(네이티브 모듈 불필요, 먼저 출시)
파일은 그대로 두고 **구간 메타데이터만** 저장한다.
```typescript
interface Version {
  // ...기존 필드
  waveform?: number[];                    // 녹음 시 캡처한 파형 샘플
  trim?: { start: number; end: number };  // 가상 트림 구간(초)
  editedFrom?: string;                     // 원본 versionId(새 버전 저장 시 출처)
}
```
- **새 버전으로 저장**: 같은 `storageUrl`을 가리키되 `trim` + `editedFrom` 설정한 새 Version 생성.
- **원본 덮어쓰기**: 해당 Version에 `trim`만 설정.
- **전역 재생이 trim을 존중**해야 가상 트림이 앱 전체에서 "실제처럼" 동작한다:
  - `PlayerContext`에서 trim 있는 버전 재생 시 `start`로 seek, `position >= end` 시 정지/다음 곡.
  - 진행 바/시간 표시도 trim 구간 기준으로 보이도록 조정(가능 범위 내).
- 길이(`duration`)는 trim 구간 길이로 계산해 표시.

### 2.6 2단계 — 네이티브 실제 자르기(가상 트림 완료 후 이어서)
무손실로 진짜 잘린 새 m4a를 만든다.
- **Expo config plugin + 네이티브 모듈**:
  - iOS: `AVAssetExportSession`(passthrough preset, 재인코딩 없음).
  - Android: `MediaExtractor` + `MediaMuxer`(AAC 프레임 경계 복사).
- JS 인터페이스(예): `trimAudio(srcUri, start, end): Promise<string /* 새 파일 uri */>`.
- 저장 시: 실제 잘린 파일 생성 → 새 Version의 `storageUrl`로 사용. 이 경우 `trim` 메타데이터는
  불필요(기록용으로 남길 수는 있음). `editedFrom`은 유지.
- **dev build 필요**(이미 EAS dev build 구성됨). Expo Go에서는 동작하지 않으므로
  네이티브 모듈 미존재 시 가상 트림으로 graceful fallback.

---

## 3. 구현 순서(작은 단위, 각 단위 검증)
1. `lib/itunes.ts` + 단위 테스트(목 fetch: 정상/빈결과/에러).
2. `Song` 메타 확장 + `addSong` meta 인자 + 앨범아트 표시(홈/상세).
3. 검색 모달(내 곡 + 검색 결과 + 직접 추가 폴백)로 추가 플로우 교체. 홈 검색 제목+아티스트 보강.
4. `useRecording` 미터링 캡처 → `Version.waveform` 저장.
5. 풀스크린 트림 에디터 UI(파형 + 핸들 + 구간 미리듣기).
6. 가상 트림 저장(새 버전/덮어쓰기) + `PlayerContext` trim 존중.
7. 네이티브 트림 config plugin + `trimAudio` 연결(실제 자르기).

각 단계는 가능하면 헤드리스(Jest) 단위 테스트로 로직을 검증한다(순수 함수 우선 분리:
검색 파싱, trim 구간 계산, 파형 정규화 등). UI는 RNTL 컴포넌트 테스트로 핵심 상호작용 확인.

---

## 4. 테스트 전략
- `lib/itunes.ts`: fetch 목으로 파싱/에러/빈결과(단위).
- trim 구간 계산·파형 정규화: 순수 함수로 분리해 단위 테스트.
- 검색 모달: 디바운스/섹션 렌더/직접추가 폴백(RNTL).
- 트림 에디터: 핸들 이동에 따른 구간 상태, 미리듣기 시작/정지 트리거(RNTL, 오디오는 목).
- 외부 모듈(expo-audio, track-player, fetch, 네이티브 trim 모듈)은 목 처리(CLAUDE.md 규칙).

## 5. 비범위(YAGNI)
- 오늘의 추천곡/푸시, 중간 구간 삭제·분할·합치기, 페이드/볼륨, 30초 미리듣기 UI.
- 소셜 기능 전반(방/피드/릴레이/백엔드) — 별도 Phase.

## 6. 위험·전제
- 미터링 캡처 파형: 기능 도입 이후 녹음만 진짜 파형, 기존 녹음은 폴백 바(합의됨).
- expo-audio 미터링 API 가용성/필드명은 구현 단계에서 확인(미지원 시 폴백 바로 degrade).
- 가상 트림의 전역 재생 정지 정밀도는 폴링 간격에 의존(체감 가능 수준이면 충분, 정밀 컷은 2단계 네이티브).
- 네이티브 trim 컷 정밀도: AAC 프레임 경계(~21ms)면 충분(더 정밀하면 재인코딩 필요 → 비범위).
