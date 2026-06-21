import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

const DEFAULT = [8, 15, 22, 13, 18, 7];

interface Props {
  color?: string;
  size?: number;
  bars?: number[];
}

// 앰버 파형 — plilog 브랜드 코어 모티프(로고/녹음/프로그레스 공통 언어).
export default function Waveform({ color, size = 20, bars = DEFAULT }: Props) {
  const { colors } = useTheme();
  const c = color ?? colors.accent;
  const scale = size / 22;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2.5 * scale, height: size }}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={{ width: 3 * scale, height: h * scale, borderRadius: 3, backgroundColor: c }}
        />
      ))}
    </View>
  );
}
