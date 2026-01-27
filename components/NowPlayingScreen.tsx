import React, { useRef, useEffect, useMemo, useState } from 'react';
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
  const {
    currentTrack,
    isExpanded,
    minimizePlayer,
    playlistState,
    playNext,
    playPrevious,
    setRepeatMode,
    handleTrackEnd,
  } = usePlayer();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const insets = useSafeAreaInsets();
  const [shuffleMode, setShuffleMode] = useState(false);

  const isPlaylistMode = playlistState !== null;

  const cycleRepeatMode = () => {
    if (!playlistState) return;
    const modes: ('none' | 'one' | 'all')[] = ['none', 'all', 'one'];
    const currentIdx = modes.indexOf(playlistState.repeatMode);
    setRepeatMode(modes[(currentIdx + 1) % 3]);
  };

  const toggleShuffleMode = () => {
    setShuffleMode(prev => !prev);
  };

  // 애니메이션 효과
  useEffect(() => {
    Animated.spring(translateY, {
      toValue: isExpanded ? 0 : SCREEN_HEIGHT,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [isExpanded]);

  // 뒤로가기 버튼 핸들러
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isExpanded) {
        minimizePlayer();
        return true; // 이벤트를 소비하여 기본 뒤로가기 동작 방지
      }
      return false; // 최소화 상태면 기본 동작 허용
    });

    return () => backHandler.remove();
  }, [isExpanded, minimizePlayer]);

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
          <Ionicons name="chevron-down" size={28} color="#e5e5e5" />
        </TouchableOpacity>
        <View style={styles.headerButton} />
      </View>

      {/* 앨범 아트 */}
      <View style={styles.albumArtContainer}>
        <View style={styles.albumArt}>
          <Ionicons name="musical-notes" size={120} color="#404040" />
        </View>
      </View>

      {/* 곡 정보 */}
      <View style={styles.songInfo}>
        <Text style={styles.songTitle}>{currentTrack.song.title}</Text>
        {currentTrack.song.artist && (
          <Text style={styles.songArtist}>{currentTrack.song.artist}</Text>
        )}
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={16} color="#fbbf24" />
          <Text style={styles.ratingText}>{currentTrack.version.rating}</Text>
        </View>
        {isPlaylistMode && playlistState && (
          <Text style={styles.trackIndicator}>
            {playlistState.currentIndex + 1} / {playlistState.items.length}
          </Text>
        )}
      </View>

      {/* 오디오 플레이어 */}
      <View style={styles.playerContainer}>
        <AudioPlayer
          onTrackEnd={isPlaylistMode ? handleTrackEnd : undefined}
          showPlaylistControls={isPlaylistMode}
          onPrevious={playPrevious}
          onNext={playNext}
          repeatMode={playlistState?.repeatMode}
          onRepeatModeChange={cycleRepeatMode}
          shuffleMode={shuffleMode}
          onShuffleModeChange={toggleShuffleMode}
        />
      </View>

      {/* 메모 */}
      {currentTrack.version.memo && (
        <View style={styles.memoContainer}>
          <Ionicons name="document-text-outline" size={16} color="#808080" />
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
    backgroundColor: '#0a0a0a',
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
    backgroundColor: '#404040',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
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
    color: '#b3b3b3',
  },
  albumArtContainer: {
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: spacing.lg,
  },
  albumArt: {
    width: '100%',
    maxWidth: 400,
    height: 400,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  songInfo: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  songTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
  },
  songArtist: {
    fontSize: 16,
    color: '#b3b3b3',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  ratingText: {
    fontSize: 14,
    color: '#b3b3b3',
  },
  trackIndicator: {
    fontSize: 12,
    color: '#808080',
    marginTop: spacing.xs,
  },
  playerContainer: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    flex: 1,
  },
    memoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: '#1a1a1a',
    borderRadius: borderRadius.md,
  },
  memoText: {
    flex: 1,
    fontSize: 14,
    color: '#b3b3b3',
    lineHeight: 20,
  },
});
