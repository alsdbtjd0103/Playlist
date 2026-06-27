# 백업/복원 (설정 탭 · 내보내기 4모드 · 가져오기) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 앱 데이터(곡·버전·메모·별점·플레이리스트)와 오디오를 zip 백업으로 내보내고 다시 복원하는 설정 탭 기능 추가.

**Architecture:** `lib/backup.ts`가 코어(순수 manifest 빌드/검증 + io 래퍼). 설정 탭에서 ExportScreen(4모드)→`buildBackup`→`Sharing.shareAsync`, SettingsScreen 가져오기→DocumentPicker→`restoreBackup`(unzip→오디오 복사→DB id병합). 순수 로직은 Jest, 네이티브 zip/picker는 dev build 수동 검증.

**Tech Stack:** React Native/Expo, expo-file-system(File/Directory), react-native-zip-archive(zip/unzip), expo-document-picker, expo-sharing, AsyncStorage.

## Global Constraints

- 함수형 컴포넌트, async/await, try-catch 에러 핸들링 필수. (CLAUDE.md)
- StyleSheet 스타일링, 테마 토큰 `useTheme()/ColorTokens` 사용. 색상 직접 하드코딩 금지.
- AsyncStorage 직렬화 규칙 준수. import 병합은 **id 기준, 기존 유지·중복 skip**(idempotent).
- 백업 포맷: `manifest.json`(schemaVersion=1) + `audio/{versionId}.m4a`. version의 `storageUrl`은 manifest에서 `audio/{id}.m4a` 상대참조로 치환.
- 외부/네이티브 모듈은 테스트에서 목 처리(`jest.setup.js`). `@testing-library/react-native` v13.
- 새 라이브러리: `react-native-zip-archive@8.0.1`, `expo-document-picker@14.0.8`, `expo-sharing@14.0.8`(설치 완료). autolinking 제외 불필요.

---

### Task 1: DB 확장 — 백업 수집 + id 병합 import (`lib/database.ts`)

**Files:**
- Modify: `lib/database.ts`
- Test: `__tests__/database.backup.test.ts`

**Interfaces:**
- Produces:
  - `getAllVersions(): Promise<Version[]>` (기존 private → export)
  - `getAllPlaylists(): Promise<Playlist[]>`, `getAllPlaylistItems(): Promise<PlaylistItem[]>` (기존 private → export)
  - `getBackupData(): Promise<BackupData>` where `BackupData = { songs: Song[]; versions: Version[]; playlists: Playlist[]; playlistItems: PlaylistItem[] }`
  - `mergeImport(data: { songs: any[]; versions: any[]; playlists: any[]; playlistItems: any[] }): Promise<MergeResult>`
  - `MergeCounts = { added: number; skipped: number }`, `MergeResult = { songs: MergeCounts; versions: MergeCounts; playlists: MergeCounts; playlistItems: MergeCounts }`

- [ ] **Step 1: 실패 테스트** — `__tests__/database.backup.test.ts`

```typescript
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
```

- [ ] **Step 2: 실패 확인** — `npm test -- database.backup` → FAIL (mergeImport/getBackupData not exported)

- [ ] **Step 3: 구현** — `lib/database.ts`

`getAllVersions`, `getAllPlaylists`, `getAllPlaylistItems` 앞에 `export` 추가 (3곳: `const getAllVersions` → `export const getAllVersions`, 동일하게 playlists/playlistItems).

파일 끝에 추가:

```typescript
// === 백업/복원 ===

export interface BackupData {
  songs: Song[];
  versions: Version[];
  playlists: Playlist[];
  playlistItems: PlaylistItem[];
}

export const getBackupData = async (): Promise<BackupData> => ({
  songs: await getAllSongs(),
  versions: await getAllVersions(),
  playlists: await getAllPlaylists(),
  playlistItems: await getAllPlaylistItems(),
});

export interface MergeCounts { added: number; skipped: number; }
export interface MergeResult {
  songs: MergeCounts; versions: MergeCounts; playlists: MergeCounts; playlistItems: MergeCounts;
}

// 원시 JSON 레벨에서 id 기준 병합(기존 유지, 중복 skip). Date 변환 불필요.
const mergeCollection = async (key: string, incoming: any[]): Promise<MergeCounts> => {
  const json = await AsyncStorage.getItem(key);
  const existing: any[] = json ? JSON.parse(json) : [];
  const ids = new Set(existing.map((r) => r.id));
  let added = 0, skipped = 0;
  for (const rec of incoming ?? []) {
    if (ids.has(rec.id)) { skipped++; continue; }
    existing.push(rec); ids.add(rec.id); added++;
  }
  await AsyncStorage.setItem(key, JSON.stringify(existing));
  return { added, skipped };
};

export const mergeImport = async (data: {
  songs: any[]; versions: any[]; playlists: any[]; playlistItems: any[];
}): Promise<MergeResult> => ({
  songs: await mergeCollection(KEYS.SONGS, data.songs),
  versions: await mergeCollection(KEYS.VERSIONS, data.versions),
  playlists: await mergeCollection(KEYS.PLAYLISTS, data.playlists),
  playlistItems: await mergeCollection(KEYS.PLAYLIST_ITEMS, data.playlistItems),
});
```

- [ ] **Step 4: 통과 확인** — `npm test -- database.backup` → PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/database.ts __tests__/database.backup.test.ts
git commit -m "feat(db): 백업 수집(getBackupData)·id병합 import(mergeImport)"
```

---

### Task 2: 백업 코어 — manifest 빌드/검증 순수 함수 (`lib/backup.ts`)

**Files:**
- Create: `lib/backup.ts`
- Test: `__tests__/backup.test.ts`
- Modify: `jest.setup.js` (네이티브 모듈 목)

**Interfaces:**
- Consumes: `getBackupData`, `BackupData` (Task 1)
- Produces:
  - `SCHEMA_VERSION = 1`
  - `BackupSelection = {type:'all'} | {type:'song'; songId:string} | {type:'playlist'; playlistId:string} | {type:'songs'; songIds:string[]}`
  - `BackupManifest` (schemaVersion, app:'plilog', exportedAt, exportType, songs, versions, playlists, playlistItems)
  - `buildManifest(sel: BackupSelection, data: BackupData, exportedAt: string): BackupManifest`
  - `parseManifest(text: string): BackupManifest`

- [ ] **Step 1: jest 네이티브 목 추가** — `jest.setup.js` 끝에 추가 (backup.ts가 import하는 네이티브 모듈이 헤드리스에서 깨지지 않게):

```javascript
jest.mock('react-native-zip-archive', () => ({
  zip: jest.fn(async (_src, dest) => dest),
  unzip: jest.fn(async (_src, dest) => dest),
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));
```

- [ ] **Step 2: 실패 테스트** — `__tests__/backup.test.ts`

```typescript
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
```

- [ ] **Step 3: 실패 확인** — `npm test -- backup` → FAIL (모듈 없음)

- [ ] **Step 4: 구현(순수부)** — `lib/backup.ts` (io 함수는 Task 3에서 추가)

```typescript
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
```

- [ ] **Step 5: 통과 확인** — `npm test -- backup` → PASS

- [ ] **Step 6: 커밋**

```bash
git add lib/backup.ts __tests__/backup.test.ts jest.setup.js
git commit -m "feat(backup): manifest 빌드/검증 순수 코어 + 네이티브 목"
```

---

### Task 3: 백업 io — buildBackup / restoreBackup (`lib/backup.ts`)

**Files:**
- Modify: `lib/backup.ts`

**Interfaces:**
- Consumes: `getBackupData`, `mergeImport`, `MergeResult` (Task 1), `saveAudioLocally` (`lib/storage.ts`), `syncDefaultPlaylist` (`lib/database.ts`), `zip`/`unzip` (react-native-zip-archive), `Paths/Directory/File` (expo-file-system)
- Produces:
  - `buildBackup(sel: BackupSelection): Promise<{ uri: string; counts: { songs: number; versions: number } }>`
  - `restoreBackup(zipUri: string): Promise<MergeResult & { audioRestored: number }>`

> 네이티브 zip/fs는 헤드리스 Jest로 동작 검증 불가(목만 존재) → 이 함수들의 실제 동작은 Task 7 dev build 수동 검증. 여기서는 컴파일/타입 일관성만 보장.

- [ ] **Step 1: 구현 추가** — `lib/backup.ts` 상단 import + 하단 io 함수

상단에 import 추가:
```typescript
import { Paths, Directory, File } from 'expo-file-system';
import { zip, unzip } from 'react-native-zip-archive';
import { getBackupData, mergeImport, syncDefaultPlaylist, type MergeResult } from './database';
import { saveAudioLocally } from './storage';
```

파일 하단에 추가:
```typescript
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
```

- [ ] **Step 2: 컴파일 확인** — `npx tsc --noEmit` → `lib/backup.ts` 관련 신규 에러 없음 (기존 PlayerContext/useRecording 경고는 무관, 무시)

- [ ] **Step 3: 전체 테스트 회귀 확인** — `npm test` → 기존 + Task1/2 전부 PASS

- [ ] **Step 4: 커밋**

```bash
git add lib/backup.ts
git commit -m "feat(backup): buildBackup/restoreBackup io (zip·오디오복사·DB병합)"
```

---

### Task 4: 내비게이션 — 설정 탭 + 라우트 (`types/index.ts`, `App.tsx`)

**Files:**
- Modify: `types/index.ts` (RootStackParamList)
- Modify: `App.tsx` (SettingsStack, Tab.Screen, 탭 아이콘 맵)

**Interfaces:**
- Produces: 라우트 `Settings: undefined`, `Export: undefined`; 탭 `SettingsTab`

- [ ] **Step 1: 라우트 타입 추가** — `types/index.ts`의 `RootStackParamList`에 추가:
```typescript
  Settings: undefined;
  Export: undefined;
```

- [ ] **Step 2: 화면 플레이스홀더 생성**(다음 태스크에서 채움) — 컴파일 위해 최소 스텁:
`screens/SettingsScreen.tsx`, `screens/ExportScreen.tsx` 각각:
```typescript
import React from 'react';
import { View } from 'react-native';
export default function SettingsScreen() { return <View />; }
```
(ExportScreen도 동일 패턴, 이름만 ExportScreen)

- [ ] **Step 3: App.tsx 수정** — import 추가:
```typescript
import SettingsScreen from './screens/SettingsScreen';
import ExportScreen from './screens/ExportScreen';
```

`HomeStack`/`PlaylistStack` 선언부 근처에 스택 추가:
```typescript
const SettingsStack = createNativeStackNavigator<RootStackParamList>();
function SettingsStackScreen({ bg }: { bg: string }) {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: bg } }}>
      <SettingsStack.Screen name="Settings" component={SettingsScreen} />
      <SettingsStack.Screen name="Export" component={ExportScreen} />
    </SettingsStack.Navigator>
  );
}
```
(주의: `HomeStackScreen`의 `screenOptions` 구조를 그대로 따라 작성 — 기존 코드 확인 후 동일 옵션 사용)

`Tab.Navigator` 안 `PlaylistTab` 다음에 추가:
```typescript
                <Tab.Screen name="SettingsTab" options={{ tabBarLabel: '설정' }}>
                  {() => <SettingsStackScreen bg={colors.bg} />}
                </Tab.Screen>
```

`CustomTabBar`의 아이콘 분기(라인 ~110)를 맵으로 교체:
```typescript
          const iconByRoute: Record<string, any> = {
            HomeTab: 'musical-notes',
            PlaylistTab: 'albums',
            SettingsTab: 'settings-outline',
          };
          const iconName = iconByRoute[route.name] ?? 'ellipse';
```

- [ ] **Step 4: 컴파일 + 테스트 회귀** — `npx tsc --noEmit`(신규 에러 없음), `npm test`(전체 PASS)

- [ ] **Step 5: 커밋**

```bash
git add types/index.ts App.tsx screens/SettingsScreen.tsx screens/ExportScreen.tsx
git commit -m "feat(nav): 설정 탭 + Settings/Export 라우트 + 탭 아이콘 맵"
```

---

### Task 5: 내보내기 화면 — 4모드 (`screens/ExportScreen.tsx`)

**Files:**
- Modify: `screens/ExportScreen.tsx`
- Test: `__tests__/ExportScreen.test.tsx`

**Interfaces:**
- Consumes: `buildBackup` (Task 3), `getAllSongs`/`getPlaylists` (database), `Sharing.shareAsync`
- 멀티셀렉트는 `PlaylistDetailScreen`의 `Set<string>`+체크박스 패턴 참고.

- [ ] **Step 1: 실패 테스트** — `__tests__/ExportScreen.test.tsx`

```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ExportScreen from '../screens/ExportScreen';
import { buildBackup } from '../lib/backup';
import * as Sharing from 'expo-sharing';

jest.mock('../lib/backup', () => ({ buildBackup: jest.fn(async () => ({ uri: 'file:///b.zip', counts: { songs: 1, versions: 2 } })) }));
jest.mock('../lib/database', () => ({
  getAllSongs: jest.fn(async () => [{ id: 's1', title: '곡1' }]),
  getPlaylists: jest.fn(async () => [{ id: 'p1', name: 'PL1' }]),
}));
const nav = { navigate: jest.fn(), goBack: jest.fn() };
const renderScreen = () => render(<ExportScreen navigation={nav as any} route={{ key: 'Export', name: 'Export' } as any} />);

describe('ExportScreen', () => {
  beforeEach(() => jest.clearAllMocks());
  it('전체 백업 → buildBackup(all) + 공유 호출', async () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('export-all'));
    await waitFor(() => expect(buildBackup).toHaveBeenCalledWith({ type: 'all' }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- ExportScreen` → FAIL

- [ ] **Step 3: 구현** — `screens/ExportScreen.tsx`. 요구 동작:
  - 4개 행: `전체 백업`(testID `export-all`), `노래 선택 백업`(`export-song`), `플레이리스트 선택 백업`(`export-playlist`), `곡 직접 선택 백업`(`export-songs`).
  - 각 실행 공통: `setBusy(true)` → `const { uri } = await buildBackup(sel)` → `await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'plilog 백업' })` → finally `setBusy(false)`. try-catch로 실패 시 `Alert.alert('오류', e.message)`.
  - `노래/곡` 모드: `getAllSongs()`로 목록 모달. 단일(노래)=탭 시 즉시 `{type:'song', songId}`. 멀티(곡 직접)=체크박스 `Set<string>` 토글 후 `내보내기` 버튼 → `{type:'songs', songIds:[...]}`.
  - `플레이리스트` 모드: `getPlaylists()` 목록 모달 → 탭 시 `{type:'playlist', playlistId}`.
  - `ScreenHeader`(뒤로가기) + 테마 토큰 사용. busy 시 `ActivityIndicator` 오버레이.
  - 모든 비동기 try-catch.

  핵심 실행 함수 형태:
```typescript
const runExport = async (sel: BackupSelection) => {
  try {
    setBusy(true);
    const { uri } = await buildBackup(sel);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'plilog 백업' });
    } else {
      Alert.alert('공유 불가', '이 기기에서는 공유를 사용할 수 없습니다.');
    }
  } catch (e: any) {
    Alert.alert('오류', e?.message ?? '백업에 실패했습니다.');
  } finally {
    setBusy(false);
  }
};
```

- [ ] **Step 4: 통과 확인** — `npm test -- ExportScreen` → PASS

- [ ] **Step 5: 커밋**

```bash
git add screens/ExportScreen.tsx __tests__/ExportScreen.test.tsx
git commit -m "feat(export): 내보내기 화면 4모드(전체/노래/플레이리스트/곡선택)"
```

---

### Task 6: 설정 화면 — 백업/복원 진입 + 가져오기 (`screens/SettingsScreen.tsx`)

**Files:**
- Modify: `screens/SettingsScreen.tsx`
- Test: `__tests__/SettingsScreen.test.tsx`

**Interfaces:**
- Consumes: `restoreBackup` (Task 3), `DocumentPicker.getDocumentAsync`, navigation→`Export`

- [ ] **Step 1: 실패 테스트** — `__tests__/SettingsScreen.test.tsx`

```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SettingsScreen from '../screens/SettingsScreen';
import { restoreBackup } from '../lib/backup';
import * as DocumentPicker from 'expo-document-picker';

jest.mock('../lib/backup', () => ({
  restoreBackup: jest.fn(async () => ({ songs: { added: 1, skipped: 0 }, versions: { added: 2, skipped: 1 }, playlists: { added: 0, skipped: 0 }, playlistItems: { added: 0, skipped: 0 }, audioRestored: 2 })),
}));
const nav = { navigate: jest.fn() };
const renderScreen = () => render(<SettingsScreen navigation={nav as any} route={{ key: 'Settings', name: 'Settings' } as any} />);

describe('SettingsScreen', () => {
  beforeEach(() => jest.clearAllMocks());
  it('내보내기 행 → Export 이동', () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('settings-export'));
    expect(nav.navigate).toHaveBeenCalledWith('Export');
  });
  it('가져오기 → 파일 선택 시 restoreBackup 호출', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///b.zip', name: 'b.zip' }] });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('settings-import'));
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith('file:///b.zip'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled()); // 완료 요약
  });
  it('가져오기 취소 시 restoreBackup 미호출', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('settings-import'));
    await waitFor(() => expect(restoreBackup).not.toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: 실패 확인** — `npm test -- SettingsScreen` → FAIL

- [ ] **Step 3: 구현** — `screens/SettingsScreen.tsx`. 요구 동작:
  - `ScreenHeader` "설정". 섹션 헤더 "백업 / 복원".
  - 행 `내보내기 (백업 만들기)` testID `settings-export` → `navigation.navigate('Export')`.
  - 행 `가져오기 (백업 복원)` testID `settings-import` → 핸들러:
```typescript
const handleImport = async () => {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/octet-stream', '*/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    setBusy(true);
    const r = await restoreBackup(res.assets[0].uri);
    Alert.alert('복원 완료', `곡 ${r.songs.added}개 · 버전 ${r.versions.added}개 복원 (중복 ${r.songs.skipped + r.versions.skipped}개 건너뜀).`);
  } catch (e: any) {
    Alert.alert('복원 실패', e?.message ?? '백업을 복원하지 못했습니다.');
  } finally {
    setBusy(false);
  }
};
```
  - busy 시 `ActivityIndicator` 오버레이. 테마 토큰 사용. import: `import * as DocumentPicker from 'expo-document-picker'`.

- [ ] **Step 4: 통과 확인** — `npm test -- SettingsScreen` → PASS

- [ ] **Step 5: 전체 회귀 + 커밋**

```bash
npm test   # 전체 PASS 확인
git add screens/SettingsScreen.tsx __tests__/SettingsScreen.test.tsx
git commit -m "feat(settings): 설정 화면 + 백업 내보내기/가져오기(복원) 진입"
```

---

### Task 7: dev build 수동 검증 (실기기/시뮬레이터)

> 네이티브 zip/unzip/document-picker는 헤드리스 불가 → dev build에서 직접 검증.

- [ ] **Step 1: prebuild + 실행** — `npx expo prebuild --clean` → `npx expo run:android`(또는 preview APK 재빌드 `eas build -p android --profile preview`).
- [ ] **Step 2: 내보내기 시나리오** — 설정 탭 → 내보내기 → 4모드 각각 실행 → 공유시트로 Drive/파일 저장 → zip 안에 `manifest.json` + `audio/*.m4a` 확인.
- [ ] **Step 3: 가져오기 시나리오** — 다른(또는 초기화된) 상태에서 설정 → 가져오기 → zip 선택 → 복원 요약 확인 → 곡/버전/메모/별점/플레이리스트 + 오디오 재생 정상.
- [ ] **Step 4: 중복 재import** — 같은 zip 재가져오기 → 중복 skip(데이터 안 늘어남) 확인.
- [ ] **Step 5: 결과 기록** — 커밋/PR에 요약.

---

## Self-Review

- **스펙 커버리지:** 설정 탭(T4)·내보내기 4모드(T5)·가져오기/복원(T6)·번들 포맷&코어(T2/T3)·DB 병합(T1)·기기검증(T7) — 스펙 전 항목 매핑됨.
- **플레이스홀더:** 순수 로직(T1/T2)·DB는 완전 코드. UI(T5/T6)는 testID·핵심 핸들러 코드 명시 + 동작 명세(목록 모달/멀티셀렉트는 기존 `PlaylistDetailScreen` 패턴 재사용 지시). 네이티브 io(T3)는 완전 코드.
- **타입 일관성:** `BackupSelection`/`BackupManifest`/`MergeResult`/`buildManifest`/`parseManifest`/`buildBackup`/`restoreBackup`/`mergeImport`/`getBackupData` 시그니처가 T1~T6에서 일치.
- **회귀:** 설정 탭 1개 추가 외 기존 화면 비침투. 기존 83 테스트 유지.
</content>
