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
import { deleteAudioLocally } from '../lib/storage';
import { setRecordingActive } from '../lib/recordingState';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { getSettings } from '../lib/settings';
import { haptic } from '../lib/haptics';

const KEEP_AWAKE_TAG = 'recording';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

// 녹음 진행 상태. recorderState.isRecording 은 폴링으로만 갱신되어
// pause()/record() 직후 잠시 stale 하므로, UI 분기는 폴링값이 아니라
// 핸들러가 동기적으로 갱신하는 이 명시적 상태 머신을 단일 기준으로 삼는다.
type RecordingPhase = 'idle' | 'recording' | 'paused' | 'stopped';

export interface RecordingResult {
  uri: string;
  /** 초 단위(반올림) */
  duration: number;
  waveform: number[];
}

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
  /** 정지 후 결과를 돌려준다(실패·이미 정지 상태면 null). 상태 갱신을 기다리지 않고 바로 저장할 때 쓴다. */
  stopRecording: () => Promise<RecordingResult | null>;
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
    setRecordingActive(next === 'recording' || next === 'paused');
    setPhase(next);
  };

  // 화면을 떠나면 녹음 중 플래그를 해제한다(남아 있으면 원격 재생이 계속 막힌다)
  useEffect(() => () => setRecordingActive(false), []);

  // 녹음(일시정지 포함) 중에는 설정에 따라 화면이 꺼지지 않게 한다.
  const active = phase === 'recording' || phase === 'paused';
  useEffect(() => {
    if (!active || !getSettings().keepAwakeWhileRecording) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch((error) => console.warn('화면 켜짐 유지 실패:', error));
    return () => {
      try {
        Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => undefined);
      } catch {
        // 해제 실패는 무시(화면이 계속 켜져 있을 뿐)
      }
    };
  }, [active]);

  const finalize = useCallback((uri: string | null | undefined, durationMs: number): RecordingResult | null => {
    updatePhase('stopped');
    setFinalDurationMs(durationMs);
    const bars = normalizeWaveform(meteringSamplesRef.current);
    setWaveform(bars);
    if (uri && uri.length > 0) {
      setAudioUri(uri);
      return { uri, duration: Math.round(durationMs / 1000), waveform: bars };
    }
    Alert.alert('오류', '녹음 파일을 찾을 수 없습니다.');
    return null;
  }, []);

  // 알림의 "Stop" 버튼(Android 포그라운드 서비스)처럼 앱 밖에서 녹음이 끝난 경우,
  // JS 상태는 여전히 'recording' 이라 화면이 멈춘 것처럼 보인다. 완료 이벤트로 동기화한다.
  // Android 녹음기 오류(미디어 서버 종료, 다른 앱의 마이크 점유)도 같은 이벤트로 오는데,
  // 이때 네이티브 녹음기는 정리되지 않아 다음 녹음이 "이미 준비됨" 오류로 계속 실패한다.
  const recorderRef = useRef<ReturnType<typeof useAudioRecorder> | null>(null);
  const onRecorderStatus = useCallback(
    (status: RecordingStatus) => {
      if (!status.isFinished || stoppingRef.current) return;
      if (phaseRef.current !== 'recording' && phaseRef.current !== 'paused') return;
      const recorder = recorderRef.current;
      const uri = status.url ?? recorder?.uri ?? null; // 오류여도 그때까지 녹음된 부분은 살린다
      if (status.hasError) {
        console.error('녹음 중 오류:', status.error);
        recorder?.stop().catch(() => undefined);
      }
      finalize(uri, lastDurationMsRef.current);
    },
    [finalize],
  );

  // 녹음 품질은 훅이 처음 마운트될 때 한 번만 읽는다(녹음 중 설정이 바뀌어 녹음기가 다시 만들어지지 않게).
  const [recordingOptions] = useState(() => ({
    ...(getSettings().recordingQuality === 'low' ? RecordingPresets.LOW_QUALITY : RecordingPresets.HIGH_QUALITY),
    isMeteringEnabled: true,
  }));
  const audioRecorder = useAudioRecorder(recordingOptions, onRecorderStatus);
  recorderRef.current = audioRecorder;
  // 100ms 폴링은 녹음 모달 전체를 초당 10번 다시 그려 버벅이게 한다.
  // 200ms 도 파형(80칸)·타이머 표시에는 충분하다.
  const recorderState = useAudioRecorderState(audioRecorder, 200);

  // 오디오 모드 설정 (녹음 시작 시에도 완료를 보장하기 위해 다시 await 한다)
  useEffect(() => {
    ensureRecordingAudioMode().catch((error) => {
      console.error('오디오 모드 설정 실패:', error);
    });
  }, []);

  // iOS 는 전화·알람 등으로 오디오가 끊기면 녹음기를 네이티브에서 일시정지하고 알려주지 않는다.
  // 그대로 두면 화면은 REC 인데 타이머가 멈춘 상태가 되므로, 실제 상태를 확인해 일시정지로 맞춘다.
  useEffect(() => {
    if (phase !== 'recording' || recorderState.isRecording) return;
    const timer = setTimeout(() => {
      if (phaseRef.current !== 'recording' || stoppingRef.current) return;
      try {
        if (!audioRecorder.getStatus().isRecording) {
          updatePhase('paused');
          Alert.alert('녹음 일시정지', '다른 소리(전화·알람 등) 때문에 녹음이 일시정지되었습니다. 재개 버튼을 눌러 이어서 녹음하세요.');
        }
      } catch {
        // 상태 조회 실패 시 판단을 미룬다
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [phase, recorderState.isRecording, audioRecorder]);

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
      try {
        await audioRecorder.prepareToRecordAsync();
      } catch (error: any) {
        // 이전 녹음이 오류로 끝나 네이티브 녹음기가 준비된 채 남은 경우: 정리 후 한 번 재시도
        if (!/prepared/i.test(String(error?.message ?? ''))) throw error;
        await audioRecorder.stop().catch(() => undefined);
        await audioRecorder.prepareToRecordAsync();
      }
      audioRecorder.record();
      setPermissionStatus('granted');
      setAudioUri(null);
      updatePhase('recording');
      haptic('medium');
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

  const stopRecording = async (): Promise<RecordingResult | null> => {
    if (stoppingRef.current) return null; // 정지 버튼 연타 방지
    if (phaseRef.current !== 'recording' && phaseRef.current !== 'paused') return null;
    stoppingRef.current = true;
    try {
      let durationMs = lastDurationMsRef.current;
      try {
        durationMs = Math.max(durationMs, audioRecorder.getStatus().durationMillis);
      } catch {
        // getStatus 실패 시 마지막 폴링값 사용
      }
      await audioRecorder.stop();
      const result = finalize(audioRecorder.uri, durationMs);
      if (result) haptic('success');
      return result;
    } catch (error) {
      // Android 는 시작 직후 정지하면 MediaRecorder.stop() 이 실패한다. 네이티브 녹음기는 이미
      // 정리됐으므로 화면을 REC 상태로 두지 말고 처음으로 되돌린다(남은 파일은 재생 불가).
      console.error('녹음 중지 실패:', error);
      const uri = audioRecorder.uri;
      updatePhase('idle');
      setAudioUri(null);
      setFinalDurationMs(null);
      meteringSamplesRef.current = [];
      setWaveform([]);
      if (uri) deleteAudioLocally(uri);
      Alert.alert('녹음 실패', '녹음이 너무 짧거나 저장되지 않았습니다. 다시 녹음해 주세요.');
      return null;
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
