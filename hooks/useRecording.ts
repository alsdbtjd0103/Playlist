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

export interface UseRecordingReturn {
  // 상태
  isRecording: boolean;
  recordingTime: number;
  audioUri: string | null;
  permissionStatus: PermissionStatus;
  checkingPermission: boolean;

  // 액션
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetRecording: () => void;
  checkPermissions: () => Promise<void>;
}

export function useRecording(): UseRecordingReturn {
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const [audioUri, setAudioUri] = useState<string | null>(null);
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

  const stopRecording = async () => {
    try {
      await audioRecorder.stop();
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
    if (recorderState.isRecording) {
      audioRecorder.stop();
    }
    setAudioUri(null);
  };

  return {
    isRecording: recorderState.isRecording,
    recordingTime: Math.round(recorderState.durationMillis / 1000), // 밀리초를 초로 변환
    audioUri,
    permissionStatus,
    checkingPermission,
    startRecording,
    stopRecording,
    resetRecording,
    checkPermissions,
  };
}
