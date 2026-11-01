import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';

// TrackPlayer 목: 이벤트 핸들러를 모아 두고 테스트에서 네이티브 이벤트를 흉내 낸다
const mockHandlers: Record<string, ((e: any) => any)[]> = {};
let mockState = 'playing';
let mockPosition = 0;
jest.mock('react-native-track-player', () => {
  const Event = {
    PlaybackQueueEnded: 'queue-ended',
    PlaybackActiveTrackChanged: 'active-changed',
    PlaybackProgressUpdated: 'progress',
  };
  const fn = (impl?: any) => jest.fn(impl ?? (async () => {}));
  const TP = {
    setupPlayer: fn(),
    updateOptions: fn(),
    addEventListener: jest.fn((name: string, handler: any) => {
      (mockHandlers[name] ||= []).push(handler);
      return { remove: () => {} };
    }),
    reset: fn(),
    add: fn(),
    skip: fn(),
    play: fn(),
    pause: fn(),
    seekTo: fn(),
    setRepeatMode: fn(),
    getQueue: fn(async () => [{ id: 'a' }, { id: 'b' }]),
    getActiveTrackIndex: fn(async () => 1),
    getProgress: fn(async () => ({ position: mockPosition, duration: 60 })),
  };
  return {
    __esModule: true,
    default: TP,
    Event,
    State: { Playing: 'playing', Paused: 'paused', Ended: 'ended' },
    RepeatMode: { Off: 0, Track: 1, Queue: 2 },
    Capability: { Play: 0, Pause: 1, Stop: 2, SeekTo: 3, SkipToNext: 4, SkipToPrevious: 5 },
    AppKilledPlaybackBehavior: { StopPlaybackAndRemoveNotification: 'stop' },
    usePlaybackState: () => ({ state: mockState }),
  };
});

import TrackPlayer from 'react-native-track-player';
import { PlayerProvider, usePlayer, type PlayingTrack } from '../contexts/PlayerContext';

const TP = TrackPlayer as unknown as Record<string, jest.Mock>;
const emit = async (name: string, event: any) => {
  await act(async () => {
    for (const h of mockHandlers[name] ?? []) await h(event);
  });
};

const song = { id: 's', title: '곡', createdAt: new Date(), updatedAt: new Date() };
const item = (id: string, extra: any = {}): PlayingTrack => ({
  song,
  version: { id, songId: 's', fileName: id, storageUrl: `file:///${id}`, rating: 3, recordedAt: new Date(), duration: 60, ...extra },
});
// 앞 0~5초, 뒤 50~60초를 잘라낸 버전
const trimmed = (id: string) => item(id, { cuts: [{ start: 0, end: 5 }, { start: 50, end: 60 }] });

const wrapper = ({ children }: { children: React.ReactNode }) => <PlayerProvider>{children}</PlayerProvider>;

async function setup(items: PlayingTrack[], startIndex = 0) {
  const hook = renderHook(() => usePlayer(), { wrapper });
  // 플레이어 준비(isReady)까지 이펙트·마이크로태스크를 흘려보낸다
  // (두 번째 테스트부터는 모듈 전역 isPlayerSetup 때문에 updateOptions 가 다시 불리지 않는다)
  for (let i = 0; i < 5; i++) await act(async () => {});
  await act(async () => {
    await hook.result.current.setPlaylist(items, startIndex);
  });
  return hook;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockHandlers)) delete mockHandlers[k];
  mockState = 'playing';
  mockPosition = 0;
});

describe('PlayerContext — 편집 구간·반복·종료 처리', () => {
  it('새 큐는 네이티브 반복 모드를 화면(전체 반복)과 맞추고, 곡 이동과 시작 위치를 한 번에 지정한다', async () => {
    await setup([item('a'), trimmed('b')], 1);
    expect(TP.setRepeatMode).toHaveBeenCalledWith(2);
    expect(TP.skip).toHaveBeenCalledWith(1, 5);
    expect(TP.seekTo).not.toHaveBeenCalled();
  });

  it('화면이 꺼져도 오는 진행 이벤트로 꼬리 cut 에서 다음 곡(마지막이면 처음)으로 넘어간다', async () => {
    await setup([item('a'), trimmed('b')], 1);
    await emit('progress', { position: 10, duration: 60, track: 1 }); // 남길 구간 확인(armed)
    await emit('progress', { position: 50.2, duration: 60, track: 1 });
    await waitFor(() => expect(TP.skip).toHaveBeenLastCalledWith(0));
  });

  it('반복 없음 + 마지막 곡이면 꼬리 cut 에서 정지한다', async () => {
    const hook = await setup([item('a'), trimmed('b')], 1);
    await act(async () => {
      await hook.result.current.setRepeatMode('none');
    });
    await emit('progress', { position: 10, duration: 60, track: 1 });
    await emit('progress', { position: 50.2, duration: 60, track: 1 });
    expect(TP.pause).toHaveBeenCalled();
  });

  it('한 곡 반복이면 꼬리 cut 에서 그 곡의 시작 지점으로 돌아간다', async () => {
    const hook = await setup([trimmed('a')]);
    await act(async () => {
      await hook.result.current.setRepeatMode('one');
    });
    await emit('progress', { position: 10, duration: 60, track: 0 });
    await emit('progress', { position: 50.2, duration: 60, track: 0 });
    expect(TP.seekTo).toHaveBeenLastCalledWith(5);
  });

  it('곡 중간의 cut 은 건너뛴다', async () => {
    await setup([item('a', { cuts: [{ start: 20, end: 30 }] })]);
    await emit('progress', { position: 10, duration: 60, track: 0 });
    await emit('progress', { position: 20.1, duration: 60, track: 0 });
    expect(TP.seekTo).toHaveBeenLastCalledWith(30);
  });

  it('큐 재생이 끝난(종료 상태) 뒤 재생 버튼을 누르면 첫 곡부터 다시 재생한다', async () => {
    const hook = await setup([trimmed('a'), item('b')]);
    mockState = 'ended';
    hook.rerender({});
    TP.skip.mockClear();
    await act(async () => {
      await hook.result.current.togglePlayPause();
    });
    expect(TP.skip).toHaveBeenCalledWith(0, 5);
    expect(TP.play).toHaveBeenCalled();
  });

  it('잘라낸 꼬리에서 멈춘 곡을 다시 재생하면 곡의 시작 지점으로 돌아간다', async () => {
    const hook = await setup([trimmed('a')]);
    mockState = 'paused';
    mockPosition = 52;
    hook.rerender({});
    await act(async () => {
      await hook.result.current.togglePlayPause();
    });
    expect(TP.seekTo).toHaveBeenLastCalledWith(5);
    expect(TP.play).toHaveBeenCalled();
  });
});
