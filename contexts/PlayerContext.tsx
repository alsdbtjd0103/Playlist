import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react';
import TrackPlayer, {
  State,
  Event,
  usePlaybackState,
  RepeatMode,
  Capability,
  AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import { Song, Version } from '../types';
import { getEffectiveCuts, nextKeepStart, cutPlaybackAction } from '../lib/trim';
import { planQueueSync } from '../lib/queueNav';
import { skipWrapped, runQueueOp } from '../services/queueControl';
import { onVersionUpdated, onVersionsRemoved } from '../lib/playbackStore';
import { getSettings, updateSettings } from '../lib/settings';

/** 버전의 첫 재생 시작 지점(첫 남길 구간의 시작). cuts/레거시 trim 모두 대응. */
const playStartOf = (version: Version): number => {
  const dur = version.duration || 0;
  if (dur <= 0) return 0;
  const cuts = getEffectiveCuts(version, dur);
  if (cuts.length === 0) return 0;
  return nextKeepStart(0, cuts, dur) ?? 0;
};

export interface PlayingTrack {
  song: Song;
  version: Version;
  versionNumber?: number;
}

interface PlaylistState {
  items: PlayingTrack[];
  currentIndex: number;
  repeatMode: 'none' | 'one' | 'all';
  // 큐를 만든 출처(플레이리스트 id). 같은 출처의 순서 변경을 재생 중인 큐에 반영할 때 사용.
  sourceId?: string;
}

interface PlayerContextType {
  currentTrack: PlayingTrack | null;
  isPlaying: boolean;
  isExpanded: boolean;
  playlistState: PlaylistState | null;
  setCurrentTrack: (track: PlayingTrack | null) => void;
  setIsPlaying: (playing: boolean) => void;
  expandPlayer: () => void;
  minimizePlayer: () => void;
  closePlayer: () => void;
  setPlaylist: (items: PlayingTrack[], startIndex?: number, sourceId?: string) => void;
  syncQueue: (sourceId: string, items: PlayingTrack[]) => void;
  playNext: () => void;
  playPrevious: () => void;
  setRepeatMode: (mode: 'none' | 'one' | 'all') => void;
  handleTrackEnd: () => void;
  togglePlayPause: () => void;
  seekTo: (seconds: number) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

let isPlayerSetup = false;

const cutsOf = (version: Version) => {
  const dur = version.duration || 0;
  return dur > 0 ? getEffectiveCuts(version, dur) : [];
};

const toNativeRepeat = (mode: 'none' | 'one' | 'all'): RepeatMode =>
  mode === 'one' ? RepeatMode.Track : mode === 'all' ? RepeatMode.Queue : RepeatMode.Off;

const toTrack = (item: PlayingTrack) => ({
  id: item.version.id,
  url: item.version.storageUrl,
  title: item.song.title,
  artist: item.song.artist || '알 수 없는 아티스트',
  duration: item.version.duration,
});

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrackState] = useState<PlayingTrack | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [playlistState, setPlaylistStateRaw] = useState<PlaylistState | null>(null);
  const [isReady, setIsReady] = useState(false);

  // 이벤트 리스너가 항상 최신 재생목록을 보도록 ref로도 보관 (리스너 재구독 사이의 이벤트 유실 방지)
  const playlistRef = useRef<PlaylistState | null>(null);
  const activeIdRef = useRef<string | null>(null);
  // setPlaylist 가 큐를 새로 채우는 동안, 목표 곡이 아닌 곡의 트랙 변경 이벤트(add 직후 0번 곡 등)는
  // 무시한다. 그러지 않으면 엉뚱한 곡 제목이 잠깐 뜨고 그 곡의 시작 위치로 seek 되어 버린다.
  const pendingIdRef = useRef<string | null>(null);
  // 편집 구간(cut) 처리 상태: 곡이 바뀐 직후 진행값은 이전 곡 위치일 수 있어, 남길 구간 안의
  // 위치를 한 번 확인(armed)한 뒤에만 판단한다. ended 는 같은 곡 끝 처리를 한 번만 하기 위함.
  const cutStateRef = useRef<{ id: string | null; armed: boolean; ended: boolean }>({
    id: null,
    armed: false,
    ended: false,
  });

  const setPlaylistState = useCallback((next: PlaylistState | null) => {
    playlistRef.current = next;
    setPlaylistStateRaw(next);
  }, []);

  // 원격 명령(PlaybackService)과 같은 줄을 써서 큐 조작이 서로 끼어들지 않게 한다
  const runExclusive = useCallback(<T,>(op: () => Promise<T>): Promise<T> => runQueueOp(op), []);

  const playbackState = usePlaybackState();
  const isPlaying = playbackState.state === State.Playing;

  // TrackPlayer 초기화
  useEffect(() => {
    async function setupPlayer() {
      if (isPlayerSetup) {
        setIsReady(true);
        return;
      }

      try {
        // androidWakeMode 1(WAKE_MODE_LOCAL): 화면이 꺼진 뒤 기기 절전으로 재생이 끊기지 않게 한다.
        // 타입 정의에는 없지만 네이티브(MusicService)가 읽는 옵션이다.
        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: true,
          androidWakeMode: 1,
        } as Parameters<typeof TrackPlayer.setupPlayer>[0]);
      } catch (error: any) {
        // JS 리로드 등으로 네이티브 플레이어가 이미 살아 있으면 그대로 사용한다
        if (!String(error?.message ?? error).includes('already been initialized')) {
          console.error('TrackPlayer 초기화 실패:', error);
          return;
        }
      }

      try {
        await TrackPlayer.updateOptions({
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.Stop,
            Capability.SeekTo,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          notificationCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
          ],
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          },
          // 편집 구간 건너뛰기를 네이티브 진행 이벤트로 처리한다. JS 타이머(useProgress)는
          // Android 에서 화면이 꺼지면 멈춰, 잠금 상태에서 잘라낸 구간이 그대로 재생됐다.
          progressUpdateEventInterval: 0.25,
        });

        isPlayerSetup = true;
        setIsReady(true);
      } catch (error) {
        console.error('TrackPlayer 옵션 설정 실패:', error);
      }
    }

    setupPlayer();
  }, []);

  // 큐 끝 도달 → 전체 반복이면 처음으로 (네이티브 반복 모드와 어긋난 경우의 안전망)
  useEffect(() => {
    const subscription = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
      const state = playlistRef.current;
      if (state?.repeatMode === 'all' && state.items.length > 0) {
        try {
          await TrackPlayer.skip(0, playStartOf(state.items[0].version));
          await TrackPlayer.play();
        } catch (error) {
          console.error('처음 곡 재생 실패:', error);
        }
      }
    });

    return () => subscription.remove();
  }, []);

  // 재생할 수 없는 파일(지워졌거나 비어 있는 녹음)에서 큐 전체가 멈추지 않도록 다음 곡으로 넘긴다.
  // 모든 곡이 연달아 실패하면 무한히 돌지 않게 멈춘다.
  const errorStreakRef = useRef(0);
  useEffect(() => {
    const subscription = TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
      console.error('재생 오류:', event.code, event.message);
      const state = playlistRef.current;
      if (!state || state.items.length <= 1) return;
      errorStreakRef.current += 1;
      if (errorStreakRef.current >= state.items.length) return;
      runQueueOp(() => skipWrapped(1)).catch((e) => console.error('다음 곡으로 넘기기 실패:', e));
    });
    return () => subscription.remove();
  }, []);

  // 편집 구간(cut) 건너뛰기 + 마지막 남길 구간 끝 처리. 화면이 꺼져도 오는 네이티브 진행 이벤트로 판단한다.
  useEffect(() => {
    const subscription = TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
      if (event.position > 0) errorStreakRef.current = 0; // 정상 재생 중이면 오류 연속 횟수 초기화
      const state = playlistRef.current;
      const trackId = activeIdRef.current;
      if (!state || !trackId || pendingIdRef.current) return;
      const item = state.items.find((it) => it.version.id === trackId);
      if (!item) return;
      const cuts = cutsOf(item.version);
      if (cuts.length === 0) return;

      const cut = cutStateRef.current;
      if (cut.id !== trackId) {
        cutStateRef.current = { id: trackId, armed: false, ended: false };
      }
      const dur = item.version.duration || 0;
      const action = cutPlaybackAction(event.position, cuts, dur);
      const st = cutStateRef.current;
      if (!st.armed) {
        if (action.type === 'none') st.armed = true;
        return;
      }
      if (action.type === 'none') {
        // 남길 구간 안으로 돌아왔으면(슬라이더로 되감기 등) 끝 처리를 다시 할 수 있게 한다
        st.ended = false;
        return;
      }
      if (action.type === 'seek') {
        TrackPlayer.seekTo(action.to).catch(() => undefined);
        return;
      }
      if (st.ended) return;
      st.ended = true;
      const index = state.items.findIndex((it) => it.version.id === trackId);
      const isLast = index === state.items.length - 1;
      if (state.repeatMode === 'one') {
        st.ended = false;
        TrackPlayer.seekTo(playStartOf(item.version)).catch(() => undefined);
      } else if (state.repeatMode === 'none' && isLast) {
        TrackPlayer.pause().catch(() => undefined);
      } else {
        runQueueOp(() => skipWrapped(1)).catch((e) => console.error('다음 곡 재생 실패:', e));
      }
    });

    return () => subscription.remove();
  }, []);

  // 삭제된 버전을 큐에서 뺀다. 지금 재생 중인 곡이면 플레이어를 닫는다(파일이 지워져 멈추므로).
  useEffect(
    () =>
      onVersionsRemoved((versionIds) => {
        const removed = new Set(versionIds);
        const state = playlistRef.current;
        if (!state || !state.items.some((it) => removed.has(it.version.id))) return;
        runQueueOp(async () => {
          try {
            const current = playlistRef.current;
            if (!current) return;
            if (activeIdRef.current && removed.has(activeIdRef.current)) {
              await TrackPlayer.reset();
              activeIdRef.current = null;
              setCurrentTrackState(null);
              setIsExpanded(false);
              setPlaylistState(null);
              return;
            }
            const queue = await TrackPlayer.getQueue();
            const indexes = queue.map((t, i) => (removed.has(t.id as string) ? i : -1)).filter((i) => i >= 0);
            if (indexes.length > 0) await TrackPlayer.remove(indexes);
            const items = current.items.filter((it) => !removed.has(it.version.id));
            const currentIndex = Math.max(0, items.findIndex((it) => it.version.id === activeIdRef.current));
            setPlaylistState({ ...current, items, currentIndex });
          } catch (error) {
            console.error('삭제된 곡을 큐에서 빼지 못함:', error);
          }
        });
      }),
    [setPlaylistState]
  );

  // 편집기에서 cuts 를 저장하면 재생 중인 큐의 버전 정보도 바꿔, 바뀐 구간을 바로 건너뛰게 한다
  useEffect(
    () =>
      onVersionUpdated((version) => {
        const state = playlistRef.current;
        if (state?.items.some((it) => it.version.id === version.id)) {
          setPlaylistState({
            ...state,
            items: state.items.map((it) => (it.version.id === version.id ? { ...it, version } : it)),
          });
        }
        setCurrentTrackState((current) =>
          current && current.version.id === version.id ? { ...current, version } : current
        );
      }),
    [setPlaylistState]
  );

  // 트랙 변경 → 현재 곡/인덱스 갱신. 인덱스가 아니라 트랙 id로 찾는다
  // (큐 재정렬 중에는 같은 곡의 인덱스만 바뀔 수 있으므로).
  useEffect(() => {
    const subscription = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
      const state = playlistRef.current;
      const trackId = event.track?.id as string | undefined;
      if (!state || !trackId) return;
      if (pendingIdRef.current && trackId !== pendingIdRef.current) return;
      const index = state.items.findIndex((it) => it.version.id === trackId);
      if (index === -1) return;

      const newTrack = state.items[index];
      // 같은 곡이 반복 재생된 경우(한 곡 반복, 한 곡짜리 전체 반복)도 시작 위치로 보내야 한다
      const repeated = event.lastTrack?.id === trackId && activeIdRef.current === trackId;
      const trackChanged = activeIdRef.current !== trackId;
      activeIdRef.current = trackId;
      if (state.currentIndex !== index) {
        setPlaylistState({ ...state, currentIndex: index });
      }
      if (!trackChanged && !repeated) return;
      cutStateRef.current = { id: trackId, armed: false, ended: false };

      setCurrentTrackState(newTrack);
      const startAt = playStartOf(newTrack.version);
      if (startAt > 0) {
        try {
          await TrackPlayer.seekTo(startAt);
        } catch (error) {
          console.error('편집 시작 위치 이동 실패:', error);
        }
      }
    });

    return () => subscription.remove();
  }, [setPlaylistState]);

  const setCurrentTrack = useCallback(async (track: PlayingTrack | null) => {
    if (!isReady) return;

    await runExclusive(async () => {
      if (!track) {
        await TrackPlayer.reset();
        activeIdRef.current = null;
        setCurrentTrackState(null);
        return;
      }

      try {
        await TrackPlayer.reset();
        activeIdRef.current = track.version.id;
        await TrackPlayer.add(toTrack(track));
        await TrackPlayer.play();
        const startAt = playStartOf(track.version);
        if (startAt > 0) { await TrackPlayer.seekTo(startAt); }
        setCurrentTrackState(track);
      } catch (error) {
        console.error('트랙 설정 실패:', error);
      }
    });
  }, [isReady, runExclusive]);

  const togglePlayPause = useCallback(async () => {
    try {
      if (isPlaying) {
        await TrackPlayer.pause();
        return;
      }
      const state = playlistRef.current;
      if (playbackState.state === State.Ended && state && state.items.length > 0) {
        // 큐가 끝난 뒤 플레이어는 '종료' 상태라 play() 만으로는 아무 일도 일어나지 않는다
        await runExclusive(() => TrackPlayer.skip(0, playStartOf(state.items[0].version)));
      } else {
        // 편집된 곡의 끝(잘라낸 꼬리)에서 멈춘 경우: 잘라낸 부분을 재생하지 말고 곡 처음으로
        const item = state?.items.find((it) => it.version.id === activeIdRef.current);
        if (item) {
          const cuts = cutsOf(item.version);
          const { position } = await TrackPlayer.getProgress();
          if (cuts.length > 0 && nextKeepStart(position, cuts, item.version.duration || 0) === null) {
            await TrackPlayer.seekTo(playStartOf(item.version));
          }
        }
      }
      await TrackPlayer.play();
    } catch (error) {
      console.error('재생/일시정지 실패:', error);
    }
  }, [isPlaying, playbackState.state, runExclusive]);

  const seekTo = useCallback(async (seconds: number) => {
    try {
      await TrackPlayer.seekTo(seconds);
    } catch (error) {
      console.error('탐색 실패:', error);
    }
  }, []);

  const expandPlayer = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const minimizePlayer = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const closePlayer = useCallback(async () => {
    await runExclusive(async () => {
      try {
        await TrackPlayer.reset();
      } catch (error) {
        console.error('플레이어 종료 실패:', error);
      }
      activeIdRef.current = null;
      setCurrentTrackState(null);
      setIsExpanded(false);
      setPlaylistState(null);
    });
  }, [runExclusive, setPlaylistState]);

  const setPlaylist = useCallback(async (items: PlayingTrack[], startIndex = 0, sourceId?: string) => {
    if (!isReady || items.length === 0) return;

    await runExclusive(async () => {
      try {
        // 새 큐의 이벤트가 이전 목록으로 해석되지 않도록 상태를 먼저 교체한다
        const startItem = items[startIndex] ?? items[0];
        // 한 곡만 재생할 때는 무한 반복하지 않는다. 여러 곡이면 마지막으로 고른 반복 모드를 쓴다.
        const repeatMode = items.length === 1 ? 'none' : getSettings().repeatMode;
        setPlaylistState({ items, currentIndex: startIndex, repeatMode, sourceId });
        pendingIdRef.current = startItem.version.id;
        activeIdRef.current = startItem.version.id;
        cutStateRef.current = { id: startItem.version.id, armed: false, ended: false };
        setCurrentTrackState(startItem);

        await TrackPlayer.reset();
        // 반복 모드는 reset 으로 초기화되지 않아 이전 큐의 '한 곡 반복'이 남는다. 화면 표시와 맞춘다.
        await TrackPlayer.setRepeatMode(toNativeRepeat(repeatMode));
        await TrackPlayer.add(items.map(toTrack));
        // 곡 이동과 시작 위치 이동을 한 번에(따로 seek 하면 다른 곡에 적용될 수 있다)
        await TrackPlayer.skip(startIndex, playStartOf(startItem.version));
        await TrackPlayer.play();

        // 곡을 누를 때마다 전체화면이 덮지 않게, 설정에서 켠 경우에만 펼친다(기본은 미니 플레이어만)
        if (getSettings().autoOpenPlayer) setIsExpanded(true);
      } catch (error) {
        console.error('플레이리스트 설정 실패:', error);
      } finally {
        pendingIdRef.current = null;
      }
    });
  }, [isReady, runExclusive, setPlaylistState]);

  // 재생 중인 큐가 sourceId에서 온 것이면, 현재 곡을 끊지 않고 나머지 순서/구성을 items에 맞춘다.
  const syncQueue = useCallback(async (sourceId: string, items: PlayingTrack[]) => {
    await runExclusive(async () => {
      const state = playlistRef.current;
      if (!state || state.sourceId !== sourceId) return;

      try {
        const [queue, activeIndex] = await Promise.all([
          TrackPlayer.getQueue(),
          TrackPlayer.getActiveTrackIndex(),
        ]);
        if (activeIndex === undefined) return;
        const currentId = queue[activeIndex]?.id as string | undefined;
        const current = state.items.find((it) => it.version.id === currentId);
        if (!currentId || !current) return;

        const plan = planQueueSync(items.map((it) => it.version.id), currentId);
        const nextItems = plan.currentInTarget ? items : [current, ...items];
        const sameOrder =
          nextItems.length === queue.length &&
          nextItems.every((it, i) => it.version.id === queue[i]?.id);

        setPlaylistState({ ...state, items: nextItems, currentIndex: plan.currentIndex });
        if (sameOrder) return;

        const byId = new Map(items.map((it) => [it.version.id, it]));
        const others = queue.map((_, i) => i).filter((i) => i !== activeIndex);
        if (others.length > 0) await TrackPlayer.remove(others);
        if (plan.after.length > 0) await TrackPlayer.add(plan.after.map((id) => toTrack(byId.get(id)!)));
        if (plan.before.length > 0) await TrackPlayer.add(plan.before.map((id) => toTrack(byId.get(id)!)), 0);
      } catch (error) {
        console.error('재생 큐 동기화 실패:', error);
      }
    });
  }, [runExclusive, setPlaylistState]);

  const playNext = useCallback(async () => {
    await runExclusive(async () => {
      try {
        await skipWrapped(1);
      } catch (error) {
        console.error('다음 곡 재생 실패:', error);
      }
    });
  }, [runExclusive]);

  const playPrevious = useCallback(async () => {
    await runExclusive(async () => {
      try {
        await skipWrapped(-1);
      } catch (error) {
        console.error('이전 곡 재생 실패:', error);
      }
    });
  }, [runExclusive]);

  const setRepeatMode = useCallback(async (mode: 'none' | 'one' | 'all') => {
    try {
      await TrackPlayer.setRepeatMode(toNativeRepeat(mode));
    } catch (error) {
      console.error('반복 모드 설정 실패:', error);
    }
    const state = playlistRef.current;
    if (state) setPlaylistState({ ...state, repeatMode: mode });
    // 여러 곡을 재생할 때 고른 반복 모드는 다음 재생에도 이어지도록 기억한다
    if (state && state.items.length > 1) updateSettings({ repeatMode: mode });
  }, [setPlaylistState]);

  const handleTrackEnd = useCallback(() => {
    // TrackPlayer가 자동으로 처리
  }, []);

  const setIsPlaying = useCallback((_playing: boolean) => {
    // 재생 상태는 TrackPlayer의 playbackState에서 파생된다 (호환용 no-op)
  }, []);

  const value = useMemo(
    () => ({
      currentTrack,
      isPlaying,
      isExpanded,
      playlistState,
      setCurrentTrack,
      setIsPlaying,
      expandPlayer,
      minimizePlayer,
      closePlayer,
      setPlaylist,
      syncQueue,
      playNext,
      playPrevious,
      setRepeatMode,
      handleTrackEnd,
      togglePlayPause,
      seekTo,
    }),
    [
      currentTrack, isPlaying, isExpanded, playlistState, setCurrentTrack, setIsPlaying,
      expandPlayer, minimizePlayer, closePlayer, setPlaylist, syncQueue, playNext,
      playPrevious, setRepeatMode, handleTrackEnd, togglePlayPause, seekTo,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}
