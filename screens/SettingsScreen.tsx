import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, Pressable, Linking, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import { RootStackParamList } from '../types';
import { restoreBackup, BackupProgress } from '../lib/backup';
import { scanStorage, cleanStorage, formatBytes, StorageReport } from '../lib/storageCleanup';
import BackupProgressOverlay from '../components/BackupProgressOverlay';
import ScreenHeader from '../components/ScreenHeader';
import PressableScale from '../components/PressableScale';
import { SettingsSection, SettingsRow, SettingsSwitch, Segmented } from '../components/SettingsRow';
import { useTheme, ThemeMode } from '../contexts/ThemeContext';
import { useSettings } from '../contexts/SettingsContext';
import { useToast } from '../contexts/ToastContext';
import { haptic } from '../lib/haptics';
import { ColorTokens, spacing, borderRadius, fontFamily } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const CONTACT_URL = `mailto:yusung.min.developers@gmail.com?subject=${encodeURIComponent('plilog 문의')}`;

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];
const REPEAT_OPTIONS = [
  { value: 'none' as const, label: '끔' },
  { value: 'one' as const, label: '한 곡' },
  { value: 'all' as const, label: '전체' },
];
const SKIP_OPTIONS = [
  { value: 5 as const, label: '5초' },
  { value: 10 as const, label: '10초' },
  { value: 15 as const, label: '15초' },
];
const QUALITY_OPTIONS = [
  { value: 'high' as const, label: '고음질' },
  { value: 'low' as const, label: '저용량' },
];

export default function SettingsScreen({ navigation }: Props) {
  const { colors, scheme, mode, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accent = scheme === 'dark' ? colors.accent : colors.accentStrong;
  const { settings, update } = useSettings();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [report, setReport] = useState<StorageReport | null>(null);
  const [scanFailed, setScanFailed] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const scanningRef = useRef(false);

  const runScan = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    try {
      const r = await scanStorage();
      setReport(r);
      setScanFailed(false);
    } catch (error) {
      console.error('저장 공간 점검 실패:', error);
      setScanFailed(true);
    } finally {
      scanningRef.current = false;
    }
  }, []);

  // 화면에 들어올 때마다 다시 계산한다
  useEffect(() => {
    runScan();
    const nav = navigation as any;
    if (typeof nav.addListener !== 'function') return;
    return nav.addListener('focus', runScan);
  }, [navigation, runScan]);

  const handleClean = useCallback(() => {
    if (!report || report.reclaimableBytes <= 0) return;
    const count = report.orphanFiles.length + report.tempFiles.length;
    Alert.alert(
      '저장 공간 정리',
      `임시 파일과 어디에도 쓰이지 않는 녹음 파일 ${count}개(${formatBytes(report.reclaimableBytes)})를 지울까요? 저장된 녹음은 지워지지 않아요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '정리하기',
          style: 'destructive',
          onPress: async () => {
            setCleaning(true);
            try {
              const freed = await cleanStorage(report);
              haptic('success');
              toast.show(`${formatBytes(freed)}를 정리했어요`);
            } catch (error) {
              console.error('저장 공간 정리 실패:', error);
              Alert.alert('정리하지 못했어요', '잠시 후 다시 시도해 주세요.');
            } finally {
              setCleaning(false);
              await runScan();
            }
          },
        },
      ]
    );
  }, [report, toast, runScan]);

  const handleImport = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      setProgress(null);
      setBusy(true);
      const r = await restoreBackup(res.assets[0].uri, setProgress);
      const skipped = r.songs.skipped + r.versions.skipped + r.playlists.skipped + r.playlistItems.skipped;
      toast.show(
        `곡 ${r.songs.added}개 · 버전 ${r.versions.added}개를 복원했어요` +
          (skipped > 0 ? ` (중복 ${skipped}개는 건너뛰었어요)` : '')
      );
      runScan();
    } catch (e: any) {
      Alert.alert('복원하지 못했어요', e?.message ?? '백업을 복원하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }, [toast, runScan]);

  const handleContact = useCallback(async () => {
    try {
      await Linking.openURL(CONTACT_URL);
    } catch (error) {
      console.error('문의 메일 열기 실패:', error);
      Alert.alert('메일 앱을 열 수 없어요', 'yusung.min.developers@gmail.com 으로 보내 주세요.');
    }
  }, []);

  const appVersion = Constants.expoConfig?.version ?? '-';
  const canClean = !!report && report.reclaimableBytes > 0 && !cleaning;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="설정" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SettingsSection title="화면">
          <SettingsRow
            icon="contrast-outline"
            label="테마"
            below={<Segmented options={THEME_OPTIONS} value={mode} onChange={setMode} testID="settings-theme" />}
          />
        </SettingsSection>

        <SettingsSection title="재생">
          <SettingsRow
            icon="expand-outline"
            label="재생할 때 전체화면 플레이어 열기"
            right={
              <SettingsSwitch
                label="재생할 때 전체화면 플레이어 열기"
                value={settings.autoOpenPlayer}
                onValueChange={(v) => update({ autoOpenPlayer: v })}
                testID="settings-auto-open-player"
              />
            }
          />
          <SettingsRow
            icon="repeat"
            label="기본 반복"
            below={
              <Segmented
                options={REPEAT_OPTIONS}
                value={settings.repeatMode}
                onChange={(v) => update({ repeatMode: v })}
                testID="settings-repeat"
              />
            }
          />
          <SettingsRow
            icon="play-forward-outline"
            label="건너뛰기 간격"
            below={
              <Segmented
                options={SKIP_OPTIONS}
                value={settings.skipSeconds}
                onChange={(v) => update({ skipSeconds: v })}
                testID="settings-skip"
              />
            }
          />
        </SettingsSection>

        <SettingsSection title="녹음">
          <SettingsRow
            icon="star-outline"
            label="새 녹음 기본 별점"
            below={
              <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={`기본 별점 ${settings.defaultRating}점`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => {
                      haptic('selection');
                      update({ defaultRating: n });
                    }}
                    hitSlop={4}
                    style={styles.starButton}
                    testID={`settings-rating-${n}`}
                    accessibilityLabel={`${n}점`}
                    accessibilityState={{ selected: settings.defaultRating === n }}
                  >
                    <Ionicons
                      name={n <= settings.defaultRating ? 'star' : 'star-outline'}
                      size={28}
                      color={n <= settings.defaultRating ? colors.star : colors.textFaint}
                    />
                  </Pressable>
                ))}
              </View>
            }
          />
          <SettingsRow
            icon="mic-outline"
            label="녹음 품질"
            caption="다음 녹음부터 적용돼요"
            below={
              <Segmented
                options={QUALITY_OPTIONS}
                value={settings.recordingQuality}
                onChange={(v) => update({ recordingQuality: v })}
                testID="settings-quality"
              />
            }
          />
          <SettingsRow
            icon="sunny-outline"
            label="녹음 중 화면 켜짐 유지"
            right={
              <SettingsSwitch
                label="녹음 중 화면 켜짐 유지"
                value={settings.keepAwakeWhileRecording}
                onValueChange={(v) => update({ keepAwakeWhileRecording: v })}
                testID="settings-keep-awake"
              />
            }
          />
        </SettingsSection>

        <SettingsSection title="일반">
          <SettingsRow
            icon="phone-portrait-outline"
            label="햅틱 진동"
            right={
              <SettingsSwitch
                label="햅틱 진동"
                value={settings.haptics}
                onValueChange={(v) => update({ haptics: v })}
                testID="settings-haptics"
              />
            }
          />
          <SettingsRow
            icon="analytics-outline"
            label="사용 통계 보내기"
            caption="익명 사용 통계로 앱을 개선해요"
            right={
              <SettingsSwitch
                label="사용 통계 보내기"
                value={settings.analytics}
                onValueChange={(v) => update({ analytics: v })}
                testID="settings-analytics"
              />
            }
          />
        </SettingsSection>

        <SettingsSection title="저장 공간">
          <SettingsRow
            icon="folder-outline"
            label="녹음 파일"
            value={
              report
                ? `녹음 ${report.recordingCount}개 · ${formatBytes(report.recordingsBytes)}`
                : scanFailed
                  ? '확인하지 못했어요'
                  : '계산 중…'
            }
            testID="settings-storage-usage"
          />
          <SettingsRow
            icon="sparkles-outline"
            label="정리할 수 있는 파일"
            caption={report ? formatBytes(report.reclaimableBytes) : scanFailed ? undefined : '계산 중…'}
            right={
              <PressableScale
                style={[styles.cleanButton, { backgroundColor: accent }, !canClean && styles.cleanDisabled]}
                onPress={handleClean}
                disabled={!canClean}
                testID="settings-clean"
                accessibilityLabel="정리하기"
                hitSlop={6}
                accessibilityState={{ disabled: !canClean }}
                haptic="light"
              >
                {cleaning ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <Text style={styles.cleanText}>정리하기</Text>
                )}
              </PressableScale>
            }
          />
        </SettingsSection>

        <SettingsSection title="백업 / 복원">
          <SettingsRow
            icon="cloud-upload-outline"
            label="내보내기"
            caption="곡·버전·플레이리스트를 zip으로"
            onPress={() => navigation.navigate('Export')}
            disabled={busy}
            chevron
            testID="settings-export"
          />
          <SettingsRow
            icon="cloud-download-outline"
            label="가져오기"
            caption="백업 zip을 골라 복원해요"
            onPress={handleImport}
            disabled={busy}
            chevron
            testID="settings-import"
          />
        </SettingsSection>

        <SettingsSection title="정보">
          <SettingsRow icon="information-circle-outline" label="버전" value={appVersion} testID="settings-version" />
          <SettingsRow
            icon="mail-outline"
            label="문의하기"
            onPress={handleContact}
            chevron
            testID="settings-contact"
          />
        </SettingsSection>
      </ScrollView>

      {busy && <BackupProgressOverlay title="백업을 복원하고 있어요" progress={progress} />}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { paddingBottom: spacing.xxl },
    stars: { flexDirection: 'row', gap: spacing.xs },
    starButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    cleanButton: {
      minHeight: 36,
      minWidth: 84,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cleanDisabled: { opacity: 0.4 },
    cleanText: { fontFamily: fontFamily.semibold, fontSize: 14, color: colors.onAccent },
  });
