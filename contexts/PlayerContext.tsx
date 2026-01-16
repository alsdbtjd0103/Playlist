import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Song, Version } from '../types';

interface PlayingTrack {
  song: Song;
  version: Version;
}

interface PlayerContextType {
  currentTrack: PlayingTrack | null;
  isPlaying: boolean;
  isExpanded: boolean;
  setCurrentTrack: (track: PlayingTrack | null) => void;
  setIsPlaying: (playing: boolean) => void;
  expandPlayer: () => void;
  minimizePlayer: () => void;
  closePlayer: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<PlayingTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const expandPlayer = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const minimizePlayer = useCallback(() => {
    setIsExpanded(false);
  }, []);

  const closePlayer = useCallback(() => {
    setCurrentTrack(null);
    setIsPlaying(false);
    setIsExpanded(false);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        isExpanded,
        setCurrentTrack,
        setIsPlaying,
        expandPlayer,
        minimizePlayer,
        closePlayer,
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
