import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, Song, Version } from '../types';
import { getPlaylistWithDetails, removeFromPlaylist, getAllSongs, getVersionsBySong, addToPlaylist } from '../lib/database';
import { usePlayer } from '../contexts/PlayerContext';
import { colors, spacing, borderRadius, typography } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PlaylistDetail'>;

interface PlaylistItem {
  id: string;
  versionId: string;
  order: number;
  version: Version;
  song: Song;
}

export default function PlaylistDetailScreen({ navigation, route }: Props) {
  const { playlistId } = route.params;
  const [playlist, setPlaylistData] = useState<any>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [availableSongs, setAvailableSongs] = useState<{ song: Song; versions: Version[] }[]>([]);
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const { setPlaylist, playlistState } = usePlayer();

  useFocusEffect(
    useCallback(() => {
      fetchPlaylist();
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
      console.log('Starting to fetch songs...');
      const songs = await getAllSongs();
      console.log('Fetched songs:', songs.length);
      const songsWithVersions = await Promise.all(
        songs.map(async (song) => ({
          song,
          versions: await getVersionsBySong(song.id),
        }))
      );
      console.log('Songs with versions:', songsWithVersions.length);
      // 버전이 있는 곡만 표시
      const filtered = songsWithVersions.filter(s => s.versions.length > 0);
      console.log('Filtered songs (with versions):', filtered.length);
      setAvailableSongs(filtered);
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
      Alert.alert('완료', `${versionsArray.length}개의 곡이 추가되었습니다.`);
    } catch (error) {
      console.error('곡 추가 실패:', error);
      Alert.alert('오류', '곡 추가에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleTrackPress = (index: number) => {
    const playlistItems = playlist.items.map((item: PlaylistItem) => ({
      song: item.song,
      version: item.version,
    }));
    setPlaylist(playlistItems, index);
  };

  // 현재 재생 중인 곡의 인덱스 계산
  const currentPlayingIndex = playlistState && playlist && playlistState.items.length === playlist.items.length
    ? playlistState.currentIndex
    : -1;

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

  const renderTrackItem = ({ item, index }: { item: PlaylistItem; index: number }) => (
    <TouchableOpacity
      style={[styles.trackItem, index === currentPlayingIndex && styles.trackItemActive]}
      onPress={() => handleTrackPress(index)}
      onLongPress={() => handleRemoveItem(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.trackNumber, index === currentPlayingIndex && styles.trackNumberActive]}>
        {index === currentPlayingIndex ? (
          <Ionicons name="musical-note" size={14} color={colors.textPrimary} />
        ) : (
          <Text style={styles.trackNumberText}>{index + 1}</Text>
        )}
      </View>
      <View style={styles.trackInfo}>
        <Text style={[styles.trackTitle, index === currentPlayingIndex && styles.trackTitleActive]} numberOfLines={1}>
          {item.song.title}
        </Text>
        {item.song.artist && (
          <Text style={styles.trackArtist} numberOfLines={1}>{item.song.artist}</Text>
        )}
      </View>
      <View style={styles.trackRating}>
        <Ionicons name="star" size={14} color={colors.warning} />
        <Text style={styles.ratingText}>{item.version.rating}</Text>
      </View>
    </TouchableOpacity>
  );

  if (!playlist) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.logo}>
          <Ionicons name="musical-notes" size={20} color={colors.primary} />
          <Text style={styles.logoText}>Playlist</Text>
        </View>
        {!playlist.isDefault && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleOpenAddModal}
          >
            <Ionicons name="add" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
      </View>

      {playlist.items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="disc-outline" size={64} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>플레이리스트가 비어있습니다</Text>
          {!playlist.isDefault && (
            <TouchableOpacity
              style={styles.emptyAddButton}
              onPress={handleOpenAddModal}
            >
              <Ionicons name="add" size={24} color={colors.background} />
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* 플레이리스트 정보 헤더 */}
          <View style={styles.playlistHeader}>
            <View style={styles.playlistCover}>
              <Ionicons name="musical-notes" size={48} color={colors.textSecondary} />
            </View>
            <View style={styles.playlistInfo}>
              <Text style={styles.playlistTitle}>{playlist.name}</Text>
              <Text style={styles.playlistCount}>{playlist.items.length}곡</Text>
              <TouchableOpacity
                style={styles.playAllButton}
                onPress={() => handleTrackPress(0)}
              >
                <Ionicons name="play" size={20} color={colors.background} />
                <Text style={styles.playAllText}>전체 재생</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.trackListSection}>
            <FlatList
              data={playlist.items}
              renderItem={renderTrackItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={styles.trackList}
            />
          </View>
        </ScrollView>
      )}

      {/* 곡 추가 모달 */}
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
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : availableSongs.length === 0 ? (
              <View style={styles.modalLoading}>
                <Ionicons name="musical-notes-outline" size={64} color={colors.textTertiary} />
                <Text style={styles.emptyModalText}>추가할 수 있는 곡이 없습니다</Text>
                <Text style={styles.emptyModalSubtext}>
                  먼저 곡을 녹음해보세요!
                </Text>
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
                                <Ionicons name="star" size={12} color={colors.warning} />
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
                                <Ionicons name="checkmark" size={16} color={colors.background} />
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
                  <Text style={styles.selectedCount}>
                    {selectedVersions.size}개 선택됨
                  </Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.body,
    color: colors.textSecondary,
  },
  errorIconContainer: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  errorText: {
    ...typography.h3,
    color: colors.textSecondary,
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
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.5,
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
    color: colors.textPrimary,
  },
  playlistCount: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  playAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  playAllText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.background,
  },
  trackListSection: {
    padding: spacing.lg,
    paddingTop: 0,
  },
  trackList: {
    gap: spacing.sm,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  trackItemActive: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.textPrimary,
  },
  trackNumber: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackNumberActive: {
    backgroundColor: colors.surfaceLighter,
  },
  trackNumberText: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  trackInfo: {
    flex: 1,
    gap: 2,
  },
  trackTitle: {
    ...typography.body,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  trackTitleActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  trackArtist: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  trackRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
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
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyAddButton: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    marginTop: spacing.xl,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
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
    color: colors.textPrimary,
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
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  songGroupArtist: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  versionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  versionItemSelected: {
    backgroundColor: colors.surfaceLighter,
    borderWidth: 1,
    borderColor: colors.primary,
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
    color: colors.textSecondary,
    fontWeight: '600',
  },
  versionDate: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  versionMemo: {
    ...typography.caption,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.textTertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxDisabledText: {
    ...typography.caption,
    color: colors.textTertiary,
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
    color: colors.textSecondary,
    fontWeight: '600',
  },
  addConfirmButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  addConfirmButtonDisabled: {
    opacity: 0.5,
  },
  addConfirmButtonText: {
    ...typography.body,
    color: colors.background,
    fontWeight: '600',
  },
  emptyModalText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  emptyModalSubtext: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
