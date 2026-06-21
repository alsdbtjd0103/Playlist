import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => {}) }),
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 10, playing: false, didJustFinish: false }),
}));
jest.mock('../lib/database', () => ({
  getVersion: jest.fn(),
  applyTrimToVersion: jest.fn(async () => {}),
  createTrimmedVersion: jest.fn(async () => 'new-v'),
}));

import { ThemeProvider } from '../contexts/ThemeContext';
import TrimEditorScreen from '../screens/TrimEditorScreen';
import { getVersion, createTrimmedVersion, applyTrimToVersion } from '../lib/database';

const nav = { goBack: jest.fn(), navigate: jest.fn() } as any;
const route = { params: { versionId: 'v1' } } as any;
const renderScreen = () =>
  render(
    <ThemeProvider>
      <TrimEditorScreen navigation={nav} route={route} />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  (getVersion as jest.Mock).mockResolvedValue({
    id: 'v1', songId: 's1', fileName: 'f.m4a', storageUrl: 'file:///f.m4a',
    rating: 4, duration: 10, recordedAt: new Date(), waveform: [0.2, 0.6, 0.4],
  });
});

it('로드 후 저장 시 createTrimmedVersion 호출(새 버전 저장 기본)', async () => {
  const r = renderScreen();
  await waitFor(() => r.getByTestId('trim-save-button'));
  await act(async () => { fireEvent.press(r.getByTestId('trim-save-button')); });
  await waitFor(() => expect(createTrimmedVersion).toHaveBeenCalled());
  expect(nav.goBack).toHaveBeenCalled();
});

it('duration·trim 없는 버전에서 오디오 길이로 range가 초기화된다', async () => {
  // version에 duration·trim 없음 → 에디터 안전망이 status.duration(10)으로 range 초기화
  (getVersion as jest.Mock).mockResolvedValue({
    id: 'v1', songId: 's1', fileName: 'f.m4a', storageUrl: 'file:///f.m4a',
    rating: 4, duration: undefined, trim: undefined, recordedAt: new Date(), waveform: [],
  });

  const r = renderScreen();
  await waitFor(() => r.getByTestId('trim-save-button'));
  await act(async () => { fireEvent.press(r.getByTestId('trim-save-button')); });
  await waitFor(() => expect(createTrimmedVersion).toHaveBeenCalled());
  // range는 { start: 0, end: 10 } (status.duration = 10)
  expect(createTrimmedVersion).toHaveBeenCalledWith('v1', { start: 0, end: 10 });
});

it('덮어쓰기 확인 Alert에서 destructive 버튼 누르면 applyTrimToVersion 호출', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const confirm = (buttons || []).find((b: any) => b.style === 'destructive');
    confirm?.onPress?.();
  });

  const r = renderScreen();
  await waitFor(() => r.getByTestId('trim-overwrite-button'));
  await act(async () => { fireEvent.press(r.getByTestId('trim-overwrite-button')); });
  await waitFor(() => expect(applyTrimToVersion).toHaveBeenCalled());
  expect(nav.goBack).toHaveBeenCalled();

  alertSpy.mockRestore();
});
