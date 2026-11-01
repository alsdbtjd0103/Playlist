import AsyncStorage from '@react-native-async-storage/async-storage';
import { mergeImport, getBackupData } from '../lib/database';

beforeEach(async () => { await AsyncStorage.clear(); });

describe('mergeImport (id 기준 병합)', () => {
  it('신규는 add, 중복 id는 skip', async () => {
    await AsyncStorage.setItem('@songs', JSON.stringify([{ id: 'a', title: 'A' }]));
    const res = await mergeImport({
      songs: [{ id: 'a', title: 'A(변경)' }, { id: 'b', title: 'B' }],
      versions: [], playlists: [], playlistItems: [],
    });
    expect(res.songs).toEqual({ added: 1, skipped: 1 });
    const stored = JSON.parse((await AsyncStorage.getItem('@songs'))!);
    expect(stored.map((s: any) => s.id).sort()).toEqual(['a', 'b']);
    // 기존 유지: a의 title은 덮어쓰지 않음
    expect(stored.find((s: any) => s.id === 'a').title).toBe('A');
  });

  it('백업 쪽 기본(대표곡) 플레이리스트와 그 항목은 건너뛴다 (대표곡 중복 방지)', async () => {
    await AsyncStorage.setItem('@playlists', JSON.stringify([{ id: 'local-default', name: '대표곡', isDefault: true }]));
    const res = await mergeImport({
      songs: [], versions: [],
      playlists: [
        { id: 'backup-default', name: '대표곡', isDefault: true },
        { id: 'custom', name: '연습', isDefault: false },
      ],
      playlistItems: [
        { id: 'i1', playlistId: 'backup-default', versionId: 'v1', order: 0 },
        { id: 'i2', playlistId: 'custom', versionId: 'v1', order: 0 },
      ],
    });
    const playlists = JSON.parse((await AsyncStorage.getItem('@playlists'))!);
    expect(playlists.filter((p: any) => p.isDefault)).toHaveLength(1);
    expect(playlists.map((p: any) => p.id).sort()).toEqual(['custom', 'local-default']);
    const items = JSON.parse((await AsyncStorage.getItem('@playlistItems'))!);
    expect(items.map((i: any) => i.id)).toEqual(['i2']);
    expect(res.playlists).toEqual({ added: 1, skipped: 1 });
  });

  it('빈 컬렉션도 안전', async () => {
    const res = await mergeImport({ songs: [], versions: [], playlists: [], playlistItems: [] });
    expect(res.versions).toEqual({ added: 0, skipped: 0 });
  });
});

describe('getBackupData', () => {
  it('네 컬렉션을 모두 반환', async () => {
    await AsyncStorage.setItem('@songs', JSON.stringify([{ id: 's', title: 'T', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]));
    const data = await getBackupData();
    expect(data.songs).toHaveLength(1);
    expect(Array.isArray(data.versions)).toBe(true);
    expect(Array.isArray(data.playlists)).toBe(true);
    expect(Array.isArray(data.playlistItems)).toBe(true);
  });
});

describe('대표곡 플레이리스트 중복 방지', () => {
  const { ensureDefaultPlaylist, getPlaylists } = require('../lib/database');

  it('이미 대표곡이 여러 개면 가장 오래된 하나만 남기고 나머지와 그 항목을 지운다', async () => {
    await AsyncStorage.setItem('@playlists', JSON.stringify([
      { id: 'newer', name: '대표곡', isDefault: true, createdAt: '2026-09-02T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z' },
      { id: 'older', name: '대표곡', isDefault: true, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z' },
      { id: 'custom', name: '연습', isDefault: false, createdAt: '2026-09-03T00:00:00Z', updatedAt: '2026-09-03T00:00:00Z' },
    ]));
    await AsyncStorage.setItem('@playlistItems', JSON.stringify([
      { id: 'i1', playlistId: 'newer', versionId: 'v1', order: 0, addedAt: '2026-09-02T00:00:00Z' },
      { id: 'i2', playlistId: 'custom', versionId: 'v1', order: 0, addedAt: '2026-09-03T00:00:00Z' },
    ]));

    expect(await ensureDefaultPlaylist()).toBe('older');
    const playlists = await getPlaylists();
    expect(playlists.map((p: any) => p.id)).toEqual(['older', 'custom']);
    const items = JSON.parse((await AsyncStorage.getItem('@playlistItems'))!);
    expect(items.map((i: any) => i.id)).toEqual(['i2']);
  });

  it('동시에 여러 번 호출해도 대표곡은 하나만 만들어진다', async () => {
    const ids = await Promise.all([ensureDefaultPlaylist(), ensureDefaultPlaylist(), getPlaylists()]);
    expect(ids[0]).toBe(ids[1]);
    const stored = JSON.parse((await AsyncStorage.getItem('@playlists'))!);
    expect(stored.filter((p: any) => p.isDefault)).toHaveLength(1);
  });
});
