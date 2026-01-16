import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../lib/theme';

interface AudioPlayerProps {
  audioUrl: string;
}

export default function AudioPlayer({ audioUrl }: AudioPlayerProps) {
  const player = useAudioPlayer(audioUrl);
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

  const handlePlayPause = () => {
    if (status.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handleStop = () => {
    player.pause();
    player.seekTo(0);
    setCurrentTime(0);
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

  return (
    <View style={styles.container}>
      {/* 프로그레스 바 */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
          <View style={[styles.progressThumb, { left: `${progress}%` }]} />
        </View>
        <View style={styles.timeInfo}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>

      {/* 컨트롤 버튼 */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleStop}
        >
          <Ionicons name="stop" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.playButton}
          onPress={handlePlayPause}
          activeOpacity={0.8}
        >
          <Ionicons
            name={status.playing ? 'pause' : 'play'}
            size={28}
            color={colors.background}
            style={status.playing ? {} : { marginLeft: 3 }}
          />
        </TouchableOpacity>

        <View style={styles.secondaryButton}>
          {/* placeholder for alignment */}
        </View>
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
    gap: spacing.xl,
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
  },
});
