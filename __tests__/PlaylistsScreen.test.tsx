import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import PlaylistsScreen from '../screens/PlaylistsScreen';
import { ThemeProvider } from '../contexts/ThemeContext';
import { getPlaylists, createPlaylist, renamePlaylist } from '../lib/database';

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});
jest.mock('../lib/database', () => ({
  getPlaylists: jest.fn(),
  getAllPlaylistItems: jest.fn(async () => [
    { id: 'i1', playlistId: 'p2', versionId: 'v1', order: 0, addedAt: new Date() },
    { id: 'i2', playlistId: 'p2', versionId: 'gone', order: 1, addedAt: new Date() },
  ]),
  getAllVersions: jest.fn(async () => [{ id: 'v1' }]),
  createPlaylist: jest.fn(async () => 'new-id'),
  renamePlaylist: jest.fn(async () => {}),
  deletePlaylist: jest.fn(async () => {}),
}));

const playlists = [
  { id: 'p1', name: '대표곡', isDefault: true, createdAt: new Date(1), updatedAt: new Date(1) },
  { id: 'p2', name: '드라이브', isDefault: false, createdAt: new Date(2), updatedAt: new Date(2) },
];
const nav = { navigate: jest.fn() };
const renderScreen = () =>
  render(
    <ThemeProvider>
      <PlaylistsScreen navigation={nav as any} route={{ key: 'Playlists', name: 'Playlists' } as any} />
    </ThemeProvider>
  );

describe('PlaylistsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getPlaylists as jest.Mock).mockResolvedValue(playlists);
  });

  it('카드에 곡 수와 대표곡 배지를 보여 주고, 기본 리스트에는 메뉴가 없다', async () => {
    const { findByText, getByText, queryByTestId, getByTestId } = renderScreen();
    expect(await findByText('드라이브')).toBeTruthy();
    expect(getByText('대표곡 자동')).toBeTruthy();
    expect(getByText('곡 1개')).toBeTruthy(); // 지워진 버전 항목은 세지 않음
    expect(queryByTestId('playlist-menu-p1')).toBeNull();
    expect(getByTestId('playlist-menu-p2')).toBeTruthy();
  });

  it('만들면 새 플레이리스트 상세로 바로 이동한다', async () => {
    const { findByText, getByTestId } = renderScreen();
    await findByText('드라이브');
    fireEvent.press(getByTestId('add-playlist-button'));
    fireEvent.changeText(getByTestId('playlist-name-input'), '  새 리스트 ');
    fireEvent.press(getByTestId('create-playlist-confirm'));
    await waitFor(() => expect(createPlaylist).toHaveBeenCalledWith('새 리스트', false));
    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('PlaylistDetail', { playlistId: 'new-id' }));
  });

  it('이름이 비어 있으면 만들기 버튼이 비활성이다', async () => {
    const { findByText, getByTestId } = renderScreen();
    await findByText('드라이브');
    fireEvent.press(getByTestId('add-playlist-button'));
    fireEvent.press(getByTestId('create-playlist-confirm'));
    expect(createPlaylist).not.toHaveBeenCalled();
  });

  it('⋮ → 이름 변경 시트에서 renamePlaylist를 호출한다', async () => {
    const { findByText, getByTestId } = renderScreen();
    await findByText('드라이브');
    fireEvent.press(getByTestId('playlist-menu-p2'));
    fireEvent.press(getByTestId('playlist-menu-rename'));
    fireEvent.changeText(getByTestId('rename-playlist-input'), '출근길');
    fireEvent.press(getByTestId('rename-playlist-confirm'));
    await waitFor(() => expect(renamePlaylist).toHaveBeenCalledWith('p2', '출근길'));
  });

  it('불러오기에 실패하면 오류 상태를 보여 준다', async () => {
    (getPlaylists as jest.Mock).mockRejectedValue(new Error('x'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { findByText } = renderScreen();
    expect(await findByText('불러오지 못했어요')).toBeTruthy();
  });
});
