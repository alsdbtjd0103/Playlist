import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  GestureResponderEvent,
  TouchableWithoutFeedback,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { RootStackParamList, SongWithVersions, Version } from '../types';
import {
  getSong,
  getVersionsBySong,
  updateSongDefaultVersion,
  deleteVersion,
  addVersion,
  updateVersion,
} from '../lib/database';
import { saveAudioLocally } from '../lib/storage';
import RecorderModal from '../components/RecorderModal';
import { usePlayer } from '../contexts/PlayerContext';
import { colors, spacing, borderRadius, typography } from '../lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SongDetail'>;

const VersionItem = ({
  version,
  song,
  onPlay,
  onOpenMenu,
}: {
  version: Version;
  song: SongWithVersions;
  onPlay: () => void;
  onOpenMenu: (x: number, y: number, version: Version) => void;
}) => {
  const buttonRef = React.useRef<View>(null);

  const handlePress = () => {
    buttonRef.current?.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
      onOpenMenu(pageX + width, pageY + height, version);
    });
  };

  return (
    <View style={styles.versionCard}>
      <View style={styles.versionRow}>
        <TouchableOpacity style={styles.versionInfo} onPress={onPlay} activeOpacity={0.7}>
          <View style={styles.versionTitleRow}>
            <Text style={styles.versionDate}>
              {new Date(version.recordedAt).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
            {song.defaultVersionId === version.id && (
              <View style={styles.defaultBadge}>
                <Ionicons name="checkmark-circle" size={12} color={colors.primary} />
                <Text style={styles.defaultBadgeText}>대표</Text>
              </View>
            )}
          </View>
          <View style={styles.ratingStars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Ionicons
                key={star}
                name={star <= version.rating ? 'star' : 'star-outline'}
                size={14}
                color={colors.warning}
              />
            ))}
          </View>
          {version.memo && (
            <Text style={styles.versionMemo} numberOfLines={1}>
              {version.memo}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          ref={buttonRef}
          style={styles.moreButton}
          onPress={handlePress}
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default function SongDetailScreen({ route, navigation }: Props) {
  const { songId } = route.params;
  const [song, setSong] = useState<SongWithVersions | null>(null);
  const [recorderVisible, setRecorderVisible] = useState(false);
  const { setCurrentTrack, expandPlayer } = usePlayer();
  const [menuState, setMenuState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    version: Version | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    version: null,
  });
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [editingVersion, setEditingVersion] = useState<Version | null>(null);
  const [newRating, setNewRating] = useState(0);

  const handlePlayVersion = (version: Version) => {
    if (!song) return;
    setCurrentTrack({ song, version });
    expandPlayer();
  };

  const fetchSong = async () => {
    try {
      const songData = await getSong(songId);
      if (!songData) {
        Alert.alert('오류', '곡을 찾을 수 없습니다.');
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
    }
  };

  useEffect(() => {
    fetchSong();
  }, [songId]);

  const handleSetDefaultVersion = async (versionId: string) => {
    closeMenu();
    try {
      await updateSongDefaultVersion(songId, versionId);
      await fetchSong();
    } catch (error) {
      console.error('대표 버전 설정 실패:', error);
      Alert.alert('오류', '대표 버전 설정에 실패했습니다.');
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    closeMenu();
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

  const handleOpenMenu = (x: number, y: number, version: Version) => {
    setMenuState({
      visible: true,
      x: x - 140, // 메뉴 너비(160) - 버튼 너비(약 40) + 여유
      y: y,
      version,
    });
  };

  const closeMenu = () => {
    setMenuState((prev) => ({ ...prev, visible: false }));
  };

  const handleEditRating = () => {
    if (menuState.version) {
      setEditingVersion(menuState.version);
      setNewRating(menuState.version.rating);
      setRatingModalVisible(true);
      closeMenu();
    }
  };

  const handleSaveRating = async () => {
    if (editingVersion) {
      try {
        await updateVersion(editingVersion.id, { rating: newRating });
        setRatingModalVisible(false);
        setEditingVersion(null);
        await fetchSong();
      } catch (error) {
        console.error('평점 수정 실패:', error);
        Alert.alert('오류', '평점 수정에 실패했습니다.');
      }
    }
  };

  const handleSaveRecording = async (audioUri: string, rating: number, memo?: string) => {
    try {
      const { fileName, localUri } = await saveAudioLocally(songId, audioUri);
      await addVersion(songId, fileName, localUri, rating, undefined, memo);
      await fetchSong();
    } catch (error) {
      console.error('녹음 저장 실패:', error);
      throw error;
    }
  };

  if (!song) {
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
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 곡 정보 */}
        <View style={styles.songHeader}>
          <View style={styles.albumArt}>
            <Ionicons name="musical-notes" size={48} color={colors.textSecondary} />
          </View>
          <Text style={styles.songTitle}>{song.title}</Text>
          {song.artist && (
            <Text style={styles.songArtist}>{song.artist}</Text>
          )}
          {song.defaultVersion && (
            <View style={styles.ratingDisplay}>
              <Ionicons name="star" size={16} color={colors.warning} />
              <Text style={styles.ratingDisplayText}>{song.defaultVersion.rating}</Text>
            </View>
          )}
        </View>

        {/* 액션 버튼 */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.recordButton}
            onPress={() => setRecorderVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.recordButtonInner}>
              <Ionicons name="mic" size={24} color={colors.textPrimary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* 버전 목록 */}
        <View style={styles.versionsSection}>

          {song.versions && song.versions.length > 0 ? (
            <View style={styles.versionsList}>
              {song.versions.map((version) => (
                <VersionItem
                  key={version.id}
                  version={version}
                  song={song}
                  onPlay={() => handlePlayVersion(version)}
                  onOpenMenu={handleOpenMenu}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconContainer}>
                <Ionicons name="mic-off-outline" size={48} color={colors.textTertiary} />
              </View>
              <Text style={styles.emptyTitle}>아직 녹음된 버전이 없습니다</Text>
              <Text style={styles.emptySubtitle}>
                첫 번째 녹음을 시작해보세요!
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => setRecorderVisible(true)}
              >
                <Ionicons name="mic" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 녹음 모달 */}
      <RecorderModal
        visible={recorderVisible}
        onClose={() => setRecorderVisible(false)}
        onSave={handleSaveRecording}
      />

      {/* 평점 수정 모달 */}
      <Modal
        visible={ratingModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setRatingModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>평점 수정</Text>
              <TouchableOpacity onPress={() => setRatingModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.ratingContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setNewRating(star)}>
                  <Ionicons
                    name={star <= newRating ? 'star' : 'star-outline'}
                    size={40}
                    color={colors.warning}
                  />
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setRatingModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleSaveRating}
              >
                <Text style={styles.confirmButtonText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 드롭다운 메뉴 */}
      {menuState.visible && (
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={[styles.menuOverlay, StyleSheet.absoluteFill]}>
            <View
              style={[
                styles.dropdownMenu,
                {
                  top: menuState.y,
                  left: menuState.x,
                },
              ]}
            >
              {menuState.version && song.defaultVersionId !== menuState.version.id && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => menuState.version && handleSetDefaultVersion(menuState.version.id)}
                >
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.textPrimary} />
                  <Text style={styles.menuItemText}>대표 버전 설정</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleEditRating}
              >
                <Ionicons name="star-outline" size={20} color={colors.warning} />
                <Text style={styles.menuItemText}>평점 수정</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => menuState.version && handleDeleteVersion(menuState.version.id)}
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
                <Text style={[styles.menuItemText, { color: colors.error }]}>삭제</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
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
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.body,
    color: colors.textSecondary,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
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
  songHeader: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  albumArt: {
    width: 160,
    height: 160,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  songTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  songArtist: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  ratingDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingDisplayText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actionButtons: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  recordButton: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  recordButtonInner: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.full,
    backgroundColor: colors.record,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  versionsSection: {
    paddingHorizontal: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  sectionCount: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  versionsList: {
    gap: spacing.md,
  },
  versionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  versionInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  versionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  versionDate: {
    ...typography.body,
    fontWeight: '500',
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
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  versionMemo: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  versionActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  versionButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
  },
  deleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledButtonText: {
    color: colors.textTertiary,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  emptyButton: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.record,
    borderRadius: borderRadius.full,
  },
  emptyButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  moreButton: {
    padding: spacing.sm,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    zIndex: 1000, // Ensure it's on top
    elevation: 1000,
  },
  dropdownMenu: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    width: 160,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  menuItemText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
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
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  modalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.surfaceLight,
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  confirmButtonText: {
    color: colors.background,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
});

