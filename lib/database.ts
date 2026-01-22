import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Song, Version, Playlist, PlaylistItem } from '@/types';

// AsyncStorage 키 상수
const KEYS = {
  SONGS: '@songs',
  VERSIONS: '@versions',
  PLAYLISTS: '@playlists',
  PLAYLIST_ITEMS: '@playlistItems',
};

// 기본 플레이리스트 상수
const DEFAULT_PLAYLIST_NAME = '대표곡';

// === Helper 함수 ===

const generateId = (): string => {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// === 곡 관리 ===

export const addSong = async (title: string, artist?: string): Promise<string> => {
  const now = new Date();
  const songId = generateId();

  const newSong: Song = {
    id: songId,
    title,
    artist: artist || undefined,
    createdAt: now,
    updatedAt: now,
    defaultVersionId: undefined,
  };

  const songs = await getAllSongs();
  songs.push(newSong);
  await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs));

  return songId;
};

export const getSong = async (songId: string): Promise<Song | null> => {
  const songs = await getAllSongs();
  const song = songs.find((s) => s.id === songId);
  return song || null;
};

export const getAllSongs = async (): Promise<Song[]> => {
  try {
    const songsJson = await AsyncStorage.getItem(KEYS.SONGS);
    if (!songsJson) return [];

    const songs = JSON.parse(songsJson);
    // Date 객체로 변환
    return songs.map((song: any) => ({
      ...song,
      createdAt: new Date(song.createdAt),
      updatedAt: new Date(song.updatedAt),
    })).sort((a: Song, b: Song) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } catch {
    return [];
  }
};

export const updateSongDefaultVersion = async (
  songId: string,
  versionId: string | null
): Promise<void> => {
  const songs = await getAllSongs();
  const songIndex = songs.findIndex((s) => s.id === songId);

  if (songIndex !== -1) {
    songs[songIndex].defaultVersionId = versionId || undefined;
    songs[songIndex].updatedAt = new Date();
    await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs));
    
    // 대표곡 플레이리스트 동기화
    await syncDefaultPlaylist();
  }
};

export const deleteSong = async (songId: string): Promise<void> => {
  // 관련 버전들도 삭제
  const versions = await getVersionsBySong(songId);
  for (const version of versions) {
    await deleteVersion(version.id);
  }

  // 곡 삭제
  const songs = await getAllSongs();
  const filteredSongs = songs.filter((s) => s.id !== songId);
  await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(filteredSongs));
};

// === 버전 관리 ===

export const addVersion = async (
  songId: string,
  fileName: string,
  storageUrl: string,
  rating: number,
  duration?: number,
  memo?: string
): Promise<string> => {
  const now = new Date();
  const versionId = generateId();

  const newVersion: Version = {
    id: versionId,
    songId,
    fileName,
    storageUrl,
    rating,
    duration: duration || undefined,
    recordedAt: now,
    memo: memo || undefined,
  };

  const versions = await getAllVersions();
  versions.push(newVersion);
  await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(versions));

  // 곡의 updatedAt 갱신
  const songs = await getAllSongs();
  const songIndex = songs.findIndex((s) => s.id === songId);
  if (songIndex !== -1) {
    songs[songIndex].updatedAt = now;
    await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs));
  }

  return versionId;
};

export const getVersion = async (versionId: string): Promise<Version | null> => {
  const versions = await getAllVersions();
  const version = versions.find((v) => v.id === versionId);
  return version || null;
};

const getAllVersions = async (): Promise<Version[]> => {
  try {
    const versionsJson = await AsyncStorage.getItem(KEYS.VERSIONS);
    if (!versionsJson) return [];

    const versions = JSON.parse(versionsJson);
    // Date 객체로 변환
    return versions.map((version: any) => ({
      ...version,
      recordedAt: new Date(version.recordedAt),
    }));
  } catch {
    return [];
  }
};

export const getVersionsBySong = async (songId: string): Promise<Version[]> => {
  const versions = await getAllVersions();
  return versions
    .filter((v) => v.songId === songId)
    .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
};

export const updateVersion = async (
  versionId: string,
  updates: { rating?: number; memo?: string }
): Promise<void> => {
  const versions = await getAllVersions();
  const versionIndex = versions.findIndex((v) => v.id === versionId);

  if (versionIndex !== -1) {
    if (updates.rating !== undefined) {
      versions[versionIndex].rating = updates.rating;
    }
    if (updates.memo !== undefined) {
      versions[versionIndex].memo = updates.memo;
    }
    await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(versions));
  }
};

export const deleteVersion = async (versionId: string): Promise<void> => {
  const versions = await getAllVersions();
  const filteredVersions = versions.filter((v) => v.id !== versionId);
  await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(filteredVersions));
};

// === 플레이리스트 관리 ===

export const createPlaylist = async (
  name: string,
  isDefault: boolean = false
): Promise<string> => {
  const now = new Date();
  const playlistId = generateId();

  const newPlaylist: Playlist = {
    id: playlistId,
    name,
    isDefault,
    createdAt: now,
    updatedAt: now,
  };

  const playlists = await getAllPlaylists();
  playlists.push(newPlaylist);
  await AsyncStorage.setItem(KEYS.PLAYLISTS, JSON.stringify(playlists));

  return playlistId;
};

const getAllPlaylists = async (): Promise<Playlist[]> => {
  try {
    const playlistsJson = await AsyncStorage.getItem(KEYS.PLAYLISTS);
    if (!playlistsJson) return [];

    const playlists = JSON.parse(playlistsJson);
    // Date 객체로 변환 및 description 필드 제거 (마이그레이션)
    const cleanedPlaylists = playlists.map((playlist: any) => {
      const { description, ...rest } = playlist; // description 제거
      return {
        ...rest,
        createdAt: new Date(rest.createdAt),
        updatedAt: new Date(rest.updatedAt),
      };
    });
    
    // description이 있었다면 정리된 데이터를 다시 저장
    if (playlists.some((p: any) => p.description !== undefined)) {
      await AsyncStorage.setItem(KEYS.PLAYLISTS, JSON.stringify(cleanedPlaylists));
    }
    
    return cleanedPlaylists;
  } catch {
    return [];
  }
};

export const getPlaylists = async (): Promise<Playlist[]> => {
  // 기본 플레이리스트 확인 및 생성
  await ensureDefaultPlaylist();
  
  const playlists = await getAllPlaylists();
  return playlists.sort((a, b) => {
    // 기본 플레이리스트가 항상 맨 위에 오도록
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
};

export const addToPlaylist = async (
  playlistId: string,
  versionId: string,
  order: number
): Promise<string> => {
  const now = new Date();
  const itemId = generateId();

  const newItem: PlaylistItem = {
    id: itemId,
    playlistId,
    versionId,
    order,
    addedAt: now,
  };

  const items = await getAllPlaylistItems();
  items.push(newItem);
  await AsyncStorage.setItem(KEYS.PLAYLIST_ITEMS, JSON.stringify(items));

  return itemId;
};

const getAllPlaylistItems = async (): Promise<PlaylistItem[]> => {
  try {
    const itemsJson = await AsyncStorage.getItem(KEYS.PLAYLIST_ITEMS);
    if (!itemsJson) return [];

    const items = JSON.parse(itemsJson);
    // Date 객체로 변환
    return items.map((item: any) => ({
      ...item,
      addedAt: new Date(item.addedAt),
    }));
  } catch {
    return [];
  }
};

export const getPlaylistItems = async (playlistId: string): Promise<PlaylistItem[]> => {
  const items = await getAllPlaylistItems();
  return items
    .filter((item) => item.playlistId === playlistId)
    .sort((a, b) => a.order - b.order);
};

export const removeFromPlaylist = async (playlistId: string, versionId: string): Promise<void> => {
  const items = await getAllPlaylistItems();
  const filteredItems = items.filter(
    (item) => !(item.playlistId === playlistId && item.versionId === versionId)
  );
  await AsyncStorage.setItem(KEYS.PLAYLIST_ITEMS, JSON.stringify(filteredItems));
};

export const deletePlaylist = async (playlistId: string): Promise<void> => {
  // 기본 플레이리스트는 삭제 불가
  const playlists = await getAllPlaylists();
  const playlist = playlists.find((p) => p.id === playlistId);
  if (playlist?.isDefault) {
    throw new Error('기본 플레이리스트는 삭제할 수 없습니다.');
  }
  
  const items = await getAllPlaylistItems();
  const filteredItems = items.filter((item) => item.playlistId !== playlistId);
  await AsyncStorage.setItem(KEYS.PLAYLIST_ITEMS, JSON.stringify(filteredItems));

  const filteredPlaylists = playlists.filter((p) => p.id !== playlistId);
  await AsyncStorage.setItem(KEYS.PLAYLISTS, JSON.stringify(filteredPlaylists));
};

export const getPlaylistWithDetails = async (playlistId: string) => {
  const playlist = (await getAllPlaylists()).find((p) => p.id === playlistId);
  if (!playlist) return null;

  const items = await getPlaylistItems(playlistId);
  const itemsWithDetails = await Promise.all(
    items.map(async (item) => {
      const version = await getVersion(item.versionId);
      if (!version) return null;

      const song = await getSong(version.songId);
      if (!song) return null;

      return {
        ...item,
        version,
        song,
      };
    })
  );

  return {
    ...playlist,
    items: itemsWithDetails.filter((item) => item !== null),
  };
};

export const getAllDefaultVersions = async (): Promise<{ song: Song; version: Version }[]> => {
  const songs = await getAllSongs();
  const results = await Promise.all(
    songs.map(async (song) => {
      if (!song.defaultVersionId) return null;

      const version = await getVersion(song.defaultVersionId);
      if (!version) return null;

      return { song, version };
    })
  );

  return results.filter((item) => item !== null) as { song: Song; version: Version }[];
};

// === 기본 플레이리스트 관리 ===

// 기본 플레이리스트가 있는지 확인하고 없으면 생성
export const ensureDefaultPlaylist = async (): Promise<string> => {
  const playlists = await getAllPlaylists();
  const defaultPlaylist = playlists.find((p) => p.isDefault);
  
  if (defaultPlaylist) {
    return defaultPlaylist.id;
  }
  
  // 기본 플레이리스트 생성
  const playlistId = await createPlaylist(DEFAULT_PLAYLIST_NAME, true);
  
  // 기존 대표 버전들을 모두 추가
  await syncDefaultPlaylist();
  
  return playlistId;
};

// 대표곡 플레이리스트를 현재 대표 버전들과 동기화
export const syncDefaultPlaylist = async (): Promise<void> => {
  const playlistId = await ensureDefaultPlaylist();
  
  // 현재 플레이리스트 항목들 가져오기
  const currentItems = await getPlaylistItems(playlistId);
  const currentVersionIds = new Set(currentItems.map((item) => item.versionId));
  
  // 모든 대표 버전 가져오기
  const defaultVersions = await getAllDefaultVersions();
  const defaultVersionIds = new Set(defaultVersions.map((dv) => dv.version.id));
  
  // 제거해야 할 항목들 (더 이상 대표 버전이 아닌 것들)
  const itemsToRemove = currentItems.filter((item) => !defaultVersionIds.has(item.versionId));
  for (const item of itemsToRemove) {
    await removeFromPlaylist(playlistId, item.versionId);
  }
  
  // 추가해야 할 항목들 (새로 대표 버전으로 설정된 것들)
  const versionsToAdd = defaultVersions.filter((dv) => !currentVersionIds.has(dv.version.id));
  for (let i = 0; i < versionsToAdd.length; i++) {
    const order = currentItems.length + i;
    await addToPlaylist(playlistId, versionsToAdd[i].version.id, order);
  }
};
