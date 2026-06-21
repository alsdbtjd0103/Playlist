import React, { useMemo } from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, borderRadius as radii } from '../lib/theme';

interface Props {
  uri?: string;
  size: number;
  iconSize?: number;
  borderRadius?: number;
}

export function AlbumArt({ uri, size, iconSize, borderRadius }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const r = borderRadius ?? radii.md;
  if (uri) {
    return (
      <Image
        testID="album-art-image"
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.surfaceAlt }}
      />
    );
  }
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: r }]}>
      <Ionicons name="musical-notes" size={iconSize ?? Math.round(size / 2)} color={colors.accent} />
    </View>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    fallback: {
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
