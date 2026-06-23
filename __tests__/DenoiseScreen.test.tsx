import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => {}) }),
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 10, playing: false, didJustFinish: false }),
}));
jest.mock('../lib/database', () => ({
  getVersion: jest.fn(),
  addVersion: jest.fn(async () => 'new-v'),
  deleteVersion: jest.fn(async () => {}),
}));
jest.mock('../lib/storage', () => ({
  saveDenoisedFile: jest.fn(async () => ({ fileName: 'clean.m4a', localUri: 'file:///rec/clean.m4a' })),
  deleteAudioLocally: jest.fn(async () => {}),
}));
jest.mock('../lib/nativeDenoise', () => ({
  isNativeDenoiseAvailable: jest.fn(() => true),
  denoiseToFile: jest.fn(async () => ({ uri: 'file:///tmp/clean.m4a', waveform: [0.1, 0.3] })),
  onDenoiseProgress: jest.fn(() => ({ remove: jest.fn() })),
}));

import { ThemeProvider } from '../contexts/ThemeContext';
import DenoiseScreen from '../screens/DenoiseScreen';
import { getVersion, addVersion, deleteVersion } from '../lib/database';
import { denoiseToFile } from '../lib/nativeDenoise';
import { saveDenoisedFile, deleteAudioLocally } from '../lib/storage';

const nav = { goBack: jest.fn(), navigate: jest.fn() } as any;
const route = { params: { versionId: 'v1' } } as any;
const renderScreen = () =>
  render(
    <ThemeProvider>
      <DenoiseScreen navigation={nav} route={route} />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  (getVersion as jest.Mock).mockResolvedValue({
    id: 'v1', songId: 's1', fileName: 'f.m4a', storageUrl: 'file:///f.m4a',
    rating: 4, duration: 10, recordedAt: new Date(), waveform: [0.2, 0.6],
  });
});

it('처리 완료 후 새 버전으로 저장하면 addVersion 호출 + goBack', async () => {
  const r = renderScreen();
  // 처리(denoiseToFile)가 끝나면 저장 버튼이 노출됨
  await waitFor(() => r.getByTestId('denoise-save-new'));
  expect(denoiseToFile).toHaveBeenCalledWith('file:///f.m4a');

  await act(async () => { fireEvent.press(r.getByTestId('denoise-save-new')); });

  await waitFor(() => expect(addVersion).toHaveBeenCalled());
  expect(saveDenoisedFile).toHaveBeenCalledWith('s1', 'file:///tmp/clean.m4a');
  // editedFrom = 원본 id, 정제본 파형 전달
  expect(addVersion).toHaveBeenCalledWith(
    's1', 'clean.m4a', 'file:///rec/clean.m4a', 4, 10, undefined,
    { waveform: [0.1, 0.3], editedFrom: 'v1' }
  );
  expect(nav.goBack).toHaveBeenCalled();
});

it('원본 대체 확인 시 addVersion + 원본 삭제', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const confirm = (buttons || []).find((b: any) => b.style === 'destructive');
    confirm?.onPress?.();
  });

  const r = renderScreen();
  await waitFor(() => r.getByTestId('denoise-save-replace'));
  await act(async () => { fireEvent.press(r.getByTestId('denoise-save-replace')); });

  await waitFor(() => expect(addVersion).toHaveBeenCalled());
  expect(deleteVersion).toHaveBeenCalledWith('v1');
  expect(deleteAudioLocally).toHaveBeenCalledWith('file:///f.m4a');
  expect(nav.goBack).toHaveBeenCalled();

  alertSpy.mockRestore();
});

it('녹음을 찾지 못하면 goBack', async () => {
  (getVersion as jest.Mock).mockResolvedValue(null);
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  renderScreen();
  await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
  alertSpy.mockRestore();
});
