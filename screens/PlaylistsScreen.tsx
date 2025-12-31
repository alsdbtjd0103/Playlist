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
import { RootStackParamList, Playlist } from '../types';
import {
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  getAllDefaultVersions,
  addToPlaylist,
  getPlaylistItems,
} from '../lib/database';

type Props = NativeStackScreenProps<RootStackParamList, 'Playlists'>;

export default function PlaylistsScreen({ navigation }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
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
    } finally {
      setLoading(false);
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
    >
      <View style={styles.playlistHeader}>
        <Text style={styles.playlistName}>{item.name}</Text>
        {item.isDefault && (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultBadgeText}>기본</Text>
          </View>
        )}
      </View>
      {item.description && (
        <Text style={styles.playlistDescription}>{item.description}</Text>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>플레이리스트</Text>
          <Text style={styles.subtitle}>나만의 플레이리스트를 만들어보세요</Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← 홈으로</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.primaryButtonText}>+ 새 플레이리스트</Text>
          </TouchableOpacity>
        </View>
      </View>

      {playlists.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>플레이리스트가 없습니다</Text>
          <Text style={styles.emptySubtitle}>
            새 플레이리스트를 만들면 자동으로 모든 대표 버전이 추가됩니다.
          </Text>
        </View>
      ) : (
        <FlatList
          data={playlists}
          renderItem={renderPlaylistCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>새 플레이리스트</Text>
            <Text style={styles.modalSubtitle}>
              모든 대표 버전이 자동으로 추가됩니다.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>이름 *</Text>
              <TextInput
                style={styles.input}
                placeholder="예: 내가 좋아하는 노래"
                value={name}
                onChangeText={setName}
                editable={!creating}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>설명 (선택)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="플레이리스트에 대한 설명을 입력하세요"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
                editable={!creating}
              />
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
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleCreatePlaylist}
                disabled={creating || !name.trim()}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>생성</Text>
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
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#000',
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#000',
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
    gap: 12,
  },
  playlistCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    padding: 16,
  },
  playlistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  playlistName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  defaultBadge: {
    backgroundColor: '#000',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  defaultBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  playlistDescription: {
    fontSize: 14,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#000',
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
