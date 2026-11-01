// 녹음 중인지 앱 전역에서 알 수 있게 하는 플래그.
// 녹음 중 이어폰·잠금화면의 "재생"이 TrackPlayer 를 다시 틀면 마이크 입력이 끊기거나
// 반주가 녹음에 섞이므로, PlaybackService 가 이 값을 보고 원격 재생을 무시한다.
let recordingActive = false;

export const setRecordingActive = (active: boolean): void => {
  recordingActive = active;
};

export const isRecordingActive = (): boolean => recordingActive;
