import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => {}) }),
  useAudioPlayerStatus: () => ({ currentTime: 0, duration: 10, playing: false, didJustFinish: false }),
}));
jest.mock('../lib/database', () => ({
  getVersion: jest.fn(),
  applyTrimToVersion: jest.fn(async () => {}),
  createTrimmedVersion: jest.fn(async () => 'new-v'),
}));

import TrimEditorScreen from '../screens/TrimEditorScreen';
import { getVersion, createTrimmedVersion } from '../lib/database';

const nav = { goBack: jest.fn(), navigate: jest.fn() } as any;
const route = { params: { versionId: 'v1' } } as any;

beforeEach(() => {
  (getVersion as jest.Mock).mockResolvedValue({
    id: 'v1', songId: 's1', fileName: 'f.m4a', storageUrl: 'file:///f.m4a',
    rating: 4, duration: 10, recordedAt: new Date(), waveform: [0.2, 0.6, 0.4],
  });
});

it('로드 후 저장 시 createTrimmedVersion 호출(새 버전 저장 기본)', async () => {
  const r = render(<TrimEditorScreen navigation={nav} route={route} />);
  await waitFor(() => r.getByTestId('trim-save-button'));
  await act(async () => { fireEvent.press(r.getByTestId('trim-save-button')); });
  await waitFor(() => expect(createTrimmedVersion).toHaveBeenCalled());
  expect(nav.goBack).toHaveBeenCalled();
});
