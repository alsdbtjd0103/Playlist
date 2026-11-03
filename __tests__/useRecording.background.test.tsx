import { renderHook, act } from '@testing-library/react-native';

// 백그라운드 녹음 관련 동작: 오디오 모드, 정지 후 길이 보존, 알림에서 정지한 경우 동기화.
let mockStatusListener: ((status: any) => void) | undefined;
let mockDurationMillis = 0;
const mockRecorder = {
  id: 'rec-bg',
  uri: 'file:///bg.m4a',
  prepareToRecordAsync: jest.fn(async () => {}),
  record: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(async () => {
    // 실제 네이티브처럼 정지 후에는 길이가 0 으로 초기화된다
    mockDurationMillis = 0;
  }),
  getStatus: jest.fn(() => ({ durationMillis: mockDurationMillis })),
};

const mockDeleteAudio = jest.fn();
jest.mock('../lib/storage', () => ({ deleteAudioLocally: (uri: string) => mockDeleteAudio(uri) }));

jest.mock('expo-audio', () => {
  const React = require('react');
  const listeners = new Set<() => void>();
  return {
    RecordingPresets: { HIGH_QUALITY: {} },
    AudioModule: {
      requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    },
    setAudioModeAsync: jest.fn(async () => {}),
    useAudioRecorder: (_options: unknown, listener?: (status: any) => void) => {
      mockStatusListener = listener;
      return mockRecorder;
    },
    useAudioRecorderState: () => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const l = () => force((n: number) => n + 1);
        listeners.add(l);
        return () => {
          listeners.delete(l);
        };
      }, []);
      return { canRecord: true, isRecording: false, durationMillis: mockDurationMillis };
    },
    __tick: () => listeners.forEach((l) => l()),
  };
});

import { useRecording } from '../hooks/useRecording';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExpoAudio = require('expo-audio');

beforeEach(() => {
  jest.clearAllMocks();
  mockDurationMillis = 0;
});

async function startAndRecordFor(result: { current: ReturnType<typeof useRecording> }, ms: number) {
  await act(async () => {
    await result.current.startRecording();
  });
  act(() => {
    mockDurationMillis = ms;
    ExpoAudio.__tick();
  });
}

describe('useRecording — 백그라운드 녹음', () => {
  it('녹음 시작 전에 백그라운드 녹음을 허용하는 오디오 모드를 설정한다', async () => {
    const { result } = renderHook(() => useRecording());
    await act(async () => {
      await result.current.startRecording();
    });
    expect(ExpoAudio.setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        allowsRecording: true,
        shouldPlayInBackground: true,
        allowsBackgroundRecording: true,
      }),
    );
    expect(mockRecorder.record).toHaveBeenCalled();
  });

  it('정지 후 네이티브 길이가 0 으로 초기화돼도 녹음 시간을 유지한다', async () => {
    const { result } = renderHook(() => useRecording());
    await startAndRecordFor(result, 65_000);
    expect(result.current.recordingTime).toBe(65);

    await act(async () => {
      await result.current.stopRecording();
    });
    expect(result.current.audioUri).toBe('file:///bg.m4a');
    expect(result.current.recordingTime).toBe(65);
  });

  it('알림의 Stop 버튼으로 네이티브에서 정지되면 화면 상태를 정지로 동기화한다', async () => {
    const { result } = renderHook(() => useRecording());
    await startAndRecordFor(result, 30_000);
    expect(result.current.isRecording).toBe(true);

    act(() => {
      mockStatusListener?.({ id: 1, isFinished: true, hasError: false, error: null, url: 'file:///notif.m4a' });
    });
    expect(result.current.isRecording).toBe(false);
    expect(result.current.isPaused).toBe(false);
    expect(result.current.audioUri).toBe('file:///notif.m4a');
    expect(result.current.recordingTime).toBe(30);
  });

  it('정지 버튼을 연타해도 stop 은 한 번만 호출된다', async () => {
    const { result } = renderHook(() => useRecording());
    await startAndRecordFor(result, 5_000);
    await act(async () => {
      await Promise.all([result.current.stopRecording(), result.current.stopRecording()]);
    });
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  });

  it('녹음 도중 버리면 정지 후 녹음기 임시 파일을 지운다', async () => {
    const { result } = renderHook(() => useRecording());
    await startAndRecordFor(result, 3_000);
    await act(async () => {
      result.current.resetRecording();
    });
    expect(mockRecorder.stop).toHaveBeenCalled();
    expect(mockDeleteAudio).toHaveBeenCalledWith('file:///bg.m4a');
    expect(result.current.isRecording).toBe(false);
  });
});
