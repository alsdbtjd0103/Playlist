import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SettingsScreen from '../screens/SettingsScreen';
import { ThemeProvider } from '../contexts/ThemeContext';
import { restoreBackup } from '../lib/backup';
import * as DocumentPicker from 'expo-document-picker';

jest.mock('../lib/backup', () => ({
  restoreBackup: jest.fn(async () => ({ songs: { added: 1, skipped: 0 }, versions: { added: 2, skipped: 1 }, playlists: { added: 0, skipped: 0 }, playlistItems: { added: 0, skipped: 0 }, audioRestored: 2 })),
}));
const nav = { navigate: jest.fn() };
const renderScreen = () => render(
  <ThemeProvider>
    <SettingsScreen navigation={nav as any} route={{ key: 'Settings', name: 'Settings' } as any} />
  </ThemeProvider>
);

describe('SettingsScreen', () => {
  beforeEach(() => jest.clearAllMocks());
  it('내보내기 행 → Export 이동', () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('settings-export'));
    expect(nav.navigate).toHaveBeenCalledWith('Export');
  });
  it('가져오기 → 파일 선택 시 restoreBackup 호출', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///b.zip', name: 'b.zip' }] });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('settings-import'));
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith('file:///b.zip'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled()); // 완료 요약
  });
  it('가져오기 취소 시 restoreBackup 미호출', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('settings-import'));
    await waitFor(() => expect(restoreBackup).not.toHaveBeenCalled());
  });
});
