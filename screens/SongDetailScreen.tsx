import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TextInput, Pressable } from 'react-native';
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
  updateSongInfo,
  deleteSong,
} from '../lib/database';
import { saveAudioLocally } from '../lib/storage';
import RecorderModal from '../components/RecorderModal';
import { AlbumArt } from '../components/AlbumArt';
import KeyBadge from '../components/KeyBadge';
import KeyPickerModal from '../components/KeyPickerModal';
import ScreenHeader from '../components/ScreenHeader';
import BottomSheet, { SheetAction } from '../components/BottomSheet';
import PressableScale from '../components/PressableScale';
import ErrorState from '../components/ErrorState';
import { SkeletonList } from '../components/Skeleton';
import { usePlayer } from '../contexts/PlayerContext';
import { useToast } from '../contexts/ToastContext';
import { ColorTokens, spacing, borderRadius, typography, fontFamily } from '../lib/theme';
import { useTheme } from '../contexts/ThemeContext';
import { haptic } from '../lib/haptics';
import { logEvent, logScreen } from '../lib/analytics';
import { isNativeDenoiseAvailable } from '../lib/nativeDenoise';
import { getVersionNumberMap, formatVersionNumber } from '../lib/versionLabel';
import { isAudioEditAvailable, renderCutsToFile } from '../lib/nativeAudioEdit';
import { getEffectiveCuts } from '../lib/trim';

type Props = NativeStackScreenProps<RootStackParamList, 'SongDetail'>;

// 네이티브 잡음 제거 모듈 가용 여부(빌드 시 고정 — Expo Go 등에서는 메뉴 숨김)
const DENOISE_AVAILABLE = isNativeDenoiseAvailable();

const formatDate = (date: Date | string) =>
  new Date(date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });

// 재생 중 표시용 작은 이퀄라이저 막대
const EqualizerIcon = ({ color }: { color: string }) => (
  <View style={eqStyles.wrap}>
    {[6, 11, 8].map((h, i) => (
      <View key={i} style={[eqStyles.bar, { height: h, backgroundColor: color }]} />
    ))}
  </View>
);
const eqStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 11 },
  bar: { width: 3, borderRadius: 1.5 },
});

interface VersionItemProps {
  version: Version;
  versionNumber?: number;
  isDefault: boolean;
  isCurrent: boolean;
  onPlay: () => void;
  onRate: (rating: number) => void;
  onToggleDefault: () => void;
  onOpenMenu: () => void;
  onEditMemo: () => void;
}

const VersionItem = ({
  version,
  versionNumber,
  isDefault,
  isCurrent,
  onPlay,
  onRate,
  onToggleDefault,
  onOpenMenu,
  onEditMemo,
}: VersionItemProps) => {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accent = scheme === 'dark' ? colors.accent : colors.accentStrong;

  return (
    <PressableScale
      style={[styles.versionCard, isCurrent && { borderColor: accent, borderWidth: 1.5 }]}
      onPress={onPlay}
      haptic="light"
      accessibilityLabel={`${formatVersionNumber(versionNumber)} 재생`}
      testID={`version-card-${version.id}`}
    >
      <View style={styles.versionRow}>
        <View style={[styles.playCircle, isCurrent && { backgroundColor: accent }]}>
          <Ionicons
            name={isCurrent ? 'volume-high' : 'play'}
            size={18}
            color={isCurrent ? colors.onAccent : accent}
            style={isCurrent ? undefined : styles.playIconOffset}
          />
        </View>

        <View style={styles.versionInfo}>
          <View style={styles.versionTitleRow}>
            <Text style={styles.versionNumber}>{formatVersionNumber(versionNumber)}</Text>
            <Text style={styles.versionDate} numberOfLines={1}>
              {formatDate(version.recordedAt)}
            </Text>
            <KeyBadge value={version.key} />
          </View>
          {isCurrent && (
            <View style={styles.nowPlaying} testID={`version-now-playing-${version.id}`}>
              <EqualizerIcon color={accent} />
              <Text style={[styles.nowPlayingText, { color: accent }]}>재생 중</Text>
            </View>
          )}
        </View>

        <Pressable
          style={styles.iconButton}
          onPress={() => {
            haptic('selection');
            onToggleDefault();
          }}
          hitSlop={4}
          accessibilityLabel={isDefault ? '대표 버전 해제' : '대표 버전으로 지정'}
          accessibilityState={{ selected: isDefault }}
          testID={`version-pin-${version.id}`}
        >
          <Ionicons
            name={isDefault ? 'bookmark' : 'bookmark-outline'}
            size={20}
            color={isDefault ? accent : colors.textMuted}
          />
        </Pressable>
        <Pressable
          style={styles.iconButton}
          onPress={onOpenMenu}
          hitSlop={4}
          accessibilityLabel="버전 메뉴"
          testID={`version-more-${version.id}`}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.versionBody}>
        <View style={styles.ratingStars}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Pressable
              key={star}
              onPress={() => onRate(star)}
              hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
              style={styles.starButton}
              accessibilityLabel={`별점 ${star}점`}
              testID={`version-star-${version.id}-${star}`}
            >
              <Ionicons name={star <= version.rating ? 'star' : 'star-outline'} size={20} color={colors.star} />
            </Pressable>
          ))}
          {isDefault && (
            <View style={styles.defaultBadge}>
              <Text style={[styles.defaultBadgeText, { color: accent }]}>대표</Text>
            </View>
          )}
        </View>
        <Pressable onPress={onEditMemo} hitSlop={6} testID={`version-memo-${version.id}`}>
          {version.memo ? (
            <Text style={styles.versionMemo} numberOfLines={2}>
              {version.memo}
            </Text>
          ) : (
            <Text style={styles.versionMemoPlaceholder}>+ 메모 추가</Text>
          )}
        </Pressable>
      </View>
    </PressableScale>
  );
};

export default function SongDetailScreen({ route, navigation }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accent = scheme === 'dark' ? colors.accent : colors.accentStrong;
  const { songId } = route.params;
  const { setPlaylist, currentTrack } = usePlayer();
  const toast = useToast();

  const [song, setSong] = useState<SongWithVersions | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [recorderVisible, setRecorderVisible] = useState(false);
  const [songSheetVisible, setSongSheetVisible] = useState(false);
  const [infoSheetVisible, setInfoSheetVisible] = useState(false);
  const [infoTitle, setInfoTitle] = useState('');
  const [infoArtist, setInfoArtist] = useState('');
  const [menuVersion, setMenuVersion] = useState<Version | null>(null);
  const [memoTarget, setMemoTarget] = useState<Version | null>(null);
  const [newMemo, setNewMemo] = useState('');
  // 키 편집 대상: 'song'이면 곡 myKey, 그 외는 해당 버전 key
  const [keyPickerTarget, setKeyPickerTarget] = useState<'song' | Version | null>(null);
  // 실행 취소 대기 중인 삭제 — 그 사이 다시 불러와도 목록에 되살아나지 않게 거른다
  const pendingDeleteIds = useRef<Set<string>>(new Set());

  const versionNumbers = useMemo(() => getVersionNumberMap(song?.versions ?? []), [song]);
  const playingVersionId = currentTrack?.version.id;

  const fetchSong = useCallback(async () => {
    try {
      const songData = await getSong(songId);
      if (!songData) {
        toast.show('곡을 찾을 수 없어요');
        navigation.goBack(); // 그대로 두면 로딩 표시가 끝나지 않는다
        return;
      }
      const versions = (await getVersionsBySong(songId)).filter((v) => !pendingDeleteIds.current.has(v.id));
      const defaultVersion = songData.defaultVersionId
        ? versions.find((v) => v.id === songData.defaultVersionId)
        : undefined;
      setSong({ ...songData, versions, latestVersion: versions[0], defaultVersion });
      setLoadError(false);
    } catch (error) {
      console.error('곡 정보 로드 실패:', error);
      setLoadError(true);
    }
  }, [songId, navigation, toast]);

  useFocusEffect(
    useCallback(() => {
      fetchSong();
      logScreen('SongDetail');
    }, [fetchSong])
  );

  const handlePlayVersion = (version: Version) => {
    if (!song || !song.versions || song.versions.length === 0) return;
    const items = song.versions.map((v) => ({ song, version: v, versionNumber: versionNumbers.get(v.id) }));
    const startIndex = items.findIndex((it) => it.version.id === version.id);
    setPlaylist(items, startIndex >= 0 ? startIndex : 0);
    logEvent('version_played', { rating: version.rating, hasMemo: !!version.memo });
  };

  // 버전 일부 필드를 화면에 먼저 반영한다(저장은 뒤따름)
  const patchLocalVersion = (versionId: string, patch: Partial<Version>) => {
    setSong((prev) => {
      if (!prev) return prev;
      const versions = prev.versions.map((v) => (v.id === versionId ? { ...v, ...patch } : v));
      const defaultVersion = prev.defaultVersionId ? versions.find((v) => v.id === prev.defaultVersionId) : undefined;
      return { ...prev, versions, latestVersion: versions[0], defaultVersion };
    });
  };

  const handleRate = async (version: Version, rating: number) => {
    if (rating === version.rating) return;
    haptic('selection');
    patchLocalVersion(version.id, { rating });
    try {
      await updateVersion(version.id, { rating });
      logEvent('version_rating_edited', { rating });
    } catch (error) {
      console.error('평점 수정 실패:', error);
      toast.show('별점을 저장하지 못했어요');
      fetchSong();
    }
  };

  const handleToggleDefault = async (version: Version) => {
    if (!song) return;
    const isDefault = song.defaultVersionId === version.id;
    setSong((prev) =>
      prev
        ? {
            ...prev,
            defaultVersionId: isDefault ? undefined : version.id,
            defaultVersion: isDefault ? undefined : version,
          }
        : prev
    );
    try {
      await updateSongDefaultVersion(songId, isDefault ? null : version.id);
      toast.show(isDefault ? '대표 버전을 해제했어요' : '대표 버전으로 지정했어요');
      await fetchSong();
    } catch (error) {
      console.error('대표 버전 설정 실패:', error);
      toast.show('대표 버전을 바꾸지 못했어요');
      fetchSong();
    }
  };

  const handleShareVersion = async (version: Version) => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('공유 불가', '이 기기에서는 공유 기능을 쓸 수 없어요.');
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
      Alert.alert('오류', '파일을 공유하지 못했어요.');
    }
  };

  const handleDeleteVersion = (version: Version) => {
    const label = formatVersionNumber(versionNumbers.get(version.id));
    pendingDeleteIds.current.add(version.id);
    setSong((prev) => {
      if (!prev) return prev;
      const versions = prev.versions.filter((v) => v.id !== version.id);
      const wasDefault = prev.defaultVersionId === version.id;
      return {
        ...prev,
        versions,
        latestVersion: versions[0],
        defaultVersionId: wasDefault ? undefined : prev.defaultVersionId,
        defaultVersion: wasDefault ? undefined : prev.defaultVersion,
      };
    });
    toast.showUndo(`버전 ${label}을 삭제했어요`, {
      onUndo: () => {
        pendingDeleteIds.current.delete(version.id);
        fetchSong();
      },
      onCommit: async () => {
        try {
          await deleteVersion(version.id);
        } finally {
          pendingDeleteIds.current.delete(version.id);
        }
      },
    });
  };

  const openMemoEditor = (version: Version) => {
    setNewMemo(version.memo ?? '');
    setMemoTarget(version);
  };

  const handleSaveMemo = async () => {
    const target = memoTarget;
    if (!target) return;
    try {
      const trimmed = newMemo.trim();
      await updateVersion(target.id, { memo: trimmed });
      setMemoTarget(null);
      setNewMemo('');
      patchLocalVersion(target.id, { memo: trimmed || undefined });
      toast.show('메모를 저장했어요');
      logEvent('version_memo_edited', { length: trimmed.length });
    } catch (error) {
      console.error('메모 수정 실패:', error);
      Alert.alert('오류', '메모를 저장하지 못했어요.');
    }
  };

  const handleSaveRecording = async (
    audioUri: string,
    rating: number,
    memo?: string,
    waveform?: number[],
    duration?: number,
    key?: number
  ) => {
    try {
      const { fileName, localUri } = await saveAudioLocally(songId, audioUri);
      await addVersion(songId, fileName, localUri, rating, duration, memo, { waveform, key });
      await fetchSong();
      toast.show('녹음을 저장했어요');
      logEvent('version_recorded', { rating, hasMemo: !!memo, duration: duration ?? 0 });
    } catch (error) {
      console.error('녹음 저장 실패:', error);
      throw error;
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
      Alert.alert('오류', '키를 저장하지 못했어요.');
    }
  };

  const openInfoEditor = () => {
    if (!song) return;
    setSongSheetVisible(false);
    setInfoTitle(song.title);
    setInfoArtist(song.artist ?? '');
    setInfoSheetVisible(true);
  };

  const handleSaveInfo = async () => {
    if (!infoTitle.trim()) {
      Alert.alert('제목 필요', '곡 제목을 입력해 주세요.');
      return;
    }
    try {
      await updateSongInfo(songId, { title: infoTitle, artist: infoArtist });
      setInfoSheetVisible(false);
      toast.show('곡 정보를 수정했어요');
      await fetchSong();
    } catch (error) {
      console.error('곡 정보 수정 실패:', error);
      Alert.alert('오류', '곡 정보를 수정하지 못했어요.');
    }
  };

  // 곡 삭제는 녹음 파일까지 모두 지우므로 실행 취소 대신 확인을 받는다
  const confirmDeleteSong = () => {
    setSongSheetVisible(false);
    const count = song?.versions.length ?? 0;
    Alert.alert('곡 삭제', `곡과 녹음 ${count}개를 모두 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSong(songId);
            navigation.goBack();
            toast.show('곡을 삭제했어요');
          } catch (error) {
            console.error('곡 삭제 실패:', error);
            Alert.alert('오류', '곡을 삭제하지 못했어요.');
          }
        },
      },
    ]);
  };

  const closeMenuThen = (fn: (v: Version) => void) => () => {
    const v = menuVersion;
    setMenuVersion(null);
    if (v) fn(v);
  };

  if (!song) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScreenHeader onBack={() => navigation.goBack()} />
        {loadError ? (
          <ErrorState message="곡 정보를 불러오지 못했어요" onRetry={fetchSong} />
        ) : (
          <SkeletonList count={4} rowHeight={96} />
        )}
      </SafeAreaView>
    );
  }

  const menuLabel = menuVersion ? formatVersionNumber(versionNumbers.get(menuVersion.id)) : '';
  const menuIsDefault = !!menuVersion && song.defaultVersionId === menuVersion.id;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        onBack={() => navigation.goBack()}
        title={song.title}
        actions={[
          {
            icon: 'ellipsis-horizontal',
            label: '곡 메뉴',
            onPress: () => setSongSheetVisible(true),
            testID: 'song-menu-button',
          },
        ]}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 곡 정보 */}
        <View style={styles.hero}>
          <View style={styles.artShadow}>
            <AlbumArt uri={song.artworkUrl} size={200} iconSize={56} borderRadius={24} />
          </View>
          <Text style={styles.songTitle}>{song.title}</Text>
          {!!song.artist && <Text style={styles.songArtist}>{song.artist}</Text>}
          <View style={styles.headerMetaRow}>
            {song.defaultVersion && (
              <View style={styles.ratingDisplay}>
                <Ionicons name="star" size={16} color={colors.star} />
                <Text style={styles.ratingDisplayText}>{song.defaultVersion.rating}</Text>
              </View>
            )}
            <KeyBadge value={song.myKey} showPlaceholder size="md" onPress={() => setKeyPickerTarget('song')} />
          </View>

          <View style={styles.recordWrap}>
            <PressableScale
              style={[styles.recordButton, { backgroundColor: accent }]}
              onPress={() => {
                setRecorderVisible(true);
                logEvent('record_open', { songId });
              }}
              haptic="medium"
              scaleTo={0.92}
              accessibilityLabel="녹음하기"
              testID="record-button"
            >
              <Ionicons name="mic" size={30} color={colors.onAccent} />
            </PressableScale>
            <Text style={styles.recordLabel}>녹음하기</Text>
          </View>
        </View>

        {/* 버전 목록 */}
        <View style={styles.versionsSection}>
          {song.versions.length > 0 && (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>녹음</Text>
              <Text style={styles.sectionCount}>{song.versions.length}</Text>
            </View>
          )}
          {song.versions.length > 0 ? (
            <View style={styles.versionsList}>
              {song.versions.map((version) => (
                <VersionItem
                  key={version.id}
                  version={version}
                  versionNumber={versionNumbers.get(version.id)}
                  isDefault={song.defaultVersionId === version.id}
                  isCurrent={playingVersionId === version.id}
                  onPlay={() => handlePlayVersion(version)}
                  onRate={(r) => handleRate(version, r)}
                  onToggleDefault={() => handleToggleDefault(version)}
                  onOpenMenu={() => setMenuVersion(version)}
                  onEditMemo={() => openMemoEditor(version)}
                />
              ))}
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyTitle}>아직 녹음이 없어요</Text>
              <Text style={styles.emptySubtitle}>위의 버튼을 눌러 첫 녹음을 남겨 보세요</Text>
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
        initialValue={keyPickerTarget === 'song' ? song.myKey : keyPickerTarget ? keyPickerTarget.key : undefined}
        onClose={() => setKeyPickerTarget(null)}
        onSave={handleSaveKey}
      />

      {/* 곡 메뉴 */}
      <BottomSheet
        visible={songSheetVisible}
        onClose={() => setSongSheetVisible(false)}
        title={song.title}
        subtitle={song.artist}
        testID="song-sheet"
      >
        <SheetAction icon="create-outline" label="정보 수정" onPress={openInfoEditor} testID="song-menu-edit" />
        <SheetAction
          icon="trash-outline"
          label="곡 삭제"
          description="녹음도 모두 함께 삭제돼요"
          destructive
          onPress={confirmDeleteSong}
          testID="song-menu-delete"
        />
      </BottomSheet>

      {/* 곡 정보 수정 */}
      <BottomSheet visible={infoSheetVisible} onClose={() => setInfoSheetVisible(false)} title="정보 수정">
        <View style={styles.sheetBody}>
          <Text style={styles.inputLabel}>제목</Text>
          <TextInput
            style={styles.input}
            value={infoTitle}
            onChangeText={setInfoTitle}
            placeholder="곡 제목"
            placeholderTextColor={colors.textMuted}
            maxLength={200}
            testID="song-info-title"
          />
          <Text style={styles.inputLabel}>아티스트</Text>
          <TextInput
            style={styles.input}
            value={infoArtist}
            onChangeText={setInfoArtist}
            placeholder="아티스트 (선택)"
            placeholderTextColor={colors.textMuted}
            maxLength={200}
            testID="song-info-artist"
          />
          <PressableScale
            style={[styles.primaryButton, { backgroundColor: accent }]}
            onPress={handleSaveInfo}
            haptic="light"
            testID="song-info-save"
          >
            <Text style={styles.primaryButtonText}>저장</Text>
          </PressableScale>
        </View>
      </BottomSheet>

      {/* 버전 메뉴 */}
      <BottomSheet
        visible={menuVersion !== null}
        onClose={() => setMenuVersion(null)}
        title={`버전 ${menuLabel}`}
        subtitle={menuVersion ? formatDate(menuVersion.recordedAt) : undefined}
        testID="version-sheet"
      >
        <SheetAction
          icon={menuIsDefault ? 'bookmark' : 'bookmark-outline'}
          label={menuIsDefault ? '대표 버전 해제' : '대표 버전으로 지정'}
          onPress={closeMenuThen(handleToggleDefault)}
          testID="version-menu-default"
        />
        <SheetAction icon="create-outline" label="메모 수정" onPress={closeMenuThen(openMemoEditor)} testID="version-menu-memo" />
        <SheetAction
          icon="musical-note"
          label="키 수정"
          onPress={closeMenuThen((v) => setKeyPickerTarget(v))}
          testID="version-menu-key"
        />
        <SheetAction
          icon="cut-outline"
          label="구간 편집"
          onPress={closeMenuThen((v) => navigation.navigate('TrimEditor', { versionId: v.id }))}
          testID="version-menu-trim"
        />
        {DENOISE_AVAILABLE && (
          <SheetAction
            icon="sparkles-outline"
            label="잡음 제거"
            onPress={closeMenuThen((v) => navigation.navigate('Denoise', { versionId: v.id }))}
            testID="version-menu-denoise"
          />
        )}
        <SheetAction
          icon="share-outline"
          label="공유 / 내보내기"
          onPress={closeMenuThen(handleShareVersion)}
          testID="version-menu-share"
        />
        <SheetAction
          icon="trash-outline"
          label="삭제"
          destructive
          onPress={closeMenuThen(handleDeleteVersion)}
          testID="version-menu-delete"
        />
      </BottomSheet>

      {/* 메모 수정 */}
      <BottomSheet
        visible={memoTarget !== null}
        onClose={() => setMemoTarget(null)}
        title="메모 수정"
        subtitle={memoTarget ? `버전 ${formatVersionNumber(versionNumbers.get(memoTarget.id))}` : undefined}
      >
        <View style={styles.sheetBody}>
          <TextInput
            style={[styles.input, styles.memoInput]}
            placeholder="이 녹음에 대한 메모를 남겨 보세요"
            placeholderTextColor={colors.textMuted}
            value={newMemo}
            onChangeText={setNewMemo}
            multiline
            numberOfLines={4}
            autoFocus
            maxLength={500}
            testID="memo-input"
          />
          <PressableScale
            style={[styles.primaryButton, { backgroundColor: accent }]}
            onPress={handleSaveMemo}
            haptic="light"
            testID="memo-save"
          >
            <Text style={styles.primaryButtonText}>저장</Text>
          </PressableScale>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    scrollContent: {
      paddingBottom: spacing.xxl + spacing.xl,
    },
    hero: {
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
    },
    artShadow: {
      borderRadius: 24,
      marginBottom: spacing.xl,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 18,
      elevation: 8,
      backgroundColor: colors.surface,
    },
    songTitle: {
      fontFamily: fontFamily.extrabold,
      fontSize: 26,
      letterSpacing: -0.4,
      color: colors.text,
      textAlign: 'center',
      marginBottom: spacing.xs,
    },
    songArtist: {
      ...typography.body,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    headerMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.xs,
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
    recordWrap: {
      alignItems: 'center',
      marginTop: spacing.xl,
      gap: spacing.sm,
    },
    recordButton: {
      width: 72,
      height: 72,
      borderRadius: borderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 10,
      elevation: 6,
    },
    recordLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.textMuted,
    },
    versionsSection: {
      paddingHorizontal: spacing.lg,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    sectionTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 18,
      color: colors.text,
    },
    sectionCount: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.textMuted,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
      overflow: 'hidden',
    },
    versionsList: {
      gap: spacing.md,
    },
    versionCard: {
      backgroundColor: colors.surface,
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    versionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    playCircle: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.full,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      alignItems: 'center',
    },
    playIconOffset: {
      marginLeft: 2,
    },
    versionInfo: {
      flex: 1,
      gap: 2,
    },
    versionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    versionNumber: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.text,
    },
    versionDate: {
      ...typography.bodySmall,
      color: colors.textMuted,
      flexShrink: 1,
    },
    nowPlaying: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    nowPlayingText: {
      fontFamily: fontFamily.semibold,
      fontSize: 12,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.full,
      justifyContent: 'center',
      alignItems: 'center',
    },
    versionBody: {
      paddingLeft: 44 + spacing.md,
      gap: spacing.xs,
    },
    ratingStars: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    starButton: {
      padding: 2,
    },
    defaultBadge: {
      marginLeft: spacing.sm,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: borderRadius.full,
    },
    defaultBadgeText: {
      fontFamily: fontFamily.semibold,
      fontSize: 12,
    },
    versionMemo: {
      ...typography.bodySmall,
      color: colors.text,
      paddingVertical: 2,
    },
    versionMemoPlaceholder: {
      ...typography.bodySmall,
      color: colors.textFaint,
      paddingVertical: 2,
    },
    emptyContainer: {
      alignItems: 'center',
      paddingVertical: spacing.xxl,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    emptyTitle: {
      ...typography.h3,
      color: colors.text,
      marginBottom: spacing.xs,
    },
    emptySubtitle: {
      ...typography.bodySmall,
      color: colors.textMuted,
      textAlign: 'center',
    },
    sheetBody: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: spacing.sm,
    },
    inputLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    input: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: borderRadius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      ...typography.body,
      color: colors.text,
    },
    memoInput: {
      minHeight: 110,
      textAlignVertical: 'top',
    },
    primaryButton: {
      marginTop: spacing.md,
      minHeight: 50,
      borderRadius: borderRadius.lg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    primaryButtonText: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.onAccent,
    },
  });
