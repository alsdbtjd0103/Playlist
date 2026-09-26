import { Paths, Directory, File } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import { zip, unzip, subscribe, NO_COMPRESSION } from 'react-native-zip-archive';
import type { Song, Version, Playlist, PlaylistItem } from '../types';
import {
  getBackupData, getAllVersions, mergeImport, syncDefaultPlaylist, type BackupData, type MergeResult,
} from './database';
export type { BackupData } from './database';
import { saveAudioLocally } from './storage';

export const SCHEMA_VERSION = 1;

export type BackupSelection =
  | { type: 'all' }
  | { type: 'song'; songId: string }
  | { type: 'playlist'; playlistId: string }
  | { type: 'songs'; songIds: string[] };

export interface BackupManifest {
  schemaVersion: number;
  app: 'plilog';
  exportedAt: string;
  exportType: BackupSelection['type'];
  songs: Song[];
  versions: Version[];
  playlists: Playlist[];
  playlistItems: PlaylistItem[];
}

export function buildManifest(sel: BackupSelection, data: BackupData, exportedAt: string): BackupManifest {
  let songs: Song[] = [];
  let versions: Version[] = [];
  let playlists: Playlist[] = [];
  let playlistItems: PlaylistItem[] = [];

  if (sel.type === 'all') {
    ({ songs, versions, playlists, playlistItems } = data);
  } else if (sel.type === 'song') {
    songs = data.songs.filter((s) => s.id === sel.songId);
    versions = data.versions.filter((v) => v.songId === sel.songId);
  } else if (sel.type === 'songs') {
    const ids = new Set(sel.songIds);
    songs = data.songs.filter((s) => ids.has(s.id));
    versions = data.versions.filter((v) => ids.has(v.songId));
  } else {
    playlists = data.playlists.filter((p) => p.id === sel.playlistId);
    playlistItems = data.playlistItems.filter((pi) => pi.playlistId === sel.playlistId);
    const versionIds = new Set(playlistItems.map((pi) => pi.versionId));
    versions = data.versions.filter((v) => versionIds.has(v.id));
    const songIds = new Set(versions.map((v) => v.songId));
    songs = data.songs.filter((s) => songIds.has(s.id));
  }

  const versionsOut = versions.map((v) => ({ ...v, storageUrl: `audio/${v.id}.m4a` }));
  return {
    schemaVersion: SCHEMA_VERSION, app: 'plilog', exportedAt, exportType: sel.type,
    songs, versions: versionsOut, playlists, playlistItems,
  };
}

export function parseManifest(text: string): BackupManifest {
  let m: any;
  try { m = JSON.parse(text); } catch { throw new Error('백업 파일을 읽을 수 없습니다 (잘못된 형식).'); }
  if (!m || m.app !== 'plilog' || typeof m.schemaVersion !== 'number') {
    throw new Error('plilog 백업 파일이 아닙니다.');
  }
  if (m.schemaVersion > SCHEMA_VERSION) {
    throw new Error('이 백업은 더 최신 버전 앱에서 만들어졌습니다. 앱을 업데이트해 주세요.');
  }
  return m as BackupManifest;
}

// === 진행도 ===

export type BackupPhase = 'copy' | 'zip' | 'unzip' | 'restore' | 'done';
export interface BackupProgress { phase: BackupPhase; done: number; total: number }
export type ProgressCallback = (p: BackupProgress) => void;

// 단계별 가중치: 백업은 파일 준비(복사)가 대부분이고 무압축 zip은 짧다.
// 복원은 압축 해제 후 파일 복원(복사)이 대부분이다.
const PHASE_RANGE: Record<BackupPhase, [number, number]> = {
  copy: [0, 0.9],
  zip: [0.9, 1],
  unzip: [0, 0.3],
  restore: [0.3, 1],
  done: [1, 1],
};

export function backupProgressRatio({ phase, done, total }: BackupProgress): number {
  const [from, to] = PHASE_RANGE[phase];
  const frac = total > 0 ? Math.min(Math.max(done / total, 0), 1) : 0;
  return from + (to - from) * frac;
}

// === 오디오 파일 계획 ===

// 트림 사본처럼 같은 원본 파일을 쓰는 버전들은 zip에 한 번만 담고 경로를 공유한다.
export function planAudioEntries(
  versionIds: string[],
  originals: Pick<Version, 'id' | 'storageUrl'>[]
): { entries: { src: string; path: string }[]; pathByVersionId: Map<string, string> } {
  const origById = new Map(originals.map((v) => [v.id, v]));
  const pathBySrc = new Map<string, string>();
  const pathByVersionId = new Map<string, string>();
  const entries: { src: string; path: string }[] = [];

  for (const id of versionIds) {
    const orig = origById.get(id);
    if (!orig) continue;
    let path = pathBySrc.get(orig.storageUrl);
    if (!path) {
      path = `audio/${id}.m4a`;
      pathBySrc.set(orig.storageUrl, path);
      entries.push({ src: orig.storageUrl, path });
    }
    pathByVersionId.set(id, path);
  }
  return { entries, pathByVersionId };
}

// 복원 시 manifest의 storageUrl(zip 안 경로)을 검증해서 쓴다. 예전 백업은 audio/{id}.m4a.
export function resolveAudioEntry(v: Pick<Version, 'id' | 'storageUrl'>): string {
  const p = v.storageUrl;
  if (typeof p === 'string' && /^audio\/[^/\\]+\.m4a$/.test(p) && !p.includes('..')) return p;
  return `audio/${v.id}.m4a`;
}

// react-native-zip-archive는 file:// 접두어 없는 경로를 기대 → 변환 헬퍼
const fsPath = (uri: string) => uri.replace(/^file:\/\//, '');

function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function buildBackup(
  sel: BackupSelection,
  onProgress?: ProgressCallback
): Promise<{ uri: string; counts: { songs: number; versions: number } }> {
  const data = await getBackupData();
  const baseManifest = buildManifest(sel, data, new Date().toISOString());
  if (baseManifest.songs.length === 0 && baseManifest.versions.length === 0) {
    throw new Error('내보낼 데이터가 없습니다.');
  }

  const { entries, pathByVersionId } = planAudioEntries(
    baseManifest.versions.map((v) => v.id),
    data.versions
  );
  const manifest: BackupManifest = {
    ...baseManifest,
    versions: baseManifest.versions.map((v) => ({
      ...v,
      storageUrl: pathByVersionId.get(v.id) ?? v.storageUrl,
    })),
  };

  const stamp = timestamp(new Date());
  const staging = new Directory(Paths.cache, `backup-staging-${stamp}`);
  if (staging.exists) staging.delete();
  staging.create();
  let zipSub: { remove: () => void } | null = null;
  try {
    new Directory(staging, 'audio').create();
    new File(staging, 'manifest.json').write(JSON.stringify(manifest));

    // 비동기 복사: 동기 File.copy는 JS 스레드를 막아 화면이 굳고 진행도도 못 그린다
    onProgress?.({ phase: 'copy', done: 0, total: entries.length });
    for (let i = 0; i < entries.length; i++) {
      const { src, path } = entries[i];
      if (new File(src).exists) {
        await copyAsync({ from: src, to: new File(staging, ...path.split('/')).uri });
      }
      onProgress?.({ phase: 'copy', done: i + 1, total: entries.length });
    }

    const destZip = new File(Paths.cache, `plilog-backup-${stamp}.zip`);
    if (destZip.exists) destZip.delete();
    onProgress?.({ phase: 'zip', done: 0, total: 1 });
    zipSub = subscribe(({ progress }) => {
      onProgress?.({ phase: 'zip', done: Math.min(progress, 1), total: 1 });
    });
    // m4a(AAC)는 이미 압축된 포맷이라 다시 압축해도 크기가 거의 줄지 않고 시간만 든다 → 무압축 저장
    const zipped = await zip(fsPath(staging.uri), fsPath(destZip.uri), NO_COMPRESSION);
    onProgress?.({ phase: 'done', done: 1, total: 1 });
    const uri = zipped.startsWith('file://') ? zipped : `file://${zipped}`;
    return { uri, counts: { songs: manifest.songs.length, versions: manifest.versions.length } };
  } finally {
    zipSub?.remove();
    if (staging.exists) staging.delete();
  }
}

export async function restoreBackup(
  zipUri: string,
  onProgress?: ProgressCallback
): Promise<MergeResult & { audioRestored: number }> {
  const work = new Directory(Paths.cache, `restore-${Date.now()}`);
  if (work.exists) work.delete();
  work.create();
  let unzipSub: { remove: () => void } | null = null;
  try {
    onProgress?.({ phase: 'unzip', done: 0, total: 1 });
    unzipSub = subscribe(({ progress }) => {
      onProgress?.({ phase: 'unzip', done: Math.min(progress, 1), total: 1 });
    });
    await unzip(fsPath(zipUri), fsPath(work.uri));
    unzipSub.remove();
    unzipSub = null;

    const mf = new File(work, 'manifest.json');
    if (!mf.exists) throw new Error('백업에 manifest.json이 없습니다.');
    const manifest = parseManifest(await mf.text());

    // 이미 있는 버전은 병합에서 건너뛰므로 오디오도 다시 복사하지 않는다
    const existingIds = new Set((await getAllVersions()).map((v) => v.id));
    const toRestore = manifest.versions.filter((v) => !existingIds.has(v.id));
    // 트림 사본처럼 zip 안 같은 파일을 공유하는 버전은 한 번만 복사한다
    const localUriByEntry = new Map<string, string>();

    let audioRestored = 0;
    const versionsOut: any[] = [];
    onProgress?.({ phase: 'restore', done: 0, total: toRestore.length });
    for (let i = 0; i < toRestore.length; i++) {
      const v = toRestore[i];
      const entry = resolveAudioEntry(v);
      let localUri = localUriByEntry.get(entry);
      if (!localUri) {
        const audio = new File(work, ...entry.split('/'));
        if (audio.exists) {
          localUri = (await saveAudioLocally(v.songId, audio.uri)).localUri;
          localUriByEntry.set(entry, localUri);
        }
      }
      if (localUri) {
        versionsOut.push({ ...v, storageUrl: localUri });
        audioRestored++;
      } else {
        versionsOut.push(v);
      }
      onProgress?.({ phase: 'restore', done: i + 1, total: toRestore.length });
    }

    const result = await mergeImport({
      songs: manifest.songs,
      versions: versionsOut,
      playlists: manifest.playlists ?? [],
      playlistItems: manifest.playlistItems ?? [],
    });
    // 이미 있던 버전은 병합 대상에서 뺐으므로 건너뛴 개수에 합산
    result.versions.skipped += manifest.versions.length - toRestore.length;
    await syncDefaultPlaylist();
    onProgress?.({ phase: 'done', done: 1, total: 1 });
    return { ...result, audioRestored };
  } finally {
    unzipSub?.remove();
    if (work.exists) work.delete();
  }
}
