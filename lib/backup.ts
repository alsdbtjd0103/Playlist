import type { Song, Version, Playlist, PlaylistItem } from '../types';
import type { BackupData } from './database';
export type { BackupData } from './database';

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
