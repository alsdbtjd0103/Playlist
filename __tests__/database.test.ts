import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addSong,
  getSong,
  getAllSongs,
  updateSongDefaultVersion,
  deleteSong,
  addVersion,
  getVersion,
  getVersionsBySong,
  updateVersion,
  deleteVersion,
  createPlaylist,
  getPlaylists,
  addToPlaylist,
  getPlaylistItems,
  removeFromPlaylist,
  deletePlaylist,
  ensureDefaultPlaylist,
  getPlaylistWithDetails,
} from '@/lib/database';

// generateId / createdAt / recordedAt 가 모두 같은 밀리초에 찍히면 정렬을
// 검증할 수 없으므로, 시간에 의존하는 테스트는 가짜 타이머로 시계를 전진시킨다.
beforeAll(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
afterAll(() => {
  jest.useRealTimers();
});

// 가짜 시계를 ms 만큼 전진 (저장 로직의 Promise 는 마이크로태스크라 await 로 처리됨)
const tick = (ms: number) => jest.advanceTimersByTime(ms);

describe('곡(Song) 관리', () => {
  it('곡을 추가하면 id로 다시 조회할 수 있다', async () => {
    const songId = await addSong('밤편지', '아이유');
    const song = await getSong(songId);

    expect(song).not.toBeNull();
    expect(song?.title).toBe('밤편지');
    expect(song?.artist).toBe('아이유');
  });

  it('artist 없이 추가하면 artist는 undefined다', async () => {
    const songId = await addSong('제목만 있는 곡');
    const song = await getSong(songId);
    expect(song?.artist).toBeUndefined();
  });

  it('createdAt/updatedAt이 직렬화 후에도 Date 객체로 복원된다', async () => {
    await addSong('테스트곡');
    const songs = await getAllSongs();

    expect(songs[0].createdAt).toBeInstanceOf(Date);
    expect(songs[0].updatedAt).toBeInstanceOf(Date);
    expect(Number.isNaN(songs[0].createdAt.getTime())).toBe(false);
  });

  it('곡 목록은 updatedAt 최신순으로 정렬된다', async () => {
    const first = await addSong('첫번째곡');
    tick(1000);
    const second = await addSong('두번째곡');
    tick(1000);

    // 두번째 곡에 버전을 추가해 updatedAt을 더 최신으로 만든다
    await addVersion(second, 'f.m4a', 'file://f.m4a', 5);

    const songs = await getAllSongs();
    expect(songs[0].id).toBe(second);
    expect(songs[1].id).toBe(first);
  });

  it('곡을 삭제하면 조회되지 않고 관련 버전도 함께 삭제된다', async () => {
    const songId = await addSong('삭제될곡');
    const versionId = await addVersion(songId, 'v.m4a', 'file://v.m4a', 4);

    await deleteSong(songId);

    expect(await getSong(songId)).toBeNull();
    expect(await getVersion(versionId)).toBeNull();
  });

  it('잘못된 JSON이 저장돼 있어도 빈 배열을 반환한다(방어 로직)', async () => {
    await AsyncStorage.setItem('@songs', '{깨진 JSON');
    const songs = await getAllSongs();
    expect(songs).toEqual([]);
  });
});

describe('버전(Version) 관리', () => {
  it('버전을 추가하고 곡별로 조회할 수 있다', async () => {
    const songId = await addSong('곡A');
    const v1 = await addVersion(songId, 'a1.m4a', 'file://a1', 3, 120, '메모1');
    const v2 = await addVersion(songId, 'a2.m4a', 'file://a2', 5);

    const versions = await getVersionsBySong(songId);
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.id)).toEqual(expect.arrayContaining([v1, v2]));
  });

  it('버전은 recordedAt 최신순으로 정렬된다', async () => {
    const songId = await addSong('곡B');
    const older = await addVersion(songId, 'old.m4a', 'file://old', 3);
    tick(1000);
    const newer = await addVersion(songId, 'new.m4a', 'file://new', 4);

    const versions = await getVersionsBySong(songId);
    expect(versions[0].id).toBe(newer);
    expect(versions[1].id).toBe(older);
  });

  it('별점과 메모를 수정할 수 있다', async () => {
    const songId = await addSong('곡C');
    const versionId = await addVersion(songId, 'c.m4a', 'file://c', 2);

    await updateVersion(versionId, { rating: 5, memo: '최고' });

    const version = await getVersion(versionId);
    expect(version?.rating).toBe(5);
    expect(version?.memo).toBe('최고');
  });

  it('버전을 삭제할 수 있다', async () => {
    const songId = await addSong('곡D');
    const versionId = await addVersion(songId, 'd.m4a', 'file://d', 3);

    await deleteVersion(versionId);
    expect(await getVersion(versionId)).toBeNull();
  });
});

describe('플레이리스트(Playlist) 관리', () => {
  it('getPlaylists 호출 시 기본 플레이리스트("대표곡")가 자동 생성된다', async () => {
    const playlists = await getPlaylists();
    expect(playlists.length).toBeGreaterThanOrEqual(1);
    expect(playlists[0].isDefault).toBe(true);
    expect(playlists[0].name).toBe('대표곡');
  });

  it('기본 플레이리스트는 항상 목록 맨 위에 온다', async () => {
    await ensureDefaultPlaylist();
    await createPlaylist('내 플리');

    const playlists = await getPlaylists();
    expect(playlists[0].isDefault).toBe(true);
  });

  it('커스텀 플레이리스트에 버전을 추가/제거할 수 있다', async () => {
    const songId = await addSong('곡E');
    const versionId = await addVersion(songId, 'e.m4a', 'file://e', 4);
    const playlistId = await createPlaylist('연습용');

    await addToPlaylist(playlistId, versionId, 0);
    let items = await getPlaylistItems(playlistId);
    expect(items).toHaveLength(1);

    await removeFromPlaylist(playlistId, versionId);
    items = await getPlaylistItems(playlistId);
    expect(items).toHaveLength(0);
  });

  it('플레이리스트 항목은 order 순으로 정렬된다', async () => {
    const songId = await addSong('곡F');
    const vA = await addVersion(songId, 'fa.m4a', 'file://fa', 3);
    const vB = await addVersion(songId, 'fb.m4a', 'file://fb', 3);
    const playlistId = await createPlaylist('순서테스트');

    await addToPlaylist(playlistId, vA, 1);
    await addToPlaylist(playlistId, vB, 0);

    const items = await getPlaylistItems(playlistId);
    expect(items[0].versionId).toBe(vB);
    expect(items[1].versionId).toBe(vA);
  });

  it('기본 플레이리스트는 삭제할 수 없다', async () => {
    const defaultId = await ensureDefaultPlaylist();
    await expect(deletePlaylist(defaultId)).rejects.toThrow('기본 플레이리스트는 삭제할 수 없습니다.');
  });

  it('커스텀 플레이리스트는 삭제할 수 있다', async () => {
    const playlistId = await createPlaylist('지울플리');
    await deletePlaylist(playlistId);

    const playlists = await getPlaylists();
    expect(playlists.find((p) => p.id === playlistId)).toBeUndefined();
  });
});

describe('대표 버전 ↔ 대표곡 플레이리스트 동기화', () => {
  it('대표 버전을 지정하면 대표곡 플레이리스트에 자동 포함된다', async () => {
    const songId = await addSong('대표곡테스트');
    const versionId = await addVersion(songId, 'g.m4a', 'file://g', 5);

    await updateSongDefaultVersion(songId, versionId);

    const defaultId = await ensureDefaultPlaylist();
    const items = await getPlaylistItems(defaultId);
    expect(items.some((i) => i.versionId === versionId)).toBe(true);
  });

  it('대표 버전을 해제하면 대표곡 플레이리스트에서 제거된다', async () => {
    const songId = await addSong('해제테스트');
    const versionId = await addVersion(songId, 'h.m4a', 'file://h', 5);

    await updateSongDefaultVersion(songId, versionId);
    await updateSongDefaultVersion(songId, null);

    const defaultId = await ensureDefaultPlaylist();
    const items = await getPlaylistItems(defaultId);
    expect(items.some((i) => i.versionId === versionId)).toBe(false);
  });

  it('getPlaylistWithDetails는 항목에 song/version을 조인해 반환한다', async () => {
    const songId = await addSong('조인곡', '가수');
    const versionId = await addVersion(songId, 'j.m4a', 'file://j', 4);
    const playlistId = await createPlaylist('조인플리');
    await addToPlaylist(playlistId, versionId, 0);

    const detail = await getPlaylistWithDetails(playlistId);
    expect(detail).not.toBeNull();
    expect(detail?.items).toHaveLength(1);
    expect(detail?.items[0].song.title).toBe('조인곡');
    expect(detail?.items[0].version.id).toBe(versionId);
  });
});
