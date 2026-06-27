import { buildManifest, parseManifest, SCHEMA_VERSION, BackupData } from '../lib/backup';

const data: BackupData = {
  songs: [{ id: 's1', title: 'A' } as any, { id: 's2', title: 'B' } as any],
  versions: [
    { id: 'v1', songId: 's1', storageUrl: 'file:///rec/s1/v1.m4a', rating: 5 } as any,
    { id: 'v2', songId: 's2', storageUrl: 'file:///rec/s2/v2.m4a', rating: 3 } as any,
  ],
  playlists: [{ id: 'p1', name: 'PL' } as any],
  playlistItems: [{ id: 'pi1', playlistId: 'p1', versionId: 'v1', order: 0 } as any],
};

describe('buildManifest', () => {
  it('all: 전부 포함 + storageUrl 치환', () => {
    const m = buildManifest({ type: 'all' }, data, '2026-06-27T00:00:00.000Z');
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.exportType).toBe('all');
    expect(m.songs).toHaveLength(2);
    expect(m.versions.find((v) => v.id === 'v1')!.storageUrl).toBe('audio/v1.m4a');
    expect(m.playlists).toHaveLength(1);
  });
  it('song: 해당 곡/버전만', () => {
    const m = buildManifest({ type: 'song', songId: 's1' }, data, 'x');
    expect(m.songs.map((s) => s.id)).toEqual(['s1']);
    expect(m.versions.map((v) => v.id)).toEqual(['v1']);
    expect(m.playlists).toHaveLength(0);
  });
  it('songs: 멀티셀렉트', () => {
    const m = buildManifest({ type: 'songs', songIds: ['s2'] }, data, 'x');
    expect(m.songs.map((s) => s.id)).toEqual(['s2']);
    expect(m.versions.map((v) => v.id)).toEqual(['v2']);
  });
  it('playlist: 플레이리스트+멤버버전+부모곡', () => {
    const m = buildManifest({ type: 'playlist', playlistId: 'p1' }, data, 'x');
    expect(m.playlists.map((p) => p.id)).toEqual(['p1']);
    expect(m.playlistItems).toHaveLength(1);
    expect(m.versions.map((v) => v.id)).toEqual(['v1']);
    expect(m.songs.map((s) => s.id)).toEqual(['s1']); // v1의 부모곡
  });
});

describe('parseManifest', () => {
  it('정상 manifest 통과', () => {
    const m = parseManifest(JSON.stringify({ app: 'plilog', schemaVersion: 1, exportType: 'all', songs: [], versions: [], playlists: [], playlistItems: [] }));
    expect(m.app).toBe('plilog');
  });
  it('plilog 아니면 throw', () => {
    expect(() => parseManifest(JSON.stringify({ app: 'other', schemaVersion: 1 }))).toThrow();
  });
  it('미래 schemaVersion이면 throw', () => {
    expect(() => parseManifest(JSON.stringify({ app: 'plilog', schemaVersion: 999 }))).toThrow();
  });
  it('깨진 JSON이면 throw', () => {
    expect(() => parseManifest('{not json')).toThrow();
  });
});
