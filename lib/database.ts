import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Song, Version, Playlist, PlaylistItem } from '@/types';
import { getVersionNumberMap } from './versionLabel';
import { deleteAudioLocally, deleteAllAudioForSong } from './storage';

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

// 쓰기 직렬화: 모든 read-modify-write 를 하나의 큐로 줄 세운다.
// 두 저장이 같은 배열을 동시에 읽고 각자 덮어쓰면 먼저 쓴 쪽이 사라지기 때문이다.
// serialized 안에서는 다른 serialized 함수를 부르면 교착되므로 내부 구현(_*)만 호출한다.
let writeChain: Promise<unknown> = Promise.resolve();
const serialized = <T>(fn: () => Promise<T>): Promise<T> => {
  const run = writeChain.then(fn, fn);
  writeChain = run.catch(() => undefined);
  return run;
};

// 저장된 배열을 읽는다. 파싱 실패 시 예외를 던진다(쓰기 경로용).
// 실패를 []로 삼키면 다음 저장이 전체 데이터를 한 건으로 덮어써 버린다.
const readArray = async (key: string): Promise<any[]> => {
  const json = await AsyncStorage.getItem(key);
  if (!json) return [];
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error(`${key} 데이터 형식이 올바르지 않습니다.`);
  return parsed;
};

const toSong = (song: any): Song => ({
  ...song,
  createdAt: new Date(song.createdAt),
  updatedAt: new Date(song.updatedAt),
});
const toVersion = (version: any): Version => ({
  ...version,
  recordedAt: new Date(version.recordedAt),
});
const toPlaylist = (playlist: any): Playlist => {
  const { description, ...rest } = playlist; // 예전 description 필드 제거 (마이그레이션)
  return { ...rest, createdAt: new Date(rest.createdAt), updatedAt: new Date(rest.updatedAt) };
};
const toPlaylistItem = (item: any): PlaylistItem => ({
  ...item,
  addedAt: new Date(item.addedAt),
});

const sortSongs = (songs: Song[]) =>
  songs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

const loadSongs = async () => sortSongs((await readArray(KEYS.SONGS)).map(toSong));
const loadVersions = async () => (await readArray(KEYS.VERSIONS)).map(toVersion);
const loadPlaylists = async () => (await readArray(KEYS.PLAYLISTS)).map(toPlaylist);
const loadPlaylistItems = async () => (await readArray(KEYS.PLAYLIST_ITEMS)).map(toPlaylistItem);

// 화면 표시용 읽기는 실패해도 빈 목록으로 그린다(쓰기에는 쓰지 않는다).
const lenient = async <T>(key: string, load: () => Promise<T[]>): Promise<T[]> => {
  try {
    return await load();
  } catch (error) {
    console.error(`${key} 읽기 실패:`, error);
    return [];
  }
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

  await serialized(async () => {
    const songs = await loadSongs();
    songs.push(newSong);
    await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs));
  });

  return songId;
};

export const getSong = async (songId: string): Promise<Song | null> => {
  const songs = await getAllSongs();
  const song = songs.find((s) => s.id === songId);
  return song || null;
};

export const getAllSongs = (): Promise<Song[]> => lenient(KEYS.SONGS, loadSongs);

export const updateSongDefaultVersion = (
  songId: string,
  versionId: string | null
): Promise<void> =>
  serialized(async () => {
    const songs = await loadSongs();
    const songIndex = songs.findIndex((s) => s.id === songId);

    if (songIndex !== -1) {
      songs[songIndex].defaultVersionId = versionId || undefined;
      songs[songIndex].updatedAt = new Date();
      await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs));

      // 대표곡 플레이리스트 동기화
      await _syncDefaultPlaylistInto(await _ensureDefaultPlaylist());
    }
  });

export const deleteSong = async (songId: string): Promise<void> => {
  await serialized(async () => {
    // 관련 버전·플레이리스트 항목을 한 번에 지운 뒤 곡 삭제
    const versionIds = (await loadVersions()).filter((v) => v.songId === songId).map((v) => v.id);
    await _deleteVersions(versionIds);
    const songs = await loadSongs();
    await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs.filter((s) => s.id !== songId)));
  });
  // 곡 폴더(recordings/{songId})의 녹음 파일 정리
  await deleteAllAudioForSong(songId);
};

// === 버전 관리 ===

export const addVersion = (
  songId: string,
  fileName: string,
  storageUrl: string,
  rating: number,
  duration?: number,
  memo?: string,
  extra?: AddVersionExtra
): Promise<string> =>
  serialized(() => _addVersion(songId, fileName, storageUrl, rating, duration, memo, extra));

interface AddVersionExtra {
  waveform?: number[];
  trim?: { start: number; end: number };
  cuts?: { start: number; end: number }[];
  editedFrom?: string;
  key?: number;
}

const _addVersion = async (
  songId: string,
  fileName: string,
  storageUrl: string,
  rating: number,
  duration?: number,
  memo?: string,
  extra?: AddVersionExtra
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

  const versions = await loadVersions();
  versions.push(newVersion);
  await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(versions));

  // 곡의 updatedAt 갱신 + 키 자동 반영(버전 저장 시 곡의 내 키 = 이 녹음 키)
  const songs = await loadSongs();
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

export const getAllVersions = (): Promise<Version[]> => lenient(KEYS.VERSIONS, loadVersions);

const byRecordedDesc = (a: Version, b: Version) => b.recordedAt.getTime() - a.recordedAt.getTime();

export const getVersionsBySong = async (songId: string): Promise<Version[]> => {
  const versions = await getAllVersions();
  return versions.filter((v) => v.songId === songId).sort(byRecordedDesc);
};

// 곡 목록 화면용: 곡마다 저장소를 다시 읽지 않도록 곡/버전을 한 번씩만 읽어 묶는다.
export const getSongsWithVersions = async (): Promise<{ song: Song; versions: Version[] }[]> => {
  const [songs, versions] = await Promise.all([getAllSongs(), getAllVersions()]);
  const bySong = new Map<string, Version[]>();
  for (const v of versions) {
    const list = bySong.get(v.songId);
    if (list) list.push(v);
    else bySong.set(v.songId, [v]);
  }
  return songs.map((song) => ({ song, versions: (bySong.get(song.id) ?? []).sort(byRecordedDesc) }));
};

export const updateVersion = (
  versionId: string,
  updates: { rating?: number; memo?: string; key?: number }
): Promise<void> =>
  serialized(async () => {
  const versions = await loadVersions();
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
      await _updateSongKey(versions[versionIndex].songId, updates.key);
    }
  }
  });

/** 곡의 내 키(myKey)를 직접 설정. undefined면 미설정으로 되돌림. */
export const updateSongKey = (songId: string, key: number | undefined): Promise<void> =>
  serialized(() => _updateSongKey(songId, key));

const _updateSongKey = async (
  songId: string,
  key: number | undefined
): Promise<void> => {
  const songs = await loadSongs();
  const songIndex = songs.findIndex((s) => s.id === songId);
  if (songIndex !== -1) {
    songs[songIndex].myKey = key;
    songs[songIndex].updatedAt = new Date();
    await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs));
  }
};

export const deleteVersion = (versionId: string): Promise<void> =>
  serialized(() => _deleteVersions([versionId]));

// 버전 삭제와 함께 그 버전을 가리키는 대표 버전 지정·플레이리스트 항목도 정리하고,
// 더 이상 어떤 버전도 참조하지 않는 녹음 파일을 지운다(편집 사본은 원본 파일을 공유한다).
const _deleteVersions = async (versionIds: string[]): Promise<void> => {
  if (versionIds.length === 0) return;
  const ids = new Set(versionIds);
  const [versions, songs, items] = await Promise.all([loadVersions(), loadSongs(), loadPlaylistItems()]);
  const removed = versions.filter((v) => ids.has(v.id));
  if (removed.length === 0) return;
  const remaining = versions.filter((v) => !ids.has(v.id));

  let defaultCleared = false;
  for (const song of songs) {
    if (song.defaultVersionId && ids.has(song.defaultVersionId)) {
      song.defaultVersionId = undefined;
      defaultCleared = true;
    }
  }

  const pairs: [string, string][] = [
    [KEYS.VERSIONS, JSON.stringify(remaining)],
    [KEYS.PLAYLIST_ITEMS, JSON.stringify(items.filter((item) => !ids.has(item.versionId)))],
  ];
  if (defaultCleared) pairs.push([KEYS.SONGS, JSON.stringify(songs)]);
  await AsyncStorage.multiSet(pairs);

  const stillUsed = new Set(remaining.map((v) => v.storageUrl));
  const orphanFiles = new Set(removed.map((v) => v.storageUrl).filter((uri) => uri && !stillUsed.has(uri)));
  for (const uri of orphanFiles) {
    await deleteAudioLocally(uri);
  }
};

export const applyTrimToVersion = (
  versionId: string,
  range: { start: number; end: number }
): Promise<void> =>
  serialized(async () => {
    const versions = await loadVersions();
    const idx = versions.findIndex((v) => v.id === versionId);
    if (idx !== -1) {
      versions[idx].trim = range;
      await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(versions));
    }
  });

export const createTrimmedVersion = (
  sourceVersionId: string,
  range: { start: number; end: number }
): Promise<string> =>
  serialized(async () => {
  const source = (await loadVersions()).find((v) => v.id === sourceVersionId);
  if (!source) throw new Error('원본 버전을 찾을 수 없습니다.');
  return _addVersion(
    source.songId,
    source.fileName,
    source.storageUrl,
    source.rating,
    range.end - range.start,
    source.memo,
    { waveform: source.waveform, trim: range, editedFrom: source.id }
  );
  });

// === 멀티 구간(cuts) 편집 — 비파괴 ===

/**
 * 버전에 삭제 구간(cuts)을 비파괴로 저장(원본 파일 그대로).
 * duration 이 없는 예전 녹음은 재생할 때 cuts 를 건너뛸 수 없으므로, 편집기가 알아낸 길이를 함께 저장한다.
 */
export const applyCutsToVersion = (
  versionId: string,
  cuts: { start: number; end: number }[],
  knownDuration?: number
): Promise<void> =>
  serialized(async () => {
    const versions = await loadVersions();
    const idx = versions.findIndex((v) => v.id === versionId);
    if (idx !== -1) {
      versions[idx].cuts = cuts;
      if (!versions[idx].duration && knownDuration && knownDuration > 0) {
        versions[idx].duration = knownDuration;
      }
      await AsyncStorage.setItem(KEYS.VERSIONS, JSON.stringify(versions));
    }
  });

/** cuts 메타를 가진 새 버전 생성(같은 원본 파일 참조, 비파괴). */
export const createEditedVersion = (
  sourceVersionId: string,
  cuts: { start: number; end: number }[],
  knownDuration?: number
): Promise<string> =>
  serialized(async () => {
  const source = (await loadVersions()).find((v) => v.id === sourceVersionId);
  if (!source) throw new Error('원본 버전을 찾을 수 없습니다.');
  // 비파괴: 원본 파일을 그대로 참조하므로 duration은 원본 길이를 유지한다.
  // (편집 후 길이는 editedDuration(cuts, duration)으로 파생 계산)
  return _addVersion(
    source.songId,
    source.fileName,
    source.storageUrl,
    source.rating,
    source.duration || knownDuration,
    source.memo,
    { waveform: source.waveform, cuts, editedFrom: source.id }
  );
  });

// === 플레이리스트 관리 ===

export const createPlaylist = (name: string, isDefault: boolean = false): Promise<string> =>
  serialized(() => _createPlaylist(name, isDefault));

const _createPlaylist = async (
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

  const playlists = await loadPlaylists();
  playlists.push(newPlaylist);
  await AsyncStorage.setItem(KEYS.PLAYLISTS, JSON.stringify(playlists));

  return playlistId;
};

// 예전 description 필드는 읽을 때 떼어내고, 다음 저장 때 자연히 정리된다.
export const getAllPlaylists = (): Promise<Playlist[]> => lenient(KEYS.PLAYLISTS, loadPlaylists);

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

export const addToPlaylist = (
  playlistId: string,
  versionId: string,
  order: number
): Promise<string> =>
  serialized(async () => {
    const newItem: PlaylistItem = {
      id: generateId(),
      playlistId,
      versionId,
      order,
      addedAt: new Date(),
    };
    const items = await loadPlaylistItems();
    items.push(newItem);
    await AsyncStorage.setItem(KEYS.PLAYLIST_ITEMS, JSON.stringify(items));
    return newItem.id;
  });

/**
 * 여러 버전을 플레이리스트 끝에 한 번의 저장으로 추가한다. 이미 들어 있는 버전은 건너뛴다.
 * 순서값은 (화면에 안 보이는 항목까지 포함한) 기존 최대값 다음부터 매겨 충돌하지 않게 한다.
 */
export const addManyToPlaylist = (playlistId: string, versionIds: string[]): Promise<number> =>
  serialized(async () => {
    const items = await loadPlaylistItems();
    const own = items.filter((item) => item.playlistId === playlistId);
    const present = new Set(own.map((item) => item.versionId));
    let order = own.reduce((max, item) => Math.max(max, item.order), -1) + 1;
    const now = new Date();
    let added = 0;
    for (const versionId of versionIds) {
      if (present.has(versionId)) continue;
      present.add(versionId);
      items.push({ id: generateId(), playlistId, versionId, order: order++, addedAt: now });
      added++;
    }
    if (added > 0) await AsyncStorage.setItem(KEYS.PLAYLIST_ITEMS, JSON.stringify(items));
    return added;
  });

export const getAllPlaylistItems = (): Promise<PlaylistItem[]> =>
  lenient(KEYS.PLAYLIST_ITEMS, loadPlaylistItems);

export const getPlaylistItems = async (playlistId: string): Promise<PlaylistItem[]> => {
  const items = await getAllPlaylistItems();
  return items
    .filter((item) => item.playlistId === playlistId)
    .sort((a, b) => a.order - b.order);
};

export const removeFromPlaylist = (playlistId: string, versionId: string): Promise<void> =>
  serialized(async () => {
    const items = await loadPlaylistItems();
    const filteredItems = items.filter(
      (item) => !(item.playlistId === playlistId && item.versionId === versionId)
    );
    await AsyncStorage.setItem(KEYS.PLAYLIST_ITEMS, JSON.stringify(filteredItems));
  });

export const deletePlaylist = (playlistId: string): Promise<void> =>
  serialized(async () => {
    // 기본 플레이리스트는 삭제 불가
    const [playlists, items] = await Promise.all([loadPlaylists(), loadPlaylistItems()]);
    const playlist = playlists.find((p) => p.id === playlistId);
    if (playlist?.isDefault) {
      throw new Error('기본 플레이리스트는 삭제할 수 없습니다.');
    }
    await AsyncStorage.multiSet([
      [KEYS.PLAYLIST_ITEMS, JSON.stringify(items.filter((item) => item.playlistId !== playlistId))],
      [KEYS.PLAYLISTS, JSON.stringify(playlists.filter((p) => p.id !== playlistId))],
    ]);
  });

// 화면에 보이는 항목 순서대로 0..n-1 을 매기고, 목록에 없는(가리키는 버전이 사라진) 항목은 정리한다.
export const reorderPlaylistItems = (playlistId: string, orderedItemIds: string[]): Promise<void> =>
  serialized(async () => {
    const items = await loadPlaylistItems();
    const position = new Map(orderedItemIds.map((id, index) => [id, index]));
    const updatedItems = items
      .filter((item) => item.playlistId !== playlistId || position.has(item.id))
      .map((item) => {
        const newOrder = position.get(item.id);
        return item.playlistId !== playlistId || newOrder === undefined ? item : { ...item, order: newOrder };
      });
    await AsyncStorage.setItem(KEYS.PLAYLIST_ITEMS, JSON.stringify(updatedItems));
  });

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
    ensuringDefault = serialized(_ensureDefaultPlaylist).finally(() => {
      ensuringDefault = null;
    });
  }
  return ensuringDefault;
};

const _ensureDefaultPlaylist = async (): Promise<string> => {
  const playlists = await loadPlaylists();
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
    const items = await loadPlaylistItems();
    await AsyncStorage.multiSet([
      [KEYS.PLAYLIST_ITEMS, JSON.stringify(items.filter((item) => !dropIds.has(item.playlistId)))],
      [KEYS.PLAYLISTS, JSON.stringify(playlists.filter((p) => !dropIds.has(p.id)))],
    ]);
    await _syncDefaultPlaylistInto(keep.id);
    return keep.id;
  }

  // 기본 플레이리스트 생성 후 기존 대표 버전들을 모두 추가
  const playlistId = await _createPlaylist(DEFAULT_PLAYLIST_NAME, true);
  await _syncDefaultPlaylistInto(playlistId);
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
// 저장은 호출한 쪽이 모아서 한 번에 한다.
const mergeCollection = async (
  key: string,
  incoming: any[]
): Promise<{ counts: MergeCounts; pair: [string, string] }> => {
  const existing = await readArray(key);
  const ids = new Set(existing.map((r) => r.id));
  let added = 0, skipped = 0;
  for (const rec of incoming ?? []) {
    if (ids.has(rec.id)) { skipped++; continue; }
    existing.push(rec); ids.add(rec.id); added++;
  }
  return { counts: { added, skipped }, pair: [key, JSON.stringify(existing)] };
};

// 기본(대표곡) 플레이리스트는 기기마다 id가 달라 id 병합으로는 중복 생성되므로 가져오지 않는다.
// 대표곡 구성은 복원 후 syncDefaultPlaylist가 곡의 defaultVersionId로 다시 맞춘다.
// 네 컬렉션을 모두 계산한 뒤 multiSet 한 번으로 저장해, 중간 실패로 일부만 반영되지 않게 한다.
export const mergeImport = (data: {
  songs: any[]; versions: any[]; playlists: any[]; playlistItems: any[];
}): Promise<MergeResult> =>
  serialized(async () => {
    const incomingPlaylists = data.playlists ?? [];
    const defaultIds = new Set(incomingPlaylists.filter((p) => p.isDefault).map((p) => p.id));
    const playlists = incomingPlaylists.filter((p) => !defaultIds.has(p.id));
    const playlistItems = (data.playlistItems ?? []).filter((i) => !defaultIds.has(i.playlistId));

    const playlistMerge = await mergeCollection(KEYS.PLAYLISTS, playlists);
    const itemMerge = await mergeCollection(KEYS.PLAYLIST_ITEMS, playlistItems);
    const songMerge = await mergeCollection(KEYS.SONGS, data.songs);
    const versionMerge = await mergeCollection(KEYS.VERSIONS, data.versions);
    await AsyncStorage.multiSet([playlistMerge.pair, itemMerge.pair, songMerge.pair, versionMerge.pair]);

    return {
      songs: songMerge.counts,
      versions: versionMerge.counts,
      playlists: { ...playlistMerge.counts, skipped: playlistMerge.counts.skipped + defaultIds.size },
      playlistItems: {
        ...itemMerge.counts,
        skipped: itemMerge.counts.skipped + ((data.playlistItems ?? []).length - playlistItems.length),
      },
    };
  });

// 대표곡 플레이리스트를 현재 대표 버전들과 동기화
export const syncDefaultPlaylist = (): Promise<void> =>
  serialized(async () => {
    await _syncDefaultPlaylistInto(await _ensureDefaultPlaylist());
  });

// 항목마다 저장소 전체를 다시 쓰지 않고, 최종 배열을 계산해 한 번만 저장한다.
const _syncDefaultPlaylistInto = async (playlistId: string): Promise<void> => {
  const [items, songs, versions] = await Promise.all([loadPlaylistItems(), loadSongs(), loadVersions()]);
  const versionIds = new Set(versions.map((v) => v.id));
  const defaultVersionIds: string[] = [];
  for (const song of songs) {
    if (song.defaultVersionId && versionIds.has(song.defaultVersionId)) {
      defaultVersionIds.push(song.defaultVersionId);
    }
  }
  const wanted = new Set(defaultVersionIds);

  const seen = new Set<string>();
  let changed = false;
  const kept = items.filter((item) => {
    if (item.playlistId !== playlistId) return true;
    // 더 이상 대표 버전이 아니거나 중복된 항목은 제거
    if (!wanted.has(item.versionId) || seen.has(item.versionId)) {
      changed = true;
      return false;
    }
    seen.add(item.versionId);
    return true;
  });

  let order =
    kept.reduce((max, item) => (item.playlistId === playlistId ? Math.max(max, item.order) : max), -1) + 1;
  const now = new Date();
  for (const versionId of defaultVersionIds) {
    if (seen.has(versionId)) continue;
    seen.add(versionId);
    kept.push({ id: generateId(), playlistId, versionId, order: order++, addedAt: now });
    changed = true;
  }

  if (changed) await AsyncStorage.setItem(KEYS.PLAYLIST_ITEMS, JSON.stringify(kept));
};
