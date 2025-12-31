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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { RootStackParamList, Song, Version } from '../types';
import { getPlaylistWithDetails, removeFromPlaylist } from '../lib/database';
import PlaylistPlayer from '../components/PlaylistPlayer';

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
  const [playlist, setPlaylist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useFocusEffect(
    useCallback(() => {
      fetchPlaylist();
    }, [])
  );

  const fetchPlaylist = async () => {
    try {
      const data = await getPlaylistWithDetails(playlistId);
      setPlaylist(data);
    } catch (error) {
      console.error('플레이리스트 로드 실패:', error);
      Alert.alert('오류', '플레이리스트를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

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
              if (currentIndex >= playlist.items.length - 1) {
                setCurrentIndex(Math.max(0, playlist.items.length - 2));
              }
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
      style={[styles.trackItem, index === currentIndex && styles.trackItemActive]}
      onPress={() => setCurrentIndex(index)}
      onLongPress={() => handleRemoveItem(item)}
    >
      <View style={styles.trackNumber}>
        <Text style={[styles.trackNumberText, index === currentIndex && styles.trackNumberTextActive]}>
          {index + 1}
        </Text>
      </View>
      <View style={styles.trackInfo}>
        <Text style={[styles.trackTitle, index === currentIndex && styles.trackTitleActive]}>
          {item.song.title}
        </Text>
        {item.song.artist && (
          <Text style={styles.trackArtist}>{item.song.artist}</Text>
        )}
      </View>
      <View style={styles.trackRating}>
        <Text style={styles.ratingStar}>★</Text>
        <Text style={styles.ratingText}>{item.version.rating}</Text>
      </View>
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

  if (!playlist) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>플레이리스트를 찾을 수 없습니다</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← 돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const playlistData = playlist.items.map((item: PlaylistItem) => ({
    song: item.song,
    version: item.version,
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.headerBackButtonText}>← 뒤로</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.title}>{playlist.name}</Text>
          {playlist.description && (
            <Text style={styles.description}>{playlist.description}</Text>
          )}
          <Text style={styles.trackCount}>{playlist.items.length}개 트랙</Text>
        </View>
      </View>

      {playlist.items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>플레이리스트가 비어있습니다</Text>
          <Text style={styles.emptySubtitle}>
            곡의 대표 버전을 설정하면 자동으로 추가됩니다.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          <View style={styles.playerSection}>
            <PlaylistPlayer
              playlist={playlistData}
              currentIndex={currentIndex}
              onIndexChange={setCurrentIndex}
            />
          </View>

          <View style={styles.trackListSection}>
            <Text style={styles.sectionTitle}>트랙 목록</Text>
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
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#000',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    gap: 12,
  },
  headerBackButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  headerBackButtonText: {
    fontSize: 16,
    color: '#000',
  },
  headerInfo: {
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  trackCount: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  playerSection: {
    padding: 16,
  },
  trackListSection: {
    padding: 16,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  trackList: {
    gap: 8,
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    gap: 12,
  },
  trackItemActive: {
    backgroundColor: '#f3f4f6',
    borderColor: '#000',
  },
  trackNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  trackNumberTextActive: {
    color: '#000',
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  trackTitleActive: {
    fontWeight: 'bold',
  },
  trackArtist: {
    fontSize: 14,
    color: '#6b7280',
  },
  trackRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingStar: {
    color: '#fbbf24',
    fontSize: 14,
  },
  ratingText: {
    fontSize: 14,
    color: '#6b7280',
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
});
