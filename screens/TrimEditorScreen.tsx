import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { RootStackParamList, Version } from '../types';
import { getVersion, applyTrimToVersion, createTrimmedVersion } from '../lib/database';
import { clampTrimRange, trimmedDuration, isPastTrimEnd, TrimRange } from '../lib/trim';
import { WaveformView } from '../components/WaveformView';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, typography } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TrimEditor'>;

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export default function TrimEditorScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { versionId } = route.params;
  const [version, setVersion] = useState<Version | null>(null);
  const [range, setRange] = useState<TrimRange>({ start: 0, end: 0 });
  const [saving, setSaving] = useState(false);

  const player = useAudioPlayer(version ? { uri: version.storageUrl } : null);
  const status = useAudioPlayerStatus(player);
  const previewingRef = useRef(false);

  useEffect(() => {
    (async () => {
      const v = await getVersion(versionId);
      if (!v) {
        Alert.alert('오류', '녹음을 찾을 수 없습니다.');
        navigation.goBack();
        return;
      }
      setVersion(v);
      const dur = v.duration ?? 0;
      setRange(v.trim ?? { start: 0, end: dur });
    })();
  }, [versionId]);

  useEffect(() => {
    if (version && !version.trim && range.end === 0 && status.duration > 0) {
      setRange({ start: 0, end: status.duration });
    }
  }, [version, status.duration, range.end]);

  const duration = version?.duration ?? status.duration ?? 0;

  // 구간 끝 도달 시 미리듣기 정지
  useEffect(() => {
    if (previewingRef.current && isPastTrimEnd(status.currentTime, range)) {
      player.pause();
      previewingRef.current = false;
    }
  }, [status.currentTime, range]);

  const handlePreview = async () => {
    if (status.playing) {
      player.pause();
      previewingRef.current = false;
      return;
    }
    await player.seekTo(range.start);
    previewingRef.current = true;
    player.play();
  };

  const finish = async (mode: 'new' | 'overwrite') => {
    if (!version) return;
    setSaving(true);
    try {
      const safe = clampTrimRange(range, duration);
      if (mode === 'overwrite') {
        await applyTrimToVersion(version.id, safe);
      } else {
        await createTrimmedVersion(version.id, safe);
      }
      navigation.goBack();
    } catch {
      Alert.alert('오류', '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    finish('new');
  };

  const handleOverwrite = () => {
    Alert.alert('원본 덮어쓰기', '되돌릴 수 없어요. 계속할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '덮어쓰기', style: 'destructive', onPress: () => finish('overwrite') },
    ]);
  };

  if (!version) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} testID="trim-close-button">
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>구간 편집</Text>
        <TouchableOpacity onPress={handleOverwrite} style={styles.overwriteButton} testID="trim-overwrite-button">
          <Text style={styles.overwriteText}>덮어쓰기</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.lenText}>{fmt(trimmedDuration(range))} 선택됨</Text>
        <WaveformView
          samples={version.waveform ?? []}
          duration={duration}
          range={range}
          playhead={status.playing ? status.currentTime : undefined}
          onChangeRange={setRange}
          width={340}
          height={140}
        />
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{fmt(range.start)}</Text>
          <Text style={styles.timeText}>{fmt(range.end)}</Text>
        </View>

        <TouchableOpacity
          style={styles.previewButton}
          onPress={handlePreview}
          testID="trim-preview-button"
        >
          <Ionicons name={status.playing ? 'pause' : 'play'} size={28} color={colors.onAccent} />
          <Text style={styles.previewText}>{status.playing ? '일시정지' : '구간 미리듣기'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.disabled]}
        onPress={handleSave}
        disabled={saving}
        testID="trim-save-button"
      >
        {saving ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.saveText}>새 버전으로 저장</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.h3, color: colors.text },
  overwriteButton: { paddingHorizontal: spacing.sm },
  overwriteText: { ...typography.bodySmall, color: colors.danger },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  lenText: { ...typography.body, color: colors.textMuted },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', width: 340 },
  timeText: { ...typography.bodySmall, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentStrong,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    marginTop: spacing.lg,
  },
  previewText: { ...typography.body, fontWeight: '600', color: colors.onAccent },
  saveButton: {
    backgroundColor: colors.accentStrong,
    margin: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  saveText: { ...typography.body, fontWeight: '700', color: colors.onAccent },
  disabled: { opacity: 0.5 },
});
