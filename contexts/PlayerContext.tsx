import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import TrackPlayer, {
  State,
  Event,
  usePlaybackState,
  useProgress,
  RepeatMode,
  Capability,
} from 'react-native-track-player';
import { Song, Version } from '../types';

interface PlayingTrack {
  song: Song;
  version: Version;
}

interface PlaylistState {
  items: PlayingTrack[];
  currentIndex: number;
  repeatMode: 'none' | 'one' | 'all';
}

interface PlayerContextType {
  currentTrack: PlayingTrack | null;
  isPlaying: boolean;
  isExpanded: boolean;
  playlistState: PlaylistState | null;
  currentTime: number;
  duration: number;
  setCurrentTrack: (track: PlayingTrack | null) => void;
  setIsPlaying: (playing: boolean) => void;
  expandPlayer: () => void;
  minimizePlayer: () => void;
  closePlayer: () => void;
  setPlaylist: (items: PlayingTrack[], startIndex?: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  setRepeatMode: (mode: 'none' | 'one' | 'all') => void;
  handleTrackEnd: () => void;
  togglePlayPause: () => void;
  seekTo: (seconds: number) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

let isPlayerSetup = false;

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrackState] = useState<PlayingTrack | null>(null);
  const [isPlaying, setIsPlayingState] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [playlistState, setPlaylistState] = useState<PlaylistState | null>(null);
  const [isReady, setIsReady] = useState(false);

  const playbackState = usePlaybackState();
  const progress = useProgress();

  const currentTime = progress.position || 0;
  const duration = progress.duration || 0;

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
        });

        isPlayerSetup = true;
        setIsReady(true);
      } catch (error) {
        console.error('TrackPlayer 초기화 실패:', error);
      }
    }

    setupPlayer();
  }, []);

  // 재생 상태 동기화
  useEffect(() => {
    const state = playbackState.state;
    setIsPlayingState(state === State.Playing);
  }, [playbackState.state]);

  // 트랙 종료 이벤트 리스너
  useEffect(() => {
    const subscription = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
      if (playlistState) {
        const { repeatMode } = playlistState;
        if (repeatMode === 'all') {
          await TrackPlayer.skip(0);
          await TrackPlayer.play();
        }
      }
    });

    return () => subscription.remove();
  }, [playlistState]);

  // 트랙 변경 이벤트 리스너
  useEffect(() => {
    const subscription = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
      if (event.index !== undefined && playlistState) {
        const newTrack = playlistState.items[event.index];
        if (newTrack) {
          setCurrentTrackState(newTrack);
          setPlaylistState(prev => prev ? { ...prev, currentIndex: event.index! } : null);
        }
      }
    });

    return () => subscription.remove();
  }, [playlistState]);

  const setCurrentTrack = useCallback(async (track: PlayingTrack | null) => {
    if (!isReady) return;

    if (!track) {
      await TrackPlayer.reset();
      setCurrentTrackState(null);
      return;
    }

    try {
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: track.version.id,
        url: track.version.storageUrl,
        title: track.song.title,
        artist: track.song.artist || '알 수 없는 아티스트',
        duration: track.version.duration,
      });
      await TrackPlayer.play();
      setCurrentTrackState(track);
    } catch (error) {
      console.error('트랙 설정 실패:', error);
    }
  }, [isReady]);

  const togglePlayPause = useCallback(async () => {
    const state = playbackState.state;
    if (state === State.Playing) {
      await TrackPlayer.pause();
    } else {
      await TrackPlayer.play();
    }
  }, [playbackState.state]);

  const seekTo = useCallback(async (seconds: number) => {
    await TrackPlayer.seekTo(seconds);
  }, []);

  const expandPlayer = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const minimizePlayer = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const closePlayer = useCallback(async () => {
    await TrackPlayer.reset();
    setCurrentTrackState(null);
    setIsPlayingState(false);
    setIsExpanded(false);
    setPlaylistState(null);
  }, []);

  const setPlaylist = useCallback(async (items: PlayingTrack[], startIndex = 0) => {
    if (!isReady || items.length === 0) return;

    try {
      await TrackPlayer.reset();

      const tracks = items.map(item => ({
        id: item.version.id,
        url: item.version.storageUrl,
        title: item.song.title,
        artist: item.song.artist || '알 수 없는 아티스트',
        duration: item.version.duration,
      }));

      await TrackPlayer.add(tracks);
      await TrackPlayer.skip(startIndex);
      await TrackPlayer.play();

      setPlaylistState({
        items,
        currentIndex: startIndex,
        repeatMode: 'all',
      });
      setCurrentTrackState(items[startIndex]);
      setIsExpanded(true);
    } catch (error) {
      console.error('플레이리스트 설정 실패:', error);
    }
  }, [isReady]);

  const playNext = useCallback(async () => {
    try {
      await TrackPlayer.skipToNext();
    } catch (error) {
      // 마지막 트랙인 경우 처음으로
      if (playlistState?.repeatMode === 'all') {
        await TrackPlayer.skip(0);
        await TrackPlayer.play();
      }
    }
  }, [playlistState]);

  const playPrevious = useCallback(async () => {
    try {
      await TrackPlayer.skipToPrevious();
    } catch (error) {
      // 첫 트랙인 경우 마지막으로
      if (playlistState?.repeatMode === 'all' && playlistState.items.length > 0) {
        await TrackPlayer.skip(playlistState.items.length - 1);
        await TrackPlayer.play();
      }
    }
  }, [playlistState]);

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
    await TrackPlayer.setRepeatMode(trackPlayerMode);
    setPlaylistState(prev => prev ? { ...prev, repeatMode: mode } : null);
  }, []);

  const handleTrackEnd = useCallback(() => {
    // TrackPlayer가 자동으로 처리
  }, []);

  const setIsPlaying = useCallback((playing: boolean) => {
    setIsPlayingState(playing);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        isExpanded,
        playlistState,
        currentTime,
        duration,
        setCurrentTrack,
        setIsPlaying,
        expandPlayer,
        minimizePlayer,
        closePlayer,
        setPlaylist,
        playNext,
        playPrevious,
        setRepeatMode,
        handleTrackEnd,
        togglePlayPause,
        seekTo,
      }}
    >
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
