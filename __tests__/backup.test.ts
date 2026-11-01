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

import { planAudioEntries, backupProgressRatio, resolveAudioEntry } from '../lib/backup';

describe('planAudioEntries (같은 녹음 파일은 한 번만 담기)', () => {
  it('원본 파일이 같은 버전(트림 사본)은 같은 zip 경로를 공유한다', () => {
    const orig = [
      { id: 'v1', storageUrl: 'file:///rec/s1/a.m4a' },
      { id: 'v2', storageUrl: 'file:///rec/s1/a.m4a' }, // v1을 트림한 사본
      { id: 'v3', storageUrl: 'file:///rec/s1/b.m4a' },
    ] as any[];
    const { entries, pathByVersionId } = planAudioEntries(['v1', 'v2', 'v3'], orig);
    expect(entries).toEqual([
      { src: 'file:///rec/s1/a.m4a', path: 'audio/v1.m4a' },
      { src: 'file:///rec/s1/b.m4a', path: 'audio/v3.m4a' },
    ]);
    expect(pathByVersionId.get('v2')).toBe('audio/v1.m4a');
    expect(pathByVersionId.get('v3')).toBe('audio/v3.m4a');
  });

  it('원본 버전이 없으면 건너뛴다', () => {
    const { entries, pathByVersionId } = planAudioEntries(['ghost'], []);
    expect(entries).toEqual([]);
    expect(pathByVersionId.has('ghost')).toBe(false);
  });
});

describe('resolveAudioEntry (복원 시 zip 안 경로)', () => {
  it('manifest의 audio/ 경로를 그대로 쓴다', () => {
    expect(resolveAudioEntry({ id: 'v2', storageUrl: 'audio/v1.m4a' } as any)).toBe('audio/v1.m4a');
  });
  it('이상한 경로면 예전 규칙(audio/{id}.m4a)으로 되돌린다', () => {
    expect(resolveAudioEntry({ id: 'v2', storageUrl: '../etc/passwd' } as any)).toBe('audio/v2.m4a');
    expect(resolveAudioEntry({ id: 'v2', storageUrl: 'file:///x.m4a' } as any)).toBe('audio/v2.m4a');
  });
});

describe('backupProgressRatio', () => {
  it('백업: 복사 단계는 0~90%, 압축 단계는 90~100%', () => {
    expect(backupProgressRatio({ phase: 'copy', done: 0, total: 10 })).toBeCloseTo(0);
    expect(backupProgressRatio({ phase: 'copy', done: 5, total: 10 })).toBeCloseTo(0.45);
    expect(backupProgressRatio({ phase: 'zip', done: 0.5, total: 1 })).toBeCloseTo(0.95);
    expect(backupProgressRatio({ phase: 'done', done: 1, total: 1 })).toBe(1);
  });
  it('복원: 압축 해제 0~30%, 파일 복원 30~100%', () => {
    expect(backupProgressRatio({ phase: 'unzip', done: 1, total: 1 })).toBeCloseTo(0.3);
    expect(backupProgressRatio({ phase: 'restore', done: 1, total: 2 })).toBeCloseTo(0.65);
  });
  it('total이 0이어도 NaN 없이 해당 단계 시작점을 준다', () => {
    expect(backupProgressRatio({ phase: 'copy', done: 0, total: 0 })).toBe(0);
  });
});
