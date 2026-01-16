import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';
import { colors, spacing, typography } from '../lib/theme';

export default function MiniPlayer() {
  const { currentTrack, isPlaying, isExpanded, setIsPlaying, expandPlayer, closePlayer } = usePlayer();

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
        <Ionicons name="musical-notes" size={20} color={colors.textSecondary} />
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
          onPress={() => setIsPlaying(!isPlaying)}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={24}
            color={colors.textPrimary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={closePlayer}
        >
          <Ionicons name="close" size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
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
    backgroundColor: colors.surfaceLight,
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
    color: colors.textPrimary,
  },
  artist: {
    ...typography.caption,
    color: colors.textSecondary,
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
