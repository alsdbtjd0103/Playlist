# Group A 디자인: 빠른 버그 수정 3건

날짜: 2026-06-21
관련 이슈: ① PlaylistsScreen 스크롤, ② 재생중 항목 highlight, ④ 녹음 시작 아이콘 깜빡임

## 배경

사용자가 제기한 9개 작업 중 빠른 버그 3건을 한 묶음으로 처리한다. 각 버그는 독립적이며 파일도 다르다.

## 진단

### ① PlaylistsScreen 스크롤 안됨

`screens/PlaylistsScreen.tsx:180-186`의 FlatList가 `<></>` Fragment 안에 sortRow와 함께 들어있는데 FlatList에 `style={{flex: 1}}`가 없다. 부모 SafeAreaView가 `flex: 1`이어도 형제 노드가 있는 flex container에서는 명시적 flex가 필요하다. 결과: FlatList가 내용 높이만큼만 차지하고 잘리거나 스크롤이 안 됨.

### ② 재생중 항목 highlight가 index 기준

`screens/PlaylistDetailScreen.tsx:154-156`:

```typescript
const currentPlayingIndex = playlistState && playlist && playlistState.items.length === playlist.items.length
  ? playlistState.currentIndex
  : -1;
```

- length 비교로 "같은 플리 재생 중" 판정 → 우연히 같은 길이의 다른 플리도 매칭됨.
- `getSortedItems`로 정렬되거나 drag로 순서 바뀌면 `index`가 `playlistState.currentIndex`와 불일치 → 잘못된 항목 highlight.

### ④ 녹음 시작 아이콘 깜빡임 (resume 시)

`hooks/useRecording.ts:110-117`의 `resumeRecording`:

```typescript
const resumeRecording = () => {
  audioRecorder.record();
  setIsPaused(false);  // ← 즉시 호출
};
```

`audioRecorder.record()` 호출 후 `recorderState.isRecording`이 true가 되는 데는 한 tick 지연이 있다. 그 사이 `setIsPaused(false)`는 동기 실행되어 다음 렌더에서 `isRecording=false, isPaused=false`가 됨. RecorderModal의 "시작 버튼" 렌더 조건이 `!isRecording && !isPaused && !audioUri`라 이 윈도우에 깜빡임.

## 결정 사항

3건을 한 spec/plan에 묶어 처리. 파일별로 독립이라 각 task는 개별 커밋.

## 변경 설계

### A-1. FlatList flex 추가

`screens/PlaylistsScreen.tsx`:
- FlatList에 `style={styles.list}` 추가.
- `styles`에 `list: { flex: 1 }` 추가.

### A-2. versionId 기준 highlight

`screens/PlaylistDetailScreen.tsx`:
- `currentPlayingIndex` 계산을 `currentPlayingVersionId`로 교체:
  ```typescript
  const currentPlayingVersionId = playlistState
    ? playlistState.items[playlistState.currentIndex]?.version.id ?? null
    : null;
  ```
- `renderTrackItem` 내부 `isPlaying`:
  ```typescript
  const isPlaying = item.versionId === currentPlayingVersionId;
  ```
- `getIndex()` 호출은 트랙 번호 표시용으로만 유지.

**부작용**: 같은 version이 다른 플리에도 있고 그 다른 플리에서 재생 중이라면, 보는 플리에서도 그 항목이 highlight됨. 이는 "그 version이 실제 재생 중"이라는 정보로 정확하다. 더 엄격한 "같은 플리 + 같은 version" 매칭이 필요하면 `playlistState`에 `playlistId`를 추가하는 별도 작업이 필요(out of scope).

### A-3. 녹음 resume 깜빡임 제거

`hooks/useRecording.ts`:
- `resumeRecording`에서 `setIsPaused(false)` 호출 제거.
- 새 useEffect로 동기화:
  ```typescript
  useEffect(() => {
    if (recorderState.isRecording && isPaused) {
      setIsPaused(false);
    }
  }, [recorderState.isRecording, isPaused]);
  ```
- 이렇게 하면 `record()` 호출 후 `recorderState.isRecording`이 true가 된 다음 tick에 isPaused가 false로 → "둘 다 false" 윈도우 사라짐 → "시작 버튼" 안 깜빡임.

## 변경 영향 범위

| 파일 | 변경 |
|---|---|
| `screens/PlaylistsScreen.tsx` | FlatList style 1개 + StyleSheet 1줄 추가 |
| `screens/PlaylistDetailScreen.tsx` | 변수 1개 교체 + isPlaying 한 줄 변경 |
| `hooks/useRecording.ts` | setIsPaused 1줄 삭제 + useEffect 1개 추가 |

## 테스트 전략

수동 검증:
- A-1: 플레이리스트를 10개 이상 만들어 PlaylistsScreen에서 위/아래 스크롤 확인.
- A-2: 5곡 이상 플리에서 ①최신순/오래된순 정렬 후 재생중 항목이 정확히 highlight, ②drag로 재생곡을 다른 위치로 이동해도 highlight 따라감, ③다른 플리 열어도 잘못 highlight 안 됨.
- A-3: 녹음 시작 → 일시정지 → 재개를 3회 반복하며 시작 버튼이 순간적으로 보이는지 슬로우 모션 또는 육안으로 확인.

## 의도적 비포함 (out of scope)

- A-2의 "같은 플리 매칭" 엄격화 (playlistId 도입): 별도 spec.
- stopRecording의 transition flicker: 사용자가 보고한 것은 resume 케이스라 명시적으로 다룸. 만약 stop에서도 깜빡이면 같은 패턴(isStopping 플래그)으로 후속 처리.
- RecorderModal 자체 리팩토링: 조건문 복잡도가 있지만 작동 중이므로 손대지 않음.

## 다음 단계

Group A 완료 후 Group C (검색 개선)로 진행.
