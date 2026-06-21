# Group B 플레이어 통일 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SongDetail/Playlist 양쪽에서 동일한 NowPlaying 컨트롤이 보이고, wrap-around가 항상 동작하며, 이어폰 prev 버튼이 모든 기기에서 이전 곡으로 작동하도록 통일한다.

**Architecture:** react-native-track-player 단일 엔진으로 정리. dead code(PlaylistPlayer.tsx) 제거. PlayerContext의 prev/next를 try/catch 우회 대신 명시적 wrap으로 재작성. SongDetail 단일곡 재생을 "현재 곡의 모든 버전" 미니 플리로 전환하여 컨트롤 모드 분기를 자연스럽게 제거. PlaybackService에 RemoteJumpBackward 핸들러 추가.

**Tech Stack:** React Native 0.81.5, Expo 54, TypeScript, react-native-track-player ^5.0.0-alpha0, React Navigation 6.

## Global Constraints

- 사용자 결정 1: 단일곡 재생도 플리 재생과 컨트롤 **완전 동일**.
- 사용자 결정 2: wrap-around는 **repeat 모드 무관 항상 동작**.
- 사용자 결정 3: 이어폰 왼쪽 액션은 **이전 곡으로 이동**.
- 코딩 규칙: 함수형 컴포넌트, async/await, StyleSheet, try-catch 에러 핸들링 필수 (CLAUDE.md).
- 테스트 인프라 없음: jest 미설정 Expo 앱이므로 자동 테스트 없이 **수동 검증 + 컴파일 검사** 사용. TypeScript strict 모드 통과가 필수 게이트.
- 커밋 규칙: 작업 단위 한국어 커밋 메시지 (기존 history 따름).
- 한 작업 = 한 커밋 = 한 PR 단위 (브랜치 분리 없이 main에 직접 커밋, 기존 워크플로우 유지).

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `components/PlaylistPlayer.tsx` | 삭제 (dead code) | Task 1 |
| `contexts/PlayerContext.tsx` | `playNext`/`playPrevious` 명시적 wrap으로 재작성 | Task 2 |
| `services/PlaybackService.ts` | `RemoteJumpBackward` 핸들러 추가 | Task 3 |
| `screens/SongDetailScreen.tsx` | `handlePlayVersion`을 미니 플리 setPlaylist 호출로 변경 | Task 4 |

작업 순서는 위험도 오름차순: 안전한 청소(Task 1) → 기존 동작 수정(Task 2) → 추가 핸들러(Task 3) → 가장 큰 행동 변화(Task 4).

---

## Task 1: PlaylistPlayer dead code 제거

**Files:**
- Delete: `components/PlaylistPlayer.tsx`

**Interfaces:**
- Consumes: 없음
- Produces: 없음 (deletion)

**Pre-check (안전 확인):**

- [ ] **Step 1: import 0건 재확인**

Run:
```bash
grep -rn "PlaylistPlayer" --include="*.tsx" --include="*.ts" /Users/ysyss/Desktop/Development/Playlist
```
Expected: `components/PlaylistPlayer.tsx` 자기 자신만 출력. 외부 import 없음.
실패 시: 호출처가 발견되면 작업 중단하고 사용자에게 보고.

- [ ] **Step 2: 파일 삭제**

Run:
```bash
rm /Users/ysyss/Desktop/Development/Playlist/components/PlaylistPlayer.tsx
```

- [ ] **Step 3: TypeScript 컴파일 통과 확인**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npx tsc --noEmit
```
Expected: 에러 0건. (만약 tsc 명령이 없으면 `npx expo-doctor` 또는 그냥 다음 단계로)

- [ ] **Step 4: 커밋**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && git add -A && git commit -m "refactor: dead code PlaylistPlayer 컴포넌트 제거"
```

---

## Task 2: Wrap-around 명시적 구현

**Files:**
- Modify: `contexts/PlayerContext.tsx:231-253` (`playNext`, `playPrevious` 함수)

**Interfaces:**
- Consumes: `playlistState.currentIndex: number`, `playlistState.items: PlayingTrack[]` (PlayerContext 내부 상태)
- Produces:
  - `playNext: () => Promise<void>` — items.length==0 이면 noop. 마지막 인덱스에서 호출 시 첫 곡으로 wrap. 항상 play() 호출.
  - `playPrevious: () => Promise<void>` — items.length==0 이면 noop. 첫 인덱스에서 호출 시 마지막 곡으로 wrap. 항상 play() 호출.

- [ ] **Step 1: 현재 구현 확인**

Read `contexts/PlayerContext.tsx` 라인 231-253. 현재 코드는 `TrackPlayer.skipToNext()` 호출 후 catch에서 wrap을 시도하지만, skipToNext는 마지막 트랙에서 에러를 던지지 않음 → wrap이 죽은 코드.

- [ ] **Step 2: playNext / playPrevious 재작성**

`contexts/PlayerContext.tsx` 라인 231-253을 다음으로 교체:

```typescript
  const playNext = useCallback(async () => {
    if (!playlistState) return;
    const { currentIndex, items } = playlistState;
    if (items.length === 0) return;
    const nextIndex = currentIndex >= items.length - 1 ? 0 : currentIndex + 1;
    try {
      await TrackPlayer.skip(nextIndex);
      await TrackPlayer.play();
    } catch (error) {
      console.error('다음 곡 재생 실패:', error);
    }
  }, [playlistState]);

  const playPrevious = useCallback(async () => {
    if (!playlistState) return;
    const { currentIndex, items } = playlistState;
    if (items.length === 0) return;
    const prevIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    try {
      await TrackPlayer.skip(prevIndex);
      await TrackPlayer.play();
    } catch (error) {
      console.error('이전 곡 재생 실패:', error);
    }
  }, [playlistState]);
```

변경 포인트:
- `TrackPlayer.skipToNext/skipToPrevious` 제거 → 명시적 `skip(index)`.
- `repeatMode` 분기 제거 (항상 wrap, 사용자 결정).
- 빈 배열 가드 추가.
- try/catch는 wrap 분기용이 아닌 일반 에러 로깅용으로만 유지 (CLAUDE.md 에러 핸들링 규칙).

- [ ] **Step 3: TypeScript 컴파일 통과**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npx tsc --noEmit
```
Expected: 에러 0건.

- [ ] **Step 4: 수동 검증 안내 작성**

이 단계는 코드 변경이 아니라 수동 검증 체크리스트만 기록. 다음 사항을 확인하라고 다음 작업자에게 전달:

1. 2곡 이상 플리에서 첫곡 → 이전 버튼 → 마지막 곡으로 wrap 되는지.
2. 마지막곡 → 다음 버튼 → 첫곡으로 wrap 되는지.
3. 단일 항목 플리에서 prev/next → 자기 자신 유지(에러 없음).
4. 빈 플리/플리 미설정 상태에서 호출 시 콘솔 에러 없음.

이 검증은 모든 Task 완료 후 실기기 테스트에서 일괄 진행.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && git add contexts/PlayerContext.tsx && git commit -m "fix: 플레이리스트 prev/next에서 항상 wrap-around 동작하도록 수정"
```

---

## Task 3: 이어폰 RemoteJumpBackward 핸들러 추가

**Files:**
- Modify: `services/PlaybackService.ts:7-33` (PlaybackService 함수 본문에 핸들러 1개 추가)

**Interfaces:**
- Consumes: `TrackPlayer.addEventListener`, `Event.RemoteJumpBackward` (react-native-track-player)
- Produces: 없음 (side effect: 이벤트 구독 등록)

- [ ] **Step 1: PlaybackService.ts 수정**

`services/PlaybackService.ts`에서 기존 `RemoteStop` 핸들러 바로 위(라인 23 앞)에 다음 핸들러 추가:

```typescript
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, () => {
    TrackPlayer.skipToPrevious();
  });
```

변경 후 PlaybackService 함수의 전체 모양 (참고용):

```typescript
import TrackPlayer, { Event } from 'react-native-track-player';

export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    TrackPlayer.skipToNext();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    TrackPlayer.skipToPrevious();
  });

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, () => {
    TrackPlayer.skipToPrevious();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    if (event.position !== undefined) {
      await TrackPlayer.seekTo(event.position);
    }
  });
}
```

주의: `TrackPlayer.skipToPrevious()`는 wrap을 지원하지 않으므로, 이어폰 동작은 wrap 없는 단순 prev. 사용자가 첫 곡에서 이어폰 prev를 눌러도 wrap을 원하면 Task 2의 `playPrevious`를 호출하도록 추후 보강 가능 (out of scope: PlaybackService는 PlayerContext에 접근 불가).

- [ ] **Step 2: TypeScript 컴파일 통과**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npx tsc --noEmit
```
Expected: 에러 0건. `Event.RemoteJumpBackward` enum이 react-native-track-player ^5.0.0-alpha0에 정의되어 있음.

- [ ] **Step 3: 수동 검증 안내**

실기기 검증 항목 (이어폰 종류별로 다름):
1. 유선 이어폰 prev 버튼 → 이전 곡 이동.
2. AirPods triple-tap(좌) → 이전 곡 이동.
3. 일반 블루투스 이어폰 prev 버튼 → 이전 곡 이동.

시뮬레이터에서는 검증 불가. 모든 Task 완료 후 일괄 실기기 테스트.

- [ ] **Step 4: 커밋**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && git add services/PlaybackService.ts && git commit -m "fix: 이어폰 RemoteJumpBackward 이벤트를 이전 곡으로 매핑"
```

---

## Task 4: SongDetail 단일곡 재생을 미니 플리로 전환

**Files:**
- Modify: `screens/SongDetailScreen.tsx:104` (usePlayer 디스트럭처에 `setPlaylist` 추가)
- Modify: `screens/SongDetailScreen.tsx:120-124` (`handlePlayVersion` 함수 본문)

**Interfaces:**
- Consumes:
  - `usePlayer()` 훅에서 `setPlaylist: (items: PlayingTrack[], startIndex?: number) => Promise<void>` (PlayerContext에 이미 존재, line 36, 201-229).
  - `song.versions: Version[]` (SongWithVersions 타입, fetchSong에서 채워짐).
  - `Version.id: string` (시작 인덱스 계산용).
- Produces: 없음 (UI 핸들러 변경)

- [ ] **Step 1: usePlayer 디스트럭처 업데이트**

`screens/SongDetailScreen.tsx` 라인 104:

변경 전:
```typescript
  const { setCurrentTrack, expandPlayer } = usePlayer();
```

변경 후:
```typescript
  const { setPlaylist } = usePlayer();
```

`expandPlayer`는 `setPlaylist` 내부(`PlayerContext.tsx:225`)에서 `setIsExpanded(true)` 호출하므로 명시 호출 불필요. `setCurrentTrack`은 더 이상 직접 호출하지 않음.

- [ ] **Step 2: handlePlayVersion 함수 재작성**

`screens/SongDetailScreen.tsx` 라인 120-124:

변경 전:
```typescript
  const handlePlayVersion = (version: Version) => {
    if (!song) return;
    setCurrentTrack({ song, version });
    expandPlayer();
  };
```

변경 후:
```typescript
  const handlePlayVersion = (version: Version) => {
    if (!song || !song.versions || song.versions.length === 0) return;
    const items = song.versions.map((v) => ({ song, version: v }));
    const startIndex = items.findIndex((it) => it.version.id === version.id);
    setPlaylist(items, startIndex >= 0 ? startIndex : 0);
  };
```

동작:
- 현재 곡의 모든 버전을 PlayingTrack 배열로 변환.
- 클릭한 버전을 시작 인덱스로 설정.
- `setPlaylist`가 자동으로 `playlistState`를 채우고 `expandPlayer`까지 수행 → NowPlaying이 풀 컨트롤로 표시됨.
- prev/next는 같은 곡의 다른 버전으로 이동 (Task 2의 wrap도 적용됨).

- [ ] **Step 3: TypeScript 컴파일 통과**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npx tsc --noEmit
```
Expected: 에러 0건.

- [ ] **Step 4: 수동 검증 안내**

다음 시나리오를 실기기 또는 시뮬레이터에서 확인:

1. HomeScreen → 곡 진입 → 임의 버전 클릭 → NowPlaying이 펼쳐지고 prev/next/repeat/shuffle 버튼 모두 표시.
2. 버전이 2개 이상인 곡에서 next → 다른 버전으로 이동, prev로 다시 원래 버전.
3. 버전이 1개인 곡에서 next/prev → 자기 자신 유지 (Task 2 wrap-around와 결합).
4. PlaylistDetail에서 재생한 곡과 SongDetail에서 재생한 곡의 NowPlaying UI가 동일.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && git add screens/SongDetailScreen.tsx && git commit -m "feat: SongDetail 단일곡 재생을 버전 미니 플레이리스트로 전환"
```

---

## Final Verification Checklist (모든 Task 완료 후)

Task 1~4를 모두 커밋한 뒤 한 번에 실행:

- [ ] **A. TypeScript 전체 통과**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && npx tsc --noEmit
```
Expected: 에러 0건.

- [ ] **B. Expo 개발 서버 정상 부팅**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && npm start
```
Expected: Metro bundler 에러 없이 QR 코드 출력.

- [ ] **C. 시뮬레이터 수동 시나리오**

1. **B-2 (wrap-around)**: 플리 진입 → 첫곡에서 prev → 마지막 곡 이동. 마지막 곡에서 next → 첫 곡 이동.
2. **B-4 (SongDetail 미니 플리)**: HomeScreen → 곡 진입 → 임의 버전 재생 → NowPlaying에 prev/next/repeat/shuffle 모두 표시.
3. **B-4 + B-2 결합**: 버전 2개 곡에서 prev/next로 버전 간 wrap 이동.
4. **회귀**: PlaylistDetail 진입 → 정상 재생, 컨트롤 정상 표시.

- [ ] **D. 실기기 이어폰 검증 (B-3)**

가능한 이어폰으로 prev 버튼 → 이전 곡 이동 확인. 실기기 없으면 사용자에게 보고하고 스킵.

- [ ] **E. git log 확인**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && git log --oneline -5
```
Expected: Task 1~4의 4개 커밋이 순서대로 표시.

---

## 다음 단계

Group B 완료 후 사용자에게 결과 보고. 이후 Group A (빠른 버그 수정 3건: 스크롤, id 기준 highlight, 녹음 아이콘 깜빡임)으로 진행.
