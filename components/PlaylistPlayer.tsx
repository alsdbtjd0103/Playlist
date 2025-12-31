import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import type { Song, Version } from '../types';

interface PlaylistPlayerProps {
  playlist: { song: Song; version: Version }[];
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

export default function PlaylistPlayer({
  playlist,
  currentIndex,
  onIndexChange,
}: PlaylistPlayerProps) {
  const currentItem = playlist[currentIndex];
  const player = useAudioPlayer(currentItem?.version.storageUrl || '');
  const status = useAudioPlayerStatus(player);
  const [currentTime, setCurrentTime] = useState(0);

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
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [status.playing, player]);

  useEffect(() => {
    if (status.isLoaded && status.duration > 0) {
      if (currentTime >= status.duration - 0.5 && status.playing) {
        handleNext();
      }
    }
  }, [currentTime, status.duration, status.playing, status.isLoaded]);

  const handlePlayPause = () => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      player.pause();
      setCurrentTime(0);
      onIndexChange(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < playlist.length - 1) {
      player.pause();
      setCurrentTime(0);
      onIndexChange(currentIndex + 1);
    } else {
      player.pause();
      player.seekTo(0);
      setCurrentTime(0);
    }
  };

  const formatTime = (seconds: number) => {
    const totalSeconds = Math.floor(seconds);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const duration = status.duration || 0;
  const position = currentTime;
  const progress = duration > 0 ? (position / duration) * 100 : 0;

  if (!currentItem) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.songInfo}>
        <Text style={styles.songTitle}>{currentItem.song.title}</Text>
        {currentItem.song.artist && (
          <Text style={styles.songArtist}>{currentItem.song.artist}</Text>
        )}
        <Text style={styles.trackInfo}>
          {currentIndex + 1} / {playlist.length}
        </Text>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <View style={styles.timeInfo}>
        <Text style={styles.timeText}>{formatTime(position)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, currentIndex === 0 && styles.controlButtonDisabled]}
          onPress={handlePrevious}
          disabled={currentIndex === 0}
        >
          <Text style={styles.controlButtonText}>⏮</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.playButton]}
          onPress={handlePlayPause}
        >
          <Text style={styles.playButtonText}>
            {status.playing ? '⏸' : '▶️'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            currentIndex === playlist.length - 1 && styles.controlButtonDisabled,
          ]}
          onPress={handleNext}
          disabled={currentIndex === playlist.length - 1}
        >
          <Text style={styles.controlButtonText}>⏭</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  songInfo: {
    alignItems: 'center',
    gap: 4,
  },
  songTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  songArtist: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  trackInfo: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#000',
  },
  timeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: '#6b7280',
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonDisabled: {
    opacity: 0.3,
  },
  controlButtonText: {
    fontSize: 20,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#000',
    borderColor: '#000',
  },
  playButtonText: {
    fontSize: 24,
    color: '#fff',
  },
});
