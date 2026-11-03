import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, fontFamily } from '../lib/theme';
import { haptic } from '../lib/haptics';

// 설정 화면용 묶음 목록(inset grouped list) 부품들

type IconName = keyof typeof Ionicons.glyphMap;

export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      <View style={styles.group}>
        {items.map((child, i) => (
          <View key={i} style={i < items.length - 1 ? styles.divider : undefined}>
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

interface RowProps {
  icon?: IconName;
  label: string;
  caption?: string;
  /** 오른쪽에 붙는 값 텍스트 */
  value?: string;
  /** 오른쪽에 붙는 임의 요소(스위치 등) */
  right?: React.ReactNode;
  /** 라벨 아래에 붙는 요소(세그먼트·별점 등) */
  below?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  chevron?: boolean;
  testID?: string;
}

export function SettingsRow({ icon, label, caption, value, right, below, onPress, disabled, chevron, testID }: RowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const content = (
    <>
      <View style={styles.rowMain}>
        {icon && (
          <View style={styles.iconWrap}>
            <Ionicons name={icon} size={18} color={colors.text} />
          </View>
        )}
        <View style={styles.rowText}>
          <Text style={styles.label}>{label}</Text>
          {caption && <Text style={styles.caption}>{caption}</Text>}
        </View>
        {value !== undefined && <Text style={styles.value} numberOfLines={1}>{value}</Text>}
        {right}
        {chevron && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
      </View>
      {below && <View style={[styles.below, icon && styles.belowIndented]}>{below}</View>}
    </>
  );
  if (!onPress) {
    return <View style={styles.row} testID={testID}>{content}</View>;
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
    >
      {content}
    </Pressable>
  );
}

export function SettingsSwitch({
  value,
  onValueChange,
  testID,
  label,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  testID?: string;
  label: string;
}) {
  const { colors, scheme } = useTheme();
  const accent = scheme === 'dark' ? colors.accent : colors.accentStrong;
  return (
    <Switch
      value={value}
      onValueChange={(v) => {
        haptic('selection');
        onValueChange(v);
      }}
      trackColor={{ true: accent, false: colors.border }}
      thumbColor={colors.surface}
      ios_backgroundColor={colors.border}
      accessibilityLabel={label}
      testID={testID}
    />
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  testID,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
}) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accent = scheme === 'dark' ? colors.accent : colors.accentStrong;
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" testID={testID}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
            onPress={() => {
              if (selected) return;
              haptic('selection');
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            testID={testID ? `${testID}-${o.value}` : undefined}
          >
            <Text style={[styles.segmentText, selected && { color: accent, fontFamily: fontFamily.bold }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: ColorTokens) =>
  StyleSheet.create({
    section: { marginTop: spacing.xl, paddingHorizontal: spacing.lg },
    sectionTitle: {
      fontFamily: fontFamily.semibold,
      fontSize: 12,
      letterSpacing: 0.6,
      color: c.textMuted,
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.sm,
    },
    group: {
      backgroundColor: c.surface,
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      overflow: 'hidden',
    },
    divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
    row: { minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, justifyContent: 'center' },
    rowPressed: { backgroundColor: c.surfaceAlt },
    disabled: { opacity: 0.5 },
    rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    iconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: { flex: 1 },
    label: { fontFamily: fontFamily.medium, fontSize: 16, color: c.text },
    caption: { fontFamily: fontFamily.regular, fontSize: 13, color: c.textMuted, marginTop: 2 },
    value: { fontFamily: fontFamily.medium, fontSize: 15, color: c.textMuted, maxWidth: '50%' },
    below: { marginTop: spacing.md },
    belowIndented: { marginLeft: 32 + spacing.md },
    segmented: {
      flexDirection: 'row',
      backgroundColor: c.surfaceAlt,
      borderRadius: borderRadius.md,
      padding: 3,
      gap: 3,
    },
    segment: {
      flex: 1,
      minHeight: 38,
      borderRadius: borderRadius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
    },
    segmentSelected: {
      backgroundColor: c.surface,
      shadowColor: c.text,
      shadowOpacity: 0.08,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    segmentText: { fontFamily: fontFamily.medium, fontSize: 14, color: c.textMuted },
  });
