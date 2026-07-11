import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatKey, clampKey, KEY_MIN, KEY_MAX } from '../lib/keyLabel';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, typography, fontFamily } from '../lib/theme';

interface KeyPickerModalProps {
  visible: boolean;
  title?: string;
  initialValue?: number;
  onClose: () => void;
  onSave: (key: number) => void;
}

/** −/+ 스텝퍼로 노래방 키(반음)를 고르는 바텀시트. 곡·버전 키 편집 공용. */
export default function KeyPickerModal({
  visible,
  title = '키 설정',
  initialValue,
  onClose,
  onSave,
}: KeyPickerModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [value, setValue] = useState<number>(initialValue ?? 0);

  useEffect(() => {
    if (visible) setValue(clampKey(initialValue ?? 0));
  }, [visible, initialValue]);

  const dec = () => setValue((v) => clampKey(v - 1));
  const inc = () => setValue((v) => clampKey(v + 1));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={[styles.stepBtn, value <= KEY_MIN && styles.stepBtnDisabled]}
              onPress={dec}
              disabled={value <= KEY_MIN}
            >
              <Ionicons name="remove" size={28} color={colors.text} />
            </TouchableOpacity>

            <View style={styles.valueBox}>
              <Text style={styles.valueText}>{formatKey(value)}</Text>
            </View>

            <TouchableOpacity
              style={[styles.stepBtn, value >= KEY_MAX && styles.stepBtnDisabled]}
              onPress={inc}
              disabled={value >= KEY_MAX}
            >
              <Ionicons name="add" size={28} color={colors.text} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.resetBtn} onPress={() => setValue(0)}>
            <Text style={styles.resetText}>기본값</Text>
          </TouchableOpacity>

          <View style={styles.buttons}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={onClose}>
              <Text style={styles.cancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.confirmButton]}
              onPress={() => onSave(value)}
            >
              <Text style={styles.confirmText}>저장</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    content: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      padding: spacing.xl,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    title: {
      ...typography.h3,
      color: colors.text,
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xl,
      paddingVertical: spacing.lg,
    },
    stepBtn: {
      width: 56,
      height: 56,
      borderRadius: borderRadius.full,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stepBtnDisabled: {
      opacity: 0.4,
    },
    valueBox: {
      minWidth: 96,
      alignItems: 'center',
    },
    valueText: {
      fontFamily: fontFamily.bold,
      fontSize: 32,
      fontWeight: '700',
      color: colors.text,
    },
    resetBtn: {
      alignSelf: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    resetText: {
      ...typography.bodySmall,
      color: colors.accentStrong,
      fontWeight: '600',
    },
    buttons: {
      flexDirection: 'row',
      gap: spacing.md,
      marginTop: spacing.lg,
    },
    button: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      alignItems: 'center',
    },
    cancelButton: {
      backgroundColor: colors.surfaceAlt,
    },
    cancelText: {
      ...typography.body,
      color: colors.text,
      fontWeight: '600',
    },
    confirmButton: {
      backgroundColor: colors.accentStrong,
    },
    confirmText: {
      ...typography.body,
      color: colors.onAccent,
      fontWeight: '600',
    },
  });
