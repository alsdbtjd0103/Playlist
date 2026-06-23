import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { RootStackParamList, Version } from '../types';
import { getVersion, addVersion, deleteVersion } from '../lib/database';
import { saveDenoisedFile, deleteAudioLocally } from '../lib/storage';
import { denoiseToFile, onDenoiseProgress, DenoiseResult } from '../lib/nativeDenoise';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, typography } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Denoise'>;
type Phase = 'processing' | 'ready' | 'error';

export default function DenoiseScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { versionId } = route.params;

  const [version, setVersion] = useState<Version | null>(null);
  const [phase, setPhase] = useState<Phase>('processing');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<DenoiseResult | null>(null);
  const [saving, setSaving] = useState(false);

  const origPlayer = useAudioPlayer(version ? { uri: version.storageUrl } : null);
  const cleanPlayer = useAudioPlayer(result ? { uri: result.uri } : null);
  const origStatus = useAudioPlayerStatus(origPlayer);
  const cleanStatus = useAudioPlayerStatus(cleanPlayer);
  const startedRef = useRef(false);

  // 로드 + 잡음 제거 처리 시작
  useEffect(() => {
    const sub = onDenoiseProgress((p) => setProgress(p));
    (async () => {
      const v = await getVersion(versionId);
      if (!v) {
        Alert.alert('오류', '녹음을 찾을 수 없습니다.');
        navigation.goBack();
        return;
      }
      setVersion(v);
      if (startedRef.current) return;
      startedRef.current = true;
      try {
        const r = await denoiseToFile(v.storageUrl);
        setResult(r);
        setPhase('ready');
      } catch {
        setPhase('error');
      }
    })();
    return () => sub?.remove();
  }, [versionId]);

  const stopBoth = () => {
    origPlayer.pause();
    cleanPlayer.pause();
  };

  const playOriginal = () => {
    if (origStatus.playing) { origPlayer.pause(); return; }
    cleanPlayer.pause();
    origPlayer.seekTo(0);
    origPlayer.play();
  };

  const playClean = () => {
    if (cleanStatus.playing) { cleanPlayer.pause(); return; }
    origPlayer.pause();
    cleanPlayer.seekTo(0);
    cleanPlayer.play();
  };

  const saveNew = async (): Promise<boolean> => {
    if (!version || !result) return false;
    const { fileName, localUri } = await saveDenoisedFile(version.songId, result.uri);
    await addVersion(
      version.songId,
      fileName,
      localUri,
      version.rating,
      version.duration,
      version.memo,
      { waveform: result.waveform ?? version.waveform, editedFrom: version.id }
    );
    return true;
  };

  const handleSaveNew = async () => {
    setSaving(true);
    try {
      stopBoth();
      if (await saveNew()) navigation.goBack();
    } catch {
      Alert.alert('오류', '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleReplace = () => {
    Alert.alert('원본 대체', '원본 녹음을 삭제하고 정제본으로 대체할까요? 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '대체',
        style: 'destructive',
        onPress: async () => {
          if (!version) return;
          setSaving(true);
          try {
            stopBoth();
            if (await saveNew()) {
              await deleteVersion(version.id);
              await deleteAudioLocally(version.storageUrl);
              navigation.goBack();
            }
          } catch {
            Alert.alert('오류', '저장에 실패했습니다.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  if (!version || phase === 'processing') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.progressText}>
          정제 중{progress > 0 ? ` ${Math.round(progress * 100)}%` : '…'}
        </Text>
        <Text style={styles.hintText}>배경 잡음을 줄이고 있어요</Text>
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.progressText}>잡음 제거에 실패했어요</Text>
        <TouchableOpacity style={styles.saveButton} onPress={() => navigation.goBack()} testID="denoise-close-button">
          <Text style={styles.saveText}>닫기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { stopBoth(); navigation.goBack(); }} testID="denoise-back-button">
          <Ionicons name="chevron-down" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>잡음 제거</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <Text style={styles.lenText}>원본과 정제본을 비교해 보세요</Text>

        <TouchableOpacity style={styles.abButton} onPress={playOriginal} testID="denoise-play-original">
          <Ionicons name={origStatus.playing ? 'pause' : 'play'} size={24} color={colors.text} />
          <Text style={styles.abText}>원본 듣기</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.abButton, styles.abClean]} onPress={playClean} testID="denoise-play-clean">
          <Ionicons name={cleanStatus.playing ? 'pause' : 'play'} size={24} color={colors.onAccent} />
          <Text style={[styles.abText, { color: colors.onAccent }]}>정제본 듣기</Text>
        </TouchableOpacity>

        <Text style={styles.hintText}>정제본이 마음에 들 때만 저장하세요</Text>
      </View>

      <View style={styles.saveRow}>
        <TouchableOpacity
          style={[styles.overwriteButton, saving && styles.disabled]}
          onPress={handleReplace}
          disabled={saving}
          testID="denoise-save-replace"
        >
          <Text style={styles.overwriteButtonText}>원본 대체</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.disabled]}
          onPress={handleSaveNew}
          disabled={saving}
          testID="denoise-save-new"
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

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, backgroundColor: colors.bg },
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
  progressText: { ...typography.body, fontWeight: '600', color: colors.text },
  hintText: { ...typography.bodySmall, color: colors.textMuted },
  abButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    minWidth: 200,
    justifyContent: 'center',
  },
  abClean: { backgroundColor: colors.accentStrong },
  abText: { ...typography.body, fontWeight: '600', color: colors.text },
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
