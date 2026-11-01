import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { RootStackParamList, SongWithVersions } from "../types";
import { getSongsWithVersions, deleteSong, updateSongInfo } from "../lib/database";
import { matchesSearch } from "../lib/search";
import { sortSongRows, relativeTime } from "../lib/sorting";
import { HomeSort } from "../lib/settings";
import { ColorTokens, spacing, borderRadius, fontFamily } from "../lib/theme";
import { useTheme } from "../contexts/ThemeContext";
import { useSettings } from "../contexts/SettingsContext";
import { useToast } from "../contexts/ToastContext";
import ScreenHeader from "../components/ScreenHeader";
import Waveform from "../components/Waveform";
import { SongSearchModal } from "../components/SongSearchModal";
import { AlbumArt } from "../components/AlbumArt";
import KeyBadge from "../components/KeyBadge";
import BottomSheet, { SheetAction } from "../components/BottomSheet";
import PressableScale from "../components/PressableScale";
import Chip from "../components/Chip";
import ErrorState from "../components/ErrorState";
import { SkeletonList } from "../components/Skeleton";
import { logScreen } from "../lib/analytics";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const SORT_OPTIONS: { value: HomeSort; label: string }[] = [
  { value: "recent", label: "최근 녹음" },
  { value: "title", label: "제목" },
  { value: "rating", label: "별점" },
];

// 카드 두 번째 줄: "아티스트 · 버전 n개 · 3일 전" (없는 항목은 뺀다)
const subtitleOf = (item: SongWithVersions): string => {
  const parts: string[] = [];
  if (item.artist) parts.push(item.artist);
  if (item.versions.length === 0) {
    parts.push("아직 녹음 없음");
  } else {
    parts.push(`버전 ${item.versions.length}개`);
    if (item.latestVersion) parts.push(relativeTime(item.latestVersion.recordedAt));
  }
  return parts.join(" · ");
};

interface SongItemProps {
  item: SongWithVersions;
  onPress: (songId: string) => void;
  onOpenMenu: (song: SongWithVersions) => void;
}

const SongItem = React.memo(function SongItem({ item, onPress, onOpenMenu }: SongItemProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const displayVersion = item.defaultVersion || item.latestVersion;

  return (
    <PressableScale
      style={styles.songCard}
      onPress={() => onPress(item.id)}
      testID={`song-card-${item.id}`}
      accessibilityRole="button"
    >
      <AlbumArt uri={item.artworkUrl} size={52} iconSize={24} />
      <View style={styles.songCardContent}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.songSubtitle} numberOfLines={1}>
          {subtitleOf(item)}
        </Text>
        {(item.myKey !== undefined || displayVersion) && (
          <View style={styles.metaRow}>
            <KeyBadge value={item.myKey} />
            {displayVersion && (
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={12} color={colors.star} />
                <Text style={styles.ratingText}>{displayVersion.rating}</Text>
              </View>
            )}
          </View>
        )}
      </View>
      <Pressable
        style={({ pressed }) => [styles.moreButton, pressed && styles.moreButtonPressed]}
        onPress={() => onOpenMenu(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title} 더보기`}
        testID={`song-more-${item.id}`}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={colors.textMuted} />
      </Pressable>
    </PressableScale>
  );
});

type SheetState = { song: SongWithVersions; mode: "menu" | "edit" } | null;

export default function HomeScreen({ navigation }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const accent = scheme === "dark" ? colors.accent : colors.accentStrong;
  const { settings, update } = useSettings();
  const { show, showUndo } = useToast();
  const [songs, setSongs] = useState<SongWithVersions[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [saving, setSaving] = useState(false);
  // 실행 취소 대기 중인 삭제는 다시 불러와도 목록에 보이지 않게 한다
  const pendingDeletesRef = useRef(new Set<string>());

  const fetchSongs = useCallback(async () => {
    try {
      // 곡마다 저장소 전체를 다시 읽으면 곡이 많을 때 화면이 멈추므로 한 번에 읽어 묶는다
      const rows = await getSongsWithVersions();
      const songsWithVersions = rows
        .filter(({ song }) => !pendingDeletesRef.current.has(song.id))
        .map(({ song, versions }) => ({
          ...song,
          versions,
          latestVersion: versions[0],
          defaultVersion: song.defaultVersionId
            ? versions.find((v) => v.id === song.defaultVersionId)
            : undefined,
        }));
      setSongs(songsWithVersions);
      setLoadError(false);
    } catch (error) {
      console.error("곡 목록 로드 실패:", error);
      setLoadError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSongs();
      logScreen("Home");
    }, [fetchSongs])
  );

  const handleRetry = useCallback(() => {
    setLoadError(false);
    setSongs(null);
    fetchSongs();
  }, [fetchSongs]);

  const handlePressSong = useCallback(
    (songId: string) => navigation.navigate("SongDetail", { songId }),
    [navigation]
  );

  const handleOpenMenu = useCallback((song: SongWithVersions) => {
    setSheet({ song, mode: "menu" });
  }, []);

  const closeSheet = useCallback(() => {
    if (saving) return;
    setSheet(null);
  }, [saving]);

  const openEdit = () => {
    if (!sheet) return;
    setEditTitle(sheet.song.title);
    setEditArtist(sheet.song.artist ?? "");
    setSheet({ song: sheet.song, mode: "edit" });
  };

  const handleSaveEdit = async () => {
    if (!sheet || saving) return;
    const title = editTitle.trim();
    if (title.length === 0) return;
    setSaving(true);
    try {
      await updateSongInfo(sheet.song.id, { title, artist: editArtist.trim() || undefined });
      setSheet(null);
      show("곡 정보를 수정했어요");
      await fetchSongs();
    } catch (error) {
      console.error("곡 정보 수정 실패:", error);
      Alert.alert("오류", "곡 정보를 수정하지 못했어요.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!sheet) return;
    const song = sheet.song;
    setSheet(null);
    pendingDeletesRef.current.add(song.id);
    setSongs((prev) => (prev ? prev.filter((s) => s.id !== song.id) : prev));
    showUndo(`「${song.title}」을 삭제했어요`, {
      onUndo: () => {
        pendingDeletesRef.current.delete(song.id);
        fetchSongs();
      },
      onCommit: async () => {
        try {
          await deleteSong(song.id);
        } catch (error) {
          console.error("곡 삭제 실패:", error);
          show("곡을 삭제하지 못했어요");
          pendingDeletesRef.current.delete(song.id);
          fetchSongs();
          return;
        }
        pendingDeletesRef.current.delete(song.id);
      },
    });
  };

  const visibleSongs = useMemo(() => {
    if (!songs) return [];
    const filtered = searchQuery
      ? songs.filter(
          (song) =>
            matchesSearch(song.title, searchQuery) ||
            (song.artist ? matchesSearch(song.artist, searchQuery) : false)
        )
      : songs;
    return sortSongRows(filtered, settings.homeSort);
  }, [songs, searchQuery, settings.homeSort]);

  const renderSongCard = useCallback(
    ({ item }: { item: SongWithVersions }) => (
      <SongItem item={item} onPress={handlePressSong} onOpenMenu={handleOpenMenu} />
    ),
    [handlePressSong, handleOpenMenu]
  );

  const openSearch = useCallback(() => setSearchModalVisible(true), []);

  const renderBody = () => {
    if (songs === null) {
      return loadError ? <ErrorState message="곡 목록을 불러오지 못했어요" onRetry={handleRetry} /> : <SkeletonList />;
    }
    if (songs.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Waveform size={40} />
          </View>
          <Text style={styles.emptyTitle}>아직 녹음한 곡이 없어요</Text>
          <Text style={styles.emptySubtitle}>첫 곡을 추가하고 오늘의 목소리를 기록해 볼까요?</Text>
          <PressableScale
            style={[styles.emptyAddButton, { backgroundColor: accent }]}
            onPress={openSearch}
            haptic="light"
            testID="empty-add-button"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={22} color={colors.onAccent} />
            <Text style={styles.emptyAddText}>첫 곡 추가하기</Text>
          </PressableScale>
        </View>
      );
    }
    return (
      <>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="제목 또는 아티스트 검색"
            placeholderTextColor={colors.textFaint}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            testID="home-search-input"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery("")}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="검색어 지우기"
              testID="search-clear-button"
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        <View style={styles.sortRow}>
          {SORT_OPTIONS.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={settings.homeSort === opt.value}
              onPress={() => update({ homeSort: opt.value })}
              testID={`sort-chip-${opt.value}`}
            />
          ))}
        </View>

        <FlatList
          keyboardShouldPersistTaps="handled"
          data={visibleSongs}
          renderItem={renderSongCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.searchEmptyContainer}>
              <Text style={styles.searchEmptyText}>"{searchQuery}"에 맞는 곡이 없어요</Text>
            </View>
          }
        />
      </>
    );
  };

  const canSave = editTitle.trim().length > 0 && !saving;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader
        showWordmark
        actions={[{ icon: "add", label: "곡 추가", onPress: openSearch, testID: "add-song-button" }]}
      />

      {renderBody()}

      <BottomSheet
        visible={sheet !== null}
        onClose={closeSheet}
        title={sheet?.mode === "edit" ? "곡 정보 수정" : sheet?.song.title}
        subtitle={sheet?.mode === "menu" ? sheet.song.artist : undefined}
        testID="song-sheet"
      >
        {sheet?.mode === "edit" ? (
          <View style={styles.editBody}>
            <Text style={styles.inputLabel}>제목</Text>
            <TextInput
              style={styles.input}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="곡 제목"
              placeholderTextColor={colors.textFaint}
              editable={!saving}
              autoFocus
              testID="edit-title-input"
            />
            <Text style={styles.inputLabel}>아티스트</Text>
            <TextInput
              style={styles.input}
              value={editArtist}
              onChangeText={setEditArtist}
              placeholder="아티스트 (선택)"
              placeholderTextColor={colors.textFaint}
              editable={!saving}
              returnKeyType="done"
              onSubmitEditing={handleSaveEdit}
              testID="edit-artist-input"
            />
            <PressableScale
              style={[styles.saveButton, { backgroundColor: accent }, !canSave && styles.saveButtonDisabled]}
              onPress={handleSaveEdit}
              disabled={!canSave}
              haptic="light"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              testID="edit-save-button"
            >
              {saving ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={styles.saveButtonText}>저장</Text>
              )}
            </PressableScale>
          </View>
        ) : (
          <View>
            <SheetAction icon="create-outline" label="정보 수정" onPress={openEdit} testID="song-sheet-edit" />
            <SheetAction icon="trash-outline" label="삭제" destructive onPress={handleDelete} testID="song-sheet-delete" />
          </View>
        )}
      </BottomSheet>

      <SongSearchModal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        onNavigateToSong={(id) => {
          setSearchModalVisible(false);
          navigation.navigate("SongDetail", { songId: id });
        }}
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    listContainer: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.sm,
    },
    songCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: borderRadius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: spacing.md,
      paddingLeft: spacing.md,
      paddingRight: spacing.xs,
      gap: spacing.md,
    },
    songCardContent: {
      flex: 1,
      gap: 3,
    },
    songTitle: {
      fontFamily: fontFamily.semibold,
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
    },
    songSubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 13,
      color: colors.textMuted,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: 2,
    },
    ratingContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
    },
    ratingText: {
      fontFamily: fontFamily.semibold,
      fontSize: 12,
      color: colors.textMuted,
    },
    moreButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    moreButtonPressed: {
      backgroundColor: colors.surfaceAlt,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.xxl,
    },
    emptyIconContainer: {
      width: 112,
      height: 112,
      borderRadius: 36,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: spacing.xl,
    },
    emptyTitle: {
      fontFamily: fontFamily.bold,
      fontSize: 20,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    emptySubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: colors.textMuted,
      textAlign: "center",
      marginBottom: spacing.xl,
    },
    emptyAddButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      height: 56,
      paddingHorizontal: spacing.xl,
      borderRadius: borderRadius.full,
    },
    emptyAddText: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.onAccent,
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      height: 48,
      backgroundColor: colors.surface,
      borderRadius: borderRadius.lg,
      marginHorizontal: spacing.lg,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      fontFamily: fontFamily.medium,
      fontSize: 16,
      color: colors.text,
      padding: 0,
    },
    sortRow: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
    },
    searchEmptyContainer: {
      alignItems: "center",
      paddingTop: spacing.xxl,
    },
    searchEmptyText: {
      fontFamily: fontFamily.medium,
      fontSize: 15,
      color: colors.textMuted,
    },
    editBody: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    inputLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: spacing.xs,
    },
    input: {
      height: 48,
      backgroundColor: colors.surfaceAlt,
      borderRadius: borderRadius.lg,
      paddingHorizontal: spacing.md,
      fontFamily: fontFamily.medium,
      fontSize: 16,
      color: colors.text,
      marginBottom: spacing.md,
    },
    saveButton: {
      height: 52,
      borderRadius: borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
      marginTop: spacing.sm,
    },
    saveButtonDisabled: {
      opacity: 0.4,
    },
    saveButtonText: {
      fontFamily: fontFamily.bold,
      fontSize: 16,
      color: colors.onAccent,
    },
  });
