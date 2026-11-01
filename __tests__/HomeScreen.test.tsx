import React from 'react';
import { render, fireEvent, waitFor, act, screen } from '@testing-library/react-native';
import HomeScreen from '../screens/HomeScreen';
import { ThemeProvider } from '../contexts/ThemeContext';
import { ToastProvider, UNDO_WINDOW_MS } from '../contexts/ToastContext';
import { getSongsWithVersions, deleteSong, updateSongInfo } from '../lib/database';
import { updateSettings } from '../lib/settings';

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});
jest.mock('../lib/analytics', () => ({ logEvent: jest.fn(), logScreen: jest.fn() }));
jest.mock('../lib/database', () => ({
  getSongsWithVersions: jest.fn(),
  deleteSong: jest.fn(async () => {}),
  updateSongInfo: jest.fn(async () => {}),
  getAllSongs: jest.fn(async () => []),
  addSong: jest.fn(),
}));
jest.mock('../lib/itunes', () => ({ searchTracks: jest.fn(async () => []) }));

const song = (id: string, title: string, updatedAt: string) => ({
  id, title, artist: '가수', createdAt: new Date(updatedAt), updatedAt: new Date(updatedAt),
});
const version = (id: string, songId: string, recordedAt: string, rating = 3) => ({
  id, songId, fileName: `${id}.m4a`, storageUrl: `file://${id}`, rating, recordedAt: new Date(recordedAt),
});

const rows = () => [
  { song: song('s1', '다람쥐', '2026-01-01T00:00:00Z'), versions: [version('v1', 's1', '2026-10-30T00:00:00Z')] },
  { song: song('s2', '가나다', '2026-01-01T00:00:00Z'), versions: [] },
  { song: song('s3', '나비', '2026-01-01T00:00:00Z'), versions: [version('v3', 's3', '2026-10-01T00:00:00Z')] },
];

const nav = { navigate: jest.fn() };
const renderScreen = (withToast = false) => {
  const screenEl = <HomeScreen navigation={nav as any} route={{ key: 'Home', name: 'Home' } as any} />;
  return render(<ThemeProvider>{withToast ? <ToastProvider>{screenEl}</ToastProvider> : screenEl}</ThemeProvider>);
};
const cardOrder = () => screen.getAllByTestId(/^song-card-/).map((n) => n.props.testID);

describe('HomeScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await updateSettings({ homeSort: 'recent' });
    (getSongsWithVersions as jest.Mock).mockResolvedValue(rows());
  });

  it('제목 칩을 누르면 가나다순으로 정렬한다', async () => {
    renderScreen();
    await screen.findByText('다람쥐');
    expect(cardOrder()).toEqual(['song-card-s1', 'song-card-s3', 'song-card-s2']);
    fireEvent.press(screen.getByTestId('sort-chip-title'));
    await waitFor(() => expect(cardOrder()).toEqual(['song-card-s2', 'song-card-s3', 'song-card-s1']));
  });

  it('녹음이 없는 곡은 "아직 녹음 없음", 있는 곡은 버전 수를 보여준다', async () => {
    renderScreen();
    expect(await screen.findByText('가수 · 아직 녹음 없음')).toBeTruthy();
    expect(screen.getAllByText(/가수 · 버전 1개 · /).length).toBe(2);
  });

  it('시트에서 삭제하면 카드가 바로 사라지고 Provider 없이는 바로 deleteSong 호출', async () => {
    renderScreen();
    await screen.findByText('다람쥐');
    fireEvent.press(screen.getByTestId('song-more-s1'));
    await act(async () => { fireEvent.press(screen.getByTestId('song-sheet-delete')); });
    expect(screen.queryByTestId('song-card-s1')).toBeNull();
    await waitFor(() => expect(deleteSong).toHaveBeenCalledWith('s1'));
  });

  it('실행 취소 시간이 지난 뒤에야 deleteSong 을 호출한다', async () => {
    jest.useFakeTimers();
    try {
      renderScreen(true);
      await act(async () => {});
      fireEvent.press(screen.getByTestId('song-more-s1'));
      await act(async () => { fireEvent.press(screen.getByTestId('song-sheet-delete')); });
      expect(screen.queryByTestId('song-card-s1')).toBeNull();
      expect(screen.getByText('「다람쥐」을 삭제했어요')).toBeTruthy();
      expect(deleteSong).not.toHaveBeenCalled();
      await act(async () => { jest.advanceTimersByTime(UNDO_WINDOW_MS); });
      expect(deleteSong).toHaveBeenCalledWith('s1');
    } finally {
      jest.useRealTimers();
    }
  });

  it('정보 수정: 빈 제목이면 저장 비활성, 저장 시 updateSongInfo 호출', async () => {
    renderScreen();
    await screen.findByText('다람쥐');
    fireEvent.press(screen.getByTestId('song-more-s1'));
    fireEvent.press(screen.getByTestId('song-sheet-edit'));
    fireEvent.changeText(screen.getByTestId('edit-title-input'), '  ');
    fireEvent.press(screen.getByTestId('edit-save-button'));
    expect(updateSongInfo).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('edit-title-input'), '새 제목');
    fireEvent.changeText(screen.getByTestId('edit-artist-input'), '');
    await act(async () => { fireEvent.press(screen.getByTestId('edit-save-button')); });
    expect(updateSongInfo).toHaveBeenCalledWith('s1', { title: '새 제목', artist: undefined });
  });

  it('불러오기에 실패하면 다시 시도 버튼을 보여주고 누르면 다시 불러온다', async () => {
    (getSongsWithVersions as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    renderScreen();
    expect(await screen.findByTestId('error-retry')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId('error-retry')); });
    expect(await screen.findByText('다람쥐')).toBeTruthy();
    expect(getSongsWithVersions).toHaveBeenCalledTimes(2);
  });
});
