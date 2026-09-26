import React, { useState, useCallback, useMemo } from 'react';
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
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { RootStackParamList, SongWithVersions, Version } from '../types';
import {
  getSong,
  getVersionsBySong,
  updateSongDefaultVersion,
  deleteVersion,
  addVersion,
  updateVersion,
  updateSongKey,
} from '../lib/database';
import { saveAudioLocally } from '../lib/storage';
import RecorderModal from '../components/RecorderModal';
import { AlbumArt } from '../components/AlbumArt';
import KeyBadge from '../components/KeyBadge';
import KeyPickerModal from '../components/KeyPickerModal';
import { usePlayer } from '../contexts/PlayerContext';
import { ColorTokens, spacing, borderRadius, typography, fontFamily } from '../lib/theme';
import { useTheme } from '../contexts/ThemeContext';
import Waveform from '../components/Waveform';
import { logEvent, logScreen } from '../lib/analytics';
import { isNativeDenoiseAvailable } from '../lib/nativeDenoise';
import { getVersionNumberMap, formatVersionNumber } from '../lib/versionLabel';
import { isAudioEditAvailable, renderCutsToFile } from '../lib/nativeAudioEdit';
import { getEffectiveCuts } from '../lib/trim';

type Props = NativeStackScreenProps<RootStackParamList, 'SongDetail'>;

// 네이티브 잡음 제거 모듈 가용 여부(빌드 시 고정 — Expo Go 등에서는 메뉴 숨김)
const DENOISE_AVAILABLE = isNativeDenoiseAvailable();

const VersionItem = ({
  version,
  versionNumber,
  song,
  onPlay,
  onOpenMenu,
}: {
  version: Version;
  versionNumber?: number;
  song: SongWithVersions;
  onPlay: () => void;
  onOpenMenu: (x: number, y: number, version: Version) => void;
}) => {
  const buttonRef = React.useRef<View>(null);
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
            <Text style={styles.versionNumber}>{formatVersionNumber(versionNumber)}</Text>
            <Text style={styles.versionDate}>
              {new Date(version.recordedAt).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
            {song.defaultVersionId === version.id && (
              <View style={styles.defaultBadge}>
                <Ionicons name="checkmark-circle" size={12} color={colors.accentStrong} />
                <Text style={styles.defaultBadgeText}>대표</Text>
              </View>
            )}
            <KeyBadge value={version.key} />
          </View>
          <View style={styles.ratingStars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Ionicons
                key={star}
                name={star <= version.rating ? 'star' : 'star-outline'}
                size={14}
                color={colors.star}
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
          <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default function SongDetailScreen({ route, navigation }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const wordColor = scheme === 'dark' ? colors.accent : colors.accentStrong;
  const { songId } = route.params;
  const [song, setSong] = useState<SongWithVersions | null>(null);
  const [recorderVisible, setRecorderVisible] = useState(false);
  const { setPlaylist } = usePlayer();
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
  const [memoModalVisible, setMemoModalVisible] = useState(false);
  const [newMemo, setNewMemo] = useState('');
  // 키 편집 대상: 'song'이면 곡 myKey, 그 외는 해당 버전 key
  const [keyPickerTarget, setKeyPickerTarget] = useState<'song' | Version | null>(null);

  const versionNumbers = useMemo(() => getVersionNumberMap(song?.versions ?? []), [song]);

  const handlePlayVersion = (version: Version) => {
    if (!song || !song.versions || song.versions.length === 0) return;
    const items = song.versions.map((v) => ({ song, version: v, versionNumber: versionNumbers.get(v.id) }));
    const startIndex = items.findIndex((it) => it.version.id === version.id);
    setPlaylist(items, startIndex >= 0 ? startIndex : 0);
    logEvent('version_played', { rating: version.rating, hasMemo: !!version.memo });
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

  useFocusEffect(
    useCallback(() => {
      fetchSong();
      logScreen('SongDetail');
    }, [songId])
  );

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

  const handleShareVersion = async (version: Version) => {
    closeMenu();
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('공유 불가', '이 기기에서는 공유 기능을 사용할 수 없습니다.');
        return;
      }
      // 비파괴 cuts가 있고 네이티브 렌더 가능하면 실제 잘린 파일로 공유(편집 반영)
      let shareUri = version.storageUrl;
      const dur = version.duration || 0;
      const cuts = getEffectiveCuts(version, dur);
      if (cuts.length > 0 && dur > 0 && isAudioEditAvailable()) {
        try {
          const rendered = await renderCutsToFile(version.storageUrl, cuts, dur, version.songId);
          shareUri = rendered.uri;
        } catch (e) {
          console.error('공유용 렌더 실패, 원본 공유로 대체:', e);
        }
      }
      await Sharing.shareAsync(shareUri, {
        mimeType: 'audio/m4a',
        dialogTitle: `${song?.title ?? '녹음'} 내보내기`,
        UTI: 'public.mpeg-4-audio',
      });
      logEvent('version_share', { songId: version.songId });
    } catch (error) {
      console.error('버전 공유 실패:', error);
      Alert.alert('오류', '파일 공유에 실패했습니다.');
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
        logEvent('version_rating_edited', { rating: newRating });
      } catch (error) {
        console.error('평점 수정 실패:', error);
        Alert.alert('오류', '평점 수정에 실패했습니다.');
      }
    }
  };

  const handleEditMemo = () => {
    if (menuState.version) {
      setEditingVersion(menuState.version);
      setNewMemo(menuState.version.memo ?? '');
      setMemoModalVisible(true);
      closeMenu();
    }
  };

  const handleSaveMemo = async () => {
    if (editingVersion) {
      try {
        const trimmed = newMemo.trim();
        await updateVersion(editingVersion.id, { memo: trimmed });
        setMemoModalVisible(false);
        setEditingVersion(null);
        setNewMemo('');
        await fetchSong();
        logEvent('version_memo_edited', { length: trimmed.length });
      } catch (error) {
        console.error('메모 수정 실패:', error);
        Alert.alert('오류', '메모 수정에 실패했습니다.');
      }
    }
  };

  const handleSaveRecording = async (audioUri: string, rating: number, memo?: string, waveform?: number[], duration?: number, key?: number) => {
    try {
      const { fileName, localUri } = await saveAudioLocally(songId, audioUri);
      await addVersion(songId, fileName, localUri, rating, duration, memo, { waveform, key });
      await fetchSong();
      logEvent('version_recorded', { rating, hasMemo: !!memo, duration: duration ?? 0 });
    } catch (error) {
      console.error('녹음 저장 실패:', error);
      throw error;
    }
  };

  const handleEditVersionKey = () => {
    if (menuState.version) {
      setKeyPickerTarget(menuState.version);
      closeMenu();
    }
  };

  const handleSaveKey = async (key: number) => {
    const target = keyPickerTarget;
    setKeyPickerTarget(null);
    if (!target) return;
    try {
      if (target === 'song') {
        await updateSongKey(songId, key);
      } else {
        await updateVersion(target.id, { key });
      }
      await fetchSong();
      logEvent('key_edited', { scope: target === 'song' ? 'song' : 'version', key });
    } catch (error) {
      console.error('키 수정 실패:', error);
      Alert.alert('오류', '키 수정에 실패했습니다.');
    }
  };

  if (!song) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.accentStrong} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.logo}>
          <Waveform size={20} />
          <Text style={[styles.logoText, { color: wordColor }]}>plilog</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 곡 정보 */}
        <View style={styles.songHeader}>
          <AlbumArt uri={song.artworkUrl} size={160} iconSize={48} borderRadius={borderRadius.lg} />
          <Text style={styles.songTitle}>{song.title}</Text>
          {song.artist && (
            <Text style={styles.songArtist}>{song.artist}</Text>
          )}
          <View style={styles.headerMetaRow}>
            {song.defaultVersion && (
              <View style={styles.ratingDisplay}>
                <Ionicons name="star" size={16} color={colors.star} />
                <Text style={styles.ratingDisplayText}>{song.defaultVersion.rating}</Text>
              </View>
            )}
            <KeyBadge
              value={song.myKey}
              showPlaceholder
              size="md"
              onPress={() => setKeyPickerTarget('song')}
            />
          </View>
        </View>

        {/* 액션 버튼 */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.recordButton}
            onPress={() => {
              setRecorderVisible(true);
              logEvent('record_open', { songId });
            }}
            activeOpacity={0.8}
          >
            <View style={styles.recordButtonInner}>
              <Ionicons name="mic" size={24} color={colors.onAccent} />
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
                  versionNumber={versionNumbers.get(version.id)}
                  song={song}
                  onPlay={() => handlePlayVersion(version)}
                  onOpenMenu={handleOpenMenu}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>아직 녹음된 버전이 없습니다</Text>
              <Text style={styles.emptySubtitle}>
                첫 번째 녹음을 시작해보세요!
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 녹음 모달: 열려 있을 때만 마운트 (닫힌 상태에서도 녹음 상태 폴링·오디오 모드 변경이 돌지 않게) */}
      {recorderVisible && (
        <RecorderModal
          visible={recorderVisible}
          onClose={() => setRecorderVisible(false)}
          onSave={handleSaveRecording}
          defaultKey={song.myKey}
        />
      )}

      {/* 키 편집 모달 (곡 또는 버전 공용) */}
      <KeyPickerModal
        visible={keyPickerTarget !== null}
        title={keyPickerTarget === 'song' ? '음정' : '이 녹음의 음정'}
        initialValue={
          keyPickerTarget === 'song'
            ? song.myKey
            : keyPickerTarget
            ? keyPickerTarget.key
            : undefined
        }
        onClose={() => setKeyPickerTarget(null)}
        onSave={handleSaveKey}
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
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.ratingContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setNewRating(star)}>
                  <Ionicons
                    name={star <= newRating ? 'star' : 'star-outline'}
                    size={40}
                    color={colors.star}
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

      {/* 메모 수정 모달 */}
      <Modal
        visible={memoModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMemoModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>메모 수정</Text>
              <TouchableOpacity onPress={() => setMemoModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.memoInputWrapper}>
              <TextInput
                style={styles.memoInput}
                placeholder="이 녹음에 대한 메모를 입력하세요"
                placeholderTextColor={colors.textMuted}
                value={newMemo}
                onChangeText={setNewMemo}
                multiline
                numberOfLines={4}
                autoFocus
                maxLength={500}
              />
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setMemoModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleSaveMemo}
              >
                <Text style={styles.confirmButtonText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
                  <Ionicons name="checkmark-circle-outline" size={20} color={colors.text} />
                  <Text style={styles.menuItemText}>대표 버전 설정</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleEditRating}
              >
                <Ionicons name="star-outline" size={20} color={colors.star} />
                <Text style={styles.menuItemText}>평점 수정</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleEditVersionKey}
              >
                <Ionicons name="musical-note" size={20} color={colors.text} />
                <Text style={styles.menuItemText}>키 수정</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleEditMemo}
              >
                <Ionicons name="create-outline" size={20} color={colors.text} />
                <Text style={styles.menuItemText}>메모 수정</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  if (menuState.version) {
                    const vId = menuState.version.id;
                    closeMenu();
                    navigation.navigate('TrimEditor', { versionId: vId });
                  }
                }}
              >
                <Ionicons name="cut-outline" size={20} color={colors.text} />
                <Text style={styles.menuItemText}>구간 편집</Text>
              </TouchableOpacity>
              {DENOISE_AVAILABLE && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    if (menuState.version) {
                      const vId = menuState.version.id;
                      closeMenu();
                      navigation.navigate('Denoise', { versionId: vId });
                    }
                  }}
                  testID="version-menu-denoise"
                >
                  <Ionicons name="sparkles-outline" size={20} color={colors.text} />
                  <Text style={styles.menuItemText}>잡음 제거</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => menuState.version && handleShareVersion(menuState.version)}
                testID="version-menu-share"
              >
                <Ionicons name="share-outline" size={20} color={colors.text} />
                <Text style={styles.menuItemText}>공유 / 내보내기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => menuState.version && handleDeleteVersion(menuState.version.id)}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                <Text style={[styles.menuItemText, { color: colors.danger }]}>삭제</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      )}
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
  loadingText: {
    marginTop: spacing.md,
    ...typography.body,
    color: colors.textMuted,
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
    fontFamily: fontFamily.wordmark,
    fontSize: 20,
    letterSpacing: -0.8,
    color: colors.text,
  },
  songHeader: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  songTitle: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  songArtist: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ratingDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  ratingDisplayText: {
    ...typography.body,
    color: colors.textMuted,
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
    color: colors.textMuted,
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
    color: colors.text,
  },
  sectionCount: {
    ...typography.bodySmall,
    color: colors.textMuted,
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
    backgroundColor: colors.accentStrong,
    justifyContent: 'center',
    alignItems: 'center',
  },
  versionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  versionNumber: {
    ...typography.body,
    fontFamily: fontFamily.semibold,
    color: colors.textMuted,
  },
  versionDate: {
    ...typography.body,
    fontWeight: '500',
    color: colors.text,
  },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  defaultBadgeText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '600',
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 2,
  },
  versionMemo: {
    ...typography.bodySmall,
    color: colors.textMuted,
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
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.full,
  },
  deleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledButtonText: {
    color: colors.textMuted,
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
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.bodySmall,
    color: colors.textMuted,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  emptyButton: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
    borderRadius: borderRadius.full,
  },
  emptyButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
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
    color: colors.text,
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  memoInputWrapper: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  memoInput: {
    padding: spacing.md,
    ...typography.bodySmall,
    color: colors.text,
    minHeight: 100,
    textAlignVertical: 'top',
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
    color: colors.text,
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
    backgroundColor: colors.surfaceAlt,
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: colors.accentStrong,
  },
  confirmButtonText: {
    color: colors.bg,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
  },
});

