import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { RootStackParamList, Song, Version } from '../types';
import {
  getPlaylistWithDetails,
  removeFromPlaylist,
  getAllSongs,
  getVersionsBySong,
  addToPlaylist,
  reorderPlaylistItems,
} from '../lib/database';
import { usePlayer } from '../contexts/PlayerContext';
import { ColorTokens, spacing, borderRadius, typography, fontFamily } from '../lib/theme';
import { useTheme } from '../contexts/ThemeContext';
import Waveform from '../components/Waveform';
import { logEvent, logScreen } from '../lib/analytics';

type Props = NativeStackScreenProps<RootStackParamList, 'PlaylistDetail'>;

interface PlaylistItem {
  id: string;
  versionId: string;
  order: number;
  addedAt: Date;
  version: Version;
  song: Song;
}

type SortOrder = null | 'newest' | 'oldest';

export default function PlaylistDetailScreen({ route }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const wordColor = scheme === 'dark' ? colors.accent : colors.accentStrong;
  const { playlistId } = route.params;
  const [playlist, setPlaylistData] = useState<any>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [availableSongs, setAvailableSongs] = useState<{ song: Song; versions: Version[] }[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>(null);
  const [reorderMode, setReorderMode] = useState(false);
  const { setPlaylist, playlistState } = usePlayer();

  useFocusEffect(
    useCallback(() => {
      fetchPlaylist();
      logScreen('PlaylistDetail');
    }, [])
  );

  const fetchPlaylist = async () => {
    try {
      const data = await getPlaylistWithDetails(playlistId);
      setPlaylistData(data);
    } catch (error) {
      console.error('플레이리스트 로드 실패:', error);
    }
  };

  const fetchAvailableSongs = async () => {
    try {
      setLoading(true);
      const songs = await getAllSongs();
      const songsWithVersions = await Promise.all(
        songs.map(async (song) => ({
          song,
          versions: await getVersionsBySong(song.id),
        }))
      );
      setAvailableSongs(songsWithVersions.filter(s => s.versions.length > 0));
    } catch (error) {
      console.error('곡 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setSelectedVersions(new Set());
    fetchAvailableSongs();
    setAddModalVisible(true);
  };

  const toggleVersionSelection = (versionId: string) => {
    const newSet = new Set(selectedVersions);
    if (newSet.has(versionId)) {
      newSet.delete(versionId);
    } else {
      newSet.add(versionId);
    }
    setSelectedVersions(newSet);
  };

  const handleAddSelectedSongs = async () => {
    if (selectedVersions.size === 0) {
      Alert.alert('알림', '추가할 곡을 선택해주세요.');
      return;
    }
    try {
      setLoading(true);
      const currentOrder = playlist.items.length;
      const versionsArray = Array.from(selectedVersions);
      for (let i = 0; i < versionsArray.length; i++) {
        await addToPlaylist(playlistId, versionsArray[i], currentOrder + i);
      }
      setAddModalVisible(false);
      setSelectedVersions(new Set());
      await fetchPlaylist();
      logEvent('playlist_songs_added', { count: versionsArray.length });
      Alert.alert('완료', `${versionsArray.length}개의 곡이 추가되었습니다.`);
    } catch (error) {
      console.error('곡 추가 실패:', error);
      Alert.alert('오류', '곡 추가에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getSortedItems = (items: PlaylistItem[]): PlaylistItem[] => {
    if (!sortOrder) return items;
    return [...items].sort((a, b) => {
      const aTime = new Date(a.version.recordedAt).getTime();
      const bTime = new Date(b.version.recordedAt).getTime();
      return sortOrder === 'newest' ? bTime - aTime : aTime - bTime;
    });
  };

  const handleTrackPress = (index: number) => {
    const sorted = getSortedItems(playlist.items);
    setPlaylist(sorted.map((item: PlaylistItem) => ({ song: item.song, version: item.version })), index);
  };

  const handleDragEnd = async ({ data }: { data: PlaylistItem[] }) => {
    setPlaylistData((prev: any) => ({ ...prev, items: data }));
    try {
      await reorderPlaylistItems(playlistId, data.map(item => item.id));
    } catch (error) {
      console.error('순서 저장 실패:', error);
      await fetchPlaylist();
    }
  };

  const currentPlayingVersionId = playlistState
    ? playlistState.items[playlistState.currentIndex]?.version.id ?? null
    : null;

  const handleRemoveItem = (item: PlaylistItem) => {
    if (playlist.isDefault) {
      Alert.alert('알림', '기본 플레이리스트에서는 항목을 삭제할 수 없습니다.');
      return;
    }
    Alert.alert(
      '항목 제거',
      `"${item.song.title}"을(를) 플레이리스트에서 제거하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '제거',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFromPlaylist(playlistId, item.versionId);
              await fetchPlaylist();
            } catch (error) {
              console.error('항목 제거 실패:', error);
              Alert.alert('오류', '항목 제거에 실패했습니다.');
            }
          },
        },
      ]
    );
  };

  const cycleSortOrder = () => {
    setSortOrder(prev => {
      if (prev === null) return 'newest';
      if (prev === 'newest') return 'oldest';
      return null;
    });
  };

  // 순서 편집 모드 토글 — 켜면 직접순서로 되돌리고 드래그 활성화.
  const toggleReorder = () => {
    setReorderMode(prev => {
      const next = !prev;
      if (next) setSortOrder(null);
      return next;
    });
  };

  const sortLabel = sortOrder === 'newest' ? '최신순' : sortOrder === 'oldest' ? '오래된순' : '직접순서';
  // 드래그는 "순서 편집" 모드에서만 활성화한다. 기본 상태는 항상 스크롤이 되어야 한다.
  // RNDFL은 리스트 전체를 Pan으로 감싸고 activeOffsetY(activationDistance)로 스크롤을 가로채므로,
  // 편집 모드가 아닐 때는 activationDistance를 매우 크게 두어 Pan이 스크롤을 강탈하지 못하게 한다.
  const isDragEnabled = reorderMode;
  const DRAG_OFF_DISTANCE = 100000; // 사실상 Pan 비활성 → 스크롤 자유
  const DRAG_ON_DISTANCE = 10;      // 편집 모드: 핸들 드래그 반응(가장자리 auto-scroll로 긴 목록 이동)

  const renderTrackItem = ({ item, getIndex, drag, isActive }: RenderItemParams<PlaylistItem>) => {
    const index = getIndex() ?? 0;
    const isPlaying = item.versionId === currentPlayingVersionId;

    return (
      <ScaleDecorator activeScale={1.03}>
        <TouchableOpacity
          style={[styles.trackItem, isPlaying && styles.trackItemActive, isActive && styles.trackItemDragging]}
          onPress={() => handleTrackPress(index)}
          onLongPress={() => !isActive && handleRemoveItem(item)}
          activeOpacity={0.7}
          disabled={isActive}
        >
          <View style={[styles.trackNumber, isPlaying && styles.trackNumberActive]}>
            {isPlaying ? (
              <Ionicons name="musical-note" size={14} color={colors.text} />
            ) : (
              <Text style={styles.trackNumberText}>{index + 1}</Text>
            )}
          </View>
          <View style={styles.trackInfo}>
            <Text style={[styles.trackTitle, isPlaying && styles.trackTitleActive]} numberOfLines={1}>
              {item.song.title}
            </Text>
            {item.song.artist && (
              <Text style={styles.trackArtist} numberOfLines={1}>{item.song.artist}</Text>
            )}
          </View>
          <View style={styles.trackRating}>
            <Ionicons name="star" size={14} color={colors.star} />
            <Text style={styles.ratingText}>{item.version.rating}</Text>
          </View>
          {isDragEnabled && (
            <TouchableOpacity
              onPressIn={drag}
              style={styles.dragHandle}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="reorder-three" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  if (!playlist) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accentStrong} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.logo}>
          <Waveform size={20} />
          <Text style={[styles.logoText, { color: wordColor }]}>plilog</Text>
        </View>
        <View style={styles.headerActions}>
          {playlist.items.length > 0 && !reorderMode && (
            <TouchableOpacity
              style={[styles.sortButton, sortOrder !== null && styles.sortButtonActive]}
              onPress={cycleSortOrder}
            >
              <Ionicons
                name={sortOrder !== null ? 'swap-vertical' : 'reorder-four-outline'}
                size={16}
                color={colors.text}
              />
              <Text style={styles.sortButtonText}>{sortLabel}</Text>
            </TouchableOpacity>
          )}
          {playlist.items.length > 1 && (
            <TouchableOpacity
              style={[styles.sortButton, reorderMode && styles.sortButtonActive]}
              onPress={toggleReorder}
              testID="reorder-toggle"
            >
              <Ionicons
                name={reorderMode ? 'checkmark' : 'swap-vertical-outline'}
                size={16}
                color={colors.text}
              />
              <Text style={styles.sortButtonText}>{reorderMode ? '완료' : '순서 편집'}</Text>
            </TouchableOpacity>
          )}
          {!playlist.isDefault && (
            <TouchableOpacity style={styles.addButton} onPress={handleOpenAddModal}>
              <Ionicons name="add" size={24} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {playlist.items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="disc-outline" size={64} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>플레이리스트가 비어있습니다</Text>
          {!playlist.isDefault && (
            <TouchableOpacity style={styles.emptyAddButton} onPress={handleOpenAddModal}>
              <Ionicons name="add" size={24} color={colors.bg} />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <DraggableFlatList
          data={getSortedItems(playlist.items)}
          renderItem={renderTrackItem}
          keyExtractor={(item) => item.id}
          onDragEnd={isDragEnabled ? handleDragEnd : undefined}
          activationDistance={isDragEnabled ? DRAG_ON_DISTANCE : DRAG_OFF_DISTANCE}
          containerStyle={styles.content}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.playlistHeader}>
              <View style={styles.playlistCover}>
                <Ionicons name="musical-notes" size={48} color={colors.textMuted} />
              </View>
              <View style={styles.playlistInfo}>
                <Text style={styles.playlistTitle}>{playlist.name}</Text>
                <Text style={styles.playlistCount}>{playlist.items.length}곡</Text>
                <TouchableOpacity
                  style={styles.playAllButton}
                  onPress={() => {
                    handleTrackPress(0);
                    logEvent('playlist_play_all', { count: playlist.items.length });
                  }}
                >
                  <Ionicons name="play" size={20} color={colors.bg} />
                  <Text style={styles.playAllText}>전체 재생</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
        />
      )}

      <Modal
        visible={addModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>곡 추가</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={colors.accentStrong} />
              </View>
            ) : availableSongs.length === 0 ? (
              <View style={styles.modalLoading}>
                <Ionicons name="musical-notes-outline" size={64} color={colors.textMuted} />
                <Text style={styles.emptyModalText}>추가할 수 있는 곡이 없습니다</Text>
                <Text style={styles.emptyModalSubtext}>먼저 곡을 녹음해보세요!</Text>
              </View>
            ) : (
              <>
                <ScrollView style={styles.songsList} showsVerticalScrollIndicator={false}>
                  {availableSongs.map((item) => (
                    <View key={item.song.id} style={styles.songGroup}>
                      <Text style={styles.songGroupTitle}>{item.song.title}</Text>
                      {item.song.artist && (
                        <Text style={styles.songGroupArtist}>{item.song.artist}</Text>
                      )}
                      {item.versions.map((version) => {
                        const isSelected = selectedVersions.has(version.id);
                        const isAlreadyInPlaylist = playlist.items.some(
                          (pItem: PlaylistItem) => pItem.versionId === version.id
                        );
                        return (
                          <TouchableOpacity
                            key={version.id}
                            style={[
                              styles.versionItem,
                              isSelected && styles.versionItemSelected,
                              isAlreadyInPlaylist && styles.versionItemDisabled,
                            ]}
                            onPress={() => !isAlreadyInPlaylist && toggleVersionSelection(version.id)}
                            disabled={isAlreadyInPlaylist}
                            activeOpacity={0.7}
                          >
                            <View style={styles.versionInfo}>
                              <View style={styles.versionMeta}>
                                <Ionicons name="star" size={12} color={colors.star} />
                                <Text style={styles.versionRating}>{version.rating}</Text>
                                <Text style={styles.versionDate}>
                                  {new Date(version.recordedAt).toLocaleDateString('ko-KR', {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </Text>
                              </View>
                              {version.memo && (
                                <Text style={styles.versionMemo} numberOfLines={1}>
                                  {version.memo}
                                </Text>
                              )}
                            </View>
                            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                              {isSelected && (
                                <Ionicons name="checkmark" size={16} color={colors.bg} />
                              )}
                              {isAlreadyInPlaylist && !isSelected && (
                                <Text style={styles.checkboxDisabledText}>추가됨</Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>

                <View style={styles.modalFooter}>
                  <Text style={styles.selectedCount}>{selectedVersions.size}개 선택됨</Text>
                  <TouchableOpacity
                    style={[
                      styles.addConfirmButton,
                      selectedVersions.size === 0 && styles.addConfirmButtonDisabled,
                    ]}
                    onPress={handleAddSelectedSongs}
                    disabled={selectedVersions.size === 0 || loading}
                  >
                    <Text style={styles.addConfirmButtonText}>추가</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  logoText: {
    fontFamily: fontFamily.wordmark,
    fontSize: 20,
    color: colors.text,
    letterSpacing: -0.8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortButtonActive: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.textMuted,
  },
  sortButtonText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '500',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  playlistHeader: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  playlistCover: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.xs,
  },
  playlistTitle: {
    ...typography.h2,
    color: colors.text,
  },
  playlistCount: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
  playAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accentStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  playAllText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.bg,
  },
  listContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.lg,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  trackItemActive: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.text,
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
  trackNumberActive: {
    backgroundColor: colors.surfaceAlt,
  },
  trackNumberText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textMuted,
  },
  trackInfo: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    ...typography.body,
    fontWeight: '500',
    color: colors.text,
  },
  trackTitleActive: {
    fontFamily: fontFamily.semibold,
    color: colors.text,
    fontWeight: '600',
  },
  trackArtist: {
    ...typography.bodySmall,
    color: colors.textMuted,
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
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
    width: 120,
    height: 120,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  emptyAddButton: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentStrong,
    borderRadius: borderRadius.full,
    marginTop: spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.xl,
    marginTop: '20%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
  },
  modalLoading: {
    padding: spacing.xxl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  songsList: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  songGroup: {
    marginBottom: spacing.lg,
  },
  songGroupTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  songGroupArtist: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  versionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  versionItemSelected: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.accentStrong,
  },
  versionItemDisabled: {
    opacity: 0.5,
  },
  versionInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  versionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  versionRating: {
    ...typography.bodySmall,
    color: colors.textMuted,
    fontWeight: '600',
  },
  versionDate: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
  versionMemo: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
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
  checkboxSelected: {
    backgroundColor: colors.accentStrong,
    borderColor: colors.accentStrong,
  },
  checkboxDisabledText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 8,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectedCount: {
    ...typography.body,
    color: colors.textMuted,
    fontWeight: '600',
  },
  addConfirmButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accentStrong,
    borderRadius: borderRadius.md,
  },
  addConfirmButtonDisabled: {
    opacity: 0.5,
  },
  addConfirmButtonText: {
    ...typography.body,
    color: colors.bg,
    fontWeight: '600',
  },
  emptyModalText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  emptyModalSubtext: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
