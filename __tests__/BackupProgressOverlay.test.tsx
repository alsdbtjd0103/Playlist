import React from 'react';
import { render } from '@testing-library/react-native';
import BackupProgressOverlay from '../components/BackupProgressOverlay';
import { ThemeProvider } from '../contexts/ThemeContext';

jest.mock('../lib/backup', () => ({
  backupProgressRatio: jest.requireActual('../lib/backup').backupProgressRatio,
}));

const renderOverlay = (progress: any) => render(
  <ThemeProvider>
    <BackupProgressOverlay title="백업을 만들고 있어요" progress={progress} />
  </ThemeProvider>
);

describe('BackupProgressOverlay', () => {
  it('복사 단계: 파일 개수와 퍼센트를 보여준다', () => {
    const { getByText } = renderOverlay({ phase: 'copy', done: 5, total: 10 });
    expect(getByText('백업을 만들고 있어요')).toBeTruthy();
    expect(getByText('녹음 파일 준비 중 5/10')).toBeTruthy();
    expect(getByText('45%')).toBeTruthy();
  });

  it('복원 단계 문구', () => {
    const { getByText } = renderOverlay({ phase: 'restore', done: 1, total: 4 });
    expect(getByText('녹음 파일 복원 중 1/4')).toBeTruthy();
  });

  it('진행 정보가 아직 없으면 0%로 시작한다', () => {
    const { getByText } = renderOverlay(null);
    expect(getByText('0%')).toBeTruthy();
  });
});
