import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { backupProgressRatio, BackupProgress } from '../lib/backup';
import { ColorTokens, spacing, borderRadius, typography } from '../lib/theme';

interface Props {
  title: string;
  progress: BackupProgress | null;
}

const phaseLabel = (p: BackupProgress | null): string => {
  if (!p) return '준비 중';
  switch (p.phase) {
    case 'copy':
      return `녹음 파일 준비 중 ${p.done}/${p.total}`;
    case 'zip':
      return '백업 파일 만드는 중';
    case 'unzip':
      return '백업 파일 여는 중';
    case 'restore':
      return `녹음 파일 복원 중 ${p.done}/${p.total}`;
    default:
      return '마무리하는 중';
  }
};

// 백업/복원 진행 오버레이: 화면 전체를 덮어 다른 조작을 막고 진행률을 보여준다
export default function BackupProgressOverlay({ title, progress }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const ratio = progress ? backupProgressRatio(progress) : 0;
  const percent = Math.round(ratio * 100);

  return (
    <View style={styles.overlay} testID="backup-progress-overlay">
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.phase} numberOfLines={1}>{phaseLabel(progress)}</Text>
          <Text style={styles.percent}>{`${percent}%`}</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { ...typography.body, color: colors.text, fontWeight: '600' },
  track: {
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: borderRadius.full },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  phase: { ...typography.caption, color: colors.textMuted, flex: 1 },
  percent: { ...typography.caption, color: colors.text, fontWeight: '600' },
});
