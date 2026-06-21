import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TouchableWithoutFeedback,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList, SongWithVersions } from "../types";
import { getAllSongs, getVersionsBySong, deleteSong } from "../lib/database";
import { matchesSearch } from "../lib/search";
import { useFocusEffect } from "@react-navigation/native";
import { colors, spacing, borderRadius, typography } from "../lib/theme";
import ScreenHeader from "../components/ScreenHeader";
import { SongSearchModal } from '../components/SongSearchModal';
import { AlbumArt } from '../components/AlbumArt';

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const SongItem = ({
  item,
  onOpenMenu,
  onPress,
}: {
  item: SongWithVersions;
  onOpenMenu: (x: number, y: number, song: SongWithVersions) => void;
  onPress: () => void;
}) => {
  const buttonRef = React.useRef<View>(null);
  const displayVersion = item.defaultVersion || item.latestVersion;

  const handlePress = () => {
    buttonRef.current?.measure((x: number, y: number, width: number, height: number, pageX: number, pageY: number) => {
      onOpenMenu(pageX + width, pageY + height, item);
    });
  };

  return (
    <TouchableOpacity style={styles.songCard} onPress={onPress} activeOpacity={0.7}>
      <AlbumArt uri={item.artworkUrl} size={48} iconSize={24} />
      <View style={styles.songCardContent}>
        <View style={styles.songInfo}>
          <Text style={styles.songTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.artist && (
            <Text style={styles.songArtist} numberOfLines={1}>
              {item.artist}
            </Text>
          )}
        </View>
        {displayVersion && (
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={12} color={colors.warning} />
            <Text style={styles.ratingText}>{displayVersion.rating}</Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        ref={buttonRef}
        style={styles.moreButton}
        onPress={handlePress}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

export default function HomeScreen({ navigation }: Props) {
  const [songs, setSongs] = useState<SongWithVersions[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [menuState, setMenuState] = useState<{
    visible: boolean;
    x: number;
    y: number;
    song: SongWithVersions | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    song: null,
  });

  useFocusEffect(
    useCallback(() => {
      fetchSongs();
    }, [])
  );

  const fetchSongs = async () => {
    try {
      const allSongs = await getAllSongs();
      const songsWithVersions = await Promise.all(
        allSongs.map(async (song) => {
          const versions = await getVersionsBySong(song.id);
          const latestVersion = versions[0];
          const defaultVersion = song.defaultVersionId
            ? versions.find((v) => v.id === song.defaultVersionId)
            : undefined;

          return {
            ...song,
            versions,
            latestVersion,
            defaultVersion,
          };
        })
      );

      setSongs(songsWithVersions);
    } catch (error) {
      console.error("곡 목록 로드 실패:", error);
    }
  };

  const handleDeleteSong = (song: SongWithVersions) => {
    closeMenu();
    Alert.alert(
      "곡 삭제",
      `"${song.title}"을(를) 삭제하시겠습니까?\n모든 녹음 버전도 함께 삭제됩니다.`, // Note: The original string had a newline character that was correctly escaped as \n. This is preserved.
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteSong(song.id);
              await fetchSongs();
            } catch (error) {
              console.error("곡 삭제 실패:", error);
              Alert.alert("오류", "곡 삭제에 실패했습니다.");
            }
          },
        },
      ]
    );
  };

  const handleOpenMenu = (x: number, y: number, song: SongWithVersions) => {
    setMenuState({
      visible: true,
      x: x - 120, // 메뉴 너비(140) - 버튼 너비(약 40) + 여유 공간
      y: y,
      song,
    });
  };

  const closeMenu = () => {
    setMenuState((prev) => ({ ...prev, visible: false }));
  };

  const filteredSongs = songs
    ? songs.filter((song) =>
        matchesSearch(song.title, searchQuery) ||
        (song.artist ? matchesSearch(song.artist, searchQuery) : false)
      )
    : [];

  const renderSongCard = ({ item }: { item: SongWithVersions }) => {
    return (
      <SongItem
        item={item}
        onOpenMenu={handleOpenMenu}
        onPress={() => navigation.navigate("SongDetail", { songId: item.id })}
      />
    );
  };

  if (songs === null) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScreenHeader onAddPress={() => setSearchModalVisible(true)} />

      {/* 검색 바 */}
      {songs.length > 0 && (
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="제목으로 검색"
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {songs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <Ionicons name="musical-notes-outline" size={64} color={colors.textTertiary} />
          </View>
          <Text style={styles.emptyTitle}>아직 등록된 곡이 없습니다</Text>
          <Text style={styles.emptySubtitle}>첫 번째 곡을 추가해보세요!</Text>
          <TouchableOpacity
            style={styles.emptyAddButton}
            onPress={() => setSearchModalVisible(true)}
          >
            <Ionicons name="add" size={24} color={colors.background} />
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredSongs}
          renderItem={renderSongCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.searchEmptyContainer}>
              <Text style={styles.searchEmptyText}>"{searchQuery}"에 대한 결과가 없습니다</Text>
            </View>
          }
        />
      )}

      {/* 곡 추가 모달 */}
      {/* 드롭다운 메뉴 (Modal 대신 절대 위치 View 사용) */}
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
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => menuState.song && handleDeleteSong(menuState.song)}
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
                <Text style={styles.menuItemText}>삭제</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      )}

      <SongSearchModal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        onNavigateToSong={(id) => {
          setSearchModalVisible(false);
          navigation.navigate('SongDetail', { songId: id });
        }}
      />
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
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.body.fontSize,
    color: colors.textSecondary,
  },
  listContainer: {
    padding: spacing.lg,
    paddingTop: 0,
    gap: spacing.sm,
  },
  songCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  songCardContent: {
    flex: 1,
    gap: spacing.xs,
  },
  songInfo: {
    gap: 2,
  },
  songTitle: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  songArtist: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  ratingText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  moreButton: {
    padding: spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xxl,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
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
    marginBottom: spacing.xl,
  },
  emptyAddButton: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.body.fontSize,
    color: colors.textPrimary,
    padding: 0,
  },
  searchEmptyContainer: {
    alignItems: "center",
    paddingTop: spacing.xxl,
  },
  searchEmptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "transparent",
  },
  dropdownMenu: {
    position: "absolute",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    width: 140,
    shadowColor: "#000",
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
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    gap: spacing.sm,
  },
  menuItemText: {
    ...typography.bodySmall,
    color: colors.error,
    fontWeight: "500",
  },
});
