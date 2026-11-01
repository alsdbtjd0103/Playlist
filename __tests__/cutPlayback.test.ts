import { cutPlaybackAction } from '../lib/trim';

describe('cutPlaybackAction — 편집 구간 재생 판단', () => {
  const cuts = [
    { start: 0, end: 5 },
    { start: 20, end: 30 },
    { start: 50, end: 60 },
  ];

  it('남길 구간 안이면 아무것도 하지 않는다', () => {
    expect(cutPlaybackAction(10, cuts, 60)).toEqual({ type: 'none' });
  });

  it('잘라낸 구간에 들어가면 그 구간 끝으로 이동한다', () => {
    expect(cutPlaybackAction(20.2, cuts, 60)).toEqual({ type: 'seek', to: 30 });
    expect(cutPlaybackAction(1, cuts, 60)).toEqual({ type: 'seek', to: 5 });
  });

  it('마지막 남길 구간을 지나 꼬리 cut 에 들어가면 곡 끝으로 처리한다', () => {
    expect(cutPlaybackAction(50.1, cuts, 60)).toEqual({ type: 'end' });
  });

  it('cut 이 없거나 길이를 모르면 판단하지 않는다', () => {
    expect(cutPlaybackAction(10, [], 60)).toEqual({ type: 'none' });
    expect(cutPlaybackAction(10, cuts, 0)).toEqual({ type: 'none' });
  });
});
