import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { RootStackParamList, Song, Playlist } from '../types';
import { getAllSongs, getPlaylists } from '../lib/database';
import { buildBackup, BackupSelection, BackupProgress } from '../lib/backup';
import BackupProgressOverlay from '../components/BackupProgressOverlay';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, typography } from '../lib/theme';
import ScreenHeader from '../components/ScreenHeader';
import PressableScale from '../components/PressableScale';
import BottomSheet from '../components/BottomSheet';
import { useToast } from '../contexts/ToastContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Export'>;
type PickerMode = 'song' | 'playlist' | 'songs' | null;

export default function ExportScreen({ navigation }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accent = scheme === 'dark' ? colors.accent : colors.accentStrong;
  const toast = useToast();
  const { height } = useWindowDimensions();
  const listMaxHeight = Math.round(height * 0.55);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [picker, setPicker] = useState<PickerMode>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const runExport = useCallback(async (sel: BackupSelection) => {
    try {
      setProgress(null);
      setBusy(true);
      const { uri } = await buildBackup(sel, setProgress);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'plilog 백업' });
      } else {
        Alert.alert('공유할 수 없어요', '이 기기에서는 공유 기능을 쓸 수 없어요.');
      }
    } catch (e: any) {
      Alert.alert('백업하지 못했어요', e?.message ?? '잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }, []);

  const openPicker = useCallback(async (mode: Exclude<PickerMode, null>) => {
    try {
      if (mode === 'playlist') {
        setPlaylists(await getPlaylists());
      } else {
        setSongs(await getAllSongs());
      }
      setChecked(new Set());
      setPicker(mode);
    } catch (e: any) {
      Alert.alert('목록을 불러오지 못했어요', e?.message ?? '잠시 후 다시 시도해 주세요.');
    }
  }, []);

  const closePicker = () => setPicker(null);

  const toggleChecked = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const confirmMultiSongs = async () => {
    if (checked.size === 0) {
      toast.show('내보낼 곡을 하나 이상 골라 주세요');
      return;
    }
    const ids = Array.from(checked);
    closePicker();
    await runExport({ type: 'songs', songIds: ids });
  };

  const rows: { id: string; label: string; desc: string; icon: any; onPress: () => void }[] = [
    { id: 'export-all', label: '전체 백업', desc: '모든 곡·버전·메모·별점·플레이리스트', icon: 'archive-outline', onPress: () => runExport({ type: 'all' }) },
    { id: 'export-song', label: '노래 선택 백업', desc: '특정 노래와 그 버전들', icon: 'musical-note-outline', onPress: () => openPicker('song') },
    { id: 'export-playlist', label: '플레이리스트 선택 백업', desc: '특정 플레이리스트와 담긴 버전들', icon: 'albums-outline', onPress: () => openPicker('playlist') },
    { id: 'export-songs', label: '곡 직접 선택 백업', desc: '여러 곡을 체크해서 한 번에', icon: 'checkbox-outline', onPress: () => openPicker('songs') },
  ];

  const pickerTitle = picker === 'playlist' ? '플레이리스트 선택' : picker === 'songs' ? '여러 곡 선택' : '노래 선택';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader title="내보내기" onBack={() => navigation.goBack()} />

      <Text style={styles.intro}>백업 파일(zip)을 만들어 다른 앱이나 기기로 보낼 수 있어요.</Text>

      <View style={styles.group}>
        {rows.map((r, i) => (
          <PressableScale
            key={r.id}
            style={[styles.row, i < rows.length - 1 && styles.rowDivider]}
            onPress={r.onPress}
            testID={r.id}
            disabled={busy}
            scaleTo={0.98}
          >
            <View style={styles.rowIconWrap}>
              <Ionicons name={r.icon} size={20} color={accent} />
            </View>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowDesc}>{r.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </PressableScale>
        ))}
      </View>

      {/* 노래 단일 / 플레이리스트 단일 / 곡 멀티 선택 시트 */}
      <BottomSheet
        visible={picker !== null}
        onClose={closePicker}
        title={pickerTitle}
        subtitle={picker === 'songs' ? `${checked.size}곡 선택됨` : undefined}
        testID="export-picker"
      >
        <View style={{ maxHeight: listMaxHeight }}>
          {picker === 'playlist' ? (
            <FlatList
              data={playlists}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.pickRow, pressed && styles.pickRowPressed]}
                  testID={`pick-playlist-${item.id}`}
                  onPress={async () => { closePicker(); await runExport({ type: 'playlist', playlistId: item.id }); }}
                >
                  <Ionicons name="albums-outline" size={20} color={colors.textMuted} />
                  <Text style={[styles.pickLabel, styles.pickTextWrap]} numberOfLines={1}>{item.name}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>플레이리스트가 없어요</Text>}
            />
          ) : (
            <FlatList
              data={songs}
              keyExtractor={(s) => s.id}
              renderItem={({ item }) => {
                const isMulti = picker === 'songs';
                const isChecked = checked.has(item.id);
                return (
                  <Pressable
                    style={({ pressed }) => [styles.pickRow, pressed && styles.pickRowPressed]}
                    testID={`pick-song-${item.id}`}
                    accessibilityState={isMulti ? { checked: isChecked } : undefined}
                    onPress={async () => {
                      if (isMulti) { toggleChecked(item.id); return; }
                      closePicker();
                      await runExport({ type: 'song', songId: item.id });
                    }}
                  >
                    {isMulti ? (
                      <View style={[styles.checkbox, isChecked && { backgroundColor: accent, borderColor: accent }]}>
                        {isChecked && <Ionicons name="checkmark" size={14} color={colors.onAccent} />}
                      </View>
                    ) : (
                      <Ionicons name="musical-note-outline" size={20} color={colors.textMuted} />
                    )}
                    <View style={styles.pickTextWrap}>
                      <Text style={styles.pickLabel} numberOfLines={1}>{item.title}</Text>
                      {!!item.artist && <Text style={styles.pickDesc} numberOfLines={1}>{item.artist}</Text>}
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={<Text style={styles.emptyText}>곡이 없어요</Text>}
            />
          )}
        </View>

        {picker === 'songs' && (
          <PressableScale
            style={[styles.confirmButton, { backgroundColor: accent }, checked.size === 0 && styles.confirmDisabled]}
            onPress={confirmMultiSongs}
            testID="export-songs-confirm"
            haptic="light"
          >
            <Text style={styles.confirmText}>
              {checked.size === 0 ? '곡을 선택해 주세요' : `선택한 ${checked.size}곡 내보내기`}
            </Text>
          </PressableScale>
        )}
      </BottomSheet>

      {busy && <BackupProgressOverlay title="백업을 만들고 있어요" progress={progress} />}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  intro: {
    ...typography.bodySmall, color: colors.textMuted,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  group: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: 64, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  rowTextWrap: { flex: 1 },
  rowLabel: { ...typography.body, color: colors.text, fontWeight: '600' },
  rowDesc: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: 52, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  pickRowPressed: { backgroundColor: colors.surfaceAlt },
  pickTextWrap: { flex: 1 },
  pickLabel: { ...typography.body, color: colors.text },
  pickDesc: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  confirmButton: {
    borderRadius: borderRadius.full, minHeight: 52,
    justifyContent: 'center', alignItems: 'center', marginTop: spacing.md, marginHorizontal: spacing.sm,
  },
  confirmDisabled: { opacity: 0.5 },
  confirmText: { ...typography.body, color: colors.onAccent, fontWeight: '700' },
});
