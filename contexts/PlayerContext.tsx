import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, ReactNode } from 'react';
import TrackPlayer, {
  State,
  Event,
  usePlaybackState,
  useProgress,
  RepeatMode,
  Capability,
  AppKilledPlaybackBehavior,
} from 'react-native-track-player';
import { Song, Version } from '../types';
import { isPastTrimEnd } from '../lib/trim';
import { planQueueSync } from '../lib/queueNav';
import { skipWrapped } from '../services/queueControl';

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
  // TrackPlayer 큐 조작(reset/add/remove/skip)이 서로 끼어들지 않도록 직렬화
  const opChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const setPlaylistState = useCallback((next: PlaylistState | null) => {
    playlistRef.current = next;
    setPlaylistStateRaw(next);
  }, []);

  const runExclusive = useCallback(<T,>(op: () => Promise<T>): Promise<T> => {
    const run = opChainRef.current.then(op, op);
    opChainRef.current = run.catch(() => {});
    return run;
  }, []);

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
        await TrackPlayer.setupPlayer({
          autoHandleInterruptions: true,
        });
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
          compactCapabilities: [
            Capability.Play,
            Capability.Pause,
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
        });

        isPlayerSetup = true;
        setIsReady(true);
      } catch (error) {
        console.error('TrackPlayer 옵션 설정 실패:', error);
      }
    }

    setupPlayer();
  }, []);

  // 큐 끝 도달 → 전체 반복이면 처음으로
  useEffect(() => {
    const subscription = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
      if (playlistRef.current?.repeatMode === 'all') {
        try {
          await TrackPlayer.skip(0);
          await TrackPlayer.play();
        } catch (error) {
          console.error('처음 곡 재생 실패:', error);
        }
      }
    });

    return () => subscription.remove();
  }, []);

  // 트랙 변경 → 현재 곡/인덱스 갱신. 인덱스가 아니라 트랙 id로 찾는다
  // (큐 재정렬 중에는 같은 곡의 인덱스만 바뀔 수 있으므로).
  useEffect(() => {
    const subscription = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
      const state = playlistRef.current;
      const trackId = event.track?.id as string | undefined;
      if (!state || !trackId) return;
      const index = state.items.findIndex((it) => it.version.id === trackId);
      if (index === -1) return;

      const newTrack = state.items[index];
      const trackChanged = activeIdRef.current !== trackId;
      activeIdRef.current = trackId;
      if (state.currentIndex !== index) {
        setPlaylistState({ ...state, currentIndex: index });
      }
      if (!trackChanged) return;

      setCurrentTrackState(newTrack);
      if (newTrack.version.trim) {
        try {
          await TrackPlayer.seekTo(newTrack.version.trim.start);
        } catch (error) {
          console.error('트림 시작 위치 이동 실패:', error);
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
        if (track.version.trim) { await TrackPlayer.seekTo(track.version.trim.start); }
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
      } else {
        await TrackPlayer.play();
      }
    } catch (error) {
      console.error('재생/일시정지 실패:', error);
    }
  }, [isPlaying]);

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
        setPlaylistState({ items, currentIndex: startIndex, repeatMode: 'all', sourceId });
        activeIdRef.current = items[startIndex]?.version.id ?? null;
        setCurrentTrackState(items[startIndex]);

        await TrackPlayer.reset();
        await TrackPlayer.add(items.map(toTrack));
        await TrackPlayer.skip(startIndex);
        await TrackPlayer.play();
        const startTrim = items[startIndex]?.version.trim;
        if (startTrim) { await TrackPlayer.seekTo(startTrim.start); }

        setIsExpanded(true);
      } catch (error) {
        console.error('플레이리스트 설정 실패:', error);
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
    let trackPlayerMode: RepeatMode;
    switch (mode) {
      case 'one':
        trackPlayerMode = RepeatMode.Track;
        break;
      case 'all':
        trackPlayerMode = RepeatMode.Queue;
        break;
      default:
        trackPlayerMode = RepeatMode.Off;
    }
    try {
      await TrackPlayer.setRepeatMode(trackPlayerMode);
    } catch (error) {
      console.error('반복 모드 설정 실패:', error);
    }
    const state = playlistRef.current;
    if (state) setPlaylistState({ ...state, repeatMode: mode });
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
      <TrimEndWatcher
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        hasNext={(playlistState?.items.length ?? 0) > 1}
        playNext={playNext}
      />
    </PlayerContext.Provider>
  );
}

// trim.end 도달 시 다음 곡/정지. 진행률 폴링을 이 컴포넌트에 가둬서
// Provider 전체(모든 usePlayer 소비자)가 폴링마다 리렌더되지 않게 한다.
function TrimEndWatcher({
  currentTrack,
  isPlaying,
  hasNext,
  playNext,
}: {
  currentTrack: PlayingTrack | null;
  isPlaying: boolean;
  hasNext: boolean;
  playNext: () => void;
}) {
  const trim = currentTrack?.version.trim;
  const trackId = currentTrack?.version.id ?? null;
  const progress = useProgress(trim ? 500 : 60_000);
  // 곡이 바뀐 직후의 progress는 이전 곡 위치일 수 있으므로,
  // 현재 곡에서 trim.end 이전 위치를 한 번 확인한 뒤에만 종료 판정을 한다.
  const armedRef = useRef<string | null>(null);
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    armedRef.current = null;
    handledRef.current = null;
  }, [trackId]);

  useEffect(() => {
    if (!trim || !trackId || !isPlaying) return;
    if (!isPastTrimEnd(progress.position, trim)) {
      armedRef.current = trackId;
      return;
    }
    if (armedRef.current !== trackId || handledRef.current === trackId) return;
    handledRef.current = trackId;
    if (hasNext) {
      playNext();
    } else {
      TrackPlayer.pause().catch(() => {});
    }
  }, [progress.position, trim, trackId, isPlaying, hasNext, playNext]);

  return null;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}
