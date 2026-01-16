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
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, Song, Version } from '../types';
import { getPlaylistWithDetails, removeFromPlaylist } from '../lib/database';
import PlaylistPlayer from '../components/PlaylistPlayer';
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
  const [playlist, setPlaylist] = useState<any>(null);
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
      activeOpacity={0.7}
    >
      <View style={[styles.trackNumber, index === currentIndex && styles.trackNumberActive]}>
        {index === currentIndex ? (
          <Ionicons name="musical-note" size={14} color={colors.textPrimary} />
        ) : (
          <Text style={styles.trackNumberText}>{index + 1}</Text>
        )}
      </View>
      <View style={styles.trackInfo}>
        <Text style={[styles.trackTitle, index === currentIndex && styles.trackTitleActive]} numberOfLines={1}>
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

  const playlistData = playlist.items.map((item: PlaylistItem) => ({
    song: item.song,
    version: item.version,
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.logo}>
          <Ionicons name="musical-notes" size={20} color={colors.primary} />
          <Text style={styles.logoText}>Playlist</Text>
        </View>
      </View>

      {playlist.items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="disc-outline" size={64} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>플레이리스트가 비어있습니다</Text>
          <Text style={styles.emptySubtitle}>
            곡의 대표 버전을 설정하면{'\n'}자동으로 추가됩니다
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.playerSection}>
            <PlaylistPlayer
              playlist={playlistData}
              currentIndex={currentIndex}
              onIndexChange={setCurrentIndex}
            />
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
  playerSection: {
    padding: spacing.lg,
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
});
