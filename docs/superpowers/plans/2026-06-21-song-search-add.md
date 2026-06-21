# 곡 검색 기반 추가 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 곡 추가를 "제목/아티스트 직접 타이핑"에서 "검색해서 고르기"(iTunes 결과 + 내 곡 재사용 + 직접 추가)로 교체한다.

**Architecture:** iTunes Search API를 호출하는 순수 클라이언트 모듈(`lib/itunes.ts`)을 추가하고, 홈의 `+`가 여는 모달을 검색 모달(`components/SongSearchModal.tsx`)로 교체한다. 곡 메타데이터(앨범아트 등)는 `Song`에 선택 필드로 저장한다. 앨범아트 표시는 작은 공용 컴포넌트로 DRY 처리.

**Tech Stack:** React Native + Expo, TypeScript strict, AsyncStorage, Jest(jest-expo) + React Native Testing Library v13.

## Global Constraints

- 함수형 컴포넌트만, async/await, `StyleSheet` 사용(Tailwind 금지), 모든 비동기에 try-catch. (CLAUDE.md)
- 색상/간격은 `lib/theme`(`colors`, `spacing`, `borderRadius`, `typography`) 사용.
- 외부 모듈(AsyncStorage, fetch, @expo/vector-icons)은 `jest.setup.js` 또는 테스트 내에서 목 처리.
- `@testing-library/react-native`는 v13 라인. jest-expo 54 preset.
- E2E로 잡을 UI 요소엔 `testID` 부여.
- 새 곡 메타 필드는 모두 **선택(optional)** — 기존 저장 데이터와 호환.

---

### Task 1: iTunes 검색 클라이언트 (`lib/itunes.ts`)

**Files:**
- Create: `lib/itunes.ts`
- Test: `__tests__/itunes.test.ts`

**Interfaces:**
- Produces:
  - `interface ITunesTrack { itunesTrackId: number; trackName: string; artistName: string; artworkUrl?: string; previewUrl?: string }`
  - `function searchTracks(term: string): Promise<ITunesTrack[]>`

- [ ] **Step 1: 실패하는 테스트 작성** — `__tests__/itunes.test.ts`

```typescript
describe('searchTracks', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  const okResponse = (body: any) => ({ ok: true, status: 200, json: async () => body });

  it('빈/공백 검색어는 네트워크 호출 없이 빈 배열', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const { searchTracks } = require('../lib/itunes');
    expect(await searchTracks('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('iTunes 응답을 ITunesTrack[]로 매핑하고 country=kr/media=music로 호출', async () => {
    const fetchMock = jest.fn(async () => okResponse({
      results: [
        { trackId: 1, trackName: '좋은날', artistName: '아이유', artworkUrl100: 'http://a/100.jpg', previewUrl: 'http://a/p.m4a' },
      ],
    }));
    global.fetch = fetchMock as any;
    const { searchTracks } = require('../lib/itunes');
    const res = await searchTracks('아이유');
    expect(res).toEqual([
      { itunesTrackId: 1, trackName: '좋은날', artistName: '아이유', artworkUrl: 'http://a/100.jpg', previewUrl: 'http://a/p.m4a' },
    ]);
    const calledUrl = (fetchMock.mock.calls[0][0] as string);
    expect(calledUrl).toContain('country=kr');
    expect(calledUrl).toContain('media=music');
    expect(calledUrl).toContain(encodeURIComponent('아이유'));
  });

  it('trackName/artistName/trackId 없는 항목은 걸러낸다', async () => {
    global.fetch = jest.fn(async () => okResponse({ results: [
      { trackId: 1, trackName: 'A', artistName: 'B' },
      { trackName: 'NoId', artistName: 'X' },
      { trackId: 2, artistName: 'Y' },
    ] })) as any;
    const { searchTracks } = require('../lib/itunes');
    const res = await searchTracks('q');
    expect(res).toHaveLength(1);
    expect(res[0].itunesTrackId).toBe(1);
  });

  it('HTTP 비정상 응답이면 throw', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as any;
    const { searchTracks } = require('../lib/itunes');
    await expect(searchTracks('q')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인** — Run: `npm test -- itunes` · Expected: FAIL (`Cannot find module '../lib/itunes'`)

- [ ] **Step 3: 구현** — `lib/itunes.ts`

```typescript
export interface ITunesTrack {
  itunesTrackId: number;
  trackName: string;
  artistName: string;
  artworkUrl?: string;
  previewUrl?: string;
}

const ENDPOINT = 'https://itunes.apple.com/search';
const TIMEOUT_MS = 8000;

export async function searchTracks(term: string): Promise<ITunesTrack[]> {
  const trimmed = term.trim();
  if (trimmed.length === 0) return [];

  const url = `${ENDPOINT}?term=${encodeURIComponent(trimmed)}&country=kr&media=music&limit=20`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`iTunes 검색 실패: ${res.status}`);
    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    return results
      .filter((r: any) => r && r.trackName && r.artistName && typeof r.trackId === 'number')
      .map((r: any) => ({
        itunesTrackId: r.trackId,
        trackName: String(r.trackName),
        artistName: String(r.artistName),
        artworkUrl: r.artworkUrl100 ?? undefined,
        previewUrl: r.previewUrl ?? undefined,
      }));
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm test -- itunes` · Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/itunes.ts __tests__/itunes.test.ts
git commit -m "feat: iTunes 곡 검색 클라이언트(lib/itunes) 추가"
```

---

### Task 2: `Song` 메타데이터 필드 + `addSong` 확장

**Files:**
- Modify: `types/index.ts` (Song 인터페이스)
- Modify: `lib/database.ts:23-41` (addSong)
- Test: `__tests__/database.test.ts` (기존 파일에 케이스 추가)

**Interfaces:**
- Consumes: `ITunesTrack`(필요 시 호출부에서 변환)
- Produces:
  - `interface SongMeta { artworkUrl?: string; itunesTrackId?: number; previewUrl?: string }`
  - `addSong(title: string, artist?: string, meta?: SongMeta): Promise<string>`
  - `Song`에 `artworkUrl?`, `itunesTrackId?`, `previewUrl?` 추가

- [ ] **Step 1: 실패하는 테스트 추가** — `__tests__/database.test.ts` 안에 새 describe

```typescript
import { addSong, getSong } from '../lib/database';

describe('addSong 메타데이터', () => {
  it('meta를 전달하면 Song에 artworkUrl/itunesTrackId/previewUrl이 저장된다', async () => {
    const id = await addSong('좋은날', '아이유', {
      artworkUrl: 'http://a/100.jpg', itunesTrackId: 42, previewUrl: 'http://a/p.m4a',
    });
    const song = await getSong(id);
    expect(song?.artworkUrl).toBe('http://a/100.jpg');
    expect(song?.itunesTrackId).toBe(42);
    expect(song?.previewUrl).toBe('http://a/p.m4a');
  });

  it('meta 없이도 기존처럼 동작한다', async () => {
    const id = await addSong('무제');
    const song = await getSong(id);
    expect(song?.title).toBe('무제');
    expect(song?.artworkUrl).toBeUndefined();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- database` · Expected: FAIL (artworkUrl undefined / 타입 에러)

- [ ] **Step 3: 타입 추가** — `types/index.ts`의 `Song`에 필드 추가

```typescript
export interface Song {
  id: string;
  title: string;
  artist?: string;
  createdAt: Date;
  updatedAt: Date;
  defaultVersionId?: string;
  artworkUrl?: string;
  itunesTrackId?: number;
  previewUrl?: string;
}
```

- [ ] **Step 4: addSong 확장** — `lib/database.ts`

```typescript
export interface SongMeta {
  artworkUrl?: string;
  itunesTrackId?: number;
  previewUrl?: string;
}

export const addSong = async (title: string, artist?: string, meta?: SongMeta): Promise<string> => {
  const now = new Date();
  const songId = generateId();

  const newSong: Song = {
    id: songId,
    title,
    artist: artist || undefined,
    createdAt: now,
    updatedAt: now,
    defaultVersionId: undefined,
    artworkUrl: meta?.artworkUrl,
    itunesTrackId: meta?.itunesTrackId,
    previewUrl: meta?.previewUrl,
  };

  const songs = await getAllSongs();
  songs.push(newSong);
  await AsyncStorage.setItem(KEYS.SONGS, JSON.stringify(songs));

  return songId;
};
```

- [ ] **Step 5: 통과 확인** — Run: `npm test -- database` · Expected: PASS (기존 + 신규)

- [ ] **Step 6: 커밋**

```bash
git add types/index.ts lib/database.ts __tests__/database.test.ts
git commit -m "feat: Song에 곡 메타데이터(앨범아트 등) 필드 + addSong meta 인자"
```

---

### Task 3: 앨범아트 공용 컴포넌트 (`components/AlbumArt.tsx`)

**Files:**
- Create: `components/AlbumArt.tsx`
- Test: `__tests__/AlbumArt.test.tsx`

**Interfaces:**
- Produces: `function AlbumArt(props: { uri?: string; size: number; iconSize?: number; borderRadius?: number }): JSX.Element`
  - `uri` 있으면 `Image`, 없으면 `colors.surface` 배경 + `musical-notes` 아이콘.

- [ ] **Step 1: 실패하는 테스트** — `__tests__/AlbumArt.test.tsx`

```typescript
import React from 'react';
import { render } from '@testing-library/react-native';
import { AlbumArt } from '../components/AlbumArt';

describe('AlbumArt', () => {
  it('uri 없으면 음표 아이콘 폴백을 보여준다', () => {
    const { getByTestId } = render(<AlbumArt size={48} />);
    expect(getByTestId('icon-musical-notes')).toBeTruthy();
  });

  it('uri 있으면 Image(testID=album-art-image)를 렌더한다', () => {
    const { getByTestId, queryByTestId } = render(<AlbumArt size={48} uri="http://a/100.jpg" />);
    expect(getByTestId('album-art-image')).toBeTruthy();
    expect(queryByTestId('icon-musical-notes')).toBeNull();
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- AlbumArt` · Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `components/AlbumArt.tsx`

```tsx
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius as radii } from '../lib/theme';

interface Props {
  uri?: string;
  size: number;
  iconSize?: number;
  borderRadius?: number;
}

export function AlbumArt({ uri, size, iconSize, borderRadius }: Props) {
  const r = borderRadius ?? radii.md;
  if (uri) {
    return (
      <Image
        testID="album-art-image"
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: r, backgroundColor: colors.surfaceLight }}
      />
    );
  }
  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: r }]}>
      <Ionicons name="musical-notes" size={iconSize ?? Math.round(size / 2)} color={colors.textSecondary} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
```

- [ ] **Step 4: 통과 확인** — Run: `npm test -- AlbumArt` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add components/AlbumArt.tsx __tests__/AlbumArt.test.tsx
git commit -m "feat: 앨범아트 공용 컴포넌트(AlbumArt) 추가"
```

---

### Task 4: 검색 모달 (`components/SongSearchModal.tsx`)

**Files:**
- Create: `components/SongSearchModal.tsx`
- Test: `__tests__/SongSearchModal.test.tsx`

**Interfaces:**
- Consumes: `searchTracks` (lib/itunes), `getAllSongs`/`addSong` (lib/database), `matchesSearch` (lib/search), `AlbumArt`.
- Produces: `function SongSearchModal(props: { visible: boolean; onClose: () => void; onNavigateToSong: (songId: string) => void }): JSX.Element`

동작 요약:
- 열릴 때 `getAllSongs()`로 로컬 곡 로드. 검색어 입력은 300ms 디바운스 후 `searchTracks` 호출.
- 두 섹션: **내 곡**(로컬, `matchesSearch(title+artist)`), **검색 결과**(iTunes). iTunes 결과 중 이미 라이브러리에 있는 곡(itunesTrackId 일치 또는 title+artist 일치)은 제외.
- 로컬 항목 탭 → `onNavigateToSong(song.id)` 후 `onClose`.
- iTunes 항목 탭 → `addSong(trackName, artistName, {meta})` → `onNavigateToSong(newId)` 후 `onClose`.
- "직접 추가" 버튼(`testID="manual-add-button"`) → `mode='manual'`로 전환(제목에 현재 검색어 prefill). 저장 시 `addSong(title, artist)` → navigate.
- iTunes 호출 실패 시 `검색 결과를 불러오지 못했어요` 표시(내 곡/직접추가는 계속 동작).

- [ ] **Step 1: 실패하는 테스트** — `__tests__/SongSearchModal.test.tsx`

```typescript
import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('../lib/itunes', () => ({ searchTracks: jest.fn() }));
jest.mock('../lib/database', () => ({ getAllSongs: jest.fn(), addSong: jest.fn() }));

import { SongSearchModal } from '../components/SongSearchModal';
import { searchTracks } from '../lib/itunes';
import { getAllSongs, addSong } from '../lib/database';

const baseSong = (over: any) => ({
  id: 'l1', title: '내곡', artist: '나', createdAt: new Date(), updatedAt: new Date(), ...over,
});

describe('SongSearchModal', () => {
  beforeEach(() => {
    (getAllSongs as jest.Mock).mockResolvedValue([baseSong({})]);
    (searchTracks as jest.Mock).mockResolvedValue([]);
    (addSong as jest.Mock).mockResolvedValue('new-id');
    jest.useFakeTimers();
  });
  afterEach(() => { jest.useRealTimers(); });

  it('검색어 입력 시 디바운스 후 searchTracks 호출', async () => {
    (searchTracks as jest.Mock).mockResolvedValue([
      { itunesTrackId: 7, trackName: '좋은날', artistName: '아이유', artworkUrl: 'http://a.jpg' },
    ]);
    const r = render(<SongSearchModal visible onClose={jest.fn()} onNavigateToSong={jest.fn()} />);
    await act(async () => {}); // 초기 getAllSongs 반영
    fireEvent.changeText(r.getByTestId('song-search-input'), '아이유');
    await act(async () => { jest.advanceTimersByTime(300); });
    await waitFor(() => expect(searchTracks).toHaveBeenCalledWith('아이유'));
    expect(r.getByText('좋은날')).toBeTruthy();
  });

  it('iTunes 결과 선택 시 addSong(meta) 후 onNavigateToSong', async () => {
    (searchTracks as jest.Mock).mockResolvedValue([
      { itunesTrackId: 7, trackName: '좋은날', artistName: '아이유', artworkUrl: 'http://a.jpg', previewUrl: 'http://p.m4a' },
    ]);
    const onNav = jest.fn();
    const r = render(<SongSearchModal visible onClose={jest.fn()} onNavigateToSong={onNav} />);
    await act(async () => {});
    fireEvent.changeText(r.getByTestId('song-search-input'), '아이유');
    await act(async () => { jest.advanceTimersByTime(300); });
    await waitFor(() => r.getByText('좋은날'));
    await act(async () => { fireEvent.press(r.getByText('좋은날')); });
    expect(addSong).toHaveBeenCalledWith('좋은날', '아이유', {
      artworkUrl: 'http://a.jpg', itunesTrackId: 7, previewUrl: 'http://p.m4a',
    });
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('new-id'));
  });

  it('내 곡 항목 선택 시 새로 추가하지 않고 기존 곡으로 이동(재사용)', async () => {
    const onNav = jest.fn();
    const r = render(<SongSearchModal visible onClose={jest.fn()} onNavigateToSong={onNav} />);
    await act(async () => {});
    fireEvent.changeText(r.getByTestId('song-search-input'), '내곡');
    await act(async () => { jest.advanceTimersByTime(300); });
    await act(async () => { fireEvent.press(r.getByText('내곡')); });
    expect(addSong).not.toHaveBeenCalled();
    expect(onNav).toHaveBeenCalledWith('l1');
  });

  it('직접 추가 버튼 → 제목 입력 후 저장하면 addSong 호출', async () => {
    const onNav = jest.fn();
    const r = render(<SongSearchModal visible onClose={jest.fn()} onNavigateToSong={onNav} />);
    await act(async () => {});
    fireEvent.press(r.getByTestId('manual-add-button'));
    fireEvent.changeText(r.getByTestId('manual-title-input'), '직접곡');
    await act(async () => { fireEvent.press(r.getByTestId('manual-submit-button')); });
    expect(addSong).toHaveBeenCalledWith('직접곡', undefined);
    await waitFor(() => expect(onNav).toHaveBeenCalledWith('new-id'));
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- SongSearchModal` · Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `components/SongSearchModal.tsx`

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAllSongs, addSong } from '../lib/database';
import { searchTracks, ITunesTrack } from '../lib/itunes';
import { matchesSearch } from '../lib/search';
import { Song } from '../types';
import { AlbumArt } from './AlbumArt';
import { colors, spacing, borderRadius, typography } from '../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onNavigateToSong: (songId: string) => void;
}

export function SongSearchModal({ visible, onClose, onNavigateToSong }: Props) {
  const [query, setQuery] = useState('');
  const [localSongs, setLocalSongs] = useState<Song[]>([]);
  const [results, setResults] = useState<ITunesTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'search' | 'manual'>('search');
  const [manualTitle, setManualTitle] = useState('');
  const [manualArtist, setManualArtist] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setQuery(''); setResults([]); setError(false); setMode('search');
    setManualTitle(''); setManualArtist('');
    (async () => {
      try { setLocalSongs(await getAllSongs()); } catch { setLocalSongs([]); }
    })();
  }, [visible]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length === 0) { setResults([]); setError(false); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        setError(false);
        setResults(await searchTracks(query));
      } catch {
        setError(true); setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const localMatches = localSongs.filter(
    (s) => matchesSearch(s.title, query) || (s.artist ? matchesSearch(s.artist, query) : false)
  );

  // 이미 라이브러리에 있는 iTunes 결과는 제외(중복 방지)
  const filteredResults = results.filter((t) => !localSongs.some(
    (s) => (s.itunesTrackId && s.itunesTrackId === t.itunesTrackId)
      || (s.title === t.trackName && (s.artist ?? '') === t.artistName)
  ));

  const handlePickLocal = (song: Song) => { onNavigateToSong(song.id); onClose(); };

  const handlePickItunes = useCallback(async (t: ITunesTrack) => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await addSong(t.trackName, t.artistName, {
        artworkUrl: t.artworkUrl, itunesTrackId: t.itunesTrackId, previewUrl: t.previewUrl,
      });
      onNavigateToSong(id); onClose();
    } catch {
      Alert.alert('오류', '곡 추가에 실패했습니다.');
    } finally { setBusy(false); }
  }, [busy, onNavigateToSong, onClose]);

  const handleManualSubmit = useCallback(async () => {
    if (manualTitle.trim().length === 0) { Alert.alert('알림', '곡 제목을 입력하세요.'); return; }
    if (busy) return;
    setBusy(true);
    try {
      const id = await addSong(manualTitle.trim(), manualArtist.trim() || undefined);
      onNavigateToSong(id); onClose();
    } catch {
      Alert.alert('오류', '곡 추가에 실패했습니다.');
    } finally { setBusy(false); }
  }, [manualTitle, manualArtist, busy, onNavigateToSong, onClose]);

  const openManual = () => { setManualTitle(query.trim()); setMode('manual'); };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{mode === 'manual' ? '직접 추가' : '곡 추가'}</Text>
            <TouchableOpacity onPress={onClose} testID="search-close-button">
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {mode === 'manual' ? (
            <View>
              <TextInput
                testID="manual-title-input"
                style={styles.input} placeholder="곡 제목" placeholderTextColor={colors.textTertiary}
                value={manualTitle} onChangeText={setManualTitle} editable={!busy}
              />
              <TextInput
                testID="manual-artist-input"
                style={styles.input} placeholder="아티스트 (선택)" placeholderTextColor={colors.textTertiary}
                value={manualArtist} onChangeText={setManualArtist} editable={!busy}
              />
              <View style={styles.manualButtons}>
                <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setMode('search')} disabled={busy}>
                  <Text style={styles.btnGhostText}>검색으로</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="manual-submit-button" style={[styles.btn, styles.btnPrimary]} onPress={handleManualSubmit} disabled={busy}>
                  {busy ? <ActivityIndicator color={colors.background} /> : <Text style={styles.btnPrimaryText}>추가</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color={colors.textTertiary} />
                <TextInput
                  testID="song-search-input"
                  style={styles.searchInput} placeholder="곡 제목 또는 가수로 검색" placeholderTextColor={colors.textTertiary}
                  value={query} onChangeText={setQuery} autoFocus returnKeyType="search"
                />
              </View>

              <FlatList
                data={[]}
                keyExtractor={() => 'x'}
                renderItem={null as any}
                ListHeaderComponent={
                  <View>
                    {localMatches.length > 0 && (
                      <View style={styles.section}>
                        <Text style={styles.sectionTitle}>내 곡</Text>
                        {localMatches.map((s) => (
                          <TouchableOpacity key={s.id} style={styles.row} onPress={() => handlePickLocal(s)}>
                            <AlbumArt uri={s.artworkUrl} size={40} />
                            <View style={styles.rowText}>
                              <Text style={styles.rowTitle} numberOfLines={1}>{s.title}</Text>
                              {s.artist ? <Text style={styles.rowSub} numberOfLines={1}>{s.artist}</Text> : null}
                            </View>
                            <Ionicons name="arrow-forward" size={16} color={colors.textTertiary} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>검색 결과</Text>
                      {loading && <ActivityIndicator color={colors.primary} style={{ paddingVertical: spacing.lg }} />}
                      {!loading && error && <Text style={styles.muted}>검색 결과를 불러오지 못했어요</Text>}
                      {!loading && !error && query.trim().length > 0 && filteredResults.length === 0 && (
                        <Text style={styles.muted}>검색 결과가 없어요</Text>
                      )}
                      {!loading && filteredResults.map((t) => (
                        <TouchableOpacity key={t.itunesTrackId} style={styles.row} onPress={() => handlePickItunes(t)} disabled={busy}>
                          <AlbumArt uri={t.artworkUrl} size={40} />
                          <View style={styles.rowText}>
                            <Text style={styles.rowTitle} numberOfLines={1}>{t.trackName}</Text>
                            <Text style={styles.rowSub} numberOfLines={1}>{t.artistName}</Text>
                          </View>
                          <Ionicons name="add" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                      ))}
                    </View>

                    <TouchableOpacity testID="manual-add-button" style={styles.manualLink} onPress={openManual}>
                      <Ionicons name="create-outline" size={18} color={colors.primary} />
                      <Text style={styles.manualLinkText}>찾는 곡이 없나요? 직접 추가</Text>
                    </TouchableOpacity>
                  </View>
                }
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xl, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { ...typography.h3, color: colors.textPrimary },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  searchInput: { flex: 1, ...typography.body, color: colors.textPrimary, padding: 0 },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
  rowSub: { ...typography.bodySmall, color: colors.textSecondary },
  muted: { ...typography.bodySmall, color: colors.textTertiary, paddingVertical: spacing.md },
  manualLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, justifyContent: 'center' },
  manualLinkText: { ...typography.body, color: colors.primary, fontWeight: '600' },
  input: { backgroundColor: colors.surfaceLight, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, ...typography.body, color: colors.textPrimary, marginBottom: spacing.md },
  manualButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: borderRadius.md, alignItems: 'center' },
  btnGhost: { backgroundColor: colors.surfaceLight },
  btnGhostText: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { ...typography.body, fontWeight: '600', color: colors.background },
});
```

- [ ] **Step 4: 통과 확인** — Run: `npm test -- SongSearchModal` · Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add components/SongSearchModal.tsx __tests__/SongSearchModal.test.tsx
git commit -m "feat: 곡 검색 모달(내 곡 재사용 + iTunes + 직접 추가)"
```

---

### Task 5: 홈 화면에 검색 모달 연결 + 라이브러리 검색 보강 + 앨범아트

**Files:**
- Modify: `screens/HomeScreen.tsx`

**Interfaces:**
- Consumes: `SongSearchModal`, `AlbumArt`.

변경점:
- 기존 곡 추가 모달(제목/아티스트 입력 + `handleAddSong` + 관련 state `modalVisible`,`title`,`artist`,`adding`)을 제거하고 `<SongSearchModal>`로 교체.
- `+` 및 빈 상태 추가 버튼 → `setSearchModalVisible(true)`.
- `onNavigateToSong={(id) => navigation.navigate('SongDetail', { songId: id })}`.
- 라이브러리 필터를 제목+아티스트로 보강.
- 곡 카드 썸네일을 `AlbumArt`로 교체(`item.artworkUrl`).

- [ ] **Step 1: import 추가**

```tsx
import { SongSearchModal } from '../components/SongSearchModal';
import { AlbumArt } from '../components/AlbumArt';
```

- [ ] **Step 2: state 교체** — `modalVisible/title/artist/adding` 관련 제거, 추가:

```tsx
const [searchModalVisible, setSearchModalVisible] = useState(false);
```
(`handleAddSong` 함수 삭제. `Modal/TextInput/KeyboardAvoidingView/ActivityIndicator/Platform/Alert` 중 미사용분 import 정리.)

- [ ] **Step 3: 라이브러리 필터 보강** — `filteredSongs`

```tsx
const filteredSongs = songs
  ? songs.filter((song) =>
      matchesSearch(song.title, searchQuery) ||
      (song.artist ? matchesSearch(song.artist, searchQuery) : false)
    )
  : [];
```

- [ ] **Step 4: 카드 썸네일 교체** — `SongItem`의 `songThumbnail` View를 교체

```tsx
<AlbumArt uri={item.artworkUrl} size={48} iconSize={24} />
```
(`styles.songThumbnail` 제거 가능)

- [ ] **Step 5: 추가 버튼/모달 교체**

```tsx
// 헤더
<ScreenHeader onAddPress={() => setSearchModalVisible(true)} />
// 빈 상태 버튼 onPress={() => setSearchModalVisible(true)}
// 기존 "곡 추가 모달" <Modal>...</Modal> 전체를 삭제하고 아래로 대체:
<SongSearchModal
  visible={searchModalVisible}
  onClose={() => setSearchModalVisible(false)}
  onNavigateToSong={(id) => {
    setSearchModalVisible(false);
    navigation.navigate('SongDetail', { songId: id });
  }}
/>
```

- [ ] **Step 6: 타입체크 + 기존 테스트 통과 확인**

Run: `npx tsc --noEmit` · Expected: 에러 없음
Run: `npm test` · Expected: 전체 PASS (기존 ScreenHeader 등 포함)

- [ ] **Step 7: 커밋**

```bash
git add screens/HomeScreen.tsx
git commit -m "feat: 홈 곡 추가를 검색 모달로 교체 + 제목/아티스트 검색·앨범아트"
```

---

### Task 6: 곡 상세 헤더 앨범아트 표시

**Files:**
- Modify: `screens/SongDetailScreen.tsx:258-261` (albumArt View)

- [ ] **Step 1: import + 교체** — `import { AlbumArt } from '../components/AlbumArt';`

상세 헤더의 albumArt View(음표 아이콘)를 교체:

```tsx
<AlbumArt uri={song.artworkUrl} size={160} iconSize={48} borderRadius={borderRadius.lg} />
```
(`styles.albumArt` 제거 가능)

- [ ] **Step 2: 타입체크/테스트**

Run: `npx tsc --noEmit && npm test` · Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add screens/SongDetailScreen.tsx
git commit -m "feat: 곡 상세 헤더에 앨범아트 표시"
```

---

## Self-Review

- **Spec 커버리지:** 검색 모듈(T1), Song 메타(T2), 앨범아트(T3), 검색 모달=내 곡 재사용+iTunes+직접추가(T4), 홈 연결+제목/아티스트 검색(T5), 상세 앨범아트(T6). 추천 기능은 비범위(미구현). previewUrl 저장만(T2/T4) — UI 미노출. ✔
- **플레이스홀더:** 없음. 모든 step에 실제 코드/명령/기대출력 포함. ✔
- **타입 일관성:** `ITunesTrack`(itunesTrackId/trackName/artistName/artworkUrl/previewUrl), `SongMeta`(artworkUrl/itunesTrackId/previewUrl), `addSong(title, artist?, meta?)`, `searchTracks(term)`, `AlbumArt({uri,size,iconSize?,borderRadius?})`, `SongSearchModal({visible,onClose,onNavigateToSong})` — 태스크 간 일치. ✔
