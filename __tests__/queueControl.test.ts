jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    getQueue: jest.fn(),
    getActiveTrackIndex: jest.fn(),
    skip: jest.fn(async () => {}),
    play: jest.fn(async () => {}),
    seekTo: jest.fn(async () => {}),
    getActiveTrack: jest.fn(),
    getProgress: jest.fn(),
  },
}));

import TrackPlayer from 'react-native-track-player';
import { skipWrapped, skipPreviousOrRestart, setTrackStartResolver } from '../services/queueControl';

const tp = TrackPlayer as unknown as Record<string, jest.Mock>;
const setQueue = (length: number, active: number | undefined) => {
  tp.getQueue.mockResolvedValue(Array.from({ length }, (_, i) => ({ id: `t${i}` })));
  tp.getActiveTrackIndex.mockResolvedValue(active);
};

describe('skipWrapped', () => {
  it('마지막 곡에서 다음 → 첫 곡으로 이동하고 재생한다', async () => {
    setQueue(3, 2);
    await skipWrapped(1);
    expect(tp.skip).toHaveBeenCalledWith(0);
    expect(tp.play).toHaveBeenCalled();
  });

  it('첫 곡에서 이전 → 마지막 곡으로 이동한다', async () => {
    setQueue(3, 0);
    await skipWrapped(-1);
    expect(tp.skip).toHaveBeenCalledWith(2);
  });

  it('빈 큐면 아무것도 하지 않는다', async () => {
    setQueue(0, undefined);
    await skipWrapped(1);
    expect(tp.skip).not.toHaveBeenCalled();
  });
});

describe('skipPreviousOrRestart — 이전 버튼', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setTrackStartResolver(() => 0);
    setQueue(3, 1);
    tp.getActiveTrack.mockResolvedValue({ id: 't1' });
  });

  it('10초 넘게 들었으면 지금 곡을 처음부터 다시 재생한다', async () => {
    tp.getProgress.mockResolvedValue({ position: 42, duration: 200 });
    await skipPreviousOrRestart();
    expect(tp.seekTo).toHaveBeenCalledWith(0);
    expect(tp.skip).not.toHaveBeenCalled();
  });

  it('10초 이내면 이전 곡으로 간다', async () => {
    tp.getProgress.mockResolvedValue({ position: 6, duration: 200 });
    await skipPreviousOrRestart();
    expect(tp.skip).toHaveBeenCalledWith(0);
    expect(tp.seekTo).not.toHaveBeenCalled();
  });

  it('첫 곡의 10초 이내면 마지막 곡으로 순환한다', async () => {
    setQueue(3, 0);
    tp.getActiveTrack.mockResolvedValue({ id: 't0' });
    tp.getProgress.mockResolvedValue({ position: 3, duration: 200 });
    await skipPreviousOrRestart();
    expect(tp.skip).toHaveBeenCalledWith(2);
  });

  it('앞부분을 잘라낸 곡은 남길 구간의 시작을 기준으로 판단하고 그 지점으로 돌아간다', async () => {
    setTrackStartResolver(() => 30); // 0~30초를 잘라낸 버전
    tp.getProgress.mockResolvedValue({ position: 36, duration: 200 }); // 실제로 6초 들음
    await skipPreviousOrRestart();
    expect(tp.skip).toHaveBeenCalledWith(0);

    jest.clearAllMocks();
    tp.getActiveTrack.mockResolvedValue({ id: 't1' });
    setQueue(3, 1);
    tp.getProgress.mockResolvedValue({ position: 45, duration: 200 }); // 15초 들음
    await skipPreviousOrRestart();
    expect(tp.seekTo).toHaveBeenCalledWith(30);
  });
});
