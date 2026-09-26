import TrackPlayer, { Event } from 'react-native-track-player';
import { skipWrapped } from './queueControl';

/**
 * TrackPlayer의 백그라운드 재생을 위한 서비스
 * 이 함수는 앱이 백그라운드에 있을 때도 실행됩니다.
 */
export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause();
  });

  // 잠금화면·알림·이어폰의 다음/이전도 끝↔처음 순환 (skipToNext는 큐 끝에서 실패함)
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    skipWrapped(1).catch((e) => console.error('원격 다음 곡 실패:', e));
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    skipWrapped(-1).catch((e) => console.error('원격 이전 곡 실패:', e));
  });

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, () => {
    skipWrapped(-1).catch((e) => console.error('원격 이전 곡 실패:', e));
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
    if (event.position !== undefined) {
      await TrackPlayer.seekTo(event.position);
    }
  });
}
