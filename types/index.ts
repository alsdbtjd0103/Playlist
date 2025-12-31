// 곡 정보
export interface Song {
  id: string;
  title: string;
  artist?: string;
  createdAt: Date;
  updatedAt: Date;
  defaultVersionId?: string;
}

// 녹음 버전
export interface Version {
  id: string;
  songId: string;
  fileName: string;
  storageUrl: string;
  rating: number;
  duration?: number;
  recordedAt: Date;
  memo?: string;
}

// 플레이리스트
export interface Playlist {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// 플레이리스트 항목
export interface PlaylistItem {
  id: string;
  playlistId: string;
  versionId: string;
  order: number;
  addedAt: Date;
}

// UI용 확장 타입들
export interface SongWithVersions extends Song {
  versions: Version[];
  latestVersion?: Version;
  defaultVersion?: Version;
}

export interface PlaylistWithItems extends Playlist {
  items: (PlaylistItem & {
    version: Version;
    song: Song;
  })[];
}

// Navigation 타입
export type RootStackParamList = {
  Home: undefined;
  SongDetail: { songId: string };
  Playlists: undefined;
  PlaylistDetail: { playlistId: string };
};
