# UX 개선 · UI 최신화 · 설정 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 탭/뒤로가기/재생/피드백 흐름을 고치고, plilog 브랜드 그대로 화면을 최신화하며, 설정 화면에 재생·녹음·저장 공간·정보 항목을 추가한다.

**Architecture:** 공통 기반(설정 저장소, 토스트·실행 취소, 바텀시트, 헤더, 눌림 애니메이션·햅틱, 칩, 오류·스켈레톤)을 먼저 만들고, 화면은 이 기반 위에서 서로 겹치지 않는 파일 묶음으로 나눠 고친다. 설정값은 React 밖(PlayerContext·analytics)에서도 읽을 수 있게 모듈 캐시를 둔다.

**Tech Stack:** React Native 0.81, Expo SDK 54, React Navigation 6, react-native-reanimated 4, react-native-track-player 5, expo-audio, expo-blur/haptics/keep-awake/constants(신규), Jest + RNTL v13.

**Spec:** `docs/superpowers/specs/2026-11-01-ux-modernization-settings-design.md`

## Global Constraints

- 색·폰트는 `lib/theme.ts` 토큰만 사용(새 하드코딩 색 금지, 단 투명도 rgba 오버레이 예외).
- 함수형 컴포넌트, StyleSheet, async/await + try/catch (CLAUDE.md).
- 외부 네이티브 모듈은 `jest.setup.js`에서 목 처리.
- 터치 대상 최소 44pt(또는 hitSlop).
- 모든 사용자 노출 문구는 한국어, 해요체.

## Review Focus

1. 실행 취소 대기 중 앱 종료·다른 삭제 연속 실행 → 데이터는 보존되거나 직전 삭제가 즉시 확정되어야 한다(유실·중복 삭제 없음).
2. 설정 저장값이 깨졌거나 이전 버전에 없던 키 → 기본값으로 병합되어 앱이 뜬다.
3. 저장 공간 정리 → DB가 참조하는 파일은 절대 지우지 않는다.
4. 탭 전환 시 첫 화면 리셋이 녹음 모달/편집기 같은 진행 중 작업을 날리지 않아야 한다(녹음 모달은 자체 확인, 편집기는 전체화면 모달이라 탭바가 가려짐).
5. 다크 모드에서 새 컴포넌트(블러 미니 플레이어, 플로팅 탭, 토스트, 시트) 대비가 유지된다.

---

### Task 1: 설정 저장소

**Files:** Create `lib/settings.ts`, `contexts/SettingsContext.tsx`; Test `__tests__/settings.test.ts`

**Interfaces — Produces:**
- `type AppSettings = { autoOpenPlayer: boolean; repeatMode: 'none'|'one'|'all'; skipSeconds: 5|10|15; defaultRating: number; recordingQuality: 'high'|'low'; keepAwakeWhileRecording: boolean; haptics: boolean; analytics: boolean; homeSort: 'recent'|'title'|'rating' }`
- `DEFAULT_SETTINGS: AppSettings`, `getSettings(): AppSettings`(동기 캐시), `loadSettings(): Promise<AppSettings>`, `updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>`, `subscribeSettings(fn): () => void`
- `SettingsProvider`, `useSettings(): { settings: AppSettings; update(patch): void }`

- [ ] 테스트: 저장값 없음→기본값, 깨진 JSON→기본값, 일부 키만 저장→기본값과 병합, 범위 밖 값(skipSeconds 7)→기본값, update 후 getSettings 반영·구독자 호출
- [ ] 구현 후 테스트 통과, 커밋

### Task 2: 피드백 기반(토스트·실행 취소·햅틱)

**Files:** Create `lib/haptics.ts`, `contexts/ToastContext.tsx`; Test `__tests__/ToastContext.test.tsx`; Modify `jest.setup.js`(expo-haptics/blur/keep-awake/constants 목)

**Interfaces — Produces:**
- `haptic(kind: 'light'|'medium'|'selection'|'success'|'warning'): void` (설정 haptics 꺼짐이면 무시)
- `ToastProvider`, `useToast(): { show(message: string): void; showUndo(message: string, opts: { onUndo?: () => void; onCommit: () => Promise<void> | void }): void }`
  - showUndo: 5초 뒤 onCommit. 실행 취소 누르면 onUndo만. 다른 showUndo가 오면 이전 것은 즉시 onCommit. Provider 언마운트 시 대기 중 항목은 커밋하지 않는다(보존).

- [ ] 테스트(가짜 타이머): 5초 후 커밋, 실행 취소 시 커밋 안 함, 연속 showUndo 시 이전 즉시 커밋, show 메시지 렌더
- [ ] 구현, 통과, 커밋

### Task 3: 공통 UI 컴포넌트

**Files:** Create `components/PressableScale.tsx`, `components/BottomSheet.tsx`, `components/Chip.tsx`, `components/ErrorState.tsx`, `components/Skeleton.tsx`; Rewrite `components/ScreenHeader.tsx`; Test `__tests__/ScreenHeader.test.tsx`(갱신), `__tests__/BottomSheet.test.tsx`

**Interfaces — Produces:**
- `PressableScale(props: PressableProps & { haptic?: HapticKind; scaleTo?: number })`
- `BottomSheet({ visible, onClose, title?, children })`, `SheetAction({ icon, label, onPress, destructive?, testID? })`
- `Chip({ label, selected?, onPress, icon? })`
- `ErrorState({ message?, onRetry })`
- `SkeletonList({ count?, rowHeight? })`
- `ScreenHeader({ title?, subtitle?, showWordmark?, onBack?, actions?: { icon, onPress, label, testID? }[] })`

- [ ] 테스트: 헤더 뒤로가기/액션 라벨·testID, 시트 액션 누르면 onPress 후 onClose
- [ ] 구현, 통과, 커밋

### Task 4: 탐색(탭 리셋·뒤로가기·플로팅 탭바·미니 플레이어)

**Files:** Modify `App.tsx`, `components/MiniPlayer.tsx`; Create `lib/tabNav.ts`; Test `__tests__/tabNav.test.ts`

**Interfaces — Produces:** `tabPressAction(params: { isFocused: boolean; routeName: string; rootScreen: string; nestedIndex: number | undefined }): 'none'|'navigate'|'popToRoot'|'navigateToRoot'`, `ROOT_SCREEN_BY_TAB`

- [ ] 테스트: 포커스 탭+스택 깊음→popToRoot, 포커스+루트→none, 비포커스+스택 깊음→navigateToRoot, 비포커스+루트→navigate
- [ ] App: 탭바 onPress에 적용, 스택 gestureEnabled 켜기(TrimEditor/Denoise 제외), Android 뒤로가기(비-홈 탭 루트→홈 탭), Provider 감싸기(Settings/Toast), 플로팅 pill 탭바
- [ ] MiniPlayer: 플로팅 카드 + BlurView + 앨범아트 + 진행 막대
- [ ] 통과, 커밋

### Task 5: 재생 동작

**Files:** Modify `contexts/PlayerContext.tsx`, `components/NowPlayingScreen.tsx`, `components/AudioPlayer.tsx`; Test `__tests__/PlayerContext.cuts.test.tsx`(추가 케이스)

- [ ] setPlaylist: 설정 autoOpenPlayer일 때만 확장, 반복 모드 = 한 곡이면 'none' 아니면 설정 repeatMode, 네이티브 반복 동기화. setRepeatMode는 설정에 기억.
- [ ] AudioPlayer: ±skipSeconds 버튼 항상, 셔플 제거. NowPlaying: AlbumArt, 곡으로 이동.
- [ ] 테스트: 한 곡 큐→RepeatMode.Off & 확장 안 함, autoOpenPlayer=true→확장
- [ ] 커밋

### Task 6: DB 추가(정보 수정·이름 변경·정렬·저장 공간)

**Files:** Modify `lib/database.ts`; Create `lib/sorting.ts`, `lib/storageCleanup.ts`; Test `__tests__/database.integrity.test.ts`(추가), `__tests__/sorting.test.ts`, `__tests__/storageCleanup.test.ts`

**Interfaces — Produces:** `updateSongInfo(songId, { title: string; artist?: string }): Promise<void>`, `renamePlaylist(playlistId, name): Promise<void>`, `sortSongRows<T extends SongWithVersions>(rows: T[], mode): T[]`, `scanStorage(): Promise<StorageReport>`, `cleanStorage(report): Promise<number>`; `StorageReport = { recordingsBytes: number; orphanFiles: {uri,size}[]; tempFiles: {uri,size}[]; reclaimableBytes: number }`

- [ ] 테스트 작성(빈 제목 거부, 정렬 3모드, 참조 파일 제외)
- [ ] 구현, 통과, 커밋

### Task 7: 화면 적용 — 홈·곡 검색

**Files:** Modify `screens/HomeScreen.tsx`, `components/SongSearchModal.tsx`
- [ ] 새 헤더(워드마크 + 추가), 정렬 칩(설정 homeSort), 카드 메타(버전 n개 · 상대시간), ⋮ → 바텀시트(정보 수정·삭제), 삭제는 showUndo, ErrorState/Skeleton, 검색 지우기 hitSlop

### Task 8: 화면 적용 — 곡 상세·녹음

**Files:** Modify `screens/SongDetailScreen.tsx`, `components/RecorderModal.tsx`, `hooks/useRecording.ts`
- [ ] 헤더(뒤로·제목·⋮: 정보 수정/곡 삭제), 버전 카드 인라인 별점·대표 핀·재생 중 강조, ⋮ 메뉴 → 바텀시트, 버전 삭제 showUndo, ErrorState
- [ ] 녹음: 기본 별점 설정값, 품질 설정값, 녹음 중 keep-awake, 시작/정지 햅틱

### Task 9: 화면 적용 — 플레이리스트

**Files:** Modify `screens/PlaylistsScreen.tsx`, `screens/PlaylistDetailScreen.tsx`
- [ ] 목록: 헤더, 카드 ⋮(이름 변경·삭제), 생성 후 바로 상세로 이동, 성공 Alert → 토스트, ErrorState
- [ ] 상세: 헤더(뒤로·이름·⋮), 대표곡 빈 상태 안내, 정렬을 명시적 칩, 곡 추가 시트를 검색 + FlatList, 항목 제거 showUndo, 추가 완료 토스트

### Task 10: 화면 적용 — 메모·편집기·설정·내보내기

**Files:** Modify `screens/MemoFeedScreen.tsx`, `screens/TrimEditorScreen.tsx`, `screens/SettingsScreen.tsx`, `screens/ExportScreen.tsx`, `lib/analytics.ts`
- [ ] 메모/내보내기: 새 헤더
- [ ] 편집기: 파형 폭 화면 맞춤, 저장 하나+옵션 시트, 사실대로 문구, 편집 중 닫기 확인
- [ ] 설정: 스펙 표의 모든 항목, 저장 공간 화면(스캔·정리 확인), 앱 버전·문의
- [ ] analytics: 설정 analytics=false면 전송 안 함

### Task 11: 검증

- [ ] `npx tsc --noEmit`, `npm test` 전체 통과
- [ ] 에뮬레이터: 탭 전환 시나리오, 각 화면 라이트/다크 스크린샷, 실행 취소, 설정 저장
- [ ] 전체 브랜치 리뷰(독립 리뷰어) 후 수정, 커밋
