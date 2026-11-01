import React, { useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';
import AudioPlayer from './AudioPlayer';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, typography, fontFamily } from '../lib/theme';
import { formatVersionNumber } from '../lib/versionLabel';
import { AlbumArt } from './AlbumArt';
import PressableScale from './PressableScale';
import { useNavigation, StackActions } from '@react-navigation/native';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const DISMISS_THRESHOLD = 120;
const ALBUM_ART_SIZE = Math.min(SCREEN_WIDTH - 60, SCREEN_HEIGHT * 0.35);

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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const isPlaylistMode = playlistState !== null;

  const cycleRepeatMode = () => {
    if (!playlistState) return;
    const modes: ('none' | 'one' | 'all')[] = ['none', 'all', 'one'];
    const currentIdx = modes.indexOf(playlistState.repeatMode);
    setRepeatMode(modes[(currentIdx + 1) % 3]);
  };

  // 지금 재생 중인 곡의 상세 화면으로(별점·메모·대표 지정을 바로 하려고)
  const goToSong = () => {
    if (!currentTrack) return;
    minimizePlayer();
    const songId = currentTrack.song.id;
    // 노래 탭 스택 위에 곡 상세를 쌓는다. navigate(탭, { screen }) 은 열려 있던 상세 화면을
    // 다른 곡으로 바꿔 버리고(뒤로가기로 못 돌아감), 편집기의 확인 없이 화면을 지운다.
    navigation.navigate('HomeTab');
    const homeStack = navigation.getState?.()?.routes?.find((r: any) => r.name === 'HomeTab')?.state;
    const top = homeStack?.routes?.[homeStack.index ?? 0];
    if (!homeStack?.key) {
      navigation.navigate('HomeTab', { screen: 'SongDetail', params: { songId } });
    } else if (!(top?.name === 'SongDetail' && top?.params?.songId === songId)) {
      navigation.dispatch({ ...StackActions.push('SongDetail', { songId }), target: homeStack.key });
    }
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
        // 다른 응답자가 제스처를 가져가도 offset이 남아 시트가 어중간한 위치에 걸리지 않게 정리
        onPanResponderTerminate: () => {
          translateY.flattenOffset();
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
          }).start();
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
          paddingBottom: insets.bottom,
        },
      ]}
      // 접힌 상태(화면 아래로 내려간 상태)에서는 터치를 받지 않는다
      pointerEvents={isExpanded ? 'auto' : 'none'}
      {...panResponder.panHandlers}
    >
      {/* 드래그 핸들 영역 */}
      <View style={styles.handleArea}>
        <View style={styles.handle} />
      </View>

      {/* 헤더 */}
      <View style={styles.header}>
        <PressableScale style={styles.headerButton} onPress={minimizePlayer} accessibilityLabel="플레이어 접기">
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </PressableScale>
        {isPlaylistMode && playlistState ? (
          <Text style={styles.headerTitle}>
            {playlistState.currentIndex + 1} / {playlistState.items.length}
          </Text>
        ) : (
          <View />
        )}
        <PressableScale style={styles.headerButton} onPress={goToSong} accessibilityLabel="곡으로 이동" testID="now-playing-go-to-song">
          <Ionicons name="musical-note-outline" size={24} color={colors.text} />
        </PressableScale>
      </View>

      {/* 앨범 아트 */}
      <View style={styles.albumArtContainer}>
        <View style={styles.albumShadow}>
          <AlbumArt
            uri={currentTrack.song.artworkUrl}
            size={ALBUM_ART_SIZE}
            iconSize={Math.min(120, ALBUM_ART_SIZE * 0.3)}
            borderRadius={28}
          />
        </View>
      </View>

      {/* 곡 정보 */}
      <View style={styles.songInfo}>
        <Text style={styles.songTitle}>{currentTrack.song.title}</Text>
        {(currentTrack.song.artist || currentTrack.versionNumber) && (
          <Text style={styles.songArtist}>
            {[currentTrack.song.artist, formatVersionNumber(currentTrack.versionNumber)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={16} color={colors.star} />
          <Text style={styles.ratingText}>{currentTrack.version.rating}</Text>
        </View>
      </View>

      {/* 오디오 플레이어 */}
      <View style={styles.playerContainer}>
        {/* 펼쳐져 있을 때만 마운트: 접힌 상태에서 250ms 진행률 폴링이 계속 돌지 않게 */}
        {isExpanded && (
          <AudioPlayer
            onTrackEnd={isPlaylistMode ? handleTrackEnd : undefined}
            showPlaylistControls={isPlaylistMode}
            onPrevious={playPrevious}
            onNext={playNext}
            repeatMode={playlistState?.repeatMode}
            onRepeatModeChange={cycleRepeatMode}
          />
        )}
      </View>

      {/* 메모 */}
      {currentTrack.version.memo && (
        <View style={styles.memoContainer}>
          <Ionicons name="document-text-outline" size={16} color={colors.textMuted} />
          <Text style={styles.memoText}>{currentTrack.version.memo}</Text>
        </View>
      )}
    </Animated.View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
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
    backgroundColor: colors.border,
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
    color: colors.textMuted,
  },
  albumArtContainer: {
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: spacing.lg,
  },
  albumShadow: {
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  songInfo: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  songTitle: {
    fontFamily: fontFamily.extrabold,
    fontSize: 24,
    letterSpacing: -0.4,
    color: colors.text,
    textAlign: 'center',
  },
  songArtist: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.textMuted,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  ratingText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  trackIndicator: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.textMuted,
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
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
  },
  memoText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
});
