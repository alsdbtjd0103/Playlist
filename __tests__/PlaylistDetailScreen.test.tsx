import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import PlaylistDetailScreen from '../screens/PlaylistDetailScreen';
import { ThemeProvider } from '../contexts/ThemeContext';
import { getPlaylistWithDetails, getSongsWithVersions, addManyToPlaylist, removeFromPlaylist } from '../lib/database';

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});
jest.mock('../lib/analytics', () => ({ logEvent: jest.fn(), logScreen: jest.fn() }));
const mockSyncQueue = jest.fn();
const mockSetPlaylist = jest.fn();
jest.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => ({ setPlaylist: mockSetPlaylist, syncQueue: mockSyncQueue, playlistState: null, currentTrack: null }),
}));
jest.mock('react-native-gesture-handler', () => {
  const { TouchableOpacity } = require('react-native');
  return { TouchableOpacity };
});
jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react');
  const { FlatList, View } = require('react-native');
  const DraggableFlatList = ({ renderItem, ListHeaderComponent, data, keyExtractor }: any) => (
    <FlatList
      data={data}
      keyExtractor={keyExtractor}
      ListHeaderComponent={ListHeaderComponent}
      renderItem={({ item, index }: any) =>
        renderItem({ item, getIndex: () => index, drag: jest.fn(), isActive: false })
      }
    />
  );
  return { __esModule: true, default: DraggableFlatList, ScaleDecorator: ({ children }: any) => <View>{children}</View> };
});
jest.mock('../lib/database', () => ({
  getPlaylistWithDetails: jest.fn(),
  getSongsWithVersions: jest.fn(),
  addManyToPlaylist: jest.fn(async (_id: string, ids: string[]) => ids.length),
  removeFromPlaylist: jest.fn(async () => {}),
  reorderPlaylistItems: jest.fn(async () => {}),
  updateSongDefaultVersion: jest.fn(async () => {}),
  renamePlaylist: jest.fn(async () => {}),
  deletePlaylist: jest.fn(async () => {}),
}));

const d = (s: string) => new Date(s);
const s1 = { id: 's1', title: '밤편지', artist: '아이유', createdAt: d('2026-01-01'), updatedAt: d('2026-01-01'), defaultVersionId: 'v1' };
const s2 = { id: 's2', title: '좋은 날', artist: '아이유', createdAt: d('2026-01-01'), updatedAt: d('2026-01-01') };
const ver = (id: string, songId: string, at: string) => ({ id, songId, fileName: `${id}.m4a`, storageUrl: `file://${id}`, rating: 4, recordedAt: d(at) });
const v1 = ver('v1', 's1', '2026-02-01');
const v1b = ver('v1b', 's1', '2026-03-01');
const v2a = ver('v2a', 's2', '2026-02-01');
const v2b = ver('v2b', 's2', '2026-03-01');

const base = { id: 'p1', name: '드라이브', isDefault: false, createdAt: d('2026-01-01'), updatedAt: d('2026-01-01') };
const nav = { navigate: jest.fn(), goBack: jest.fn() };
const renderScreen = () =>
  render(
    <ThemeProvider>
      <PlaylistDetailScreen navigation={nav as any} route={{ key: 'PD', name: 'PlaylistDetail', params: { playlistId: 'p1' } } as any} />
    </ThemeProvider>
  );

describe('PlaylistDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getSongsWithVersions as jest.Mock).mockResolvedValue([
      { song: s1, versions: [v1b, v1] },
      { song: s2, versions: [v2b, v2a] },
    ]);
  });

  it('대표곡 플레이리스트가 비어 있으면 안내 문구를 보여 주고 곡 추가 버튼은 없다', async () => {
    (getPlaylistWithDetails as jest.Mock).mockResolvedValue({ ...base, name: '대표곡', isDefault: true, items: [] });
    const { findByText, queryByTestId } = renderScreen();
    expect(await findByText('곡 상세에서 대표 버전을 지정하면 여기에 자동으로 추가돼요')).toBeTruthy();
    expect(queryByTestId('playlist-add-songs')).toBeNull();
  });

  it('곡 추가 시트: 곡 행은 대표(없으면 최신) 버전, 펼친 버전 체크까지 addManyToPlaylist로 보낸다', async () => {
    (getPlaylistWithDetails as jest.Mock).mockResolvedValue({ ...base, items: [] });
    const { findByText, getByTestId, findByTestId, getByText } = renderScreen();
    await findByText('아직 곡이 없어요');
    fireEvent.press(getByTestId('playlist-add-songs'));
    fireEvent.press(await findByTestId('add-song-s1')); // 대표 v1
    fireEvent.press(getByTestId('add-song-s2')); // 대표 없음 → 최신 v2b
    fireEvent.press(getByTestId('add-expand-s2'));
    fireEvent.press(getByTestId('add-version-v2a'));
    expect(getByText('3곡 추가')).toBeTruthy();
    fireEvent.press(getByTestId('add-songs-confirm'));
    await waitFor(() => expect(addManyToPlaylist).toHaveBeenCalledWith('p1', ['v1', 'v2b', 'v2a']));
  });

  it('이미 담긴 버전은 고를 수 없고, 아무것도 안 고르면 추가 버튼이 비활성이다', async () => {
    (getPlaylistWithDetails as jest.Mock).mockResolvedValue({
      ...base,
      items: [{ id: 'i1', playlistId: 'p1', versionId: 'v1', order: 0, addedAt: d('2026-02-02'), version: v1, song: s1, versionNumber: 1, isDefault: true }],
    });
    const { findByTestId, getByTestId } = renderScreen();
    fireEvent.press(await findByTestId('playlist-add-songs'));
    fireEvent.press(await findByTestId('add-song-s1'));
    fireEvent.press(getByTestId('add-songs-confirm'));
    expect(addManyToPlaylist).not.toHaveBeenCalled();
  });

  it('항목을 길게 눌러 빼면 확인 없이 바로 목록에서 사라진다(실행 취소 후 확정)', async () => {
    (getPlaylistWithDetails as jest.Mock).mockResolvedValue({
      ...base,
      items: [{ id: 'i1', playlistId: 'p1', versionId: 'v1', order: 0, addedAt: d('2026-02-02'), version: v1, song: s1, versionNumber: 1, isDefault: true }],
    });
    const { findByTestId, getByTestId, queryByTestId } = renderScreen();
    fireEvent(await findByTestId('playlist-item-i1'), 'longPress');
    fireEvent.press(getByTestId('track-menu-remove'));
    expect(queryByTestId('playlist-item-i1')).toBeNull();
    // Provider 밖에서는 바로 확정
    await waitFor(() => expect(removeFromPlaylist).toHaveBeenCalledWith('p1', 'v1'));
  });
});
