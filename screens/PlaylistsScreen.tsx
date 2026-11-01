import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, Playlist } from '../types';
import {
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  renamePlaylist,
  getAllPlaylistItems,
  getAllVersions,
} from '../lib/database';
import { ColorTokens, spacing, borderRadius, typography, fontFamily } from '../lib/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import ScreenHeader from '../components/ScreenHeader';
import BottomSheet, { SheetAction, afterSheetClose } from '../components/BottomSheet';
import PressableScale from '../components/PressableScale';
import Chip from '../components/Chip';
import ErrorState from '../components/ErrorState';
import { SkeletonList } from '../components/Skeleton';
import { withObjectParticle } from '../lib/josa';

type Props = NativeStackScreenProps<RootStackParamList, 'Playlists'>;

type SortOrder = 'newest' | 'oldest';

export default function PlaylistsScreen({ navigation }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accent = scheme === 'dark' ? colors.accent : colors.accentStrong;
  const { show, showUndo } = useToast();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loadError, setLoadError] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  // 만들기 시트
  const [createVisible, setCreateVisible] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  // 카드 메뉴 / 이름 변경 시트
  const [menuTarget, setMenuTarget] = useState<Playlist | null>(null);
  const [renameTarget, setRenameTarget] = useState<Playlist | null>(null);
  const [renameText, setRenameText] = useState('');
  const [renaming, setRenaming] = useState(false);

  // 실행 취소를 기다리는 중인 플레이리스트는 다시 불러와도 보이지 않게 거른다
  const pendingDeletesRef = useRef(new Set<string>());

  const fetchPlaylists = useCallback(async () => {
    try {
      const [data, items, versions] = await Promise.all([
        getPlaylists(),
        getAllPlaylistItems(),
        getAllVersions(),
      ]);
      // 지워진 버전을 가리키는 항목은 상세 화면에도 안 보이므로 개수에서 뺀다
      const versionIds = new Set(versions.map((v) => v.id));
      const next = new Map<string, number>();
      for (const item of items) {
        if (!versionIds.has(item.versionId)) continue;
        next.set(item.playlistId, (next.get(item.playlistId) ?? 0) + 1);
      }
      setCounts(next);
      setPlaylists(data.filter((p) => !pendingDeletesRef.current.has(p.id)));
      setLoadError(false);
    } catch (error) {
      console.error('플레이리스트 로드 실패:', error);
      setLoadError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPlaylists();
    }, [fetchPlaylists])
  );

  const openCreate = () => {
    setName('');
    setCreateVisible(true);
  };

  const handleCreatePlaylist = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const id = await createPlaylist(trimmed, false);
      setCreateVisible(false);
      setName('');
      navigation.navigate('PlaylistDetail', { playlistId: id });
    } catch (error) {
      console.error('플레이리스트 생성 실패:', error);
      Alert.alert('오류', '플레이리스트를 만들지 못했어요.');
    } finally {
      setCreating(false);
    }
  };

  const openMenu = (playlist: Playlist) => {
    if (playlist.isDefault) return;
    setMenuTarget(playlist);
  };

  const startRename = () => {
    if (!menuTarget) return;
    const target = menuTarget;
    setRenameText(target.name);
    setMenuTarget(null);
    afterSheetClose(() => setRenameTarget(target));
  };

  const handleRename = async () => {
    const trimmed = renameText.trim();
    if (!renameTarget || !trimmed || renaming) return;
    setRenaming(true);
    try {
      await renamePlaylist(renameTarget.id, trimmed);
      setRenameTarget(null);
      show('이름을 바꿨어요');
      await fetchPlaylists();
    } catch (error) {
      console.error('플레이리스트 이름 변경 실패:', error);
      Alert.alert('오류', '이름을 바꾸지 못했어요.');
    } finally {
      setRenaming(false);
    }
  };

  const handleDelete = () => {
    const target = menuTarget;
    if (!target) return;
    setMenuTarget(null);
    setPlaylists((prev) => (prev ? prev.filter((p) => p.id !== target.id) : prev));
    pendingDeletesRef.current.add(target.id);
    showUndo(`${withObjectParticle(target.name, `「${target.name}」`)} 삭제했어요`, {
      onUndo: () => {
        pendingDeletesRef.current.delete(target.id);
        fetchPlaylists();
      },
      onCommit: async () => {
        try {
          await deletePlaylist(target.id);
        } catch (error) {
          console.error('플레이리스트 삭제 실패:', error);
          pendingDeletesRef.current.delete(target.id);
          await fetchPlaylists();
        } finally {
          pendingDeletesRef.current.delete(target.id);
        }
      },
    });
  };

  const sortedPlaylists = useMemo(() => {
    const items = playlists ?? [];
    const defaults = items.filter((p) => p.isDefault);
    const rest = items
      .filter((p) => !p.isDefault)
      .sort((a, b) => {
        const diff = a.createdAt.getTime() - b.createdAt.getTime();
        return sortOrder === 'newest' ? -diff : diff;
      });
    return [...defaults, ...rest];
  }, [playlists, sortOrder]);

  const customCount = (playlists ?? []).filter((p) => !p.isDefault).length;

  const renderPlaylistCard = ({ item }: { item: Playlist }) => (
    <PressableScale
      style={styles.card}
      onPress={() => navigation.navigate('PlaylistDetail', { playlistId: item.id })}
      onLongPress={() => openMenu(item)}
      testID={`playlist-card-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={item.name}
    >
      <View style={[styles.cover, item.isDefault && { backgroundColor: accent }]}>
        <Ionicons
          name={item.isDefault ? 'star' : 'musical-notes'}
          size={24}
          color={item.isDefault ? colors.onAccent : accent}
        />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.cardMeta}>곡 {counts.get(item.id) ?? 0}개</Text>
          {item.isDefault && (
            <View style={styles.badge}>
              <Text style={[styles.badgeText, { color: accent }]}>대표곡 자동</Text>
            </View>
          )}
        </View>
      </View>
      {item.isDefault ? (
        <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
      ) : (
        <PressableScale
          style={styles.moreButton}
          onPress={() => openMenu(item)}
          accessibilityLabel={`${item.name} 메뉴`}
          testID={`playlist-menu-${item.id}`}
          hitSlop={4}
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
        </PressableScale>
      )}
    </PressableScale>
  );

  const renderBody = () => {
    if (playlists === null) {
      if (loadError) return <ErrorState onRetry={fetchPlaylists} />;
      return <SkeletonList count={4} rowHeight={80} />;
    }
    if (playlists.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="albums-outline" size={56} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>플레이리스트가 없어요</Text>
          <Text style={styles.emptySubtitle}>오른쪽 위 + 로 새 플레이리스트를 만들어 보세요</Text>
        </View>
      );
    }
    return (
      <FlatList
        style={styles.list}
        data={sortedPlaylists}
        renderItem={renderPlaylistCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          customCount > 1 ? (
            <View style={styles.chipRow}>
              <Chip label="최신순" selected={sortOrder === 'newest'} onPress={() => setSortOrder('newest')} testID="playlists-sort-newest" />
              <Chip label="오래된순" selected={sortOrder === 'oldest'} onPress={() => setSortOrder('oldest')} testID="playlists-sort-oldest" />
            </View>
          ) : null
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="플레이리스트"
        actions={[{ icon: 'add', label: '플레이리스트 만들기', onPress: openCreate, testID: 'add-playlist-button' }]}
      />

      {renderBody()}

      {/* 만들기 */}
      <BottomSheet
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        title="새 플레이리스트"
        testID="create-playlist-sheet"
      >
        <View style={styles.sheetBody}>
          <TextInput
            style={styles.input}
            placeholder="예: 내가 좋아하는 노래"
            placeholderTextColor={colors.textFaint}
            value={name}
            onChangeText={setName}
            editable={!creating}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleCreatePlaylist}
            testID="playlist-name-input"
          />
          <PressableScale
            style={[styles.primaryButton, { backgroundColor: accent }, (!name.trim() || creating) && styles.disabled]}
            onPress={handleCreatePlaylist}
            disabled={!name.trim() || creating}
            haptic="light"
            testID="create-playlist-confirm"
            accessibilityRole="button"
          >
            {creating ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>만들기</Text>
            )}
          </PressableScale>
        </View>
      </BottomSheet>

      {/* 카드 메뉴 */}
      <BottomSheet
        visible={!!menuTarget}
        onClose={() => setMenuTarget(null)}
        title={menuTarget?.name}
        testID="playlist-menu-sheet"
      >
        <SheetAction icon="pencil" label="이름 변경" onPress={startRename} testID="playlist-menu-rename" />
        <SheetAction icon="trash-outline" label="삭제" destructive onPress={handleDelete} testID="playlist-menu-delete" />
      </BottomSheet>

      {/* 이름 변경 */}
      <BottomSheet
        visible={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        title="이름 변경"
        testID="rename-playlist-sheet"
      >
        <View style={styles.sheetBody}>
          <TextInput
            style={styles.input}
            value={renameText}
            onChangeText={setRenameText}
            editable={!renaming}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={handleRename}
            placeholder="플레이리스트 이름"
            placeholderTextColor={colors.textFaint}
            testID="rename-playlist-input"
          />
          <PressableScale
            style={[styles.primaryButton, { backgroundColor: accent }, (!renameText.trim() || renaming) && styles.disabled]}
            onPress={handleRename}
            disabled={!renameText.trim() || renaming}
            haptic="light"
            testID="rename-playlist-confirm"
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>저장</Text>
          </PressableScale>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    list: {
      flex: 1,
    },
    listContainer: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    chipRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingBottom: spacing.xs,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      paddingLeft: spacing.md,
      paddingRight: spacing.sm,
      gap: spacing.md,
      minHeight: 80,
    },
    cover: {
      width: 56,
      height: 56,
      borderRadius: borderRadius.lg,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardInfo: {
      flex: 1,
      gap: 4,
    },
    cardName: {
      fontFamily: fontFamily.bold,
      fontSize: 17,
      color: colors.text,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    cardMeta: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
    },
    badge: {
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
    },
    badgeText: {
      fontFamily: fontFamily.semibold,
      fontSize: 11,
    },
    moreButton: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xxl,
    },
    emptyIconContainer: {
      width: 112,
      height: 112,
      borderRadius: borderRadius.full,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    emptyTitle: {
      ...typography.h3,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    emptySubtitle: {
      ...typography.bodySmall,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    sheetBody: {
      paddingHorizontal: spacing.md,
      gap: spacing.md,
      paddingBottom: spacing.sm,
    },
    input: {
      fontFamily: fontFamily.regular,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surfaceAlt,
      borderRadius: borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      height: 52,
    },
    primaryButton: {
      height: 52,
      borderRadius: borderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    primaryButtonText: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.onAccent,
    },
    disabled: {
      opacity: 0.4,
    },
  });
