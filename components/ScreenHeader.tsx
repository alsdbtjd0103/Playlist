import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '../lib/theme';

interface ScreenHeaderProps {
  onAddPress?: () => void;
  showAddButton?: boolean;
}

export default function ScreenHeader({ onAddPress, showAddButton = true }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.logo}>
        <Ionicons name="musical-notes" size={20} color={colors.primary} />
        <Text style={styles.logoText}>Playlist</Text>
      </View>
      {showAddButton && onAddPress ? (
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onAddPress}
        >
          <Ionicons name="add" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.iconButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    height: 56, // 정확한 고정 높이
    minHeight: 56,
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: 40, // 로고 영역 고정 높이
  },
  logoText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 24, // 텍스트 라인 높이 고정
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
