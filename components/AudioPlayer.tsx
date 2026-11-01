import React, { useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TrackPlayer, { useProgress } from 'react-native-track-player';
import Slider from '@react-native-community/slider';
import { usePlayer } from '../contexts/PlayerContext';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, fontFamily } from '../lib/theme';
import { useSettings } from '../contexts/SettingsContext';
import { haptic } from '../lib/haptics';
import PressableScale from './PressableScale';

interface AudioPlayerProps {
  onTrackEnd?: () => void;
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
  const { settings } = useSettings();
  const skipSeconds = settings.skipSeconds;
  const { isPlaying, togglePlayPause, seekTo, currentTrack } = usePlayer();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const progress = useProgress(250);

  const hasEndedRef = useRef(false);

  // 드래그하는 동안에는 폴링된 재생 위치로 슬라이더를 되돌리지 않는다(손잡이가 튀는 문제)
  const [seekingValue, setSeekingValue] = useState<number | null>(null);
  const currentTime = progress.position;
  const duration = progress.duration;
  const sliderValue = seekingValue ?? currentTime;

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

  // 연습할 때 자주 쓰는 앞뒤 건너뛰기(간격은 설정에서 5/10/15초)
  const skipBy = async (delta: number) => {
    haptic('light');
    const target = Math.min(Math.max(currentTime + delta, 0), Math.max(duration - 0.5, 0));
    await seekTo(target);
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
        value={sliderValue}
        onSlidingStart={(value) => setSeekingValue(value)}
        onValueChange={(value) => {
          if (seekingValue !== null) setSeekingValue(value);
        }}
        onSlidingComplete={async (value) => {
          try {
            await seekTo(value);
          } finally {
            setSeekingValue(null);
          }
        }}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.accent}
      />

      {/* 시간 표시 */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(sliderValue)}</Text>
        <Text style={styles.timeText}>{formatTime(duration)}</Text>
      </View>

      {/* 컨트롤 버튼: 이전 · -N초 · 재생 · +N초 · 다음 */}
      <View style={styles.controls}>
        {showPlaylistControls ? (
          <PressableScale onPress={onPrevious} style={styles.controlButton} accessibilityLabel="이전 곡" haptic="light">
            <Ionicons name="play-skip-back" size={30} color={colors.text} />
          </PressableScale>
        ) : (
          <View style={styles.controlButton} />
        )}

        <PressableScale onPress={() => skipBy(-skipSeconds)} style={styles.controlButton} accessibilityLabel={`${skipSeconds}초 뒤로`}>
          <Ionicons name="play-back" size={26} color={colors.text} />
          <Text style={styles.skipText}>{skipSeconds}</Text>
        </PressableScale>

        <PressableScale
          style={styles.playButton}
          onPress={togglePlayPause}
          haptic="medium"
          scaleTo={0.92}
          accessibilityLabel={isPlaying ? '일시정지' : '재생'}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={36}
            color={colors.onAccent}
            style={isPlaying ? {} : { marginLeft: 4 }}
          />
        </PressableScale>

        <PressableScale onPress={() => skipBy(skipSeconds)} style={styles.controlButton} accessibilityLabel={`${skipSeconds}초 앞으로`}>
          <Ionicons name="play-forward" size={26} color={colors.text} />
          <Text style={styles.skipText}>{skipSeconds}</Text>
        </PressableScale>

        {showPlaylistControls ? (
          <PressableScale onPress={onNext} style={styles.controlButton} accessibilityLabel="다음 곡" haptic="light">
            <Ionicons name="play-skip-forward" size={30} color={colors.text} />
          </PressableScale>
        ) : (
          <View style={styles.controlButton} />
        )}
      </View>

      {showPlaylistControls && (
        <View style={styles.secondaryRow}>
          <PressableScale
            onPress={onRepeatModeChange}
            style={[styles.repeatChip, repeatMode !== 'none' && { backgroundColor: colors.surfaceAlt }]}
            accessibilityLabel={`반복: ${repeatMode === 'one' ? '한 곡' : repeatMode === 'all' ? '전체' : '끔'}`}
            haptic="selection"
          >
            <Ionicons
              name="repeat"
              size={18}
              color={repeatMode !== 'none' ? colors.accentStrong : colors.textMuted}
            />
            <Text style={[styles.repeatLabel, repeatMode !== 'none' && { color: colors.accentStrong }]}>
              {repeatMode === 'one' ? '한 곡 반복' : repeatMode === 'all' ? '전체 반복' : '반복 끔'}
            </Text>
          </PressableScale>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
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
    fontFamily: fontFamily.medium,
    color: colors.textMuted,
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
    backgroundColor: colors.accentStrong,
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
  skipText: {
    position: 'absolute',
    bottom: 2,
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: colors.textMuted,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
  },
  repeatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  repeatLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: 13,
    color: colors.textMuted,
  },
  repeatOneText: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    fontSize: 10,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.accent,
  },
});
