import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
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
import ScreenHeader from '../components/ScreenHeader';
import PressableScale from '../components/PressableScale';
import ErrorState from '../components/ErrorState';
import { SkeletonList } from '../components/Skeleton';
import { useToast } from '../contexts/ToastContext';

type Props = NativeStackScreenProps<RootStackParamList, 'MemoFeed'>;

export default function MemoFeedScreen({ navigation }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accent = scheme === 'dark' ? colors.accent : colors.accentStrong;
  const toast = useToast();
  const { setPlaylist } = usePlayer();
  const [items, setItems] = useState<MemoFeedItem[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const fetchFeed = useCallback(async () => {
    try {
      setItems(await getMemoFeed());
      setError(false);
    } catch (e) {
      console.error('메모 피드 로드 실패:', e);
      setError(true);
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
      toast.show('메모를 저장했어요');
      await fetchFeed();
    } catch (e) {
      console.error('메모 수정 실패:', e);
      Alert.alert('메모를 저장하지 못했어요', '잠시 후 다시 시도해 주세요.');
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
          <AlbumArt uri={item.song.artworkUrl} size={44} iconSize={18} borderRadius={borderRadius.md} />
          <View style={styles.cardTitleWrap}>
            <Text style={styles.songTitle} numberOfLines={1}>{item.song.title}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.versionNumber}>{formatVersionNumber(item.versionNumber)}</Text>
              <Text style={styles.metaText}>{date}</Text>
            </View>
          </View>
          <PressableScale
            style={styles.iconButton}
            onPress={() => handlePlay(item)}
            testID={`memo-play-${id}`}
            accessibilityLabel="이 버전 재생"
            haptic="light"
          >
            <Ionicons name="play-circle" size={32} color={accent} />
          </PressableScale>
          <PressableScale
            style={styles.iconButton}
            onPress={() => handleOpenSong(item)}
            testID={`memo-open-song-${id}`}
            accessibilityLabel="곡으로 이동"
          >
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </PressableScale>
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
              placeholder="메모를 남겨 보세요"
              placeholderTextColor={colors.textMuted}
              testID={`memo-edit-input-${id}`}
            />
            <View style={styles.editButtons}>
              <PressableScale style={[styles.editButton, styles.cancelButton]} onPress={cancelEdit}>
                <Text style={styles.cancelButtonText}>취소</Text>
              </PressableScale>
              <PressableScale
                style={[styles.editButton, styles.saveButton, { backgroundColor: accent }]}
                onPress={() => saveEdit(item)}
                disabled={saving}
                testID={`memo-save-${id}`}
                haptic="light"
              >
                <Text style={styles.saveButtonText}>저장</Text>
              </PressableScale>
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
      <ScreenHeader title="메모" />

      {error && items === null ? (
        <ErrorState message="메모를 불러오지 못했어요" onRetry={fetchFeed} />
      ) : items === null ? (
        <SkeletonList count={4} rowHeight={120} />
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
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: spacing.xxl, gap: spacing.sm,
  },
  emptyTitle: { ...typography.h3, color: colors.textMuted, marginTop: spacing.md },
  emptySubtitle: { ...typography.bodySmall, color: colors.textMuted, textAlign: 'center' },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitleWrap: { flex: 1, gap: 2 },
  songTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  versionNumber: { ...typography.caption, color: colors.text, fontWeight: '600' },
  metaText: { ...typography.caption, color: colors.textMuted },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
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
  editButton: {
    minHeight: 44, justifyContent: 'center',
    paddingHorizontal: spacing.lg, borderRadius: borderRadius.full,
  },
  cancelButton: { backgroundColor: colors.surfaceAlt },
  cancelButtonText: { ...typography.bodySmall, color: colors.text },
  saveButton: { backgroundColor: colors.accentStrong },
  saveButtonText: { ...typography.bodySmall, color: colors.onAccent, fontWeight: '600' },
});
