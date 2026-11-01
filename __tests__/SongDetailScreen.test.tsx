import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { ThemeProvider } from '../contexts/ThemeContext';
import {
  getSong,
  getVersionsBySong,
  updateVersion,
  updateSongDefaultVersion,
  deleteVersion,
} from '../lib/database';

const mockSetPlaylist = jest.fn();
let mockCurrentTrack: any = null;
jest.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => ({
    currentTrack: mockCurrentTrack,
    isPlaying: false,
    setPlaylist: mockSetPlaylist,
    togglePlayPause: jest.fn(),
  }),
}));
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});
jest.mock('../lib/analytics', () => ({ logEvent: jest.fn(), logScreen: jest.fn() }));
jest.mock('../lib/storage', () => ({ saveAudioLocally: jest.fn(), deleteAudioLocally: jest.fn() }));
jest.mock('../lib/nativeDenoise', () => ({ isNativeDenoiseAvailable: () => false }));
jest.mock('../lib/nativeAudioEdit', () => ({ isAudioEditAvailable: () => false, renderCutsToFile: jest.fn() }));
jest.mock('../components/RecorderModal', () => () => null);
jest.mock('../lib/database', () => ({
  getSong: jest.fn(),
  getVersionsBySong: jest.fn(),
  updateSongDefaultVersion: jest.fn(async () => {}),
  deleteVersion: jest.fn(async () => {}),
  addVersion: jest.fn(async () => {}),
  updateVersion: jest.fn(async () => {}),
  updateSongKey: jest.fn(async () => {}),
  updateSongInfo: jest.fn(async () => {}),
  deleteSong: jest.fn(async () => {}),
}));

import SongDetailScreen from '../screens/SongDetailScreen';

const song = { id: 's1', title: '밤편지', artist: '아이유', createdAt: new Date(), updatedAt: new Date() };
const makeVersion = (id: string, day: number, rating: number) => ({
  id,
  songId: 's1',
  fileName: `${id}.m4a`,
  storageUrl: `file://${id}`,
  rating,
  recordedAt: new Date(`2026-09-${String(day).padStart(2, '0')}T00:00:00Z`),
});
const v1 = makeVersion('v1', 1, 3);
const v2 = makeVersion('v2', 2, 4);

const nav = { navigate: jest.fn(), goBack: jest.fn() };
const renderScreen = () =>
  render(
    <ThemeProvider>
      <SongDetailScreen
        navigation={nav as any}
        route={{ key: 'SongDetail', name: 'SongDetail', params: { songId: 's1' } } as any}
      />
    </ThemeProvider>
  );

describe('SongDetailScreen', () => {
  beforeEach(() => {
    mockCurrentTrack = null;
    (getSong as jest.Mock).mockResolvedValue({ ...song });
    (getVersionsBySong as jest.Mock).mockResolvedValue([v2, v1]);
  });

  it('별을 누르면 그 자리에서 별점을 바꾼다', async () => {
    const { findByTestId, getByTestId } = renderScreen();
    fireEvent.press(await findByTestId('version-star-v1-5'));
    await waitFor(() => expect(updateVersion).toHaveBeenCalledWith('v1', { rating: 5 }));
    // 낙관적 반영: 다섯 번째 별이 채워진다
    expect(getByTestId('version-star-v1-5').findByProps({ name: 'star' })).toBeTruthy();
  });

  it('핀 버튼으로 대표 버전을 지정하고, 다시 누르면 해제한다', async () => {
    const { findByTestId, findByText } = renderScreen();
    const pin = await findByTestId('version-pin-v2');
    // 지정 후 다시 불러오면 저장된 대표 버전이 반영된다
    (getSong as jest.Mock).mockResolvedValue({ ...song, defaultVersionId: 'v2' });
    fireEvent.press(pin);
    await waitFor(() => expect(updateSongDefaultVersion).toHaveBeenCalledWith('s1', 'v2'));
    expect(await findByText('대표')).toBeTruthy();
    await waitFor(() => expect(getSong).toHaveBeenCalledTimes(2));
    fireEvent.press(await findByTestId('version-pin-v2'));
    await waitFor(() => expect(updateSongDefaultVersion).toHaveBeenLastCalledWith('s1', null));
  });

  it('바텀시트에서 삭제하면 카드가 바로 사라지고 삭제가 확정된다', async () => {
    const { findByTestId, getByTestId, queryByTestId } = renderScreen();
    fireEvent.press(await findByTestId('version-more-v1'));
    await act(async () => {
      fireEvent.press(getByTestId('version-menu-delete'));
    });
    expect(queryByTestId('version-card-v1')).toBeNull();
    expect(getByTestId('version-card-v2')).toBeTruthy();
    // ToastProvider 가 없으면 실행 취소 없이 바로 확정한다
    await waitFor(() => expect(deleteVersion).toHaveBeenCalledWith('v1'));
  });

  it('재생 중인 버전에 "재생 중" 표시를 단다', async () => {
    mockCurrentTrack = { song, version: v1 };
    const { findByTestId, queryByTestId } = renderScreen();
    expect(await findByTestId('version-now-playing-v1')).toBeTruthy();
    expect(queryByTestId('version-now-playing-v2')).toBeNull();
  });

  it('불러오기에 실패하면 다시 시도 화면을 보여준다', async () => {
    (getSong as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('error-retry'));
    await waitFor(() => expect(getSong).toHaveBeenCalledTimes(2));
  });
});
