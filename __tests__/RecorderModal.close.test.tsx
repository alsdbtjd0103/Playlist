import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '../contexts/ThemeContext';

// 녹음 상태는 훅을 목으로 바꿔 직접 지정한다
const mockRecording = {
  isRecording: true,
  isPaused: false,
  recordingTime: 42,
  audioUri: null as string | null,
  permissionStatus: 'granted',
  checkingPermission: false,
  waveform: [] as number[],
  startRecording: jest.fn(async () => {}),
  pauseRecording: jest.fn(),
  resumeRecording: jest.fn(),
  stopRecording: jest.fn(async () => ({ uri: 'file:///take.m4a', duration: 42, waveform: [0.5] })),
  resetRecording: jest.fn(),
  checkPermissions: jest.fn(async () => {}),
};
jest.mock('../hooks/useRecording', () => ({ useRecording: () => mockRecording }));
jest.mock('../contexts/PlayerContext', () => ({
  usePlayer: () => ({ isPlaying: false, togglePlayPause: jest.fn() }),
}));
const mockDeleteAudio = jest.fn();
jest.mock('../lib/storage', () => ({ deleteAudioLocally: (uri: string) => mockDeleteAudio(uri) }));

import RecorderModal from '../components/RecorderModal';

const renderModal = (onSave = jest.fn(async () => {}), onClose = jest.fn()) => {
  const utils = render(
    <ThemeProvider>
      <RecorderModal visible onClose={onClose} onSave={onSave} />
    </ThemeProvider>,
  );
  return { ...utils, onSave, onClose };
};

// Alert 에 넘어온 버튼 중 text 로 찾아 누른다
const pressAlertButton = async (spy: jest.SpyInstance, text: string) => {
  const buttons = spy.mock.calls[spy.mock.calls.length - 1][2] as { text: string; onPress?: () => any }[];
  const button = buttons.find((b) => b.text === text);
  expect(button).toBeDefined();
  await act(async () => {
    await button!.onPress?.();
  });
};

describe('RecorderModal — 실수로 닫아도 녹음이 사라지지 않는다', () => {
  let alertSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecording.isRecording = true;
    mockRecording.audioUri = null;
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alertSpy.mockRestore());

  it('녹음 중에는 정지 버튼 아래의 닫기 버튼이 보이지 않는다', () => {
    const { queryByText } = renderModal();
    expect(queryByText('닫기')).toBeNull();
  });

  it('녹음 중 뒤로가기(onRequestClose)는 바로 닫지 않고 저장/버리기/계속을 묻는다', () => {
    const { UNSAFE_getByType, onClose } = renderModal();
    const { Modal } = require('react-native');
    act(() => {
      UNSAFE_getByType(Modal).props.onRequestClose();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(mockRecording.resetRecording).not.toHaveBeenCalled();
    const texts = (alertSpy.mock.calls[0][2] as { text: string }[]).map((b) => b.text);
    expect(texts).toEqual(['계속 녹음', '버리기', '저장하고 닫기']);
  });

  it('"저장하고 닫기"를 누르면 녹음을 정지하고 저장한 뒤 닫는다', async () => {
    const { UNSAFE_getByType, onSave, onClose } = renderModal();
    const { Modal } = require('react-native');
    act(() => {
      UNSAFE_getByType(Modal).props.onRequestClose();
    });
    await pressAlertButton(alertSpy, '저장하고 닫기');
    expect(mockRecording.stopRecording).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith('file:///take.m4a', 3, undefined, [0.5], 42, 0);
    expect(onClose).toHaveBeenCalled();
  });

  it('녹음 전에는 확인 없이 바로 닫힌다', () => {
    mockRecording.isRecording = false;
    const { getByText, onClose } = renderModal();
    fireEvent.press(getByText('닫기'));
    expect(alertSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('저장 전 녹음을 "버리기"로 닫으면 임시 파일을 지운다', async () => {
    mockRecording.isRecording = false;
    mockRecording.audioUri = 'file:///review.m4a';
    const { getByText, onClose } = renderModal();
    fireEvent.press(getByText('취소'));
    await pressAlertButton(alertSpy, '버리기');
    expect(mockDeleteAudio).toHaveBeenCalledWith('file:///review.m4a');
    expect(onClose).toHaveBeenCalled();
  });
});
