import AsyncStorage from '@react-native-async-storage/async-storage';

const mockDeleteAudio = jest.fn(async (_uri: string) => {});
const mockDeleteSongDir = jest.fn(async (_songId: string) => {});
jest.mock('@/lib/storage', () => ({
  deleteAudioLocally: (uri: string) => mockDeleteAudio(uri),
  deleteAllAudioForSong: (songId: string) => mockDeleteSongDir(songId),
}));

import {
  addSong,
  getAllSongs,
  getSong,
  addVersion,
  getAllVersions,
  deleteVersion,
  deleteSong,
  createEditedVersion,
  updateSongDefaultVersion,
  createPlaylist,
  addToPlaylist,
  addManyToPlaylist,
  getPlaylistItems,
  getAllPlaylistItems,
  getPlaylists,
  syncDefaultPlaylist,
  getSongsWithVersions,
} from '@/lib/database';

beforeEach(() => {
  (AsyncStorage as any).__resetStore();
  jest.clearAllMocks();
});

describe('데이터 무결성', () => {
  it('동시에 곡을 추가해도 어느 쪽도 사라지지 않는다', async () => {
    await Promise.all([addSong('A'), addSong('B'), addSong('C')]);
    const titles = (await getAllSongs()).map((s) => s.title).sort();
    expect(titles).toEqual(['A', 'B', 'C']);
  });

  it('저장된 데이터가 깨져 읽기에 실패하면 덮어쓰지 않고 쓰기를 거부한다', async () => {
    await AsyncStorage.setItem('@songs', '{broken json');
    await expect(addSong('새 곡')).rejects.toThrow();
    expect(await AsyncStorage.getItem('@songs')).toBe('{broken json');
  });

  it('버전을 지우면 대표 지정·플레이리스트 항목을 정리하고, 공유되지 않는 파일만 삭제한다', async () => {
    const songId = await addSong('곡');
    const v1 = await addVersion(songId, 'a.m4a', 'file:///a.m4a', 5, 100);
    const edited = await createEditedVersion(v1, [{ start: 0, end: 10 }]); // 같은 파일 공유
    await updateSongDefaultVersion(songId, v1);
    const playlistId = await createPlaylist('내 목록');
    await addToPlaylist(playlistId, v1, 0);

    await deleteVersion(v1);

    expect((await getSong(songId))?.defaultVersionId).toBeUndefined();
    expect(await getPlaylistItems(playlistId)).toHaveLength(0);
    const defaultPlaylist = (await getPlaylists()).find((p) => p.isDefault)!;
    expect(await getPlaylistItems(defaultPlaylist.id)).toHaveLength(0);
    // 편집 사본이 아직 같은 파일을 쓰므로 지우면 안 된다
    expect(mockDeleteAudio).not.toHaveBeenCalled();

    await deleteVersion(edited);
    expect(mockDeleteAudio).toHaveBeenCalledWith('file:///a.m4a');
  });

  it('곡을 지우면 버전·플레이리스트 항목·녹음 폴더가 함께 정리된다', async () => {
    const songId = await addSong('곡');
    const keep = await addSong('남는 곡');
    const v1 = await addVersion(songId, 'a.m4a', 'file:///a.m4a', 5, 100);
    await addVersion(songId, 'b.m4a', 'file:///b.m4a', 4, 100);
    const vKeep = await addVersion(keep, 'c.m4a', 'file:///c.m4a', 4, 100);
    const playlistId = await createPlaylist('목록');
    await addManyToPlaylist(playlistId, [v1, vKeep]);

    await deleteSong(songId);

    expect((await getAllVersions()).map((v) => v.id)).toEqual([vKeep]);
    expect((await getPlaylistItems(playlistId)).map((i) => i.versionId)).toEqual([vKeep]);
    expect(mockDeleteSongDir).toHaveBeenCalledWith(songId);
  });

  it('여러 곡을 한 번에 추가하면 중복을 건너뛰고 기존 최대 순서 다음부터 이어 붙인다', async () => {
    const songId = await addSong('곡');
    const [a, b, c] = [
      await addVersion(songId, 'a', 'file:///a', 5),
      await addVersion(songId, 'b', 'file:///b', 5),
      await addVersion(songId, 'c', 'file:///c', 5),
    ];
    const playlistId = await createPlaylist('목록');
    await addToPlaylist(playlistId, a, 7);

    const added = await addManyToPlaylist(playlistId, [a, b, c]);

    expect(added).toBe(2);
    expect((await getPlaylistItems(playlistId)).map((i) => [i.versionId, i.order])).toEqual([
      [a, 7],
      [b, 8],
      [c, 9],
    ]);
  });

  it('대표곡 동기화가 겹쳐 실행돼도 항목이 중복되지 않는다', async () => {
    const songId = await addSong('곡');
    const v1 = await addVersion(songId, 'a', 'file:///a', 5);
    await updateSongDefaultVersion(songId, v1);

    await Promise.all([syncDefaultPlaylist(), syncDefaultPlaylist(), syncDefaultPlaylist()]);

    const items = (await getAllPlaylistItems()).filter((i) => i.versionId === v1);
    expect(items).toHaveLength(1);
  });

  it('곡 목록용 조회는 곡별 버전을 최신순으로 묶어 준다', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const songId = await addSong('곡');
    const older = await addVersion(songId, 'a', 'file:///a', 5);
    jest.advanceTimersByTime(1000);
    const newer = await addVersion(songId, 'b', 'file:///b', 5);
    jest.useRealTimers();

    const rows = await getSongsWithVersions();
    expect(rows).toHaveLength(1);
    expect(rows[0].versions.map((v) => v.id)).toEqual([newer, older]);
  });
});
