import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import SettingsScreen from '../screens/SettingsScreen';
import { ThemeProvider } from '../contexts/ThemeContext';
import { restoreBackup } from '../lib/backup';
import { scanStorage, cleanStorage } from '../lib/storageCleanup';
import { getSettings, updateSettings, DEFAULT_SETTINGS } from '../lib/settings';
import * as DocumentPicker from 'expo-document-picker';

jest.mock('../lib/backup', () => ({
  restoreBackup: jest.fn(async () => ({ songs: { added: 1, skipped: 0 }, versions: { added: 2, skipped: 1 }, playlists: { added: 0, skipped: 0 }, playlistItems: { added: 0, skipped: 0 }, audioRestored: 2 })),
  backupProgressRatio: jest.requireActual('../lib/backup').backupProgressRatio,
}));
jest.mock('../lib/storageCleanup', () => ({
  scanStorage: jest.fn(),
  cleanStorage: jest.fn(async () => 2 * 1024 * 1024),
  formatBytes: jest.requireActual('../lib/storageCleanup').formatBytes,
}));
const mockShow = jest.fn();
jest.mock('../contexts/ToastContext', () => ({
  useToast: () => ({ show: mockShow, showUndo: jest.fn() }),
}));

const MB = 1024 * 1024;
const report = (reclaimable: number) => ({
  recordingsBytes: 12 * MB,
  recordingCount: 3,
  orphanFiles: reclaimable ? [{ uri: 'file:///orphan.m4a', size: reclaimable }] : [],
  tempFiles: [],
  reclaimableBytes: reclaimable,
});

const nav = { navigate: jest.fn() };
const renderScreen = () => render(
  <ThemeProvider>
    <SettingsScreen navigation={nav as any} route={{ key: 'Settings', name: 'Settings' } as any} />
  </ThemeProvider>
);

describe('SettingsScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (scanStorage as jest.Mock).mockResolvedValue(report(0));
    await updateSettings(DEFAULT_SETTINGS);
  });

  it('내보내기 행 → Export 이동', async () => {
    const { getByTestId, findByText } = renderScreen();
    await findByText('녹음 3개 · 12.0 MB');
    fireEvent.press(getByTestId('settings-export'));
    expect(nav.navigate).toHaveBeenCalledWith('Export');
  });

  it('가져오기 → 파일 선택 시 restoreBackup 호출 후 토스트로 알린다', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///b.zip', name: 'b.zip' }] });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('settings-import'));
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith('file:///b.zip', expect.any(Function)));
    await waitFor(() => expect(mockShow).toHaveBeenCalledWith(expect.stringContaining('곡 1개 · 버전 2개를 복원했어요')));
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('가져오기 취소 시 restoreBackup 미호출', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: true, assets: null });
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('settings-import'));
    await waitFor(() => expect(restoreBackup).not.toHaveBeenCalled());
  });

  it('스위치·세그먼트·별점을 바꾸면 설정이 저장된다', async () => {
    const { getByTestId, findByText } = renderScreen();
    await findByText('녹음 3개 · 12.0 MB');
    fireEvent(getByTestId('settings-auto-open-player'), 'valueChange', true);
    fireEvent(getByTestId('settings-analytics'), 'valueChange', false);
    fireEvent.press(getByTestId('settings-repeat-one'));
    fireEvent.press(getByTestId('settings-skip-15'));
    fireEvent.press(getByTestId('settings-quality-low'));
    fireEvent.press(getByTestId('settings-rating-5'));
    expect(getSettings()).toMatchObject({
      autoOpenPlayer: true,
      analytics: false,
      repeatMode: 'one',
      skipSeconds: 15,
      recordingQuality: 'low',
      defaultRating: 5,
    });
  });

  it('저장 공간: 정리할 파일이 없으면 정리하기가 비활성', async () => {
    const { getByTestId, findByText } = renderScreen();
    await findByText('녹음 3개 · 12.0 MB');
    expect(getByTestId('settings-clean').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('저장 공간: 정리 확인 후 cleanStorage → 토스트 → 다시 점검', async () => {
    (scanStorage as jest.Mock).mockResolvedValueOnce(report(2 * MB)).mockResolvedValue(report(0));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      (buttons || []).find((b: any) => b.style === 'destructive')?.onPress?.();
    });
    const { getByTestId, findByText } = renderScreen();
    await findByText('2.0 MB');
    await act(async () => { fireEvent.press(getByTestId('settings-clean')); });
    expect(alertSpy).toHaveBeenCalledWith(
      '저장 공간 정리',
      expect.stringContaining('녹음 파일 1개(2.0 MB)'),
      expect.any(Array)
    );
    await waitFor(() => expect(cleanStorage).toHaveBeenCalled());
    await waitFor(() => expect(mockShow).toHaveBeenCalledWith('2.0 MB를 정리했어요'));
    await waitFor(() => expect(scanStorage).toHaveBeenCalledTimes(2));
    alertSpy.mockRestore();
  });

  it('정보: 앱 버전 표시와 문의하기 메일 열기', async () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
    const { getByText, getByTestId, findByText } = renderScreen();
    await findByText('녹음 3개 · 12.0 MB');
    expect(getByText('1.3.0')).toBeTruthy();
    await act(async () => { fireEvent.press(getByTestId('settings-contact')); });
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('mailto:yusung.min.developers@gmail.com'));
    openSpy.mockRestore();
  });
});
