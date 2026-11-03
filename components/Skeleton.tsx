import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius } from '../lib/theme';

// 목록 첫 로딩 동안 카드 모양 자리표시자를 깜빡이며 보여 준다(가운데 스피너 대신).
export function SkeletonList({ count = 6, rowHeight = 76 }: { count?: number; rowHeight?: number }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.list} testID="skeleton-list" accessibilityLabel="불러오는 중">
      {Array.from({ length: count }).map((_, i) => (
        <Animated.View key={i} style={[styles.row, { height: rowHeight }, pulse]}>
          <View style={styles.thumb} />
          <View style={styles.lines}>
            <View style={[styles.line, { width: '60%' }]} />
            <View style={[styles.line, { width: '35%' }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

const makeStyles = (c: ColorTokens) =>
  StyleSheet.create({
    list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.xl,
      backgroundColor: c.surface,
    },
    thumb: { width: 52, height: 52, borderRadius: borderRadius.md, backgroundColor: c.surfaceAlt },
    lines: { flex: 1, gap: spacing.sm },
    line: { height: 12, borderRadius: 6, backgroundColor: c.surfaceAlt },
  });
