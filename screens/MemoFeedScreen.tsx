import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList } from '../types';
import { getMemoFeed, updateVersion, MemoFeedItem } from '../lib/database';
import { usePlayer } from '../contexts/PlayerContext';
import { useTheme } from '../contexts/ThemeContext';
import { AlbumArt } from '../components/AlbumArt';
import { formatVersionNumber } from '../lib/versionLabel';
import { ColorTokens, spacing, borderRadius, typography } from '../lib/theme';
import { logEvent, logScreen } from '../lib/analytics';

type Props = NativeStackScreenProps<RootStackParamList, 'MemoFeed'>;

export default function MemoFeedScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { setPlaylist } = usePlayer();
  const [items, setItems] = useState<MemoFeedItem[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchFeed = useCallback(async () => {
    try {
      setItems(await getMemoFeed());
    } catch (error) {
      console.error('메모 피드 로드 실패:', error);
      setItems([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchFeed();
      logScreen('MemoFeed');
    }, [fetchFeed])
  );

  const startEdit = (item: MemoFeedItem) => {
    setEditingId(item.version.id);
    setDraft(item.version.memo ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
  };

  const saveEdit = async (item: MemoFeedItem) => {
    const trimmed = draft.trim();
    try {
      setSaving(true);
      await updateVersion(item.version.id, { memo: trimmed });
      logEvent('memo_feed_edited', { length: trimmed.length });
      cancelEdit();
      await fetchFeed();
    } catch (error) {
      console.error('메모 수정 실패:', error);
      Alert.alert('오류', '메모 수정에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handlePlay = (item: MemoFeedItem) => {
    setPlaylist([{ song: item.song, version: item.version, versionNumber: item.versionNumber }], 0);
  };

  const handleOpenSong = (item: MemoFeedItem) => {
    // 곡 상세는 노래 탭 스택에 있으므로 그 탭으로 이동한다 (뒤로 가면 곡 목록)
    (navigation as any).navigate('HomeTab', {
      screen: 'SongDetail',
      params: { songId: item.song.id },
      initial: false,
    });
  };

  const renderItem = ({ item }: { item: MemoFeedItem }) => {
    const id = item.version.id;
    const isEditing = editingId === id;
    const date = new Date(item.version.recordedAt).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <AlbumArt uri={item.song.artworkUrl} size={40} iconSize={18} borderRadius={borderRadius.sm} />
          <View style={styles.cardTitleWrap}>
            <Text style={styles.songTitle} numberOfLines={1}>{item.song.title}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.versionNumber}>{formatVersionNumber(item.versionNumber)}</Text>
              <Text style={styles.metaText}>{date}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => handlePlay(item)}
            testID={`memo-play-${id}`}
            accessibilityLabel="이 버전 재생"
          >
            <Ionicons name="play-circle" size={28} color={colors.accentStrong} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => handleOpenSong(item)}
            testID={`memo-open-song-${id}`}
            accessibilityLabel="곡으로 이동"
          >
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {isEditing ? (
          <View>
            <TextInput
              style={styles.memoInput}
              value={draft}
              onChangeText={setDraft}
              multiline
              autoFocus
              maxLength={500}
              placeholder="메모를 입력하세요"
              placeholderTextColor={colors.textMuted}
              testID={`memo-edit-input-${id}`}
            />
            <View style={styles.editButtons}>
              <TouchableOpacity style={[styles.editButton, styles.cancelButton]} onPress={cancelEdit}>
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editButton, styles.saveButton]}
                onPress={() => saveEdit(item)}
                disabled={saving}
                testID={`memo-save-${id}`}
              >
                <Text style={styles.saveButtonText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => startEdit(item)} activeOpacity={0.7}>
            <Text style={styles.memoText}>{item.version.memo}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>메모</Text>
      </View>

      {items === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentStrong} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={56} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>아직 남긴 메모가 없어요</Text>
          <Text style={styles.emptySubtitle}>녹음할 때나 버전 메뉴에서 메모를 남겨보세요</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <FlatList
            data={items}
            keyExtractor={(item) => item.version.id}
            renderItem={renderItem}
            extraData={{ editingId, draft, saving }}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          />
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.h2, color: colors.text },
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: spacing.xxl, gap: spacing.sm,
  },
  emptyTitle: { ...typography.h3, color: colors.textMuted, marginTop: spacing.md },
  emptySubtitle: { ...typography.bodySmall, color: colors.textMuted, textAlign: 'center' },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitleWrap: { flex: 1, gap: 2 },
  songTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  versionNumber: { ...typography.caption, color: colors.text, fontWeight: '600' },
  metaText: { ...typography.caption, color: colors.textMuted },
  iconButton: { padding: spacing.xs },
  memoText: { ...typography.body, color: colors.text, lineHeight: 22 },
  memoInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 96,
    textAlignVertical: 'top',
  },
  editButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  editButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: borderRadius.md },
  cancelButton: { backgroundColor: colors.surfaceAlt },
  cancelButtonText: { ...typography.bodySmall, color: colors.text },
  saveButton: { backgroundColor: colors.accentStrong },
  saveButtonText: { ...typography.bodySmall, color: colors.onAccent, fontWeight: '600' },
});
