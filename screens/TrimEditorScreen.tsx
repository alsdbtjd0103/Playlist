import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { RootStackParamList, Version } from '../types';
import { getVersion, applyCutsToVersion, createEditedVersion, addVersion } from '../lib/database';
import {
  TrimRange,
  getEffectiveCuts,
  normalizeCuts,
  editedDuration,
  nextKeepStart,
} from '../lib/trim';
import { isAudioEditAvailable, renderCutsToFile } from '../lib/nativeAudioEdit';
import { WaveformView } from '../components/WaveformView';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, typography } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TrimEditor'>;

const DEFAULT_CUT = 2; // 새 구간 기본 길이(초)

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
  const [cuts, setCuts] = useState<TrimRange[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const player = useAudioPlayer(version ? { uri: version.storageUrl } : null);
  const status = useAudioPlayerStatus(player);
  const previewingRef = useRef(false);
  const nativeAvailable = useMemo(() => isAudioEditAvailable(), []);

  const duration = version?.duration || status.duration || 0;

  useEffect(() => {
    (async () => {
      const v = await getVersion(versionId);
      if (!v) {
        Alert.alert('오류', '녹음을 찾을 수 없습니다.');
        navigation.goBack();
        return;
      }
      setVersion(v);
      const dur = v.duration || 0;
      if (dur > 0) setCuts(getEffectiveCuts(v, dur));
    })();
  }, [versionId]);

  // duration을 늦게 알게 된 경우(레거시 trim → cuts) 보정
  useEffect(() => {
    if (version && cuts.length === 0 && duration > 0) {
      const eff = getEffectiveCuts(version, duration);
      if (eff.length) setCuts(eff);
    }
  }, [version, duration]);

  // 미리듣기: cut 구간을 건너뛰며 재생
  useEffect(() => {
    if (!previewingRef.current) return;
    const nxt = nextKeepStart(status.currentTime, cuts, duration);
    if (nxt === null) {
      player.pause();
      previewingRef.current = false;
    } else if (nxt > status.currentTime + 0.05) {
      player.seekTo(nxt);
    }
  }, [status.currentTime, cuts, duration]);

  const handlePreview = async () => {
    if (status.playing) {
      player.pause();
      previewingRef.current = false;
      return;
    }
    const start = nextKeepStart(0, cuts, duration) ?? 0;
    await player.seekTo(start);
    previewingRef.current = true;
    player.play();
  };

  const handleAddCut = () => {
    const at = status.currentTime > 0 ? status.currentTime : 0;
    const start = Math.max(0, Math.min(at, Math.max(0, duration - DEFAULT_CUT)));
    const end = Math.min(duration, start + DEFAULT_CUT);
    if (end - start < 0.1) return;
    const next = normalizeCuts([...cuts, { start, end }], duration);
    setCuts(next);
    const idx = next.findIndex((c) => start >= c.start - 1e-3 && start <= c.end + 1e-3);
    setSelectedIndex(idx === -1 ? null : idx);
  };

  const handleDeleteCut = () => {
    if (selectedIndex === null) return;
    setCuts(cuts.filter((_, i) => i !== selectedIndex));
    setSelectedIndex(null);
  };

  const finish = async (mode: 'new' | 'overwrite') => {
    if (!version) return;
    setSaving(true);
    try {
      const safe = normalizeCuts(cuts, duration);
      if (mode === 'overwrite') {
        await applyCutsToVersion(version.id, safe);
      } else {
        await createEditedVersion(version.id, safe);
      }
      navigation.goBack();
    } catch {
      Alert.alert('오류', '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => finish('new');

  // 실제로 잘라 새 파일 렌더 후 새 버전 저장(네이티브)
  const handleRenderSave = async () => {
    if (!version) return;
    const safe = normalizeCuts(cuts, duration);
    if (safe.length === 0) {
      Alert.alert('알림', '잘라낼 구간을 먼저 추가해주세요.');
      return;
    }
    setSaving(true);
    try {
      const { uri, duration: outDur } = await renderCutsToFile(
        version.storageUrl,
        safe,
        duration,
        version.songId
      );
      const fileName = uri.split('/').pop() || `${version.songId}_edit.m4a`;
      await addVersion(version.songId, fileName, uri, version.rating, outDur, version.memo, {
        waveform: version.waveform,
      });
      navigation.goBack();
    } catch {
      Alert.alert('오류', '렌더링에 실패했습니다.');
    } finally {
      setSaving(false);
    }
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

  const remaining = editedDuration(cuts, duration);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} testID="trim-close-button">
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>구간 편집</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <Text style={styles.lenText}>
          {cuts.length > 0 ? `${cuts.length}개 구간 잘라냄 · 남은 길이 ${fmt(remaining)}` : `잘라낼 구간 없음 · ${fmt(duration)}`}
        </Text>
        <WaveformView
          samples={version.waveform ?? []}
          duration={duration}
          cuts={cuts}
          onChangeCuts={setCuts}
          selectedIndex={selectedIndex}
          onSelectCut={setSelectedIndex}
          playhead={status.playing ? status.currentTime : undefined}
          width={340}
          height={140}
        />

        <View style={styles.editRow}>
          <TouchableOpacity style={styles.editButton} onPress={handleAddCut} testID="trim-add-cut-button">
            <Ionicons name="cut-outline" size={20} color={colors.text} />
            <Text style={styles.editButtonText}>구간 추가</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.editButton, selectedIndex === null && styles.disabled]}
            onPress={handleDeleteCut}
            disabled={selectedIndex === null}
            testID="trim-delete-cut-button"
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.editButtonText, { color: colors.danger }]}>선택 구간 삭제</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.previewButton} onPress={handlePreview} testID="trim-preview-button">
          <Ionicons name={status.playing ? 'pause' : 'play'} size={28} color={colors.onAccent} />
          <Text style={styles.previewText}>{status.playing ? '일시정지' : '구간 미리듣기'}</Text>
        </TouchableOpacity>
      </View>

      {nativeAvailable && cuts.length > 0 && (
        <TouchableOpacity
          style={[styles.renderButton, saving && styles.disabled]}
          onPress={handleRenderSave}
          disabled={saving}
          testID="trim-render-button"
        >
          <Ionicons name="save-outline" size={20} color={colors.onAccent} />
          <Text style={styles.renderButtonText}>실제로 잘라 새 버전 저장</Text>
        </TouchableOpacity>
      )}

      <View style={styles.saveRow}>
        <TouchableOpacity
          style={[styles.overwriteButton, saving && styles.disabled]}
          onPress={handleOverwrite}
          disabled={saving}
          testID="trim-overwrite-button"
        >
          <Text style={styles.overwriteButtonText}>원본 덮어쓰기</Text>
        </TouchableOpacity>
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
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
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
    headerSpacer: { width: 28 },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg },
    lenText: { ...typography.body, color: colors.textMuted },
    editRow: { flexDirection: 'row', gap: spacing.md },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: borderRadius.full,
    },
    editButtonText: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
    previewButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.accentStrong,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.full,
    },
    previewText: { ...typography.body, fontWeight: '600', color: colors.onAccent },
    renderButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: colors.accent,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.md,
      marginHorizontal: spacing.lg,
      marginTop: spacing.md,
    },
    renderButtonText: { ...typography.body, fontWeight: '700', color: colors.onAccent },
    saveRow: { flexDirection: 'row', gap: spacing.md, margin: spacing.lg },
    overwriteButton: {
      flex: 1,
      backgroundColor: colors.surfaceAlt,
      paddingVertical: spacing.lg,
      borderRadius: borderRadius.md,
      alignItems: 'center',
    },
    overwriteButtonText: { ...typography.body, fontWeight: '600', color: colors.danger },
    saveButton: {
      flex: 1,
      backgroundColor: colors.accentStrong,
      paddingVertical: spacing.lg,
      borderRadius: borderRadius.md,
      alignItems: 'center',
    },
    saveText: { ...typography.body, fontWeight: '700', color: colors.onAccent },
    disabled: { opacity: 0.5 },
  });
