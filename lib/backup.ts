import { Paths, Directory, File } from 'expo-file-system';
import { zip, unzip } from 'react-native-zip-archive';
import type { Song, Version, Playlist, PlaylistItem } from '../types';
import { getBackupData, mergeImport, syncDefaultPlaylist, type BackupData, type MergeResult } from './database';
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

// react-native-zip-archive는 file:// 접두어 없는 경로를 기대 → 변환 헬퍼
const fsPath = (uri: string) => uri.replace(/^file:\/\//, '');

function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function buildBackup(
  sel: BackupSelection
): Promise<{ uri: string; counts: { songs: number; versions: number } }> {
  const data = await getBackupData();
  const manifest = buildManifest(sel, data, new Date().toISOString());
  if (manifest.songs.length === 0 && manifest.versions.length === 0) {
    throw new Error('내보낼 데이터가 없습니다.');
  }

  const stamp = timestamp(new Date());
  const staging = new Directory(Paths.cache, `backup-staging-${stamp}`);
  if (staging.exists) staging.delete();
  staging.create();
  try {
    const audioDir = new Directory(staging, 'audio');
    audioDir.create();

    new File(staging, 'manifest.json').write(JSON.stringify(manifest));

    const origById = new Map(data.versions.map((v) => [v.id, v]));
    for (const v of manifest.versions) {
      const orig = origById.get(v.id);
      if (!orig) continue;
      const src = new File(orig.storageUrl);
      if (src.exists) src.copy(new File(audioDir, `${v.id}.m4a`));
    }

    const destZip = new File(Paths.cache, `plilog-backup-${stamp}.zip`);
    if (destZip.exists) destZip.delete();
    const zipped = await zip(fsPath(staging.uri), fsPath(destZip.uri));
    const uri = zipped.startsWith('file://') ? zipped : `file://${zipped}`;
    return { uri, counts: { songs: manifest.songs.length, versions: manifest.versions.length } };
  } finally {
    if (staging.exists) staging.delete();
  }
}

export async function restoreBackup(
  zipUri: string
): Promise<MergeResult & { audioRestored: number }> {
  const work = new Directory(Paths.cache, `restore-${Date.now()}`);
  if (work.exists) work.delete();
  work.create();
  try {
    await unzip(fsPath(zipUri), fsPath(work.uri));
    const mf = new File(work, 'manifest.json');
    if (!mf.exists) throw new Error('백업에 manifest.json이 없습니다.');
    const manifest = parseManifest(await mf.text());

    let audioRestored = 0;
    const versionsOut: any[] = [];
    for (const v of manifest.versions) {
      const audio = new File(work, 'audio', `${v.id}.m4a`);
      if (audio.exists) {
        const { localUri } = await saveAudioLocally(v.songId, audio.uri);
        versionsOut.push({ ...v, storageUrl: localUri });
        audioRestored++;
      } else {
        versionsOut.push(v);
      }
    }

    const result = await mergeImport({
      songs: manifest.songs,
      versions: versionsOut,
      playlists: manifest.playlists ?? [],
      playlistItems: manifest.playlistItems ?? [],
    });
    await syncDefaultPlaylist();
    return { ...result, audioRestored };
  } finally {
    if (work.exists) work.delete();
  }
}
