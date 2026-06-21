# Group A 빠른 버그 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PlaylistsScreen 스크롤 복구, 재생중 항목 highlight를 versionId 기준으로, 녹음 resume 시 시작 버튼 깜빡임 제거.

**Architecture:** 세 건 모두 독립 파일 단건 수정. 각 task = 한 파일 변경 + 커밋. 새 의존성 없음.

**Tech Stack:** React Native 0.81.5, Expo 54, TypeScript, expo-audio 1.1.1.

## Global Constraints

- 코딩 규칙: 함수형 컴포넌트, async/await, StyleSheet, try-catch 에러 핸들링 (CLAUDE.md).
- 테스트 인프라: Jest + jest-expo preset + React Native Testing Library v13. 각 task 후 `npm test`로 회귀 확인.
- TypeScript 게이트: `npx tsc --noEmit`에서 내 변경으로 인한 새 에러 0.
- 한 작업 = 한 커밋 (Group B와 동일 패턴).

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `screens/PlaylistsScreen.tsx` | FlatList flex 추가 | Task 1 |
| `screens/PlaylistDetailScreen.tsx` | versionId 기준 highlight | Task 2 |
| `hooks/useRecording.ts` | resume race condition 해결 | Task 3 |

작업 순서는 위험도 오름차순: 안전한 스타일 추가 → 비교 로직 변경 → 상태 동기화 수정.

---

## Task 1: PlaylistsScreen 스크롤 복구

**Files:**
- Modify: `screens/PlaylistsScreen.tsx:180-186` (FlatList에 style 추가), `screens/PlaylistsScreen.tsx:273-277` (StyleSheet에 list 키 추가)

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (UI 버그 수정)

- [ ] **Step 1: FlatList에 style 추가**

`screens/PlaylistsScreen.tsx`의 FlatList(라인 180-186)에 `style` prop 추가:

변경 전:
```typescript
          <FlatList
            data={getSortedPlaylists(playlists)}
            renderItem={renderPlaylistCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />
```

변경 후:
```typescript
          <FlatList
            style={styles.list}
            data={getSortedPlaylists(playlists)}
            renderItem={renderPlaylistCard}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />
```

- [ ] **Step 2: StyleSheet에 list 키 추가**

`screens/PlaylistsScreen.tsx`의 StyleSheet 내부 `listContainer` 키 바로 위(라인 273 부근)에 추가:

```typescript
  list: {
    flex: 1,
  },
  listContainer: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.sm,
  },
```

- [ ] **Step 3: TypeScript 컴파일 통과**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npx tsc --noEmit 2>&1 | grep -v "^contexts/PlayerContext.tsx(84" | grep -v "^hooks/useRecording.ts(47" | grep -v "^__tests__/"
```
Expected: 출력 없음(=내 변경으로 인한 새 에러 0).

- [ ] **Step 4: 커밋**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && git add screens/PlaylistsScreen.tsx && git commit -m "fix: PlaylistsScreen FlatList에 flex 추가하여 스크롤 복구"
```

---

## Task 2: versionId 기준 재생중 highlight

**Files:**
- Modify: `screens/PlaylistDetailScreen.tsx:154-156` (`currentPlayingIndex` 변수 교체), `screens/PlaylistDetailScreen.tsx:196-198` (`isPlaying` 비교 로직)

**Interfaces:**
- Consumes: `playlistState.items[i].version.id`, `PlaylistItem.versionId` (PlaylistItem 타입에 이미 존재, line 36-43).
- Produces: 없음

- [ ] **Step 1: currentPlayingIndex를 currentPlayingVersionId로 교체**

`screens/PlaylistDetailScreen.tsx` 라인 154-156:

변경 전:
```typescript
  const currentPlayingIndex = playlistState && playlist && playlistState.items.length === playlist.items.length
    ? playlistState.currentIndex
    : -1;
```

변경 후:
```typescript
  const currentPlayingVersionId = playlistState
    ? playlistState.items[playlistState.currentIndex]?.version.id ?? null
    : null;
```

- [ ] **Step 2: renderTrackItem의 isPlaying 비교 변경**

`screens/PlaylistDetailScreen.tsx` 라인 196-198 부근:

변경 전:
```typescript
  const renderTrackItem = ({ item, getIndex, drag, isActive }: RenderItemParams<PlaylistItem>) => {
    const index = getIndex() ?? 0;
    const isPlaying = index === currentPlayingIndex;
```

변경 후:
```typescript
  const renderTrackItem = ({ item, getIndex, drag, isActive }: RenderItemParams<PlaylistItem>) => {
    const index = getIndex() ?? 0;
    const isPlaying = item.versionId === currentPlayingVersionId;
```

`index`는 트랙 번호 표시(`{index + 1}`)에 그대로 쓰이므로 유지.

- [ ] **Step 3: TypeScript 컴파일 통과**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npx tsc --noEmit 2>&1 | grep -v "^contexts/PlayerContext.tsx(84" | grep -v "^hooks/useRecording.ts(47" | grep -v "^__tests__/"
```
Expected: 출력 없음.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && git add screens/PlaylistDetailScreen.tsx && git commit -m "fix: 재생중 항목 highlight를 index가 아닌 versionId 기준으로 비교"
```

---

## Task 3: 녹음 resume 시 시작 버튼 깜빡임 제거

**Files:**
- Modify: `hooks/useRecording.ts:1` (useEffect import 확인 — 이미 있음), `hooks/useRecording.ts:110-117` (`resumeRecording` 함수), `hooks/useRecording.ts:53` 부근(새 useEffect 추가)

**Interfaces:**
- Consumes: `recorderState.isRecording: boolean` (useAudioRecorderState 반환값), `isPaused: boolean` (로컬 state).
- Produces: 없음 (race condition 수정)

- [ ] **Step 1: resumeRecording에서 setIsPaused(false) 제거**

`hooks/useRecording.ts` 라인 110-117:

변경 전:
```typescript
  const resumeRecording = () => {
    try {
      audioRecorder.record();
      setIsPaused(false);
    } catch (error) {
      console.error('녹음 재개 실패:', error);
    }
  };
```

변경 후:
```typescript
  const resumeRecording = () => {
    try {
      audioRecorder.record();
    } catch (error) {
      console.error('녹음 재개 실패:', error);
    }
  };
```

- [ ] **Step 2: recorder 상태 동기화 useEffect 추가**

`hooks/useRecording.ts`의 기존 오디오 모드 설정 useEffect(라인 41-53) 바로 뒤에 새 useEffect 추가:

```typescript
  // recorder가 실제로 녹음 중이 되면 isPaused를 false로 동기화
  // (race condition 방지: record() 호출 직후 isRecording이 true가 되기 전에
  //  setIsPaused(false)를 호출하면 두 플래그 모두 false인 윈도우가 생겨
  //  UI가 "시작 버튼"으로 잠시 깜빡임)
  useEffect(() => {
    if (recorderState.isRecording && isPaused) {
      setIsPaused(false);
    }
  }, [recorderState.isRecording, isPaused]);
```

- [ ] **Step 3: TypeScript 컴파일 통과**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npx tsc --noEmit 2>&1 | grep -v "^contexts/PlayerContext.tsx(84" | grep -v "^hooks/useRecording.ts(47" | grep -v "^__tests__/"
```
Expected: 출력 없음.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && git add hooks/useRecording.ts && git commit -m "fix: 녹음 resume 시 시작 버튼이 잠시 보이는 race condition 제거"
```

---

## Final Verification

Task 1~3 모두 커밋 후:

- [ ] **A. 전체 typecheck**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npx tsc --noEmit
```
Expected: pre-existing 에러 외에 새 에러 0건.

- [ ] **A-2. Jest 회귀 테스트**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npm test
```
Expected: 모든 테스트 통과.

- [ ] **B. git log 확인**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && git log --oneline -5
```
Expected: Task 1~3의 3개 fix 커밋이 최상단.

- [ ] **C. 시뮬레이터 수동 시나리오 (사용자가 직접 확인)**

1. **A-1**: 플레이리스트 10개 이상에서 위/아래 스크롤 → 정상 스크롤.
2. **A-2**: 5곡 플리에서 ①정렬 변경 후 highlight 정확, ②drag로 재생곡 이동 시 highlight 따라감, ③다른 플리 열어도 잘못 highlight 안 됨.
3. **A-3**: 녹음 시작 → 일시정지 → 재개 3회 반복. 재개 순간 "시작 마이크 버튼" 깜빡임 없음.

---

## 다음 단계

Group A 완료 후 Group C (검색 trim + 한글 초성 검색)로 진행.
