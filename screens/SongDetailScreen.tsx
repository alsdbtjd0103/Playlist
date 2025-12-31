import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, SongWithVersions } from '../types';
import {
  getSong,
  getVersionsBySong,
  updateSongDefaultVersion,
  deleteVersion,
  addVersion,
} from '../lib/database';
import { saveAudioLocally } from '../lib/storage';
import RecorderModal from '../components/RecorderModal';
import AudioPlayer from '../components/AudioPlayer';

type Props = NativeStackScreenProps<RootStackParamList, 'SongDetail'>;

export default function SongDetailScreen({ route, navigation }: Props) {
  const { songId } = route.params;
  const [song, setSong] = useState<SongWithVersions | null>(null);
  const [loading, setLoading] = useState(true);
  const [recorderVisible, setRecorderVisible] = useState(false);

  const fetchSong = async () => {
    try {
      const songData = await getSong(songId);
      if (!songData) {
        Alert.alert('오류', '곡을 찾을 수 없습니다.');
        navigation.goBack();
        return;
      }

      const versions = await getVersionsBySong(songId);
      const latestVersion = versions[0];
      const defaultVersion = songData.defaultVersionId
        ? versions.find((v) => v.id === songData.defaultVersionId)
        : undefined;

      setSong({
        ...songData,
        versions,
        latestVersion,
        defaultVersion,
      });
    } catch (error) {
      console.error('곡 정보 로드 실패:', error);
      Alert.alert('오류', '곡 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSong();
  }, [songId]);

  const handleSetDefaultVersion = async (versionId: string) => {
    try {
      await updateSongDefaultVersion(songId, versionId);
      await fetchSong();
    } catch (error) {
      console.error('대표 버전 설정 실패:', error);
      Alert.alert('오류', '대표 버전 설정에 실패했습니다.');
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    Alert.alert(
      '삭제 확인',
      '이 버전을 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVersion(versionId);
              await fetchSong();
            } catch (error) {
              console.error('버전 삭제 실패:', error);
              Alert.alert('오류', '버전 삭제에 실패했습니다.');
            }
          },
        },
      ]
    );
  };

  const handleSaveRecording = async (audioUri: string, rating: number, memo?: string) => {
    try {
      // 1. 로컬 파일 시스템에 오디오 파일 저장
      const { fileName, localUri } = await saveAudioLocally(songId, audioUri);

      // 2. 로컬 데이터베이스에 버전 메타데이터 저장
      await addVersion(songId, fileName, localUri, rating, undefined, memo);

      // 3. 데이터 다시 로드
      await fetchSong();
    } catch (error) {
      console.error('녹음 저장 실패:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  if (!song) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← 목록으로</Text>
        </TouchableOpacity>

        <View style={styles.songHeader}>
          <Text style={styles.songTitle}>{song.title}</Text>
          {song.artist && (
            <Text style={styles.songArtist}>{song.artist}</Text>
          )}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={() => setRecorderVisible(true)}
          >
            <Text style={styles.primaryButtonText}>🎤 녹음하기</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.outlineButton]}
          >
            <Text style={styles.outlineButtonText}>재생</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.versionsHeader}>
          <Text style={styles.versionsTitle}>
            녹음 버전 ({song.versions?.length || 0})
          </Text>
        </View>

        {song.versions && song.versions.length > 0 ? (
          <View style={styles.versionsList}>
            {song.versions.map((version) => (
              <View key={version.id} style={styles.versionCard}>
                <View style={styles.versionHeader}>
                  <View style={styles.versionInfo}>
                    <Text style={styles.versionDate}>
                      {new Date(version.recordedAt).toLocaleDateString('ko-KR')}
                    </Text>
                    {song.defaultVersionId === version.id && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>대표</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.ratingContainer}>
                    <Text style={styles.ratingStar}>★</Text>
                    <Text style={styles.ratingText}>{version.rating}/5</Text>
                  </View>
                </View>

                {/* 오디오 플레이어 */}
                <View style={styles.audioPlayerContainer}>
                  <AudioPlayer audioUrl={version.storageUrl} />
                </View>

                <View style={styles.versionActions}>
                  <TouchableOpacity
                    style={[
                      styles.versionButton,
                      song.defaultVersionId === version.id && styles.disabledButton,
                    ]}
                    onPress={() => handleSetDefaultVersion(version.id)}
                    disabled={song.defaultVersionId === version.id}
                  >
                    <Text style={styles.versionButtonText}>대표 설정</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.versionButton, styles.deleteButton]}
                    onPress={() => handleDeleteVersion(version.id)}
                  >
                    <Text style={styles.deleteButtonText}>삭제</Text>
                  </TouchableOpacity>
                </View>

                {version.memo && (
                  <Text style={styles.versionMemo}>{version.memo}</Text>
                )}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>아직 녹음된 버전이 없습니다</Text>
            <Text style={styles.emptySubtitle}>
              첫 번째 녹음을 시작해보세요!
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setRecorderVisible(true)}
            >
              <Text style={styles.emptyButtonText}>🎤 녹음하기</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* 녹음 모달 */}
      <RecorderModal
        visible={recorderVisible}
        onClose={() => setRecorderVisible(false)}
        onSave={handleSaveRecording}
      />
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
  scrollContent: {
    padding: 16,
  },
  backButton: {
    paddingVertical: 8,
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#666',
  },
  songHeader: {
    marginBottom: 24,
  },
  songTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  songArtist: {
    fontSize: 18,
    color: '#666',
  },
  actionButtons: {
    flexDirection: 'column',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#000',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#ddd',
  },
  outlineButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  versionsHeader: {
    marginBottom: 16,
  },
  versionsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  versionsList: {
    gap: 12,
  },
  versionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    padding: 16,
  },
  versionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  versionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  versionDate: {
    fontSize: 14,
    color: '#374151',
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
  ratingContainer: {
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
    color: '#374151',
  },
  audioPlayerContainer: {
    marginVertical: 12,
  },
  versionActions: {
    flexDirection: 'column',
    gap: 8,
  },
  versionButton: {
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    alignItems: 'center',
  },
  versionButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  deleteButton: {
    borderColor: '#ef4444',
  },
  deleteButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.5,
  },
  versionMemo: {
    marginTop: 12,
    fontSize: 12,
    color: '#666',
  },
  emptyContainer: {
    paddingVertical: 48,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e5e5',
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  emptyTitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 24,
  },
  emptyButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: '#000',
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
