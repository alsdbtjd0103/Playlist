import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { RootStackParamList } from '../types';
import { restoreBackup } from '../lib/backup';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, typography } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export default function SettingsScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [busy, setBusy] = useState(false);

  const handleImport = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      setBusy(true);
      const r = await restoreBackup(res.assets[0].uri);
      const skipped = r.songs.skipped + r.versions.skipped + r.playlists.skipped + r.playlistItems.skipped;
      Alert.alert(
        '복원 완료',
        `곡 ${r.songs.added}개 · 버전 ${r.versions.added}개를 복원했어요. 중복 ${skipped}개는 건너뛰었어요.`
      );
    } catch (e: any) {
      Alert.alert('복원 실패', e?.message ?? '백업을 복원하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>설정</Text>
      </View>

      <Text style={styles.sectionTitle}>백업 / 복원</Text>

      <View style={styles.list}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('Export')}
          testID="settings-export"
          disabled={busy}
        >
          <Ionicons name="cloud-upload-outline" size={22} color={colors.text} style={styles.rowIcon} />
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>내보내기</Text>
            <Text style={styles.rowDesc}>곡·버전·플레이리스트를 zip으로</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.row}
          onPress={handleImport}
          testID="settings-import"
          disabled={busy}
        >
          <Ionicons name="cloud-download-outline" size={22} color={colors.text} style={styles.rowIcon} />
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>가져오기</Text>
            <Text style={styles.rowDesc}>백업 zip을 선택해 복원</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {busy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.busyText}>백업을 복원하고 있어요…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.h2, color: colors.text },
  sectionTitle: {
    ...typography.caption, color: colors.textMuted,
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs,
  },
  list: { paddingHorizontal: spacing.md },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    marginBottom: spacing.sm, gap: spacing.sm,
  },
  rowIcon: { width: 24, textAlign: 'center' },
  rowTextWrap: { flex: 1 },
  rowLabel: { ...typography.body, color: colors.text, fontWeight: '600' },
  rowDesc: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  busyText: { ...typography.body, color: '#fff' },
});
