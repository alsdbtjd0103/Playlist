import { useState, useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

// 녹음 진행 상태. recorderState.isRecording 은 500ms 폴링으로만 갱신되어
// pause()/record() 직후 최대 500ms 동안 stale 하므로, UI 분기는 폴링값이 아니라
// 핸들러가 동기적으로 갱신하는 이 명시적 상태 머신을 단일 기준으로 삼는다.
type RecordingPhase = 'idle' | 'recording' | 'paused' | 'stopped';

export interface UseRecordingReturn {
  // 상태
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  audioUri: string | null;
  permissionStatus: PermissionStatus;
  checkingPermission: boolean;

  // 액션
  startRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<void>;
  resetRecording: () => void;
  checkPermissions: () => Promise<void>;
}

export function useRecording(): UseRecordingReturn {
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [checkingPermission, setCheckingPermission] = useState(false);

  // 오디오 모드 설정 및 권한 초기화
  useEffect(() => {
    (async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
          staysActiveInBackground: true,
        });
      } catch (error) {
        console.error('오디오 모드 설정 실패:', error);
      }
    })();
  }, []);

  const checkPermissions = async () => {
    setCheckingPermission(true);
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (status.granted) {
        setPermissionStatus('granted');
      } else {
        setPermissionStatus('denied');
      }
    } catch (error) {
      console.error('권한 확인 실패:', error);
      setPermissionStatus('denied');
    } finally {
      setCheckingPermission(false);
    }
  };

  const startRecording = async () => {
    try {
      setCheckingPermission(true);
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setPermissionStatus('granted');
      setAudioUri(null);
      setPhase('recording');
      setCheckingPermission(false);
    } catch (error: any) {
      console.error('녹음 시작 실패:', error);
      setCheckingPermission(false);

      if (error?.message?.includes('permission') || error?.message?.includes('Permission')) {
        setPermissionStatus('denied');
        Alert.alert(
          '마이크 권한 필요',
          '녹음 기능을 사용하려면 마이크 권한이 필요합니다. 설정에서 권한을 허용해주세요.',
          [
            { text: '취소', style: 'cancel' },
            { text: '설정으로 이동', onPress: () => Linking.openSettings() },
          ]
        );
      } else {
        Alert.alert('오류', '녹음을 시작할 수 없습니다.');
      }
    }
  };

  const pauseRecording = () => {
    try {
      audioRecorder.pause();
      setPhase('paused');
    } catch (error) {
      console.error('녹음 일시정지 실패:', error);
    }
  };

  const resumeRecording = () => {
    try {
      audioRecorder.record();
      setPhase('recording');
    } catch (error) {
      console.error('녹음 재개 실패:', error);
    }
  };

  const stopRecording = async () => {
    try {
      await audioRecorder.stop();
      setPhase('stopped');
      const uri = audioRecorder.uri;

      if (uri && uri.length > 0) {
        setAudioUri(uri);
      } else {
        Alert.alert('오류', '녹음 파일을 찾을 수 없습니다.');
      }
    } catch (error) {
      console.error('녹음 중지 실패:', error);
      Alert.alert('오류', '녹음 중지에 실패했습니다.');
    }
  };

  const resetRecording = () => {
    if (phase === 'recording' || phase === 'paused') {
      audioRecorder.stop();
    }
    setPhase('idle');
    setAudioUri(null);
  };

  return {
    isRecording: phase === 'recording',
    isPaused: phase === 'paused',
    recordingTime: Math.round(recorderState.durationMillis / 1000),
    audioUri,
    permissionStatus,
    checkingPermission,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    checkPermissions,
  };
}
