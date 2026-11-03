import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  FlatList,
  TextInput,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
// 아이템 터치는 gesture-handler의 터치블을 써야 RNDFL(gesture-handler FlatList)의
// 스크롤과 충돌하지 않는다. RN 기본 TouchableOpacity의 onLongPress는 JS 응답자를
// 잡아 스크롤을 막는다.
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { RootStackParamList, Song, Version } from '../types';
import {
  getPlaylistWithDetails,
  removeFromPlaylist,
  getSongsWithVersions,
  addManyToPlaylist,
  reorderPlaylistItems,
  updateSongDefaultVersion,
  renamePlaylist,
  deletePlaylist,
  PlaylistDetailItem,
} from '../lib/database';
import { usePlayer, PlayingTrack } from '../contexts/PlayerContext';
import { getVersionNumberMap, formatVersionNumber } from '../lib/versionLabel';
import { matchesSearch } from '../lib/search';
import { ColorTokens, spacing, borderRadius, typography, fontFamily } from '../lib/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import ScreenHeader, { HeaderAction } from '../components/ScreenHeader';
import BottomSheet, { SheetAction, afterSheetClose } from '../components/BottomSheet';
import PressableScale from '../components/PressableScale';
import Chip from '../components/Chip';
import ErrorState from '../components/ErrorState';
import { SkeletonList } from '../components/Skeleton';
import { logEvent, logScreen } from '../lib/analytics';
import { withObjectParticle } from '../lib/josa';

type Props = NativeStackScreenProps<RootStackParamList, 'PlaylistDetail'>;

type PlaylistItem = PlaylistDetailItem;
type PlaylistData = NonNullable<Awaited<ReturnType<typeof getPlaylistWithDetails>>>;
type SongWithVersions = { song: Song; versions: Version[] };

const toPlayingTracks = (items: PlaylistItem[]): PlayingTrack[] =>
  items.map((item) => ({ song: item.song, version: item.version, versionNumber: item.versionNumber }));

// null = 직접 순서(드래그 가능)
type SortOrder = null | 'newest' | 'oldest';

// 곡 행을 눌렀을 때 담을 버전: 대표 버전, 없으면 가장 최근 녹음
const primaryVersionOf = ({ song, versions }: SongWithVersions): Version | undefined =>
  versions.find((v) => v.id === song.defaultVersionId) ?? versions[0];

export default function PlaylistDetailScreen({ route, navigation }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accent = scheme === 'dark' ? colors.accent : colors.accentStrong;
  const { height: windowHeight } = useWindowDimensions();
  const { show, showUndo } = useToast();
  const { playlistId } = route.params;
  const [playlist, setPlaylistData] = useState<PlaylistData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);
  const { setPlaylist, syncQueue, playlistState } = usePlayer();

  // 곡 추가 시트
  const [addVisible, setAddVisible] = useState(false);
  const [availableSongs, setAvailableSongs] = useState<SongWithVersions[]>([]);
  const [versionNumbers, setVersionNumbers] = useState<Map<string, number>>(new Map());
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [expandedSongs, setExpandedSongs] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [songsLoading, setSongsLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  // 메뉴 시트
  const [trackMenu, setTrackMenu] = useState<PlaylistItem | null>(null);
  const [playlistMenuVisible, setPlaylistMenuVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [renaming, setRenaming] = useState(false);

  // 실행 취소를 기다리는 중인(아직 저장소에서 빠지지 않은) 항목. 다시 불러와도 보이지 않게 거른다.
  const pendingRemovalsRef = useRef(new Map<string, string>()); // itemId → versionId

  const fetchPlaylist = useCallback(async () => {
    try {
      const raw = await getPlaylistWithDetails(playlistId);
      const data = raw
        ? { ...raw, items: raw.items.filter((i) => !pendingRemovalsRef.current.has(i.id)) }
        : raw;
      if (!data) {
        // 삭제된 플레이리스트: 로딩 표시가 끝나지 않으므로 이전 화면으로 돌아간다
        Alert.alert('알림', '플레이리스트를 찾을 수 없어요.');
        navigation.goBack();
        return;
      }
      setPlaylistData(data);
      setLoadError(false);
    } catch (error) {
      console.error('플레이리스트 로드 실패:', error);
      setLoadError(true);
    }
  }, [playlistId, navigation]);

  useFocusEffect(
    useCallback(() => {
      fetchPlaylist();
      logScreen('PlaylistDetail');
    }, [fetchPlaylist])
  );

  const sortedItems = useMemo<PlaylistItem[]>(() => {
    const items: PlaylistItem[] = playlist?.items ?? [];
    if (!sortOrder) return items;
    return [...items].sort((a, b) => {
      const aTime = new Date(a.version.recordedAt).getTime();
      const bTime = new Date(b.version.recordedAt).getTime();
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });
  }, [playlist, sortOrder]);

  // 순서 변경·정렬·추가/제거가 생기면, 이 플레이리스트를 재생 중일 때 큐에도 즉시 반영한다
  // (현재 곡은 끊지 않음. 다른 출처의 큐를 재생 중이면 syncQueue가 무시한다).
  useEffect(() => {
    if (!playlist) return;
    syncQueue(playlistId, toPlayingTracks(sortedItems));
  }, [sortedItems, playlistId, syncQueue]);

  const handleTrackPress = (index: number) => {
    setPlaylist(toPlayingTracks(sortedItems), index, playlistId);
  };

  const handleDragEnd = async ({ data }: { data: PlaylistItem[] }) => {
    setPlaylistData((prev) => (prev ? { ...prev, items: data } : prev));
    try {
      // 빼기를 기다리는 항목도 목록에 남겨 둔다(안 그러면 순서 저장이 그 항목을 지워 실행 취소가 안 된다)
      await reorderPlaylistItems(playlistId, [
        ...data.map((item) => item.id),
        ...pendingRemovalsRef.current.keys(),
      ]);
    } catch (error) {
      console.error('순서 저장 실패:', error);
      await fetchPlaylist();
    }
  };

  const currentPlayingVersionId = playlistState
    ? playlistState.items[playlistState.currentIndex]?.version.id ?? null
    : null;

  // ---------- 곡 추가 ----------
  const existingVersionIds = useMemo(
    () => new Set((playlist?.items ?? []).map((item) => item.versionId)),
    [playlist]
  );

  const filteredSongs = useMemo(
    () =>
      availableSongs.filter(({ song }) =>
        matchesSearch(`${song.title} ${song.artist ?? ''}`, query)
      ),
    [availableSongs, query]
  );

  const fetchAvailableSongs = async () => {
    try {
      setSongsLoading(true);
      const rows = await getSongsWithVersions();
      setVersionNumbers(getVersionNumberMap(rows.flatMap((r) => r.versions)));
      setAvailableSongs(rows.filter((r) => r.versions.length > 0));
    } catch (error) {
      console.error('곡 목록 로드 실패:', error);
    } finally {
      setSongsLoading(false);
    }
  };

  const openAddSheet = () => {
    setSelectedVersions(new Set());
    setExpandedSongs(new Set());
    setQuery('');
    setAddVisible(true);
    fetchAvailableSongs();
  };

  const toggleVersion = (versionId: string) => {
    if (existingVersionIds.has(versionId)) return;
    setSelectedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(versionId)) next.delete(versionId);
      else next.add(versionId);
      return next;
    });
  };

  const toggleExpanded = (songId: string) => {
    setExpandedSongs((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (selectedVersions.size === 0 || adding) return;
    try {
      setAdding(true);
      const added = await addManyToPlaylist(playlistId, Array.from(selectedVersions));
      setAddVisible(false);
      setSelectedVersions(new Set());
      await fetchPlaylist();
      logEvent('playlist_songs_added', { count: added });
      show(`${added}곡을 추가했어요`);
    } catch (error) {
      console.error('곡 추가 실패:', error);
      Alert.alert('오류', '곡을 추가하지 못했어요.');
    } finally {
      setAdding(false);
    }
  };

  // ---------- 항목 메뉴 ----------
  const handleSetDefault = async (item: PlaylistItem) => {
    setTrackMenu(null);
    try {
      await updateSongDefaultVersion(item.song.id, item.version.id);
      await fetchPlaylist();
      logEvent('playlist_set_default_version', { versionNumber: item.versionNumber });
      show('대표 버전으로 지정했어요');
    } catch (error) {
      console.error('대표 버전 설정 실패:', error);
      Alert.alert('오류', '대표 버전을 지정하지 못했어요.');
    }
  };

  const handleRemoveItem = (item: PlaylistItem) => {
    setTrackMenu(null);
    setPlaylistData((prev) =>
      prev ? { ...prev, items: prev.items.filter((i) => i.id !== item.id) } : prev
    );
    pendingRemovalsRef.current.set(item.id, item.versionId);
    showUndo('목록에서 뺐어요', {
      onUndo: () => {
        pendingRemovalsRef.current.delete(item.id);
        fetchPlaylist();
      },
      onCommit: async () => {
        try {
          await removeFromPlaylist(playlistId, item.versionId);
        } catch (error) {
          console.error('항목 제거 실패:', error);
          await fetchPlaylist();
        } finally {
          pendingRemovalsRef.current.delete(item.id);
        }
      },
    });
  };

  const goToSong = (item: PlaylistItem) => {
    setTrackMenu(null);
    navigation.navigate('SongDetail', { songId: item.song.id });
  };

  // ---------- 플레이리스트 메뉴 ----------
  const startRename = () => {
    setPlaylistMenuVisible(false);
    setRenameText(playlist?.name ?? '');
    afterSheetClose(() => setRenameVisible(true));
  };

  const handleRename = async () => {
    const trimmed = renameText.trim();
    if (!trimmed || renaming) return;
    setRenaming(true);
    try {
      await renamePlaylist(playlistId, trimmed);
      setRenameVisible(false);
      show('이름을 바꿨어요');
      await fetchPlaylist();
    } catch (error) {
      console.error('플레이리스트 이름 변경 실패:', error);
      Alert.alert('오류', '이름을 바꾸지 못했어요.');
    } finally {
      setRenaming(false);
    }
  };

  const confirmDeletePlaylist = () => {
    setPlaylistMenuVisible(false);
    afterSheetClose(() => Alert.alert('플레이리스트 삭제', `${withObjectParticle(playlist?.name ?? '', `「${playlist?.name ?? ''}」`)} 삭제할까요?\n녹음 파일은 지워지지 않아요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePlaylist(playlistId);
            navigation.goBack();
            show('플레이리스트를 삭제했어요');
          } catch (error) {
            console.error('플레이리스트 삭제 실패:', error);
            Alert.alert('오류', '플레이리스트를 삭제하지 못했어요.');
          }
        },
      },
    ]));
  };

  // 직접 순서일 때만 드래그(핸들) 활성화. 정렬 중에는 수동 순서가 의미 없으므로 비활성.
  const isDragEnabled = sortOrder === null;

  const renderTrackItem = ({ item, getIndex, drag, isActive }: RenderItemParams<PlaylistItem>) => {
    const index = getIndex() ?? 0;
    const isPlaying = item.versionId === currentPlayingVersionId;

    return (
      <ScaleDecorator activeScale={1.03}>
        <GHTouchableOpacity
          style={[styles.trackItem, isPlaying && { borderColor: accent }, isActive && styles.trackItemDragging]}
          onPress={() => handleTrackPress(index)}
          onLongPress={() => !isActive && setTrackMenu(item)}
          activeOpacity={0.7}
          disabled={isActive}
          testID={`playlist-item-${item.id}`}
        >
          <View style={[styles.trackNumber, isPlaying && { backgroundColor: accent }]}>
            {isPlaying ? (
              <Ionicons name="musical-note" size={14} color={colors.onAccent} />
            ) : (
              <Text style={styles.trackNumberText}>{index + 1}</Text>
            )}
          </View>
          <View style={styles.trackInfo}>
            <Text style={[styles.trackTitle, isPlaying && { color: accent }]} numberOfLines={1}>
              {item.song.title}
            </Text>
            <View style={styles.trackMetaRow}>
              <Text style={styles.trackArtist} numberOfLines={1}>
                {[item.song.artist, formatVersionNumber(item.versionNumber)].filter(Boolean).join(' · ')}
              </Text>
              {item.isDefault && !playlist?.isDefault && (
                <View style={styles.defaultBadge}>
                  <Ionicons name="checkmark-circle" size={11} color={accent} />
                  <Text style={[styles.defaultBadgeText, { color: accent }]}>대표</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.trackRating}>
            <Ionicons name="star" size={14} color={colors.star} />
            <Text style={styles.ratingText}>{item.version.rating}</Text>
          </View>
          {isDragEnabled && (
            <GHTouchableOpacity
              onPressIn={drag}
              style={styles.dragHandle}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityLabel="순서 바꾸기"
            >
              <Ionicons name="reorder-three" size={22} color={colors.textMuted} />
            </GHTouchableOpacity>
          )}
        </GHTouchableOpacity>
      </ScaleDecorator>
    );
  };

  const renderVersionRow = (version: Version) => {
    const already = existingVersionIds.has(version.id);
    const checked = already || selectedVersions.has(version.id);
    return (
      <Pressable
        key={version.id}
        style={[styles.versionRow, already && styles.disabled]}
        onPress={() => toggleVersion(version.id)}
        disabled={already}
        testID={`add-version-${version.id}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: already }}
      >
        <View style={styles.versionInfo}>
          <View style={styles.versionMeta}>
            <Text style={styles.versionNumber}>{formatVersionNumber(versionNumbers.get(version.id))}</Text>
            <Ionicons name="star" size={12} color={colors.star} />
            <Text style={styles.versionRating}>{version.rating}</Text>
            <Text style={styles.versionDate}>
              {new Date(version.recordedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
            </Text>
          </View>
          {version.memo ? (
            <Text style={styles.versionMemo} numberOfLines={1}>{version.memo}</Text>
          ) : null}
        </View>
        <View style={[styles.checkbox, checked && { backgroundColor: accent, borderColor: accent }]}>
          {checked && <Ionicons name="checkmark" size={16} color={colors.onAccent} />}
        </View>
      </Pressable>
    );
  };

  const renderSongRow = ({ item }: { item: SongWithVersions }) => {
    const primary = primaryVersionOf(item);
    if (!primary) return null;
    const already = existingVersionIds.has(primary.id);
    const checked = already || selectedVersions.has(primary.id);
    const expanded = expandedSongs.has(item.song.id);
    const others = item.versions.filter((v) => v.id !== primary.id);
    return (
      <View style={styles.songCard}>
        <View style={styles.songRow}>
          <Pressable
            style={styles.songMain}
            onPress={() => toggleVersion(primary.id)}
            disabled={already}
            testID={`add-song-${item.song.id}`}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled: already }}
          >
            <View style={[styles.checkbox, checked && { backgroundColor: accent, borderColor: accent }, already && styles.disabled]}>
              {checked && <Ionicons name="checkmark" size={16} color={colors.onAccent} />}
            </View>
            <View style={styles.songInfo}>
              <Text style={styles.songTitle} numberOfLines={1}>{item.song.title}</Text>
              <Text style={styles.songMeta} numberOfLines={1}>
                {[
                  item.song.artist,
                  `${primary.id === item.song.defaultVersionId ? '대표' : '최근'} ${formatVersionNumber(versionNumbers.get(primary.id))}`,
                  already ? '추가됨' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </Pressable>
          {others.length > 0 && (
            <Pressable
              style={styles.expandButton}
              onPress={() => toggleExpanded(item.song.id)}
              accessibilityLabel={expanded ? '다른 버전 접기' : '다른 버전 보기'}
              testID={`add-expand-${item.song.id}`}
            >
              <Text style={styles.expandCount}>{item.versions.length}</Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        {expanded && <View style={styles.versionList}>{others.map(renderVersionRow)}</View>}
      </View>
    );
  };

  if (!playlist) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        {loadError ? <ErrorState onRetry={fetchPlaylist} /> : <SkeletonList count={5} rowHeight={68} />}
      </SafeAreaView>
    );
  }

  const headerActions: HeaderAction[] = playlist.isDefault
    ? []
    : [
        { icon: 'add', label: '곡 추가', onPress: openAddSheet, testID: 'playlist-add-songs' },
        { icon: 'ellipsis-vertical', label: '플레이리스트 메뉴', onPress: () => setPlaylistMenuVisible(true), testID: 'playlist-detail-menu' },
      ];

  const trackLabel = trackMenu
    ? `${trackMenu.song.title} ${formatVersionNumber(trackMenu.versionNumber)}`.trim()
    : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        title={playlist.name}
        subtitle={`곡 ${playlist.items.length}개`}
        actions={headerActions}
      />

      {playlist.items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name={playlist.isDefault ? 'star-outline' : 'disc-outline'} size={56} color={colors.textMuted} />
          </View>
          {playlist.isDefault ? (
            <Text style={styles.emptyTitle}>곡 상세에서 대표 버전을 지정하면 여기에 자동으로 추가돼요</Text>
          ) : (
            <>
              <Text style={styles.emptyTitle}>아직 곡이 없어요</Text>
              <PressableScale
                style={[styles.pillButton, { backgroundColor: accent }]}
                onPress={openAddSheet}
                haptic="light"
                testID="playlist-empty-add"
              >
                <Ionicons name="add" size={20} color={colors.onAccent} />
                <Text style={styles.pillText}>곡 추가</Text>
              </PressableScale>
            </>
          )}
        </View>
      ) : (
        <DraggableFlatList
          data={sortedItems}
          renderItem={renderTrackItem}
          keyExtractor={(item) => item.id}
          onDragEnd={isDragEnabled ? handleDragEnd : undefined}
          activationDistance={20}
          containerStyle={styles.content}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <PressableScale
                style={[styles.pillButton, styles.playButton, { backgroundColor: accent }]}
                onPress={() => {
                  handleTrackPress(0);
                  logEvent('playlist_play_all', { count: playlist.items.length });
                }}
                haptic="light"
                testID="playlist-play-all"
                accessibilityRole="button"
              >
                <Ionicons name="play" size={20} color={colors.onAccent} />
                <Text style={styles.pillText}>재생</Text>
              </PressableScale>
              {playlist.items.length > 1 && (
                <View style={styles.chipRow}>
                  <Chip label="직접 순서" selected={sortOrder === null} onPress={() => setSortOrder(null)} testID="playlist-sort-manual" />
                  <Chip label="최신순" selected={sortOrder === 'newest'} onPress={() => setSortOrder('newest')} testID="playlist-sort-newest" />
                  <Chip label="오래된순" selected={sortOrder === 'oldest'} onPress={() => setSortOrder('oldest')} testID="playlist-sort-oldest" />
                </View>
              )}
            </View>
          }
        />
      )}

      {/* 항목 메뉴 */}
      <BottomSheet visible={!!trackMenu} onClose={() => setTrackMenu(null)} title={trackLabel} testID="track-menu-sheet">
        {trackMenu && (
          <>
            {!playlist.isDefault && !trackMenu.isDefault && (
              <SheetAction icon="star-outline" label="대표 버전으로 지정" onPress={() => handleSetDefault(trackMenu)} testID="track-menu-set-default" />
            )}
            <SheetAction icon="musical-note-outline" label="곡으로 이동" onPress={() => goToSong(trackMenu)} testID="track-menu-go-song" />
            {!playlist.isDefault && (
              <SheetAction icon="remove-circle-outline" label="목록에서 빼기" destructive onPress={() => handleRemoveItem(trackMenu)} testID="track-menu-remove" />
            )}
          </>
        )}
      </BottomSheet>

      {/* 플레이리스트 메뉴 */}
      <BottomSheet visible={playlistMenuVisible} onClose={() => setPlaylistMenuVisible(false)} title={playlist.name} testID="playlist-detail-menu-sheet">
        <SheetAction icon="pencil" label="이름 변경" onPress={startRename} testID="playlist-detail-rename" />
        <SheetAction icon="trash-outline" label="플레이리스트 삭제" destructive onPress={confirmDeletePlaylist} testID="playlist-detail-delete" />
      </BottomSheet>

      {/* 이름 변경 */}
      <BottomSheet visible={renameVisible} onClose={() => setRenameVisible(false)} title="이름 변경" testID="playlist-detail-rename-sheet">
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
            testID="playlist-detail-rename-input"
          />
          <PressableScale
            style={[styles.primaryButton, { backgroundColor: accent }, (!renameText.trim() || renaming) && styles.disabled]}
            onPress={handleRename}
            disabled={!renameText.trim() || renaming}
            haptic="light"
            testID="playlist-detail-rename-confirm"
          >
            <Text style={styles.primaryButtonText}>저장</Text>
          </PressableScale>
        </View>
      </BottomSheet>

      {/* 곡 추가 */}
      <BottomSheet visible={addVisible} onClose={() => setAddVisible(false)} title="곡 추가" testID="add-songs-sheet">
        <View style={[styles.addBody, { height: Math.round(windowHeight * 0.6) }]}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="제목·가수 검색 (초성 가능)"
              placeholderTextColor={colors.textFaint}
              returnKeyType="search"
              testID="add-songs-search"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={12} accessibilityLabel="검색어 지우기">
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
          {songsLoading ? (
            <View style={styles.sheetCenter}>
              <ActivityIndicator color={accent} />
            </View>
          ) : availableSongs.length === 0 ? (
            <View style={styles.sheetCenter}>
              <Ionicons name="musical-notes-outline" size={48} color={colors.textMuted} />
              <Text style={styles.sheetEmptyText}>추가할 수 있는 곡이 없어요</Text>
              <Text style={styles.sheetEmptySub}>먼저 곡을 녹음해 보세요</Text>
            </View>
          ) : (
            <FlatList
              style={styles.flex}
              data={filteredSongs}
              keyExtractor={(item) => item.song.id}
              renderItem={renderSongRow}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.songListContent}
              ListEmptyComponent={<Text style={styles.sheetEmptySub}>검색 결과가 없어요</Text>}
            />
          )}
          <PressableScale
            style={[styles.primaryButton, { backgroundColor: accent }, (selectedVersions.size === 0 || adding) && styles.disabled]}
            onPress={handleAddSelected}
            disabled={selectedVersions.size === 0 || adding}
            haptic="light"
            testID="add-songs-confirm"
            accessibilityRole="button"
          >
            {adding ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {selectedVersions.size > 0 ? `${selectedVersions.size}곡 추가` : '곡을 골라 주세요'}
              </Text>
            )}
          </PressableScale>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    flex: { flex: 1 },
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    content: {
      flex: 1,
    },
    listHeader: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      gap: spacing.md,
    },
    chipRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    pillButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      height: 48,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.full,
    },
    playButton: {
      alignSelf: 'stretch',
      marginTop: spacing.md, // 헤더의 곡 수 표시와 붙어 보이지 않게
    },
    pillText: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.onAccent,
    },
    listContent: {
      paddingBottom: spacing.xl,
      gap: spacing.sm,
    },
    trackItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginHorizontal: spacing.lg,
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
      paddingVertical: spacing.md,
      gap: spacing.md,
    },
    trackItemDragging: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    trackNumber: {
      width: 32,
      height: 32,
      borderRadius: borderRadius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    trackNumberText: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.textMuted,
    },
    trackInfo: {
      flex: 1,
      gap: 2,
    },
    trackTitle: {
      fontFamily: fontFamily.semibold,
      fontSize: 16,
      color: colors.text,
    },
    trackArtist: {
      ...typography.bodySmall,
      color: colors.textMuted,
      flexShrink: 1,
    },
    trackMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    defaultBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    defaultBadgeText: {
      fontFamily: fontFamily.semibold,
      fontSize: 11,
    },
    trackRating: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    ratingText: {
      ...typography.bodySmall,
      color: colors.textMuted,
    },
    dragHandle: {
      width: 44,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xxl,
      gap: spacing.lg,
    },
    emptyIconContainer: {
      width: 112,
      height: 112,
      borderRadius: borderRadius.full,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyTitle: {
      ...typography.body,
      fontFamily: fontFamily.semibold,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
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
    addBody: {
      paddingHorizontal: spacing.xs,
      gap: spacing.md,
      paddingBottom: spacing.sm,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      height: 46,
      paddingHorizontal: spacing.md,
      borderRadius: borderRadius.full,
      backgroundColor: colors.surfaceAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      fontFamily: fontFamily.regular,
      fontSize: 15,
      color: colors.text,
      paddingVertical: 0,
    },
    sheetCenter: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.sm,
    },
    sheetEmptyText: {
      ...typography.body,
      color: colors.textMuted,
    },
    sheetEmptySub: {
      ...typography.bodySmall,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
    songListContent: {
      gap: spacing.sm,
      paddingBottom: spacing.sm,
    },
    songCard: {
      backgroundColor: colors.bg,
      borderRadius: borderRadius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    songRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    songMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 60,
      paddingHorizontal: spacing.md,
    },
    songInfo: {
      flex: 1,
      gap: 2,
    },
    songTitle: {
      fontFamily: fontFamily.semibold,
      fontSize: 15,
      color: colors.text,
    },
    songMeta: {
      fontFamily: fontFamily.regular,
      fontSize: 12,
      color: colors.textMuted,
    },
    expandButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      minWidth: 52,
      height: 60,
      paddingHorizontal: spacing.sm,
    },
    expandCount: {
      fontFamily: fontFamily.semibold,
      fontSize: 12,
      color: colors.textMuted,
    },
    versionList: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingLeft: spacing.xl + spacing.md,
    },
    versionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      paddingRight: spacing.md,
      gap: spacing.md,
    },
    versionInfo: {
      flex: 1,
      gap: 2,
    },
    versionMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    versionNumber: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.text,
    },
    versionRating: {
      ...typography.bodySmall,
      color: colors.textMuted,
    },
    versionDate: {
      ...typography.bodySmall,
      color: colors.textMuted,
    },
    versionMemo: {
      ...typography.caption,
      color: colors.textMuted,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: borderRadius.sm,
      borderWidth: 2,
      borderColor: colors.textMuted,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
