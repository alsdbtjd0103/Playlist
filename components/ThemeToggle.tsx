import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

const ICON = {
  system: 'contrast-outline',
  light: 'sunny-outline',
  dark: 'moon-outline',
} as const;

export default function ThemeToggle() {
  const { colors, mode, cycleMode } = useTheme();
  return (
    <TouchableOpacity
      onPress={cycleMode}
      accessibilityLabel="테마 전환"
      testID="theme-toggle"
      hitSlop={8}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name={ICON[mode]} size={22} color={colors.text} />
    </TouchableOpacity>
  );
}
