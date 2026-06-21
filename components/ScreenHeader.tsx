import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, fontFamily } from '../lib/theme';
import Waveform from './Waveform';
import ThemeToggle from './ThemeToggle';

interface ScreenHeaderProps {
  onAddPress?: () => void;
  showAddButton?: boolean;
}

export default function ScreenHeader({ onAddPress, showAddButton = true }: ScreenHeaderProps) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const wordColor = scheme === 'dark' ? colors.accent : colors.accentStrong;

  return (
    <View style={styles.header}>
      <View style={styles.logo}>
        <Waveform size={20} />
        <Text style={[styles.logoText, { color: wordColor }]}>plilog</Text>
      </View>
      <View style={styles.right}>
        <ThemeToggle />
        {showAddButton && onAddPress ? (
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onAddPress}
            testID="add-song-button"
            accessibilityLabel="곡 추가"
          >
            <Ionicons name="add" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconButton} />
        )}
      </View>
    </View>
  );
}

const makeStyles = (c: ColorTokens) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      height: 56,
      minHeight: 56,
    },
    logo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      height: 40,
    },
    logoText: {
      fontFamily: fontFamily.wordmark,
      fontSize: 20,
      letterSpacing: -0.8,
      lineHeight: 24,
    },
    right: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
