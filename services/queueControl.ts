import TrackPlayer from 'react-native-track-player';
import { wrapIndex } from '../lib/queueNav';

// TrackPlayer 큐 조작(reset/add/remove/skip)이 서로 끼어들지 않도록 앱 버튼과
// 원격 명령(잠금화면·이어폰)이 같은 줄을 쓴다.
let opChain: Promise<unknown> = Promise.resolve();
export function runQueueOp<T>(op: () => Promise<T>): Promise<T> {
  const run = opChain.then(op, op);
  opChain = run.catch(() => undefined);
  return run;
}

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

// "이전" 버튼: 지금 곡을 일정 시간 이상 들었으면 그 곡을 처음부터, 아니면 이전 곡으로(일반 음악 앱과 같은 규칙).
export const RESTART_THRESHOLD_SECONDS = 10;

// 곡의 시작 지점(편집으로 앞부분을 잘랐으면 첫 남길 구간의 시작). 버전 정보를 가진 PlayerProvider 가 등록한다.
type TrackStartResolver = (trackId: string) => number;
let trackStartResolver: TrackStartResolver = () => 0;
export function setTrackStartResolver(resolver: TrackStartResolver): void {
  trackStartResolver = resolver;
}

export async function skipPreviousOrRestart(): Promise<void> {
  const [track, progress] = await Promise.all([TrackPlayer.getActiveTrack(), TrackPlayer.getProgress()]);
  const start = track?.id ? trackStartResolver(String(track.id)) : 0;
  if (progress.position - start > RESTART_THRESHOLD_SECONDS) {
    await TrackPlayer.seekTo(start);
    await TrackPlayer.play();
    return;
  }
  await skipWrapped(-1);
}
