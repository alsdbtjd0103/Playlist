import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';
import { colors, spacing, borderRadius, typography } from '../lib/theme';

interface AudioPlayerProps {
  onTrackEnd?: () => void;
  // 플레이리스트 관련 props
  showPlaylistControls?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  repeatMode?: 'none' | 'one' | 'all';
  onRepeatModeChange?: () => void;
}

export default function AudioPlayer({
  onTrackEnd,
  showPlaylistControls = false,
  onPrevious,
  onNext,
  repeatMode,
  onRepeatModeChange,
}: AudioPlayerProps) {
  const { player, isPlaying, currentTime, duration, togglePlayPause, seekTo } = usePlayer();
  const [progressWidth, setProgressWidth] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const hasEndedRef = useRef(false);
  const wasPlayingRef = useRef(false);

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

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      wasPlayingRef.current = isPlaying;
      if (isPlaying && player) {
        player.pause();
      }
      setIsSeeking(true);
      const locationX = evt.nativeEvent.locationX;
      const percentage = Math.max(0, Math.min(1, locationX / progressWidth));
      setSeekPosition(percentage * duration);
    },
    onPanResponderMove: (evt) => {
      const locationX = evt.nativeEvent.locationX;
      const percentage = Math.max(0, Math.min(1, locationX / progressWidth));
      setSeekPosition(percentage * duration);
    },
    onPanResponderRelease: () => {
      seekTo(seekPosition);
      setIsSeeking(false);
      hasEndedRef.current = false;
      if (wasPlayingRef.current && player) {
        player.play();
      }
    },
  }), [progressWidth, duration, player, seekPosition, isPlaying, seekTo]);

  const handleStop = () => {
    if (player) {
      player.pause();
      seekTo(0);
    }
  };

  const formatTime = (seconds: number) => {
    const totalSeconds = Math.floor(seconds);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const displayPosition = isSeeking ? seekPosition : currentTime;
  const progress = duration > 0 ? (displayPosition / duration) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* 프로그레스 바 */}
      <View
        style={styles.progressContainer}
        onLayout={(e) => setProgressWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
          <View style={[styles.progressThumb, isSeeking && styles.progressThumbActive, { left: `${progress}%` }]} />
        </View>
        <View style={styles.timeInfo}>
          <Text style={styles.timeText}>{formatTime(displayPosition)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>

      {/* 컨트롤 버튼 */}
      <View style={styles.controls}>
        {showPlaylistControls ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={onRepeatModeChange}>
            <Ionicons
              name="repeat"
              size={20}
              color={repeatMode !== 'none' ? colors.primary : colors.textSecondary}
            />
            {repeatMode === 'one' && (
              <Text style={styles.repeatOneText}>1</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.secondaryButton} onPress={handleStop}>
            <Ionicons name="stop" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {showPlaylistControls && (
          <TouchableOpacity style={styles.secondaryButton} onPress={onPrevious}>
            <Ionicons name="play-skip-back" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.playButton}
          onPress={togglePlayPause}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={28}
            color={colors.background}
            style={isPlaying ? {} : { marginLeft: 3 }}
          />
        </TouchableOpacity>

        {showPlaylistControls && (
          <TouchableOpacity style={styles.secondaryButton} onPress={onNext}>
            <Ionicons name="play-skip-forward" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        )}

        {showPlaylistControls ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={handleStop}>
            <Ionicons name="stop" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.secondaryButton} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  progressContainer: {
    gap: spacing.sm,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.surfaceLighter,
    borderRadius: borderRadius.full,
    overflow: 'visible',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.textPrimary,
    borderRadius: borderRadius.full,
  },
  progressThumb: {
    position: 'absolute',
    top: -4,
    width: 12,
    height: 12,
    borderRadius: borderRadius.full,
    backgroundColor: colors.textPrimary,
    marginLeft: -6,
  },
  progressThumbActive: {
    width: 16,
    height: 16,
    top: -6,
    marginLeft: -8,
  },
  timeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  repeatOneText: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    fontSize: 8,
    fontWeight: '700',
    color: colors.primary,
  },
});
