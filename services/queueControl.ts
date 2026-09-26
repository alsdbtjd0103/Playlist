import TrackPlayer from 'react-native-track-player';
import { wrapIndex } from '../lib/queueNav';

// 큐의 끝에서 다음 → 첫 곡, 첫 곡에서 이전 → 마지막 곡으로 순환 이동.
// 앱 버튼과 잠금화면/이어폰(원격) 명령이 같은 규칙을 쓰도록 TrackPlayer 상태를 기준으로 계산한다.
export async function skipWrapped(step: 1 | -1): Promise<void> {
  const [queue, activeIndex] = await Promise.all([
    TrackPlayer.getQueue(),
    TrackPlayer.getActiveTrackIndex(),
  ]);
  const target = wrapIndex(activeIndex ?? 0, step, queue.length);
  if (target < 0) return;
  await TrackPlayer.skip(target);
  await TrackPlayer.play();
}
