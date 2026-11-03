# UX 개선 · UI 최신화 · 설정 확장 설계

## 목적

쓰다가 헷갈리거나 불편한 흐름을 없애고(탭·뒤로가기·재생·피드백), plilog 코지 웜 브랜드는 유지한 채 2025~26년 앱다운 화면으로 갱신하며, 설정에서 자주 바꾸고 싶은 값을 직접 고를 수 있게 한다.

## 확정 사항 (브레인스토밍)

- UI 방향: **브랜드 유지 + 모던화.** `lib/theme.ts`의 색·폰트 토큰은 그대로 쓰고, 레이아웃과 컴포넌트를 바꾼다.
- 탭 동작: 다른 탭에서 돌아오거나 현재 탭을 다시 누르면 **항상 그 탭의 첫 화면**으로 간다(사용자가 예로 든 플레이리스트 문제).
- 재생을 시작해도 전체화면 플레이어는 **자동으로 열지 않는다**(설정으로 켤 수 있음).
- 셔플 버튼은 동작하지 않으므로 **제거**한다. 휴지통(30일 보관)은 이번 범위에서 제외한다.
- 네이티브 의존성 추가 허용: `expo-blur`, `expo-haptics`, `expo-keep-awake`, `expo-constants`(앱 버전 표시). 다음 배포에서 어차피 다시 빌드한다.

## 단계

세 단계로 나눠 각각 커밋한다. 단계마다 `npm test`와 `tsc`를 통과시키고, 마지막에 에뮬레이터에서 화면을 확인한다.

### A. 사용 흐름(UX)

**탐색 (`App.tsx`)**
- 탭을 누를 때 대상 탭의 스택이 첫 화면이 아니면 `navigate(tab, { screen: <root> })`로 첫 화면으로 보낸다. 현재 탭을 다시 눌러도 같다.
- 곡 상세·플레이리스트 상세 헤더에 뒤로가기 버튼과 제목을 둔다. 스택의 `gestureEnabled`를 켠다(편집기 같은 전체화면 모달은 끈 채 유지).
- Android 뒤로가기: 노래가 아닌 탭의 첫 화면에서는 종료를 묻지 않고 노래 탭으로 이동한다.

**재생 (`contexts/PlayerContext.tsx`, `components/NowPlayingScreen.tsx`, `components/MiniPlayer.tsx`, `components/AudioPlayer.tsx`)**
- `setPlaylist`는 설정값 `autoOpenPlayer`가 켜져 있을 때만 전체화면을 연다.
- 반복 모드: 마지막으로 고른 모드를 기억(설정 저장소)하고, 한 곡짜리 큐는 `none`으로 시작한다.
- 이전/다음 옆에 ±N초(설정값 5/10/15) 버튼을 항상 둔다. 셔플 버튼 제거.
- 미니 플레이어·전체 플레이어에 `AlbumArt`를 쓴다. 전체 플레이어 헤더에 "곡으로 이동" 버튼.

**피드백 (신규 `components/Toast.tsx` + `contexts/ToastContext.tsx`)**
- 앱 공통 토스트/스낵바. `show(message)`와 `showUndo(message, onUndo)`(5초).
- 성공 Alert(플레이리스트 생성, 곡 추가, 복원 완료 등)를 토스트로 바꾼다.
- 곡·버전·플레이리스트 항목 삭제: 확인 창 없이 화면에서 바로 빼고 스낵바를 띄운다. 5초 안에 실행 취소하지 않으면 실제로 지운다. 곡 삭제는 녹음 파일까지 지우므로 이 방식이 특히 중요하다.

**버전 카드 (`screens/SongDetailScreen.tsx`)**
- 카드의 별을 눌러 바로 별점을 바꾼다. 대표 버전 핀 버튼을 카드에 노출한다.
- ⋮ 메뉴를 바텀시트(신규 `components/BottomSheet.tsx`)로 바꾼다(화면 밖으로 잘리던 문제).
- 재생 중인 버전을 강조한다.

**기타**
- `lib/database.ts`에 `updateSongInfo(songId, {title, artist})`, `renamePlaylist(id, name)` 추가. 곡 상세·플레이리스트 상세 헤더 ⋮, 플레이리스트 카드 ⋮에서 사용(이름 변경·삭제).
- 홈: 정렬 칩(최근 녹음/제목/별점, 설정에 기억) + 카드 메타("버전 3개 · 3일 전").
- 불러오기 실패 시 "다시 시도" 화면(신규 `components/ErrorState.tsx`)을 홈·플레이리스트·곡 상세·플레이리스트 상세에 적용.
- 편집기: 파형 폭을 `useWindowDimensions`로, 저장을 "저장" 하나 + 옵션 시트(새 버전/이 버전에 적용/실제로 잘라 새 파일)로 정리, 문구를 사실대로("원본 파일은 그대로 두고 편집 구간만 바뀝니다"), 편집 내용이 있을 때 닫으면 확인.
- 탭 대상이 44pt 미만인 버튼에 `hitSlop` 또는 크기 보정.

### B. UI 최신화

- 공통 헤더 `components/ScreenHeader.tsx` 재작성: `title`(큰 볼드), `onBack`, `actions` props. 홈은 plilog 워드마크 유지. 모든 화면이 이 헤더를 쓴다. Playlists의 잘못된 접근성 라벨(`곡 추가`) 수정.
- 하단 탭: 화면 가장자리에서 띄운 둥근 pill 형태(플로팅), 선택 탭은 accent 배경 칩.
- 미니 플레이어: 탭 위에 떠 있는 둥근 카드, `expo-blur` 반투명 배경, 하단 얇은 진행 막대.
- 카드 반경 `borderRadius.xl` 이상, 그림자 대신 얇은 경계 + 살짝 띄운 surface.
- 공통 `components/PressableScale.tsx`: 누를 때 0.97로 줄어드는 스프링(reanimated) + 햅틱(설정에서 끌 수 있음).
- 칩(`components/Chip.tsx`): 홈 정렬, 플레이리스트 정렬에 사용.
- 스켈레톤(`components/Skeleton.tsx`): 목록 첫 로딩에 사용.

### C. 설정 (`screens/SettingsScreen.tsx`, 신규 `contexts/SettingsContext.tsx`)

설정값은 AsyncStorage `@settings` 하나에 JSON으로 저장하고, 기본값과 병합해 읽는다.

| 섹션 | 항목 | 키 | 기본값 |
|---|---|---|---|
| 화면 | 테마 시스템/라이트/다크 (헤더 토글 제거) | `ThemeContext` 기존 저장 사용 | 시스템 |
| 재생 | 재생 시 전체화면 열기 | `autoOpenPlayer` | false |
| 재생 | 기본 반복 모드 | `repeatMode` | `all` |
| 재생 | 건너뛰기 간격 5/10/15초 | `skipSeconds` | 10 |
| 녹음 | 새 녹음 기본 별점 | `defaultRating` | 3 |
| 녹음 | 녹음 품질 고음질/저용량 | `recordingQuality` | `high` |
| 녹음 | 녹음 중 화면 켜짐 유지 | `keepAwakeWhileRecording` | true |
| 일반 | 햅틱 | `haptics` | true |
| 일반 | 사용 통계 전송 | `analytics` | true |
| 저장 공간 | 녹음 용량 표시 · 임시/고아 파일 정리 | — | — |
| 정보 | 앱 버전, 문의하기(mailto) | — | — |

- 저장 공간 정리: `recordings/` 아래에서 어떤 버전도 참조하지 않는 파일, 캐시의 녹음·편집 임시 파일과 오래된 백업 zip을 지운다. 지우기 전에 개수와 용량을 보여 주고 확인받는다.
- 사용 통계 끄기: `lib/analytics.ts`의 전송 전에 설정값을 확인한다.
- 녹음 품질: `useRecording`의 프리셋을 `HIGH_QUALITY`/`LOW_QUALITY`로 고른다.

## 오류 처리

- 설정 읽기 실패나 형식 오류는 기본값으로 동작한다(앱이 뜨지 않는 일이 없게).
- 실행 취소 대기 중에 앱이 종료되면 삭제는 일어나지 않는다(데이터 보존 쪽으로 실패).
- 저장 공간 정리는 DB가 참조하는 파일을 절대 지우지 않는다. 참조 판정은 `@versions`의 `storageUrl` 전체 집합으로 한다.

## 테스트

- 순수 로직은 유닛 테스트: 설정 병합/기본값, 정렬 함수, 고아 파일 판정, 실행 취소 지연 삭제, `updateSongInfo`/`renamePlaylist`.
- 컴포넌트 테스트: 탭 재클릭 시 첫 화면 이동 로직(탭바 onPress), 실행 취소 스낵바, 설정 화면 토글 저장.
- 에뮬레이터: 탭 이동 시나리오(사용자 보고 케이스), 플로팅 탭·미니 플레이어 화면, 설정 화면, 다크 모드.

## 범위 밖

휴지통, 셔플 구현, 플레이리스트 공유, 아이콘/스토어 이미지 갱신.
