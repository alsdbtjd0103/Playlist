import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatKey } from '../lib/keyLabel';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, fontFamily } from '../lib/theme';

interface KeyBadgeProps {
  value?: number;
  /** 미설정일 때 placeholder 배지를 보여줄지(편집 진입점용). 기본 false → 아무것도 렌더 안 함. */
  showPlaceholder?: boolean;
  onPress?: () => void;
  size?: 'sm' | 'md';
}

/** 노래방 키(반음 오프셋) 표시 배지. value가 미설정이면 기본적으로 렌더하지 않는다. */
export default function KeyBadge({ value, showPlaceholder = false, onPress, size = 'sm' }: KeyBadgeProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const label = formatKey(value);
  if (label === null && !showPlaceholder) return null;

  const isOriginal = value === 0;
  const text = label ?? '키 설정';
  const tone = label === null ? colors.textMuted : isOriginal ? colors.textMuted : colors.accentStrong;

  const content = (
    <View
      style={[
        styles.badge,
        size === 'md' && styles.badgeMd,
        { borderColor: tone },
      ]}
    >
      <Ionicons name="musical-note" size={size === 'md' ? 13 : 11} color={tone} />
      <Text style={[styles.text, size === 'md' && styles.textMd, { color: tone }]}>{text}</Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityLabel={`키 ${text}`}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.sm,
      borderWidth: 1,
      backgroundColor: colors.surfaceAlt,
    },
    badgeMd: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    text: {
      fontFamily: fontFamily.semibold,
      fontSize: 12,
      fontWeight: '600',
    },
    textMd: {
      fontSize: 14,
    },
  });
