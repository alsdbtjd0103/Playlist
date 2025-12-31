import React, { useState, useCallback } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList, SongWithVersions } from "../types";
import { getAllSongs, addSong, getVersionsBySong } from "../lib/database";
import { useFocusEffect } from "@react-navigation/native";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export default function HomeScreen({ navigation }: Props) {
  const [songs, setSongs] = useState<SongWithVersions[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [adding, setAdding] = useState(false);

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
      Alert.alert("오류", "곡 목록을 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddSong = async () => {
    if (!title.trim()) {
      Alert.alert("알림", "곡 제목을 입력하세요.");
      return;
    }

    setAdding(true);
    try {
      await addSong(title.trim(), artist.trim() || undefined);
      setTitle("");
      setArtist("");
      setModalVisible(false);
      await fetchSongs();
    } catch (error) {
      console.error("곡 추가 실패:", error);
      Alert.alert("오류", "곡 추가에 실패했습니다.");
    } finally {
      setAdding(false);
    }
  };

  const renderSongCard = ({ item }: { item: SongWithVersions }) => {
    const versionCount = item.versions?.length || 0;
    const displayVersion = item.defaultVersion || item.latestVersion;

    return (
      <TouchableOpacity
        style={styles.songCard}
        onPress={() => navigation.navigate("SongDetail", { songId: item.id })}
      >
        <View style={styles.songCardContent}>
          <View style={styles.songInfo}>
            <Text style={styles.songTitle}>{item.title}</Text>
            {item.artist && (
              <Text style={styles.songArtist}>{item.artist}</Text>
            )}
          </View>
          <View style={styles.songStats}>
            <Text style={styles.versionCount}>{versionCount}개 버전</Text>
            {displayVersion && (
              <View style={styles.ratingContainer}>
                <Text style={styles.ratingStar}>★</Text>
                <Text style={styles.ratingText}>{displayVersion.rating}/5</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>방구석 플레이리스트</Text>
          <Text style={styles.subtitle}>
            나만의 노래방 플레이리스트를 관리하세요
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.outlineButton}
            onPress={() => navigation.navigate("Playlists")}
          >
            <Text style={styles.outlineButtonText}>📝</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.primaryButtonText}>+ 새 곡 추가</Text>
          </TouchableOpacity>
        </View>
      </View>

      {songs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>아직 등록된 곡이 없습니다</Text>
          <Text style={styles.emptySubtitle}>첫 번째 곡을 추가해보세요!</Text>
        </View>
      ) : (
        <FlatList
          data={songs}
          renderItem={renderSongCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}

      {/* 곡 추가 모달 */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>새 곡 추가</Text>
            <Text style={styles.modalSubtitle}>
              부를 곡의 정보를 입력하세요.
            </Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>곡 제목 *</Text>
              <TextInput
                style={styles.input}
                placeholder="예: 좋은날"
                value={title}
                onChangeText={setTitle}
                editable={!adding}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>아티스트 (선택)</Text>
              <TextInput
                style={styles.input}
                placeholder="예: 아이유"
                value={artist}
                onChangeText={setArtist}
                editable={!adding}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
                disabled={adding}
              >
                <Text style={styles.cancelButtonText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleAddSong}
                disabled={adding || !title.trim()}
              >
                {adding ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>추가</Text>
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
    backgroundColor: "#fff",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  header: {
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
  },
  headerButtons: {
    flexDirection: "row",
    gap: 8,
  },
  outlineButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
  },
  outlineButtonText: {
    fontSize: 16,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "#000",
    borderRadius: 8,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  listContainer: {
    padding: 16,
    gap: 12,
  },
  songCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    overflow: "hidden",
  },
  songCardContent: {
    padding: 16,
  },
  songInfo: {
    marginBottom: 12,
  },
  songTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  songArtist: {
    fontSize: 14,
    color: "#666",
  },
  songStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  versionCount: {
    fontSize: 14,
    color: "#666",
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ratingStar: {
    color: "#fbbf24",
    fontSize: 14,
  },
  ratingText: {
    fontSize: 14,
    color: "#666",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    color: "#666",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#999",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f3f4f6",
  },
  cancelButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmButton: {
    backgroundColor: "#000",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
