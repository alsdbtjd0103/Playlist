import { Paths, Directory, File } from 'expo-file-system';
import { getAllVersionsStrict, getAllSongs } from './database';

// 저장 공간 점검·정리. 어떤 버전도 참조하지 않는 녹음 파일(고아)과 캐시의 임시 파일을 찾는다.
// DB 가 참조하는 파일은 절대 지우지 않는다.

export interface FileEntry {
  uri: string;
  size: number;
}

export interface StorageReport {
  recordingsBytes: number;
  recordingCount: number;
  orphanFiles: FileEntry[];
  tempFiles: FileEntry[];
  reclaimableBytes: number;
}

// "file:///a/b" 와 "file:/a/b", 인코딩 차이를 같은 경로로 본다.
// iOS 는 재설치 시 앱 컨테이너 경로가 바뀌므로 recordings/ 아래 상대 경로로 비교한다.
export const normalizeUri = (uri: string): string => {
  let path = uri.replace(/^file:\/*/, '/');
  try {
    path = decodeURI(path);
  } catch {
    // 잘못된 인코딩은 그대로 비교
  }
  path = path.replace(/\/+$/, '');
  const idx = path.lastIndexOf('/recordings/');
  return idx >= 0 ? path.slice(idx) : path;
};

/**
 * 어떤 버전도 참조하지 않는 녹음 파일을 고른다. 안전장치:
 * - 아직 있는 곡의 폴더(recordings/{songId}/)에 있는 파일은 지우지 않는다(참조 판정이 틀려도 녹음은 지킨다).
 */
export function findOrphans(files: FileEntry[], referencedUris: string[], liveSongIds: string[] = []): FileEntry[] {
  const referenced = new Set(referencedUris.filter(Boolean).map(normalizeUri));
  const live = new Set(liveSongIds);
  return files.filter((f) => {
    const path = normalizeUri(f.uri);
    if (referenced.has(path)) return false;
    const songDir = path.match(/^\/recordings\/([^/]+)\//)?.[1];
    return !(songDir && live.has(songDir));
  });
}

const walk = (dir: Directory, out: FileEntry[]) => {
  if (!dir.exists) return;
  for (const entry of dir.list()) {
    if (entry instanceof Directory) {
      walk(entry, out);
    } else {
      out.push({ uri: entry.uri, size: (entry as File).size ?? 0 });
    }
  }
};

// 캐시 안에서 앱이 만든 임시물: 녹음기 임시 폴더(Audio), 공유·편집용 렌더(.m4a),
// 백업 zip 과 백업/복원 작업 폴더 잔여물
const isTempCacheEntry = (name: string): boolean =>
  name === 'Audio' ||
  name.endsWith('.m4a') ||
  /^plilog-backup-.*\.zip$/.test(name) ||
  name.startsWith('backup-staging-') ||
  name.startsWith('restore-');

export async function scanStorage(): Promise<StorageReport> {
  const recordings: FileEntry[] = [];
  walk(new Directory(Paths.document, 'recordings'), recordings);

  // 저장소 읽기에 실패하면(빈 목록으로 오인하면 모든 녹음이 고아가 된다) 예외로 멈춘다
  const versions = await getAllVersionsStrict();
  const songs = await getAllSongs();
  if (versions.length === 0 && recordings.length > 0 && songs.length > 0) {
    throw new Error('녹음 정보를 확인하지 못해 정리를 멈췄어요.');
  }
  const orphanFiles = findOrphans(recordings, versions.map((v) => v.storageUrl), songs.map((s) => s.id));

  const tempFiles: FileEntry[] = [];
  const cache = new Directory(Paths.cache);
  if (cache.exists) {
    for (const entry of cache.list()) {
      if (!isTempCacheEntry(entry.name)) continue;
      if (entry instanceof Directory) walk(entry, tempFiles);
      else tempFiles.push({ uri: entry.uri, size: (entry as File).size ?? 0 });
    }
  }

  const sum = (list: FileEntry[]) => list.reduce((s, f) => s + f.size, 0);
  return {
    recordingsBytes: sum(recordings),
    recordingCount: recordings.length,
    orphanFiles,
    tempFiles,
    reclaimableBytes: sum(orphanFiles) + sum(tempFiles),
  };
}

/** 점검 결과의 고아·임시 파일을 지운다. 지우기 직전에 참조 여부를 한 번 더 확인한다. 지운 바이트 수를 돌려준다. */
export async function cleanStorage(report: StorageReport): Promise<number> {
  const referenced = new Set((await getAllVersionsStrict()).map((v) => normalizeUri(v.storageUrl)));
  let freed = 0;
  for (const f of [...report.orphanFiles, ...report.tempFiles]) {
    if (referenced.has(normalizeUri(f.uri))) continue;
    try {
      const file = new File(f.uri);
      if (file.exists) {
        file.delete();
        freed += f.size;
      }
    } catch (error) {
      console.error('파일 정리 실패:', f.uri, error);
    }
  }
  return freed;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
