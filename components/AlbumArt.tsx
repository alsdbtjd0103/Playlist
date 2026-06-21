import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius as radii } from '../lib/theme';

interface Props {
  uri?: string;
  size: number;
  iconSize?: number;
  borderRadius?: number;
}

export function AlbumArt({ uri, size, iconSize, borderRadius }: Props) {
  const r = borderRadius ?? radii.md;
  if (uri) {
    return (
      <Image
        testID="album-art-image"
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.surfaceLight }}
      />
    );
  }
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: r }]}>
      <Ionicons name="musical-notes" size={iconSize ?? Math.round(size / 2)} color={colors.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
