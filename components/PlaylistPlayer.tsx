import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import type { Song, Version } from '../types';
import { colors, spacing, borderRadius, typography } from '../lib/theme';

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
  // 반복 모드: 'none' (반복 없음), 'one' (한 곡 반복), 'all' (전체 반복) - 기본값 'all'
  const [repeatMode, setRepeatMode] = useState<'none' | 'one' | 'all'>('all');
  // 셔플 모드
  const [isShuffleOn, setIsShuffleOn] = useState(false);

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

  // 곡이 바뀔 때 자동으로 재생 시작
  useEffect(() => {
    if (currentItem && status.isLoaded) {
      player.play();
    }
  }, [currentIndex]);

  // 곡이 끝났을 때 자동으로 다음 곡 재생
  useEffect(() => {
    if (status.isLoaded && status.duration > 0) {
      if (currentTime >= status.duration - 0.5 && status.playing) {
        handleTrackEnd();
      }
    }
  }, [currentTime, status.duration, status.playing, status.isLoaded]);

  const handleTrackEnd = () => {
    if (repeatMode === 'one') {
      // 한 곡 반복: 현재 곡을 처음부터 다시 재생
      player.seekTo(0);
      setCurrentTime(0);
      player.play();
    } else if (repeatMode === 'all') {
      // 전체 반복: 마지막 곡이면 첫 곡으로, 아니면 다음 곡으로
      if (currentIndex < playlist.length - 1) {
        handleNext();
      } else {
        // 마지막 곡이면 첫 곡으로
        player.pause();
        setCurrentTime(0);
        onIndexChange(0);
      }
    } else {
      // 반복 없음: 마지막 곡이 아니면 다음 곡으로
      if (currentIndex < playlist.length - 1) {
        handleNext();
      } else {
        // 마지막 곡이면 정지
        player.pause();
        player.seekTo(0);
        setCurrentTime(0);
      }
    }
  };

  const toggleRepeatMode = () => {
    if (repeatMode === 'none') {
      setRepeatMode('all');
    } else if (repeatMode === 'all') {
      setRepeatMode('one');
    } else {
      setRepeatMode('none');
    }
  };

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
    } else if (repeatMode === 'all') {
      // 전체 반복 모드에서 첫 곡에서 이전을 누르면 마지막 곡으로
      player.pause();
      setCurrentTime(0);
      onIndexChange(playlist.length - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < playlist.length - 1) {
      player.pause();
      setCurrentTime(0);
      onIndexChange(currentIndex + 1);
    } else if (repeatMode === 'all') {
      // 전체 반복 모드에서 마지막 곡에서 다음을 누르면 첫 곡으로
      player.pause();
      setCurrentTime(0);
      onIndexChange(0);
    } else {
      // 반복 모드가 아니면 정지
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
      {/* 앨범 아트 */}
      <View style={styles.albumArt}>
        <Ionicons name="musical-notes" size={48} color={colors.textSecondary} />
      </View>

      {/* 곡 정보 */}
      <View style={styles.songInfo}>
        <Text style={styles.songTitle} numberOfLines={1}>{currentItem.song.title}</Text>
        {currentItem.song.artist && (
          <Text style={styles.songArtist} numberOfLines={1}>{currentItem.song.artist}</Text>
        )}
        <View style={styles.trackIndicator}>
          <Ionicons name="disc-outline" size={14} color={colors.textTertiary} />
          <Text style={styles.trackInfo}>
            {currentIndex + 1} / {playlist.length}
          </Text>
        </View>
      </View>

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
        {/* 셔플 버튼 */}
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => setIsShuffleOn(!isShuffleOn)}
          activeOpacity={0.5}
        >
          <View>
            <Ionicons
              name="shuffle"
              size={24}
              color={colors.textPrimary}
            />
            {isShuffleOn && (
              <View style={styles.activeIndicator} />
            )}
          </View>
        </TouchableOpacity>

        {/* 이전 곡 버튼 */}
        <TouchableOpacity
          style={styles.controlButton}
          onPress={handlePrevious}
          disabled={currentIndex === 0 && repeatMode !== 'all'}
          activeOpacity={0.5}
        >
          <Ionicons
            name="play-skip-back"
            size={32}
            color={currentIndex === 0 && repeatMode !== 'all' ? colors.textTertiary : colors.textPrimary}
          />
        </TouchableOpacity>

        {/* 재생/일시정지 버튼 */}
        <TouchableOpacity
          style={styles.playButton}
          onPress={handlePlayPause}
          activeOpacity={0.8}
        >
          <Ionicons
            name={status.playing ? 'pause' : 'play'}
            size={32}
            color={colors.background}
            style={status.playing ? {} : { marginLeft: 4 }}
          />
        </TouchableOpacity>

        {/* 다음 곡 버튼 */}
        <TouchableOpacity
          style={styles.controlButton}
          onPress={handleNext}
          disabled={currentIndex === playlist.length - 1 && repeatMode !== 'all'}
          activeOpacity={0.5}
        >
          <Ionicons
            name="play-skip-forward"
            size={32}
            color={currentIndex === playlist.length - 1 && repeatMode !== 'all' ? colors.textTertiary : colors.textPrimary}
          />
        </TouchableOpacity>

        {/* 반복 모드 버튼 */}
        <TouchableOpacity
          style={styles.controlButton}
          onPress={toggleRepeatMode}
          activeOpacity={0.5}
        >
          <View style={styles.repeatButtonContent}>
            <Ionicons
              name="repeat"
              size={28}
              color={colors.textPrimary}
            />
            {repeatMode === 'one' && (
              <Text style={styles.repeatOneText}>1</Text>
            )}
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.lg,
  },
  albumArt: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  songInfo: {
    alignItems: 'center',
    gap: spacing.xs,
    width: '100%',
  },
  songTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  songArtist: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  trackIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  trackInfo: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  progressContainer: {
    width: '100%',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  controlButton: {
    padding: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  repeatButtonContent: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textPrimary,
  },
  secondaryButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.4,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  repeatOneText: {
    position: 'absolute',
    fontSize: 9,
    fontWeight: 'bold',
    color: colors.textPrimary,
    top: 8,
    right: 6,
  },
});
