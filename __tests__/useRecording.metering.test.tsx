import { renderHook, act } from '@testing-library/react-native';

// Variables prefixed with 'mock' are allowed inside jest.mock() factory per Jest rules
let mockRecState: any = { canRecord: true, isRecording: false, durationMillis: 0, metering: undefined };
const mockListeners = new Set<() => void>();
const mockRecorder = {
  uri: 'file:///rec.m4a',
  prepareToRecordAsync: jest.fn(async () => {}),
  record: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(async () => {}),
};

jest.mock('expo-audio', () => {
  const React = require('react');
  return {
    RecordingPresets: { HIGH_QUALITY: {} },
    AudioModule: { requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })) },
    setAudioModeAsync: jest.fn(async () => {}),
    useAudioRecorder: () => mockRecorder,
    useAudioRecorderState: () => {
      const [, force] = React.useState(0);
      React.useEffect(() => {
        const l = () => force((n: number) => n + 1);
        mockListeners.add(l);
        return () => { mockListeners.delete(l); };
      }, []);
      return mockRecState;
    },
    __set: (p: any) => { mockRecState = { ...mockRecState, ...p }; mockListeners.forEach((l) => l()); },
  };
});

import { useRecording } from '../hooks/useRecording';
const ExpoAudio = require('expo-audio');

it('녹음 중 미터링 샘플을 모아 stop 후 정규화된 waveform을 제공', async () => {
  const { result } = renderHook(() => useRecording());
  await act(async () => { await result.current.startRecording(); });
  // 미터링 폴링 흉내
  act(() => { ExpoAudio.__set({ isRecording: true, metering: -60 }); });
  act(() => { ExpoAudio.__set({ metering: 0 }); });
  act(() => { ExpoAudio.__set({ metering: -30 }); });
  await act(async () => { await result.current.stopRecording(); });
  expect(result.current.waveform.length).toBeGreaterThan(0);
  result.current.waveform.forEach((v) => {
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});
