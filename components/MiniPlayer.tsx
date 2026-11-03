import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useProgress } from 'react-native-track-player';
import { usePlayer } from '../contexts/PlayerContext';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, fontFamily, borderRadius } from '../lib/theme';
import { formatVersionNumber } from '../lib/versionLabel';
import { AlbumArt } from './AlbumArt';
import PressableScale from './PressableScale';

// 진행률 폴링을 이 막대에만 가둬서 미니 플레이어 전체가 매번 다시 그려지지 않게 한다
function ProgressLine({ color, track }: { color: string; track: string }) {
  const { position, duration } = useProgress(1000);
  const ratio = duration > 0 ? Math.min(1, position / duration) : 0;
  return (
    <View style={[progressStyles.track, { backgroundColor: track }]}>
      <View style={[progressStyles.fill, { backgroundColor: color, width: `${ratio * 100}%` }]} />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: { position: 'absolute', left: 14, right: 14, bottom: 0, height: 2, borderRadius: 1, overflow: 'hidden' },
  fill: { height: 2 },
});

// 탭바 위에 떠 있는 반투명(블러) 카드 형태의 미니 플레이어
export default function MiniPlayer() {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { currentTrack, isPlaying, isExpanded, expandPlayer, closePlayer, togglePlayPause } = usePlayer();

  if (!currentTrack || isExpanded) {
    return null;
  }

  const subtitle = [currentTrack.song.artist, formatVersionNumber(currentTrack.versionNumber)]
    .filter(Boolean)
    .join(' · ');
  const accent = scheme === 'dark' ? colors.accent : colors.accentStrong;

  return (
    <PressableScale style={styles.card} onPress={expandPlayer} scaleTo={0.98} testID="mini-player">
      {/* Android 블러는 비용이 커서 반투명 면으로 대신하고, iOS 만 실제 블러를 쓴다 */}
      {Platform.OS === 'ios' ? (
        <BlurView intensity={60} tint={scheme === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
      <AlbumArt uri={currentTrack.song.artworkUrl} size={44} iconSize={20} />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {currentTrack.song.title}
        </Text>
        {subtitle.length > 0 && (
          <Text style={styles.artist} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      <PressableScale
        style={styles.controlButton}
        onPress={togglePlayPause}
        haptic="light"
        accessibilityLabel={isPlaying ? '일시정지' : '재생'}
        testID="mini-player-toggle"
      >
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={26} color={accent} />
      </PressableScale>
      <PressableScale style={styles.controlButton} onPress={closePlayer} accessibilityLabel="플레이어 닫기">
        <Ionicons name="close" size={22} color={colors.textMuted} />
      </PressableScale>
      <ProgressLine color={accent} track={colors.border} />
    </PressableScale>
  );
}

const makeStyles = (c: ColorTokens) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingLeft: spacing.sm,
      paddingRight: spacing.xs,
      height: 62,
      borderRadius: borderRadius.xl,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    tint: {
      backgroundColor: c.surface,
      opacity: Platform.OS === 'ios' ? 0.7 : 0.96,
    },
    info: { flex: 1, justifyContent: 'center' },
    title: { fontFamily: fontFamily.semibold, fontSize: 15, color: c.text },
    artist: { fontFamily: fontFamily.regular, fontSize: 12, color: c.textMuted, marginTop: 2 },
    controlButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  });
