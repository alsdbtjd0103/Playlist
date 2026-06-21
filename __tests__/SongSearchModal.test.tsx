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
