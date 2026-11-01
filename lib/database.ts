import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Song, Version, Playlist, PlaylistItem } from '@/types';
import { getVersionNumberMap } from './versionLabel';

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

export interface SongMeta {
  artworkUrl?: string;
  itunesTrackId?: number;
  previewUrl?: string;
}

export const addSong = async (title: string, artist?: string, meta?: SongMeta): Promise<string> => {
  const now = new Date();
  const songId = generateId();

  const newSong: Song = {
    id: songId,
    title,
    artist: artist || undefined,
    createdAt: now,
    updatedAt: now,
    defaultVersionId: undefined,
    artworkUrl: meta?.artworkUrl,
    itunesTrackId: meta?.itunesTrackId,
    previewUrl: meta?.previewUrl,
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
  memo?: string,
  extra?: {
    waveform?: number[];
    trim?: { start: number; end: number };
    cuts?: { start: number; end: number }[];
    editedFrom?: string;
    key?: number;
  }
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
    waveform: extra?.waveform,
    trim: extra?.trim,
    cuts: extra?.cuts,
    editedFrom: extra?.editedFrom,
    key: extra?.key,
  };

  const versions = await getAllVersions();
  versions.push(newVersion);
  await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(versions));

  // 곡의 updatedAt 갱신 + 키 자동 반영(버전 저장 시 곡의 내 키 = 이 녹음 키)
  const songs = await getAllSongs();
  const songIndex = songs.findIndex((s) => s.id === songId);
  if (songIndex !== -1) {
    songs[songIndex].updatedAt = now;
    if (extra?.key !== undefined) {
      songs[songIndex].myKey = extra.key;
    }
    await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs));
  }

  return versionId;
};

export const getVersion = async (versionId: string): Promise<Version | null> => {
  const versions = await getAllVersions();
  const version = versions.find((v) => v.id === versionId);
  return version || null;
};

export const getAllVersions = async (): Promise<Version[]> => {
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
  updates: { rating?: number; memo?: string; key?: number }
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
    if (updates.key !== undefined) {
      versions[versionIndex].key = updates.key;
    }
    await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(versions));

    // 버전 키를 수정하면 곡의 내 키도 최근 의도로 반영
    if (updates.key !== undefined) {
      await updateSongKey(versions[versionIndex].songId, updates.key);
    }
  }
};

/** 곡의 내 키(myKey)를 직접 설정. undefined면 미설정으로 되돌림. */
export const updateSongKey = async (
  songId: string,
  key: number | undefined
): Promise<void> => {
  const songs = await getAllSongs();
  const songIndex = songs.findIndex((s) => s.id === songId);
  if (songIndex !== -1) {
    songs[songIndex].myKey = key;
    songs[songIndex].updatedAt = new Date();
    await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs));
  }
};

export const deleteVersion = async (versionId: string): Promise<void> => {
  const versions = await getAllVersions();
  const filteredVersions = versions.filter((v) => v.id !== versionId);
  await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(filteredVersions));
};

export const applyTrimToVersion = async (
  versionId: string,
  range: { start: number; end: number }
): Promise<void> => {
  const versions = await getAllVersions();
  const idx = versions.findIndex((v) => v.id === versionId);
  if (idx !== -1) {
    versions[idx].trim = range;
    await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(versions));
  }
};

export const createTrimmedVersion = async (
  sourceVersionId: string,
  range: { start: number; end: number }
): Promise<string> => {
  const source = await getVersion(sourceVersionId);
  if (!source) throw new Error('원본 버전을 찾을 수 없습니다.');
  return addVersion(
    source.songId,
    source.fileName,
    source.storageUrl,
    source.rating,
    range.end - range.start,
    source.memo,
    { waveform: source.waveform, trim: range, editedFrom: source.id }
  );
};

// === 멀티 구간(cuts) 편집 — 비파괴 ===

/** 버전에 삭제 구간(cuts)을 비파괴로 저장(원본 파일 그대로). */
export const applyCutsToVersion = async (
  versionId: string,
  cuts: { start: number; end: number }[]
): Promise<void> => {
  const versions = await getAllVersions();
  const idx = versions.findIndex((v) => v.id === versionId);
  if (idx !== -1) {
    versions[idx].cuts = cuts;
    await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(versions));
  }
};

/** cuts 메타를 가진 새 버전 생성(같은 원본 파일 참조, 비파괴). */
export const createEditedVersion = async (
  sourceVersionId: string,
  cuts: { start: number; end: number }[]
): Promise<string> => {
  const source = await getVersion(sourceVersionId);
  if (!source) throw new Error('원본 버전을 찾을 수 없습니다.');
  // 비파괴: 원본 파일을 그대로 참조하므로 duration은 원본 길이를 유지한다.
  // (편집 후 길이는 editedDuration(cuts, duration)으로 파생 계산)
  return addVersion(
    source.songId,
    source.fileName,
    source.storageUrl,
    source.rating,
    source.duration,
    source.memo,
    { waveform: source.waveform, cuts, editedFrom: source.id }
  );
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

export const getAllPlaylists = async (): Promise<Playlist[]> => {
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

export const getAllPlaylistItems = async (): Promise<PlaylistItem[]> => {
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

export const reorderPlaylistItems = async (playlistId: string, orderedItemIds: string[]): Promise<void> => {
  const items = await getAllPlaylistItems();
  const updatedItems = items.map(item => {
    if (item.playlistId !== playlistId) return item;
    const newOrder = orderedItemIds.indexOf(item.id);
    return newOrder === -1 ? item : { ...item, order: newOrder };
  });
  await AsyncStorage.setItem(KEYS.PLAYLIST_ITEMS, JSON.stringify(updatedItems));
};

export interface PlaylistDetailItem extends PlaylistItem {
  version: Version;
  song: Song;
  versionNumber: number;
  isDefault: boolean;
}

// 곡/버전을 한 번씩만 읽어 조인한다(항목마다 저장소를 다시 읽으면 목록이 길 때 느려짐).
export const getPlaylistWithDetails = async (playlistId: string) => {
  const playlist = (await getAllPlaylists()).find((p) => p.id === playlistId);
  if (!playlist) return null;

  const [items, versions, songs] = await Promise.all([
    getPlaylistItems(playlistId),
    getAllVersions(),
    getAllSongs(),
  ]);
  const versionById = new Map(versions.map((v) => [v.id, v]));
  const songById = new Map(songs.map((s) => [s.id, s]));
  const numbers = getVersionNumberMap(versions);

  const itemsWithDetails: PlaylistDetailItem[] = [];
  for (const item of items) {
    const version = versionById.get(item.versionId);
    if (!version) continue;
    const song = songById.get(version.songId);
    if (!song) continue;
    itemsWithDetails.push({
      ...item,
      version,
      song,
      versionNumber: numbers.get(version.id) ?? 0,
      isDefault: song.defaultVersionId === version.id,
    });
  }

  return {
    ...playlist,
    items: itemsWithDetails,
  };
};

export const getAllDefaultVersions = async (): Promise<{ song: Song; version: Version }[]> => {
  const [songs, versions] = await Promise.all([getAllSongs(), getAllVersions()]);
  const versionById = new Map(versions.map((v) => [v.id, v]));
  const results: { song: Song; version: Version }[] = [];
  for (const song of songs) {
    if (!song.defaultVersionId) continue;
    const version = versionById.get(song.defaultVersionId);
    if (version) results.push({ song, version });
  }
  return results;
};

// === 메모 피드 ===

export interface MemoFeedItem {
  version: Version;
  song: Song;
  versionNumber: number;
}

// 메모가 있는 버전만 녹음일 최신순으로 모은다.
export const getMemoFeed = async (): Promise<MemoFeedItem[]> => {
  const [songs, versions] = await Promise.all([getAllSongs(), getAllVersions()]);
  const songById = new Map(songs.map((s) => [s.id, s]));
  const numbers = getVersionNumberMap(versions);

  const feed: MemoFeedItem[] = [];
  for (const version of versions) {
    if (!version.memo?.trim()) continue;
    const song = songById.get(version.songId);
    if (!song) continue;
    feed.push({ version, song, versionNumber: numbers.get(version.id) ?? 0 });
  }
  return feed.sort((a, b) => b.version.recordedAt.getTime() - a.version.recordedAt.getTime());
};

// === 기본 플레이리스트 관리 ===

// 기본 플레이리스트가 있는지 확인하고 없으면 생성.
// 여러 화면이 동시에 불러도 대표곡이 두 번 만들어지지 않도록 진행 중인 호출을 공유한다.
let ensuringDefault: Promise<string> | null = null;

export const ensureDefaultPlaylist = (): Promise<string> => {
  if (!ensuringDefault) {
    ensuringDefault = ensureDefaultPlaylistOnce().finally(() => {
      ensuringDefault = null;
    });
  }
  return ensuringDefault;
};

const ensureDefaultPlaylistOnce = async (): Promise<string> => {
  const playlists = await getAllPlaylists();
  const defaults = playlists
    .filter((p) => p.isDefault)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  if (defaults.length === 1) {
    return defaults[0].id;
  }

  if (defaults.length > 1) {
    // 예전 복원/동시 생성으로 대표곡이 여러 개 생긴 경우: 가장 오래된 하나만 남긴다
    const keep = defaults[0];
    const dropIds = new Set(defaults.slice(1).map((p) => p.id));
    const items = await getAllPlaylistItems();
    await AsyncStorage.setItem(
      KEYS.PLAYLIST_ITEMS,
      JSON.stringify(items.filter((item) => !dropIds.has(item.playlistId)))
    );
    await AsyncStorage.setItem(
      KEYS.PLAYLISTS,
      JSON.stringify(playlists.filter((p) => !dropIds.has(p.id)))
    );
    await syncDefaultPlaylistInto(keep.id);
    return keep.id;
  }

  // 기본 플레이리스트 생성 후 기존 대표 버전들을 모두 추가
  const playlistId = await createPlaylist(DEFAULT_PLAYLIST_NAME, true);
  await syncDefaultPlaylistInto(playlistId);
  return playlistId;
};

// === 백업/복원 ===

export interface BackupData {
  songs: Song[];
  versions: Version[];
  playlists: Playlist[];
  playlistItems: PlaylistItem[];
}

export const getBackupData = async (): Promise<BackupData> => ({
  songs: await getAllSongs(),
  versions: await getAllVersions(),
  playlists: await getAllPlaylists(),
  playlistItems: await getAllPlaylistItems(),
});

export interface MergeCounts { added: number; skipped: number; }
export interface MergeResult {
  songs: MergeCounts; versions: MergeCounts; playlists: MergeCounts; playlistItems: MergeCounts;
}

// 원시 JSON 레벨에서 id 기준 병합(기존 유지, 중복 skip). Date 변환 불필요.
const mergeCollection = async (key: string, incoming: any[]): Promise<MergeCounts> => {
  const json = await AsyncStorage.getItem(key);
  const existing: any[] = json ? JSON.parse(json) : [];
  const ids = new Set(existing.map((r) => r.id));
  let added = 0, skipped = 0;
  for (const rec of incoming ?? []) {
    if (ids.has(rec.id)) { skipped++; continue; }
    existing.push(rec); ids.add(rec.id); added++;
  }
  await AsyncStorage.setItem(key, JSON.stringify(existing));
  return { added, skipped };
};

// 기본(대표곡) 플레이리스트는 기기마다 id가 달라 id 병합으로는 중복 생성되므로 가져오지 않는다.
// 대표곡 구성은 복원 후 syncDefaultPlaylist가 곡의 defaultVersionId로 다시 맞춘다.
export const mergeImport = async (data: {
  songs: any[]; versions: any[]; playlists: any[]; playlistItems: any[];
}): Promise<MergeResult> => {
  const incomingPlaylists = data.playlists ?? [];
  const defaultIds = new Set(incomingPlaylists.filter((p) => p.isDefault).map((p) => p.id));
  const playlists = incomingPlaylists.filter((p) => !defaultIds.has(p.id));
  const playlistItems = (data.playlistItems ?? []).filter((i) => !defaultIds.has(i.playlistId));

  const playlistCounts = await mergeCollection(KEYS.PLAYLISTS, playlists);
  const itemCounts = await mergeCollection(KEYS.PLAYLIST_ITEMS, playlistItems);
  return {
    songs: await mergeCollection(KEYS.SONGS, data.songs),
    versions: await mergeCollection(KEYS.VERSIONS, data.versions),
    playlists: { ...playlistCounts, skipped: playlistCounts.skipped + defaultIds.size },
    playlistItems: {
      ...itemCounts,
      skipped: itemCounts.skipped + ((data.playlistItems ?? []).length - playlistItems.length),
    },
  };
};

// 대표곡 플레이리스트를 현재 대표 버전들과 동기화
export const syncDefaultPlaylist = async (): Promise<void> => {
  await syncDefaultPlaylistInto(await ensureDefaultPlaylist());
};

const syncDefaultPlaylistInto = async (playlistId: string): Promise<void> => {
  
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
