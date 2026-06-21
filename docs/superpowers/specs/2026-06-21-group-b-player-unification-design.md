# Group B 디자인: 플레이어 통일 및 컨트롤 일관성

날짜: 2026-06-21
관련 이슈: ⑤ wrap-around, ⑥ 이어폰 이전곡, ⑨ NowPlaying 컨트롤 통일

## 배경

사용자가 제기한 9개 작업 중 3개(⑤⑥⑨)는 모두 플레이어 아키텍처와 관련된다. 코드 탐색 결과:

- 두 오디오 엔진(react-native-track-player, expo-audio) 혼용 신화는 실제로는 거의 사라진 상태.
  - `PlayerContext`와 `AudioPlayer`는 TrackPlayer 사용.
  - `PlaylistPlayer.tsx`(expo-audio)는 import 0건으로 dead code.
- `SongDetailScreen`(단일곡 재생)과 `PlaylistDetailScreen`(플리 재생) 모두 동일한 `NowPlayingScreen` 컴포넌트를 사용함. 차이는 `playlistState` 유무에 따른 **컨트롤 모드 분기**(prev/next/repeat/shuffle 표시 여부)뿐.
- wrap-around는 두 곳에 이중 구현되어 있으나, `TrackPlayer.skipToNext()`가 마지막 트랙에서 에러를 던지지 않아 `catch` 블록의 wrap 코드가 실행되지 않음(죽은 코드).

## 결정 사항 (사용자 합의)

1. 단일곡 재생도 플리 재생과 컨트롤이 **완전 동일**해야 함.
2. wrap-around는 **repeat 모드 무관 항상 동작**.
3. 이어폰 왼쪽 액션은 **이전 곡으로 이동**.

## 변경 설계

### B-1. Dead code 제거

- `components/PlaylistPlayer.tsx` 삭제.
- 검증: `grep -rn "PlaylistPlayer"` 결과 컴포넌트 파일 자신을 제외하면 0건.

### B-2. 단일곡 진입도 "미니 플레이리스트"로 (⑨ 해결)

`screens/SongDetailScreen.tsx`의 `handlePlayVersion`:

- 변경 전: `setCurrentTrack({ song, version })` 호출 → `playlistState === null` → NowPlaying에서 prev/next/repeat/shuffle 미표시.
- 변경 후: 현재 곡의 모든 버전을 `PlayingTrack[]`로 묶어 `setPlaylist(items, selectedIndex)` 호출.
  - 결과: NowPlaying이 항상 풀 컨트롤로 표시됨.
  - 부가 효과: prev/next로 같은 곡의 다른 버전 간 이동 가능. 사용 의미 있음(자기 노래의 여러 녹음 비교).

의사 코드:

```typescript
const handlePlayVersion = (version: Version) => {
  if (!song || !song.versions) return;
  const items = song.versions.map((v) => ({ song, version: v }));
  const startIndex = items.findIndex((it) => it.version.id === version.id);
  setPlaylist(items, startIndex >= 0 ? startIndex : 0);
  expandPlayer();
};
```

### B-3. Wrap-around 항상 동작 (⑤ 해결)

`contexts/PlayerContext.tsx`의 `playNext`/`playPrevious` 재작성:

```typescript
const playNext = useCallback(async () => {
  if (!playlistState) return;
  const { currentIndex, items } = playlistState;
  if (items.length === 0) return;
  const nextIndex = currentIndex >= items.length - 1 ? 0 : currentIndex + 1;
  await TrackPlayer.skip(nextIndex);
  await TrackPlayer.play();
}, [playlistState]);

const playPrevious = useCallback(async () => {
  if (!playlistState) return;
  const { currentIndex, items } = playlistState;
  if (items.length === 0) return;
  const prevIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
  await TrackPlayer.skip(prevIndex);
  await TrackPlayer.play();
}, [playlistState]);
```

- `TrackPlayer.skipToNext/Previous` 사용 중단(에러 안 던져서 wrap 분기 실행 안 됨).
- `repeatMode` 체크 제거(사용자 결정: 항상 wrap).
- 트랙 변경 이벤트 리스너(`Event.PlaybackActiveTrackChanged`)가 `currentIndex`를 동기화하므로 별도 상태 업데이트 불필요.

### B-4. 이어폰 이전곡 보강 (⑥ 해결)

`services/PlaybackService.ts`에 핸들러 추가:

```typescript
TrackPlayer.addEventListener(Event.RemoteJumpBackward, () => {
  TrackPlayer.skipToPrevious();
});
```

- 기존 `RemotePrevious` 핸들러 유지.
- 일부 블루투스 이어폰이 prev 버튼에 `RemoteJumpBackward`를 보내는 케이스 커버.
- `capabilities`는 그대로(잠금화면에 별도 jump 버튼 노출하지 않음).

## 변경 영향 범위

| 파일 | 변경 종류 | 변경 양 |
|---|---|---|
| `components/PlaylistPlayer.tsx` | 삭제 | -397 lines |
| `screens/SongDetailScreen.tsx` | `handlePlayVersion` 함수 1개 수정, `usePlayer`에서 `setPlaylist` 추가 import | ~10 lines |
| `contexts/PlayerContext.tsx` | `playNext`/`playPrevious` 2개 함수 재작성 | ~20 lines |
| `services/PlaybackService.ts` | 핸들러 1개 추가 | +3 lines |

## 테스트 전략

이 프로젝트는 jest 설정이 없는 Expo 앱이며 UI 단위 테스트가 부재함. 수동 검증 체크리스트:

- **B-2**: HomeScreen → 곡 진입 → 임의 버전 재생 → NowPlaying에서 prev/next 버튼이 표시되고, 같은 곡의 다른 버전으로 이동하는지.
- **B-3**: 2곡 이상 플레이리스트에서 ①첫곡 prev → 마지막곡, ②마지막곡 next → 첫곡, ③단일 항목 플리에서 prev/next → 자기 자신 유지.
- **B-4**: 실기기(시뮬레이터 X)에서 유선/무선 이어폰의 prev 버튼이 이전 곡으로 이동하는지 확인.

## 의도적 비포함 (out of scope)

- expo-audio 의존성 자체 제거: 다른 곳에서 쓰일 가능성 있음. 추후 별도 정리.
- repeat=one 모드 동작 변경: 사용자 결정은 wrap 정책만이며, 곡 단위 반복 동작은 현재 유지.
- 백그라운드 자동 재생 큐 관리, Audio Session 카테고리 등 OS 레벨 동작: 별도 그룹 작업.

## 다음 단계

이 디자인 승인 후 writing-plans 스킬로 단계별 구현 계획을 작성한다.
