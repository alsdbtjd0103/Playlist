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
