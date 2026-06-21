import { renderHook, act } from '@testing-library/react-native';

// expo-audio 목: recorderState는 실제 라이브러리처럼 500ms 폴링으로만 갱신되므로
// pause()/record() 직후에는 stale 값을 반환한다. __setRecorderState 로 폴링 시점을 흉내낸다.
const mockRecorder = {
  id: 'rec-1',
  uri: 'file:///rec.m4a',
  prepareToRecordAsync: jest.fn(async () => {}),
  record: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(async () => {}),
};

jest.mock('expo-audio', () => {
  const React = require('react');
  let state = {
    canRecord: true,
    isRecording: false,
    durationMillis: 0,
    mediaServicesDidReset: false,
    url: null as string | null,
  };
  const listeners = new Set<() => void>();
  return {
    RecordingPresets: { HIGH_QUALITY: {} },
    AudioModule: {
      requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    },
    setAudioModeAsync: jest.fn(async () => {}),
    useAudioRecorder: () => mockRecorder,
    useAudioRecorderState: () => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const l = () => force((n: number) => n + 1);
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      }, []);
      return state;
    },
    // 테스트 전용: 폴링으로 갱신되는 recorderState를 수동으로 흉내낸다.
    __setRecorderState: (partial: Record<string, unknown>) => {
      state = { ...state, ...partial };
      listeners.forEach((l) => l());
    },
  };
});

import { useRecording } from '../hooks/useRecording';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExpoAudio = require('expo-audio');

describe('useRecording — 일시정지/재개', () => {
  it('일시정지하면 폴링된 isRecording이 아직 stale(true)여도 isPaused가 유지된다', async () => {
    const { result } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.startRecording();
    });
    // 폴링이 "녹음 중"을 반영
    act(() => {
      ExpoAudio.__setRecorderState({ isRecording: true });
    });
    expect(result.current.isRecording).toBe(true);
    expect(result.current.isPaused).toBe(false);

    // 일시정지: 핸들러는 즉시 paused로 만들지만 폴링된 isRecording은 아직 stale(true)
    act(() => {
      result.current.pauseRecording();
    });
    // 폴링이 따라잡아 isRecording=false가 되는 순간
    act(() => {
      ExpoAudio.__setRecorderState({ isRecording: false });
    });

    // 두 플래그 모두 false면 RecorderModal이 "시작 버튼"으로 깜빡인다 → 버그
    expect(result.current.isPaused).toBe(true);
    expect(result.current.isRecording).toBe(false);
  });

  it('재개하면 폴링이 isRecording=true로 따라잡기 전에도 시작 버튼으로 깜빡이지 않는다', async () => {
    const { result } = renderHook(() => useRecording());

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      ExpoAudio.__setRecorderState({ isRecording: true });
    });

    act(() => {
      result.current.pauseRecording();
    });
    act(() => {
      ExpoAudio.__setRecorderState({ isRecording: false });
    });
    expect(result.current.isPaused).toBe(true);

    // 재개: 핸들러 직후 폴링된 isRecording은 아직 stale(false)
    act(() => {
      result.current.resumeRecording();
    });

    // isRecording(false) && isPaused(false) 둘 다 false인 "시작 버튼" 윈도우가 없어야 한다
    expect(result.current.isPaused || result.current.isRecording).toBe(true);

    // 폴링이 따라잡으면 정상적으로 녹음 중 상태
    act(() => {
      ExpoAudio.__setRecorderState({ isRecording: true });
    });
    expect(result.current.isRecording).toBe(true);
    expect(result.current.isPaused).toBe(false);
  });
});
