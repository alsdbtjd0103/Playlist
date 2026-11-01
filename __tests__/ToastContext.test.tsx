import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../contexts/ThemeContext';
import { ToastProvider, useToast, UNDO_WINDOW_MS } from '../contexts/ToastContext';

let api: ReturnType<typeof useToast>;
function Probe() {
  api = useToast();
  return <Text>probe</Text>;
}

const renderToast = () =>
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 400, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
      <ThemeProvider>
        <ToastProvider>
          <Probe />
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('토스트·실행 취소', () => {
  it('일반 알림을 보여 준다', () => {
    const r = renderToast();
    act(() => api.show('저장했어요'));
    expect(r.getByText('저장했어요')).toBeTruthy();
  });

  it('실행 취소 시간이 지나면 작업을 확정한다', async () => {
    renderToast();
    const onCommit = jest.fn();
    act(() => api.showUndo('곡을 삭제했어요', { onCommit }));
    expect(onCommit).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(UNDO_WINDOW_MS);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('실행 취소를 누르면 확정하지 않고 되돌린다', async () => {
    const r = renderToast();
    const onCommit = jest.fn();
    const onUndo = jest.fn();
    act(() => api.showUndo('곡을 삭제했어요', { onCommit, onUndo }));
    fireEvent.press(r.getByTestId('toast-undo'));
    await act(async () => {
      jest.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    });
    expect(onUndo).toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('다른 삭제가 이어지면 앞의 삭제는 바로 확정한다', async () => {
    renderToast();
    const first = jest.fn();
    const second = jest.fn();
    act(() => api.showUndo('첫 번째', { onCommit: first }));
    await act(async () => {
      api.showUndo('두 번째', { onCommit: second });
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('대기 중 화면이 사라지면 삭제를 확정하지 않는다(데이터 보존)', async () => {
    const r = renderToast();
    const onCommit = jest.fn();
    act(() => api.showUndo('곡을 삭제했어요', { onCommit }));
    r.unmount();
    await act(async () => {
      jest.advanceTimersByTime(UNDO_WINDOW_MS * 2);
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('실행 취소 대기 중 일반 알림이 와도 삭제를 앞당겨 확정하지 않는다', async () => {
    const r = renderToast();
    const onCommit = jest.fn();
    act(() => api.showUndo('곡을 삭제했어요', { onCommit }));
    act(() => api.show('메모를 저장했어요'));
    expect(onCommit).not.toHaveBeenCalled();
    expect(r.getByTestId('toast-undo')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(UNDO_WINDOW_MS);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
