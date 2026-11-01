import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import MemoFeedScreen from '../screens/MemoFeedScreen';
import { ThemeProvider } from '../contexts/ThemeContext';
import { getMemoFeed, updateVersion } from '../lib/database';

const mockSetPlaylist = jest.fn();
jest.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => ({ setPlaylist: mockSetPlaylist }),
}));
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return { useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]) };
});
jest.mock('../lib/analytics', () => ({ logEvent: jest.fn(), logScreen: jest.fn() }));
jest.mock('../lib/database', () => ({
  getMemoFeed: jest.fn(),
  updateVersion: jest.fn(async () => {}),
}));

const song = { id: 's1', title: '밤편지', artist: '아이유', createdAt: new Date(), updatedAt: new Date() };
const version = {
  id: 'v1', songId: 's1', fileName: 'a.m4a', storageUrl: 'file://a', rating: 4,
  recordedAt: new Date('2026-09-01T00:00:00Z'), memo: '고음에서 숨 부족',
};
const nav = { navigate: jest.fn() };
const renderScreen = () => render(
  <ThemeProvider>
    <MemoFeedScreen navigation={nav as any} route={{ key: 'MemoFeed', name: 'MemoFeed' } as any} />
  </ThemeProvider>
);

describe('MemoFeedScreen', () => {
  beforeEach(() => {
    (getMemoFeed as jest.Mock).mockResolvedValue([{ song, version, versionNumber: 3 }]);
  });

  it('메모 카드에 곡 제목·버전 번호·메모를 보여준다', async () => {
    const { findByText, getByText } = renderScreen();
    expect(await findByText('고음에서 숨 부족')).toBeTruthy();
    expect(getByText('밤편지')).toBeTruthy();
    expect(getByText('#3')).toBeTruthy();
  });

  it('메모가 없으면 빈 상태 안내를 보여준다', async () => {
    (getMemoFeed as jest.Mock).mockResolvedValue([]);
    const { findByText } = renderScreen();
    expect(await findByText('아직 남긴 메모가 없어요')).toBeTruthy();
  });

  it('메모를 눌러 수정하고 저장하면 updateVersion을 호출한다', async () => {
    const { findByText, getByTestId } = renderScreen();
    fireEvent.press(await findByText('고음에서 숨 부족'));
    fireEvent.changeText(getByTestId('memo-edit-input-v1'), '호흡 개선됨');
    fireEvent.press(getByTestId('memo-save-v1'));
    await waitFor(() => expect(updateVersion).toHaveBeenCalledWith('v1', { memo: '호흡 개선됨' }));
    await waitFor(() => expect(getMemoFeed).toHaveBeenCalledTimes(2)); // 저장 후 새로고침
  });

  it('재생 버튼은 해당 버전 하나를 재생한다', async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('memo-play-v1'));
    expect(mockSetPlaylist).toHaveBeenCalledWith([{ song, version, versionNumber: 3 }], 0);
  });

  it('곡으로 이동 버튼은 노래 탭의 곡 상세로 이동한다', async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('memo-open-song-v1'));
    expect(nav.navigate).toHaveBeenCalledWith('HomeTab', {
      screen: 'SongDetail', params: { songId: 's1' }, initial: false,
    });
  });
});
