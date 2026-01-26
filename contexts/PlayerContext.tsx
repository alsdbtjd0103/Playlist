import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, AudioPlayer } from 'expo-audio';
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
  player: AudioPlayer | null;
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

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrackState] = useState<PlayingTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [playlistState, setPlaylistState] = useState<PlaylistState | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // 오디오 플레이어
  const audioUrl = currentTrack?.version.storageUrl || '';
  const player = useAudioPlayer(audioUrl);
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || 0;

  // 재생 상태 동기화
  useEffect(() => {
    setIsPlaying(status.playing);
  }, [status.playing]);

  // 현재 시간 업데이트
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (status.playing) {
      interval = setInterval(() => {
        setCurrentTime(player.currentTime);
      }, 100);
    } else {
      setCurrentTime(player.currentTime);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [status.playing, player]);

  // 백그라운드 재생을 위한 오디오 모드 설정
  useEffect(() => {
    const configureAudio = async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          staysActiveInBackground: true,
        });
      } catch (error) {
        console.error('오디오 모드 설정 실패:', error);
      }
    };
    configureAudio();
  }, []);

  const setCurrentTrack = useCallback((track: PlayingTrack | null) => {
    setCurrentTrackState(track);
    setCurrentTime(0);
  }, []);

  const togglePlayPause = useCallback(() => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player, status.playing]);

  const seekTo = useCallback((seconds: number) => {
    player.seekTo(seconds);
    setCurrentTime(seconds);
  }, [player]);

  const expandPlayer = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const minimizePlayer = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const closePlayer = useCallback(() => {
    player.pause();
    setCurrentTrackState(null);
    setIsPlaying(false);
    setIsExpanded(false);
    setPlaylistState(null);
  }, [player]);

  const setPlaylist = useCallback((items: PlayingTrack[], startIndex = 0) => {
    if (items.length === 0) return;

    setPlaylistState({
      items,
      currentIndex: startIndex,
      repeatMode: 'all',
    });
    setCurrentTrack(items[startIndex]);
    setIsExpanded(true);
  }, []);

  const playNext = useCallback(() => {
    if (!playlistState) return;

    const { items, currentIndex, repeatMode } = playlistState;
    let nextIndex = currentIndex + 1;

    if (nextIndex >= items.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        return;
      }
    }

    setPlaylistState(prev => prev ? { ...prev, currentIndex: nextIndex } : null);
    setCurrentTrack(items[nextIndex]);
  }, [playlistState]);

  const playPrevious = useCallback(() => {
    if (!playlistState) return;

    const { items, currentIndex, repeatMode } = playlistState;
    let prevIndex = currentIndex - 1;

    if (prevIndex < 0) {
      if (repeatMode === 'all') {
        prevIndex = items.length - 1;
      } else {
        return;
      }
    }

    setPlaylistState(prev => prev ? { ...prev, currentIndex: prevIndex } : null);
    setCurrentTrack(items[prevIndex]);
  }, [playlistState]);

  const setRepeatMode = useCallback((mode: 'none' | 'one' | 'all') => {
    setPlaylistState(prev => prev ? { ...prev, repeatMode: mode } : null);
  }, []);

  const handleTrackEnd = useCallback(() => {
    if (!playlistState) return;

    const { items, currentIndex, repeatMode } = playlistState;

    if (repeatMode === 'one') {
      // 한 곡 반복: 현재 곡 다시 재생 (AudioPlayer에서 처리)
      return;
    }

    let nextIndex = currentIndex + 1;

    if (nextIndex >= items.length) {
      if (repeatMode === 'all') {
        nextIndex = 0;
      } else {
        // 반복 없음: 재생 종료
        setIsPlaying(false);
        return;
      }
    }

    setPlaylistState(prev => prev ? { ...prev, currentIndex: nextIndex } : null);
    setCurrentTrack(items[nextIndex]);
  }, [playlistState]);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        isExpanded,
        playlistState,
        player,
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
