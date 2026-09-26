import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ExportScreen from '../screens/ExportScreen';
import { ThemeProvider } from '../contexts/ThemeContext';
import { buildBackup } from '../lib/backup';
import * as Sharing from 'expo-sharing';

jest.mock('../lib/backup', () => ({
  buildBackup: jest.fn(async () => ({ uri: 'file:///b.zip', counts: { songs: 1, versions: 2 } })),
  backupProgressRatio: jest.requireActual('../lib/backup').backupProgressRatio,
}));
jest.mock('../lib/database', () => ({
  getAllSongs: jest.fn(async () => [{ id: 's1', title: '곡1' }]),
  getPlaylists: jest.fn(async () => [{ id: 'p1', name: 'PL1' }]),
}));
const nav = { navigate: jest.fn(), goBack: jest.fn() };
const renderScreen = () => render(
  <ThemeProvider>
    <ExportScreen navigation={nav as any} route={{ key: 'Export', name: 'Export' } as any} />
  </ThemeProvider>
);

describe('ExportScreen', () => {
  beforeEach(() => jest.clearAllMocks());
  it('전체 백업 → buildBackup(all) + 공유 호출', async () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('export-all'));
    await waitFor(() => expect(buildBackup).toHaveBeenCalledWith({ type: 'all' }, expect.any(Function)));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
  });
});

describe('ExportScreen 진행도', () => {
  it('백업 중 진행 콜백을 받아 진행 상태를 보여준다', async () => {
    let release: () => void = () => {};
    (buildBackup as jest.Mock).mockImplementationOnce(async (_sel: any, onProgress: any) => {
      onProgress({ phase: 'copy', done: 3, total: 4 });
      await new Promise<void>((r) => { release = r; });
      return { uri: 'file:///b.zip', counts: { songs: 1, versions: 4 } };
    });
    const { getByTestId, findByText } = renderScreen();
    fireEvent.press(getByTestId('export-all'));
    expect(await findByText('녹음 파일 준비 중 3/4')).toBeTruthy();
    release();
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
  });
});
