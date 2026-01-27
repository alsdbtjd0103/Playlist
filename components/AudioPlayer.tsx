import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TrackPlayer, { useProgress } from 'react-native-track-player';
import Slider from '@react-native-community/slider';
import { usePlayer } from '../contexts/PlayerContext';

interface AudioPlayerProps {
  onTrackEnd?: () => void;
  showPlaylistControls?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  repeatMode?: 'none' | 'one' | 'all';
  onRepeatModeChange?: () => void;
  shuffleMode?: boolean;
  onShuffleModeChange?: () => void;
}

export default function AudioPlayer({
  onTrackEnd,
  showPlaylistControls = false,
  onPrevious,
  onNext,
  repeatMode,
  onRepeatModeChange,
  shuffleMode = false,
  onShuffleModeChange,
}: AudioPlayerProps) {
  const { isPlaying, togglePlayPause, seekTo, currentTrack } = usePlayer();
  const progress = useProgress(250);

  const hasEndedRef = useRef(false);

  const currentTime = progress.position;
  const duration = progress.duration;

  // 곡 종료 감지
  React.useEffect(() => {
    if (duration > 0 && currentTime >= duration - 0.5 && isPlaying && !hasEndedRef.current) {
      hasEndedRef.current = true;
      onTrackEnd?.();
    }
  }, [currentTime, duration, isPlaying, onTrackEnd]);

  // duration 변경 시 (새 곡) hasEndedRef 초기화
  React.useEffect(() => {
    hasEndedRef.current = false;
  }, [duration]);

  const skipBackward = async () => {
    const newPosition = Math.max(currentTime - 10, 0);
    await seekTo(newPosition);
  };

  const formatTime = (seconds: number) => {
    const totalSeconds = Math.floor(seconds);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (!currentTrack) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* 슬라이더 */}
      <Slider
        style={styles.slider}
        minimumValue={0}
        maximumValue={duration}
        value={currentTime}
        onSlidingComplete={async (value) => {
          await seekTo(value);
        }}
        minimumTrackTintColor="#fff"
        maximumTrackTintColor="#888"
        thumbTintColor="#fff"
      />

      {/* 시간 표시 */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>

      {/* 컨트롤 버튼 */}
      <View style={styles.controls}>
        {showPlaylistControls ? (
          <TouchableOpacity onPress={onRepeatModeChange} style={styles.controlButton}>
            <Ionicons
              name="repeat"
              size={28}
              color={repeatMode !== 'none' ? '#fff' : '#666'}
            />
            {repeatMode === 'one' && (
              <Text style={styles.repeatOneText}>1</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={skipBackward} style={styles.controlButton}>
            <Ionicons name="play-back" size={36} color="#e5e5e5" />
          </TouchableOpacity>
        )}

        {showPlaylistControls && (
          <TouchableOpacity onPress={onPrevious} style={styles.controlButton}>
            <Ionicons name="play-skip-back" size={36} color="#e5e5e5" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.playButton}
          onPress={togglePlayPause}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={40}
            color="#000"
            style={isPlaying ? {} : { marginLeft: 4 }}
          />
        </TouchableOpacity>

        {showPlaylistControls && (
          <TouchableOpacity onPress={onNext} style={styles.controlButton}>
            <Ionicons name="play-skip-forward" size={36} color="#e5e5e5" />
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={onShuffleModeChange} style={styles.controlButton}>
          <Ionicons 
            name="shuffle" 
            size={28} 
            color={shuffleMode ? '#fff' : '#666'} 
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: -8,
  },
  timeText: {
    color: '#e5e5e5',
    fontSize: 14,
    fontWeight: '500',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  playButton: {
    width: 70,
    height: 70,
    backgroundColor: '#ffffff',
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  controlButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  repeatOneText: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
});
