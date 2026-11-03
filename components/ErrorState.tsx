import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, fontFamily, borderRadius, spacing } from '../lib/theme';
import PressableScale from './PressableScale';

// 불러오기 실패 시 로딩 표시가 끝나지 않는 대신 보여 주는 화면
export default function ErrorState({ message = '불러오지 못했어요', onRetry }: { message?: string; onRetry: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container} testID="error-state">
      <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
      <Text style={styles.message}>{message}</Text>
      <PressableScale style={styles.button} onPress={onRetry} haptic="light" testID="error-retry">
        <Text style={styles.buttonText}>다시 시도</Text>
      </PressableScale>
    </View>
  );
}

const makeStyles = (c: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
    message: { fontFamily: fontFamily.medium, fontSize: 15, color: c.textMuted, textAlign: 'center' },
    button: {
      marginTop: spacing.sm,
      height: 44,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.full,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      justifyContent: 'center',
    },
    buttonText: { fontFamily: fontFamily.semibold, fontSize: 15, color: c.text },
  });
