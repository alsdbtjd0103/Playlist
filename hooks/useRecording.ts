import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
  type RecordingStatus,
} from 'expo-audio';
import { normalizeWaveform } from '../lib/waveform';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

// 녹음 진행 상태. recorderState.isRecording 은 폴링으로만 갱신되어
// pause()/record() 직후 잠시 stale 하므로, UI 분기는 폴링값이 아니라
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
  waveform: number[];

  // 액션
  startRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<void>;
  resetRecording: () => void;
  checkPermissions: () => Promise<void>;
}

// 화면이 꺼지거나 다른 앱으로 전환돼도 녹음이 이어지도록 하는 오디오 모드.
// - shouldPlayInBackground: Android 는 이 값이 false 면 앱이 백그라운드로 갈 때
//   녹음기를 강제로 pause 한다(allowsBackgroundRecording 과 별개로 확인함).
// - allowsBackgroundRecording: Android 는 마이크 포그라운드 서비스(상단 알림)로,
//   iOS 는 UIBackgroundModes=audio 세션 유지로 녹음을 계속한다.
const RECORDING_AUDIO_MODE = {
  playsInSilentMode: true,
  allowsRecording: true,
  shouldPlayInBackground: true,
  allowsBackgroundRecording: true,
} as const;

let audioModeReady: Promise<void> | null = null;
function ensureRecordingAudioMode(): Promise<void> {
  if (!audioModeReady) {
    audioModeReady = setAudioModeAsync(RECORDING_AUDIO_MODE).catch((error) => {
      audioModeReady = null; // 실패 시 다음 녹음 시작 때 재시도
      throw error;
    });
  }
  return audioModeReady;
}

// Android 13+ 는 포그라운드 서비스 알림을 띄우려면 알림 권한이 필요하다.
// 거부해도 녹음은 계속되고 알림만 보이지 않으므로 결과는 무시한다.
let notificationPermissionAsked = false;
async function requestNotificationPermissionOnce(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33 || notificationPermissionAsked) return;
  notificationPermissionAsked = true;
  try {
    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (!(await PermissionsAndroid.check(permission))) {
      await PermissionsAndroid.request(permission);
    }
  } catch (error) {
    console.warn('알림 권한 요청 실패:', error);
  }
}

export function useRecording(): UseRecordingReturn {
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('undetermined');
  const [checkingPermission, setCheckingPermission] = useState(false);
  // 정지 후에는 네이티브 녹음기가 durationMillis 를 0 으로 초기화하므로
  // 정지 시점의 길이를 따로 고정해 둔다(표시·저장 duration 용).
  const [finalDurationMs, setFinalDurationMs] = useState<number | null>(null);

  const phaseRef = useRef<RecordingPhase>('idle');
  const stoppingRef = useRef(false);
  const lastDurationMsRef = useRef(0);
  const meteringSamplesRef = useRef<number[]>([]);
  const [waveform, setWaveform] = useState<number[]>([]);

  const updatePhase = (next: RecordingPhase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const finalize = useCallback((uri: string | null | undefined, durationMs: number) => {
    updatePhase('stopped');
    setFinalDurationMs(durationMs);
    setWaveform(normalizeWaveform(meteringSamplesRef.current));
    if (uri && uri.length > 0) {
      setAudioUri(uri);
    } else {
      Alert.alert('오류', '녹음 파일을 찾을 수 없습니다.');
    }
  }, []);

  // 알림의 "Stop" 버튼(Android 포그라운드 서비스)처럼 앱 밖에서 녹음이 끝난 경우,
  // JS 상태는 여전히 'recording' 이라 화면이 멈춘 것처럼 보인다. 완료 이벤트로 동기화한다.
  const onRecorderStatus = useCallback(
    (status: RecordingStatus) => {
      if (!status.isFinished || stoppingRef.current) return;
      if (phaseRef.current !== 'recording' && phaseRef.current !== 'paused') return;
      finalize(status.url, lastDurationMsRef.current);
    },
    [finalize],
  );

  const audioRecorder = useAudioRecorder(
    { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true },
    onRecorderStatus,
  );
  const recorderState = useAudioRecorderState(audioRecorder, 100);

  // 오디오 모드 설정 (녹음 시작 시에도 완료를 보장하기 위해 다시 await 한다)
  useEffect(() => {
    ensureRecordingAudioMode().catch((error) => {
      console.error('오디오 모드 설정 실패:', error);
    });
  }, []);

  // 녹음 중 미터링 샘플·길이 수집
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return;
    if (recorderState.durationMillis > 0) {
      lastDurationMsRef.current = recorderState.durationMillis;
    }
    if (phase === 'recording' && typeof recorderState.metering === 'number') {
      meteringSamplesRef.current.push(recorderState.metering);
    }
  }, [recorderState.metering, recorderState.durationMillis, phase]);

  const checkPermissions = async () => {
    setCheckingPermission(true);
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      setPermissionStatus(status.granted ? 'granted' : 'denied');
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
      meteringSamplesRef.current = [];
      lastDurationMsRef.current = 0;
      setWaveform([]);
      setFinalDurationMs(null);
      try {
        await ensureRecordingAudioMode();
      } catch (error) {
        // 모드 설정이 실패해도 포그라운드 녹음은 가능하므로 계속 진행
        console.error('오디오 모드 설정 실패:', error);
      }
      await requestNotificationPermissionOnce();
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setPermissionStatus('granted');
      setAudioUri(null);
      updatePhase('recording');
    } catch (error: any) {
      console.error('녹음 시작 실패:', error);

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
    } finally {
      setCheckingPermission(false);
    }
  };

  const pauseRecording = () => {
    try {
      audioRecorder.pause();
      updatePhase('paused');
    } catch (error) {
      console.error('녹음 일시정지 실패:', error);
    }
  };

  const resumeRecording = () => {
    try {
      audioRecorder.record();
      updatePhase('recording');
    } catch (error) {
      console.error('녹음 재개 실패:', error);
    }
  };

  const stopRecording = async () => {
    if (stoppingRef.current) return; // 정지 버튼 연타 방지
    if (phaseRef.current !== 'recording' && phaseRef.current !== 'paused') return;
    stoppingRef.current = true;
    try {
      let durationMs = lastDurationMsRef.current;
      try {
        durationMs = Math.max(durationMs, audioRecorder.getStatus().durationMillis);
      } catch {
        // getStatus 실패 시 마지막 폴링값 사용
      }
      await audioRecorder.stop();
      finalize(audioRecorder.uri, durationMs);
    } catch (error) {
      console.error('녹음 중지 실패:', error);
      Alert.alert('오류', '녹음 중지에 실패했습니다.');
    } finally {
      stoppingRef.current = false;
    }
  };

  const resetRecording = () => {
    if (phaseRef.current === 'recording' || phaseRef.current === 'paused') {
      stoppingRef.current = true;
      audioRecorder
        .stop()
        .catch((error) => console.error('resetRecording: stop 실패', error))
        .finally(() => {
          stoppingRef.current = false;
        });
    }
    updatePhase('idle');
    setAudioUri(null);
    setFinalDurationMs(null);
    lastDurationMsRef.current = 0;
    meteringSamplesRef.current = [];
    setWaveform([]);
  };

  const durationMs = finalDurationMs ?? recorderState.durationMillis;

  return {
    isRecording: phase === 'recording',
    isPaused: phase === 'paused',
    recordingTime: Math.round(durationMs / 1000),
    audioUri,
    permissionStatus,
    checkingPermission,
    waveform,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    checkPermissions,
  };
}
