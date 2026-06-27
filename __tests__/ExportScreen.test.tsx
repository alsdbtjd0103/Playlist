import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ExportScreen from '../screens/ExportScreen';
import { ThemeProvider } from '../contexts/ThemeContext';
import { buildBackup } from '../lib/backup';
import * as Sharing from 'expo-sharing';

jest.mock('../lib/backup', () => ({ buildBackup: jest.fn(async () => ({ uri: 'file:///b.zip', counts: { songs: 1, versions: 2 } })) }));
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
    await waitFor(() => expect(buildBackup).toHaveBeenCalledWith({ type: 'all' }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
  });
});
