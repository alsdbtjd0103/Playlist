jest.mock('react-native-track-player', () => ({
  __esModule: true,
  default: {
    getQueue: jest.fn(),
    getActiveTrackIndex: jest.fn(),
    skip: jest.fn(async () => {}),
    play: jest.fn(async () => {}),
  },
}));

import TrackPlayer from 'react-native-track-player';
import { skipWrapped } from '../services/queueControl';

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
