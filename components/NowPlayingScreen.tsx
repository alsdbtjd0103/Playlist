import React, { useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';
import AudioPlayer from './AudioPlayer';
import { colors, spacing, borderRadius, typography } from '../lib/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 120;

export default function NowPlayingScreen() {
  const { currentTrack, isExpanded, minimizePlayer, closePlayer } = usePlayer();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: isExpanded ? 0 : SCREEN_HEIGHT,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [isExpanded]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return gestureState.dy > 15 && Math.abs(gestureState.dx) < Math.abs(gestureState.dy);
        },
        onPanResponderGrant: () => {
          translateY.extractOffset();
        },
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dy > 0) {
            translateY.setValue(gestureState.dy);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          translateY.flattenOffset();
          if (gestureState.dy > DISMISS_THRESHOLD || gestureState.vy > 0.5) {
            minimizePlayer();
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              useNativeDriver: true,
              tension: 65,
              friction: 11,
            }).start();
          }
        },
      }),
    [minimizePlayer]
  );

  if (!currentTrack) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          paddingTop: insets.top,
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* 드래그 핸들 영역 */}
      <View style={styles.handleArea}>
        <View style={styles.handle} />
      </View>

      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={minimizePlayer}>
          <Ionicons name="chevron-down" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerButton} onPress={closePlayer}>
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* 앨범 아트 */}
      <View style={styles.albumArtContainer}>
        <View style={styles.albumArt}>
          <Ionicons name="musical-notes" size={80} color={colors.textSecondary} />
        </View>
      </View>

      {/* 곡 정보 */}
      <View style={styles.songInfo}>
        <Text style={styles.songTitle}>{currentTrack.song.title}</Text>
        {currentTrack.song.artist && (
          <Text style={styles.songArtist}>{currentTrack.song.artist}</Text>
        )}
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={16} color={colors.warning} />
          <Text style={styles.ratingText}>{currentTrack.version.rating}</Text>
        </View>
      </View>

      {/* 오디오 플레이어 */}
      <View style={styles.playerContainer}>
        <AudioPlayer audioUrl={currentTrack.version.storageUrl} />
      </View>

      {/* 메모 */}
      {currentTrack.version.memo && (
        <View style={styles.memoContainer}>
          <Ionicons name="document-text-outline" size={16} color={colors.textTertiary} />
          <Text style={styles.memoText}>{currentTrack.version.memo}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    zIndex: 1000,
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  albumArtContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xl,
  },
  albumArt: {
    width: 280,
    height: 280,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  songInfo: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  songTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  songArtist: {
    ...typography.body,
    color: colors.textSecondary,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  ratingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  playerContainer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
  },
  memoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
  },
  memoText: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 20,
  },
});
