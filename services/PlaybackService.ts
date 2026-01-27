import TrackPlayer, { Event } from 'react-native-track-player';

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

  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    TrackPlayer.skipToNext();
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    TrackPlayer.skipToPrevious();
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
