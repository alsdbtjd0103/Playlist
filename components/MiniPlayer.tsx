import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, typography } from '../lib/theme';

export default function MiniPlayer() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { currentTrack, isPlaying, isExpanded, expandPlayer, closePlayer, togglePlayPause } = usePlayer();

  if (!currentTrack || isExpanded) {
    return null;
  }

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={expandPlayer}
      activeOpacity={0.9}
    >
      <View style={styles.thumbnail}>
        <Ionicons name="musical-notes" size={20} color={colors.accent} />
      </View>

      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {currentTrack.song.title}
        </Text>
        {currentTrack.song.artist && (
          <Text style={styles.artist} numberOfLines={1}>
            {currentTrack.song.artist}
          </Text>
        )}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={togglePlayPause}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={24}
            color={colors.accent}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={closePlayer}
        >
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.body,
    fontWeight: '500',
    color: colors.text,
  },
  artist: {
    ...typography.caption,
    color: colors.textMuted,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  controlButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
