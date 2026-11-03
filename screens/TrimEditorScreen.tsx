import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import TrackPlayer from 'react-native-track-player';
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
import { notifyVersionUpdated } from '../lib/playbackStore';
import { WaveformView } from '../components/WaveformView';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, typography, fontFamily } from '../lib/theme';
import PressableScale from '../components/PressableScale';
import BottomSheet, { SheetAction } from '../components/BottomSheet';
import { useToast } from '../contexts/ToastContext';

type Props = NativeStackScreenProps<RootStackParamList, 'TrimEditor'>;

const DEFAULT_CUT = 2; // 새 구간 기본 길이(초)

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

// 편집 여부 비교용: 부동소수 오차를 무시하고 구간 목록을 문자열로 만든다
const cutsKey = (list: TrimRange[]) => list.map((c) => `${c.start.toFixed(2)}-${c.end.toFixed(2)}`).join(',');

export default function TrimEditorScreen({ navigation, route }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accent = scheme === 'dark' ? colors.accent : colors.accentStrong;
  const toast = useToast();
  const { width: windowWidth } = useWindowDimensions();
  const waveformWidth = Math.max(200, windowWidth - spacing.lg * 2);
  const { versionId } = route.params;
  const [version, setVersion] = useState<Version | null>(null);
  const [cuts, setCuts] = useState<TrimRange[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSheetVisible, setSaveSheetVisible] = useState(false);
  // 처음 불러온 구간. 이것과 달라졌으면 닫을 때 확인한다.
  const initialKeyRef = useRef('');
  const allowLeaveRef = useRef(false);

  const player = useAudioPlayer(version ? { uri: version.storageUrl } : null);
  const status = useAudioPlayerStatus(player);
  const previewingRef = useRef(false);
  const nativeAvailable = useMemo(() => isAudioEditAvailable(), []);

  const duration = version?.duration || status.duration || 0;

  useEffect(() => {
    (async () => {
      try {
        const v = await getVersion(versionId);
        if (!v) {
          Alert.alert('녹음을 찾을 수 없어요');
          allowLeaveRef.current = true;
          navigation.goBack();
          return;
        }
        setVersion(v);
        const dur = v.duration || 0;
        if (dur > 0) {
          const eff = getEffectiveCuts(v, dur);
          initialKeyRef.current = cutsKey(eff);
          setCuts(eff);
        }
      } catch (error) {
        console.error('편집할 녹음 불러오기 실패:', error);
        Alert.alert('녹음을 불러오지 못했어요');
        allowLeaveRef.current = true;
        navigation.goBack();
      }
    })();
  }, [versionId]);

  // duration을 늦게 알게 된 경우(레거시 trim → cuts) 보정
  useEffect(() => {
    if (version && cuts.length === 0 && duration > 0) {
      const eff = getEffectiveCuts(version, duration);
      if (eff.length) {
        initialKeyRef.current = cutsKey(eff);
        setCuts(eff);
      }
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
    // 플레이어(TrackPlayer)가 재생 중이면 멈춘다. 그대로 두면 오디오 포커스를 빼앗겼다가
    // 미리듣기가 끝날 때 플레이어가 저절로 다시 재생된다.
    await TrackPlayer.pause().catch(() => undefined);
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
      // 예전 녹음은 길이가 저장돼 있지 않아 재생 시 편집 구간을 못 건너뛰므로 알아낸 길이도 저장한다
      if (mode === 'overwrite') {
        await applyCutsToVersion(version.id, safe, duration);
        // 재생 중인 큐에 이 버전이 있으면 바뀐 구간을 바로 반영한다
        notifyVersionUpdated({ ...version, cuts: safe, duration: version.duration || duration });
      } else {
        await createEditedVersion(version.id, safe, duration);
      }
      toast.show(mode === 'overwrite' ? '편집한 내용을 적용했어요' : '새 버전으로 저장했어요');
      allowLeaveRef.current = true;
      navigation.goBack();
    } catch (error) {
      console.error('편집 저장 실패:', error);
      Alert.alert('저장하지 못했어요', '잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  // 실제로 잘라 새 파일 렌더 후 새 버전 저장(네이티브)
  const handleRenderSave = async () => {
    if (!version) return;
    const safe = normalizeCuts(cuts, duration);
    if (safe.length === 0) {
      Alert.alert('잘라낼 구간을 먼저 추가해 주세요');
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
      toast.show('잘라낸 새 버전을 저장했어요');
      allowLeaveRef.current = true;
      navigation.goBack();
    } catch (error) {
      console.error('편집 파일 만들기 실패:', error);
      Alert.alert('새 파일을 만들지 못했어요', '잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const isDirty = cutsKey(cuts) !== initialKeyRef.current;
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  const confirmDiscard = useCallback((onDiscard: () => void) => {
    Alert.alert('편집한 내용을 버릴까요?', '저장하지 않은 잘라낼 구간은 사라져요.', [
      { text: '계속 편집', style: 'cancel' },
      {
        text: '버리기',
        style: 'destructive',
        onPress: () => {
          allowLeaveRef.current = true;
          onDiscard();
        },
      },
    ]);
  }, []);

  // 스와이프·하드웨어 뒤로가기로 나갈 때도 편집 중이면 확인한다
  useEffect(() => {
    const nav = navigation as any;
    if (typeof nav.addListener !== 'function') return;
    return nav.addListener('beforeRemove', (e: any) => {
      if (allowLeaveRef.current || !dirtyRef.current) return;
      e.preventDefault();
      confirmDiscard(() => navigation.dispatch(e.data.action));
    });
  }, [navigation, confirmDiscard]);

  const handleClose = () => {
    if (isDirty && !allowLeaveRef.current) {
      confirmDiscard(() => navigation.goBack());
      return;
    }
    navigation.goBack();
  };

  const chooseSave = (run: () => void) => {
    setSaveSheetVisible(false);
    run();
  };

  if (!version) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  }

  const remaining = editedDuration(cuts, duration);
  const canRender = nativeAvailable && cuts.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <PressableScale
          style={styles.iconButton}
          onPress={handleClose}
          testID="trim-close-button"
          accessibilityLabel="닫기"
          hitSlop={8}
        >
          <Ionicons name="chevron-down" size={26} color={colors.text} />
        </PressableScale>
        <Text style={styles.headerTitle} accessibilityRole="header">편집</Text>
        <View style={styles.iconButton} />
      </View>

      <View style={styles.body}>
        <Text style={styles.lenText}>
          {cuts.length > 0 ? `${cuts.length}개 구간 잘라냄 · 남은 길이 ${fmt(remaining)}` : `잘라낼 구간 없음 · ${fmt(duration)}`}
        </Text>
        <View style={styles.waveCard}>
          <WaveformView
            samples={version.waveform ?? []}
            duration={duration}
            cuts={cuts}
            onChangeCuts={setCuts}
            selectedIndex={selectedIndex}
            onSelectCut={setSelectedIndex}
            playhead={status.playing ? status.currentTime : undefined}
            width={waveformWidth - spacing.lg * 2}
            height={140}
          />
        </View>
        <Text style={styles.hint}>구간 양 끝을 끌어서 길이를 조절해요</Text>

        <View style={styles.editRow}>
          <PressableScale style={styles.editButton} onPress={handleAddCut} testID="trim-add-cut-button" haptic="light">
            <Ionicons name="cut-outline" size={20} color={colors.text} />
            <Text style={styles.editButtonText}>구간 추가</Text>
          </PressableScale>
          <PressableScale
            style={[styles.editButton, selectedIndex === null && styles.disabled]}
            onPress={handleDeleteCut}
            disabled={selectedIndex === null}
            testID="trim-delete-cut-button"
          >
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={[styles.editButtonText, { color: colors.danger }]}>선택 구간 삭제</Text>
          </PressableScale>
        </View>

        <PressableScale style={styles.previewButton} onPress={handlePreview} testID="trim-preview-button" haptic="light">
          <Ionicons name={status.playing ? 'pause' : 'play'} size={22} color={colors.text} />
          <Text style={styles.previewText}>{status.playing ? '일시정지' : '편집한 대로 미리듣기'}</Text>
        </PressableScale>
      </View>

      <PressableScale
        style={[styles.saveButton, { backgroundColor: accent }, saving && styles.disabled]}
        onPress={() => setSaveSheetVisible(true)}
        disabled={saving}
        testID="trim-save-button"
        haptic="medium"
      >
        {saving ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.saveText}>저장</Text>
        )}
      </PressableScale>

      <BottomSheet
        visible={saveSheetVisible}
        onClose={() => setSaveSheetVisible(false)}
        title="어떻게 저장할까요?"
        testID="trim-save-sheet"
      >
        <SheetAction
          icon="copy-outline"
          label="새 버전으로 저장"
          description="원본은 그대로 두고 새 버전을 만들어요"
          onPress={() => chooseSave(() => finish('new'))}
          testID="trim-save-new"
        />
        <SheetAction
          icon="checkmark-circle-outline"
          label="이 버전에 적용"
          description="원본 녹음 파일은 그대로 두고 잘라낼 구간만 바뀌어요"
          onPress={() => chooseSave(() => finish('overwrite'))}
          testID="trim-overwrite-button"
        />
        {canRender && (
          <SheetAction
            icon="cut-outline"
            label="잘라서 새 파일로 저장"
            description="잘라낸 부분을 실제로 지운 새 파일을 만들어요"
            onPress={() => chooseSave(handleRenderSave)}
            testID="trim-render-button"
          />
        )}
      </BottomSheet>
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
      paddingHorizontal: spacing.sm,
      paddingTop: spacing.sm,
      minHeight: 56,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: { fontFamily: fontFamily.bold, fontSize: 18, color: colors.text },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg },
    lenText: { ...typography.body, color: colors.textMuted },
    waveCard: {
      alignSelf: 'stretch',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: spacing.lg,
    },
    hint: { ...typography.caption, color: colors.textFaint, marginTop: -spacing.sm },
    editRow: { flexDirection: 'row', gap: spacing.md },
    editButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: 44,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      borderRadius: borderRadius.full,
    },
    editButtonText: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
    previewButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.full,
    },
    previewText: { ...typography.body, fontWeight: '600', color: colors.text },
    saveButton: {
      minHeight: 56,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.lg,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveText: { ...typography.body, fontWeight: '700', color: colors.onAccent },
    disabled: { opacity: 0.5 },
  });
