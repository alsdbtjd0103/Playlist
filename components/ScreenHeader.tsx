import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, fontFamily } from '../lib/theme';
import Waveform from './Waveform';
import PressableScale from './PressableScale';

export interface HeaderAction {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  testID?: string;
}

interface ScreenHeaderProps {
  /** 큰 볼드 제목. 뒤로가기가 있으면 한 줄짜리 작은 제목으로 표시한다. */
  title?: string;
  subtitle?: string;
  /** 홈처럼 plilog 워드마크를 제목 자리에 둔다 */
  showWordmark?: boolean;
  onBack?: () => void;
  actions?: HeaderAction[];
}

// 모든 화면이 같은 헤더를 쓴다: [뒤로] 제목 ...... [액션들]
export default function ScreenHeader({ title, subtitle, showWordmark, onBack, actions = [] }: ScreenHeaderProps) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const wordColor = scheme === 'dark' ? colors.accent : colors.accentStrong;
  const compact = !!onBack;

  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      {onBack && (
        <PressableScale
          style={styles.iconButton}
          onPress={onBack}
          accessibilityLabel="뒤로"
          testID="header-back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </PressableScale>
      )}
      <View style={styles.titleWrap}>
        {showWordmark ? (
          <View style={styles.logo}>
            <Waveform size={22} />
            <Text style={[styles.logoText, { color: wordColor }]}>plilog</Text>
          </View>
        ) : (
          title !== undefined && (
            <Text style={compact ? styles.titleCompact : styles.title} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
          )
        )}
        {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      <View style={styles.right}>
        {actions.map((a) => (
          <PressableScale
            key={a.label}
            style={styles.iconButton}
            onPress={a.onPress}
            accessibilityLabel={a.label}
            testID={a.testID}
            hitSlop={6}
            haptic="light"
          >
            <Ionicons name={a.icon} size={24} color={colors.text} />
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (c: ColorTokens) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      minHeight: 64,
      gap: spacing.xs,
    },
    headerCompact: {
      paddingHorizontal: spacing.sm,
      minHeight: 56,
    },
    titleWrap: { flex: 1, justifyContent: 'center' },
    title: {
      fontFamily: fontFamily.extrabold,
      fontSize: 30,
      letterSpacing: -0.6,
      color: c.text,
    },
    titleCompact: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: c.text,
    },
    subtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: c.textMuted,
      marginTop: 2,
    },
    logo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 44 },
    logoText: { fontFamily: fontFamily.wordmark, fontSize: 26, letterSpacing: -1, lineHeight: 30 },
    right: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
