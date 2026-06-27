import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { RootStackParamList, Song, Playlist } from '../types';
import { getAllSongs, getPlaylists } from '../lib/database';
import { buildBackup, BackupSelection } from '../lib/backup';
import { useTheme } from '../contexts/ThemeContext';
import { ColorTokens, spacing, borderRadius, typography } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Export'>;
type PickerMode = 'song' | 'playlist' | 'songs' | null;

export default function ExportScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<PickerMode>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const runExport = useCallback(async (sel: BackupSelection) => {
    try {
      setBusy(true);
      const { uri } = await buildBackup(sel);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'plilog 백업' });
      } else {
        Alert.alert('공유 불가', '이 기기에서는 공유를 사용할 수 없습니다.');
      }
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '백업에 실패했습니다.');
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
      Alert.alert('오류', e?.message ?? '목록을 불러오지 못했습니다.');
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
      Alert.alert('선택 없음', '내보낼 곡을 하나 이상 선택하세요.');
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} testID="export-back-button">
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>내보내기</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.list}>
        {rows.map((r) => (
          <TouchableOpacity key={r.id} style={styles.row} onPress={r.onPress} testID={r.id} disabled={busy}>
            <Ionicons name={r.icon} size={22} color={colors.text} style={styles.rowIcon} />
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowDesc}>{r.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>

      {/* 노래 단일 / 플레이리스트 단일 / 곡 멀티 선택 모달 */}
      <Modal visible={picker !== null} animationType="slide" transparent onRequestClose={closePicker}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {picker === 'playlist' ? '플레이리스트 선택' : picker === 'songs' ? '곡 선택 (여러 개)' : '노래 선택'}
              </Text>
              <TouchableOpacity onPress={closePicker} testID="picker-close">
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {picker === 'playlist' ? (
              <FlatList
                data={playlists}
                keyExtractor={(p) => p.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.pickRow}
                    testID={`pick-playlist-${item.id}`}
                    onPress={async () => { closePicker(); await runExport({ type: 'playlist', playlistId: item.id }); }}
                  >
                    <Text style={styles.pickLabel}>{item.name}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={styles.emptyText}>플레이리스트가 없습니다.</Text>}
              />
            ) : (
              <FlatList
                data={songs}
                keyExtractor={(s) => s.id}
                renderItem={({ item }) => {
                  const isMulti = picker === 'songs';
                  const isChecked = checked.has(item.id);
                  return (
                    <TouchableOpacity
                      style={styles.pickRow}
                      testID={`pick-song-${item.id}`}
                      onPress={async () => {
                        if (isMulti) { toggleChecked(item.id); return; }
                        closePicker();
                        await runExport({ type: 'song', songId: item.id });
                      }}
                    >
                      {isMulti && (
                        <View style={[styles.checkbox, isChecked && styles.checkboxOn]}>
                          {isChecked && <Ionicons name="checkmark" size={14} color={colors.onAccent} />}
                        </View>
                      )}
                      <View style={styles.pickTextWrap}>
                        <Text style={styles.pickLabel}>{item.title}</Text>
                        {!!item.artist && <Text style={styles.pickDesc}>{item.artist}</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={<Text style={styles.emptyText}>곡이 없습니다.</Text>}
              />
            )}

            {picker === 'songs' && (
              <TouchableOpacity style={styles.confirmButton} onPress={confirmMultiSongs} testID="export-songs-confirm">
                <Text style={styles.confirmText}>선택한 {checked.size}곡 내보내기</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {busy && (
        <View style={styles.busyOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.busyText}>백업을 만들고 있어요…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.h3, color: colors.text },
  headerSpacer: { width: 28 },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: borderRadius.lg, borderTopRightRadius: borderRadius.lg,
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.lg, maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  modalTitle: { ...typography.h3, color: colors.text },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pickTextWrap: { flex: 1 },
  pickLabel: { ...typography.body, color: colors.text },
  pickDesc: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  emptyText: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  confirmButton: {
    backgroundColor: colors.accent, borderRadius: borderRadius.md,
    paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm,
  },
  confirmText: { ...typography.body, color: colors.onAccent, fontWeight: '700' },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  busyText: { ...typography.body, color: '#fff' },
});
