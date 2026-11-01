import React, { useMemo } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, fontFamily, borderRadius, spacing } from '../lib/theme';
import PressableScale from './PressableScale';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
}

export default function Chip({ label, selected, onPress, icon, testID }: ChipProps) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const selectedBg = scheme === 'dark' ? colors.accent : colors.accentStrong;
  const fg = selected ? colors.onAccent : colors.text;
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      style={[styles.chip, selected && { backgroundColor: selectedBg, borderColor: selectedBg }]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      testID={testID}
      hitSlop={6}
    >
      <View style={styles.row}>
        {icon && <Ionicons name={icon} size={14} color={fg} />}
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
      </View>
    </PressableScale>
  );
}

const makeStyles = (c: ColorTokens) =>
  StyleSheet.create({
    chip: {
      height: 36,
      paddingHorizontal: spacing.md + 2,
      borderRadius: borderRadius.full,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      justifyContent: 'center',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    label: { fontFamily: fontFamily.semibold, fontSize: 13 },
  });
