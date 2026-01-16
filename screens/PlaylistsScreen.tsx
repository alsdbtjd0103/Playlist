import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, Playlist } from '../types';
import {
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  getAllDefaultVersions,
  addToPlaylist,
} from '../lib/database';
import { colors, spacing, borderRadius, typography } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Playlists'>;

export default function PlaylistsScreen({ navigation }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchPlaylists();
    }, [])
  );

  const fetchPlaylists = async () => {
    try {
      const data = await getPlaylists();
      setPlaylists(data);
    } catch (error) {
      console.error('플레이리스트 로드 실패:', error);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!name.trim()) {
      Alert.alert('알림', '플레이리스트 이름을 입력하세요.');
      return;
    }

    setCreating(true);
    try {
      const playlistId = await createPlaylist(
        name.trim(),
        description.trim() || undefined,
        false
      );

      const defaultVersions = await getAllDefaultVersions();
      for (let i = 0; i < defaultVersions.length; i++) {
        await addToPlaylist(playlistId, defaultVersions[i].version.id, i);
      }

      setName('');
      setDescription('');
      setModalVisible(false);
      await fetchPlaylists();
      Alert.alert('완료', '플레이리스트가 생성되었습니다. 모든 대표 버전이 추가되었습니다.');
    } catch (error) {
      console.error('플레이리스트 생성 실패:', error);
      Alert.alert('오류', '플레이리스트 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePlaylist = (playlist: Playlist) => {
    if (playlist.isDefault) {
      Alert.alert('알림', '기본 플레이리스트는 삭제할 수 없습니다.');
      return;
    }

    Alert.alert(
      '플레이리스트 삭제',
      `"${playlist.name}"을(를) 삭제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePlaylist(playlist.id);
              await fetchPlaylists();
            } catch (error) {
              console.error('플레이리스트 삭제 실패:', error);
              Alert.alert('오류', '플레이리스트 삭제에 실패했습니다.');
            }
          },
        },
      ]
    );
  };

  const renderPlaylistCard = ({ item }: { item: Playlist }) => (
    <TouchableOpacity
      style={styles.playlistCard}
      onPress={() => navigation.navigate('PlaylistDetail', { playlistId: item.id })}
      onLongPress={() => handleDeletePlaylist(item)}
      activeOpacity={0.7}
    >
      <View style={styles.playlistThumbnail}>
        <Ionicons
          name={item.isDefault ? 'musical-notes' : 'list'}
          size={24}
          color={colors.textSecondary}
        />
      </View>
      <View style={styles.playlistInfo}>
        <View style={styles.playlistTitleRow}>
          <Text style={styles.playlistName} numberOfLines={1}>{item.name}</Text>
          {item.isDefault && (
            <View style={styles.defaultBadge}>
              <Ionicons name="checkmark-circle" size={12} color={colors.primary} />
              <Text style={styles.defaultBadgeText}>기본</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );

  if (playlists === null) {
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
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {playlists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="albums-outline" size={64} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>플레이리스트가 없습니다</Text>
          <Text style={styles.emptySubtitle}>
            새 플레이리스트를 만들면 자동으로{'\n'}모든 대표 버전이 추가됩니다
          </Text>
        </View>
      ) : (
        <FlatList
          data={playlists}
          renderItem={renderPlaylistCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* 생성 모달 */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>새 리스트</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>이름</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="albums" size={20} color={colors.textTertiary} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="예: 내가 좋아하는 노래"
                  placeholderTextColor={colors.textTertiary}
                  value={name}
                  onChangeText={setName}
                  editable={!creating}
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>설명 (선택)</Text>
              <View style={[styles.inputWrapper, styles.textAreaWrapper]}>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="플레이리스트에 대한 설명을 입력하세요"
                  placeholderTextColor={colors.textTertiary}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  editable={!creating}
                />
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
                disabled={creating}
              >
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, !name.trim() && styles.disabledButton]}
                onPress={handleCreatePlaylist}
                disabled={creating || !name.trim()}
              >
                {creating ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={20} color={colors.background} />
                    <Text style={styles.confirmButtonText}>생성</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.body,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.sm,
  },
  playlistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  playlistThumbnail: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistInfo: {
    flex: 1,
  },
  playlistTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  playlistName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  defaultBadgeText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textAreaWrapper: {
    alignItems: 'flex-start',
  },
  inputIcon: {
    marginLeft: spacing.md,
  },
  input: {
    flex: 1,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  modalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  cancelButton: {
    backgroundColor: colors.surfaceLight,
  },
  cancelButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  confirmButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.background,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
