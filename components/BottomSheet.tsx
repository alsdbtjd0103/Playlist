import React, { useMemo } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, fontFamily } from '../lib/theme';
import { haptic } from '../lib/haptics';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  testID?: string;
}

// 화면 아래에서 올라오는 시트. 바깥을 누르거나 뒤로가기로 닫힌다.
// 버튼 위치에 붙던 드롭다운(화면 밖으로 잘림)을 대신한다.
export default function BottomSheet({ visible, onClose, title, subtitle, children, testID }: BottomSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} testID={testID}>
          <View style={styles.handle} />
          {(title || subtitle) && (
            <View style={styles.header}>
              {title && <Text style={styles.title} numberOfLines={1}>{title}</Text>}
              {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
            </View>
          )}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface SheetActionProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  description?: string;
  testID?: string;
}

export function SheetAction({ icon, label, onPress, destructive, description, testID }: SheetActionProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tint = destructive ? colors.danger : colors.text;
  return (
    <Pressable
      style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      onPress={() => {
        haptic('selection');
        onPress();
      }}
      testID={testID}
      accessibilityRole="button"
    >
      <View style={[styles.actionIcon, destructive && styles.actionIconDanger]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.actionLabel, { color: tint }]}>{label}</Text>
        {description && <Text style={styles.actionDesc}>{description}</Text>}
      </View>
    </Pressable>
  );
}

const makeStyles = (c: ColorTokens) =>
  StyleSheet.create({
    flex: { flex: 1 },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay,
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.surface,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      marginBottom: spacing.md,
    },
    header: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      gap: 2,
    },
    title: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: c.text,
    },
    subtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: c.textMuted,
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.lg,
    },
    actionPressed: {
      backgroundColor: c.surfaceAlt,
    },
    actionIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceAlt,
    },
    actionIconDanger: {
      backgroundColor: c.bg,
    },
    actionLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: 16,
    },
    actionDesc: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: c.textMuted,
      marginTop: 2,
    },
  });
