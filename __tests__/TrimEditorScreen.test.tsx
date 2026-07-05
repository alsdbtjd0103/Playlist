import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => {}) }),
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 10, playing: false, didJustFinish: false }),
}));
jest.mock('../lib/database', () => ({
  getVersion: jest.fn(),
  applyCutsToVersion: jest.fn(async () => {}),
  createEditedVersion: jest.fn(async () => 'new-v'),
}));

import { ThemeProvider } from '../contexts/ThemeContext';
import TrimEditorScreen from '../screens/TrimEditorScreen';
import { getVersion, createEditedVersion, applyCutsToVersion } from '../lib/database';

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

it('cut 없이 저장하면 createEditedVersion([]) 호출(새 버전 저장 기본)', async () => {
  const r = renderScreen();
  await waitFor(() => r.getByTestId('trim-save-button'));
  await act(async () => { fireEvent.press(r.getByTestId('trim-save-button')); });
  await waitFor(() => expect(createEditedVersion).toHaveBeenCalledWith('v1', []));
  expect(nav.goBack).toHaveBeenCalled();
});

it('구간 추가 → 저장 시 cut 1개가 저장된다', async () => {
  const r = renderScreen();
  await waitFor(() => r.getByTestId('trim-add-cut-button'));
  await act(async () => { fireEvent.press(r.getByTestId('trim-add-cut-button')); });
  // 파형에 cut 구간이 하나 생김
  await waitFor(() => r.getByTestId('cut-0-region'));
  await act(async () => { fireEvent.press(r.getByTestId('trim-save-button')); });
  await waitFor(() => expect(createEditedVersion).toHaveBeenCalled());
  const cutsArg = (createEditedVersion as jest.Mock).mock.calls[0][1];
  expect(cutsArg).toHaveLength(1);
  expect(cutsArg[0].end - cutsArg[0].start).toBeGreaterThan(0);
});

it('구간 추가 후 선택 삭제하면 다시 0개', async () => {
  const r = renderScreen();
  await waitFor(() => r.getByTestId('trim-add-cut-button'));
  await act(async () => { fireEvent.press(r.getByTestId('trim-add-cut-button')); });
  await waitFor(() => r.getByTestId('cut-0-region'));
  // 추가 직후 선택 상태 → 삭제
  await act(async () => { fireEvent.press(r.getByTestId('trim-delete-cut-button')); });
  await act(async () => { fireEvent.press(r.getByTestId('trim-save-button')); });
  await waitFor(() => expect(createEditedVersion).toHaveBeenCalledWith('v1', []));
});

it('덮어쓰기 확인 Alert에서 destructive 버튼 누르면 applyCutsToVersion 호출', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    const confirm = (buttons || []).find((b: any) => b.style === 'destructive');
    confirm?.onPress?.();
  });

  const r = renderScreen();
  await waitFor(() => r.getByTestId('trim-overwrite-button'));
  await act(async () => { fireEvent.press(r.getByTestId('trim-overwrite-button')); });
  await waitFor(() => expect(applyCutsToVersion).toHaveBeenCalled());
  expect(nav.goBack).toHaveBeenCalled();

  alertSpy.mockRestore();
});
