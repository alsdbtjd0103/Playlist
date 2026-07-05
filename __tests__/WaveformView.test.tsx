import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../contexts/ThemeContext';
import { WaveformView } from '../components/WaveformView';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

const baseProps = {
  duration: 10,
  cuts: [] as { start: number; end: number }[],
  onChangeCuts: jest.fn(),
  selectedIndex: null as number | null,
  onSelectCut: jest.fn(),
  width: 300,
};

describe('WaveformView', () => {
  it('samples가 있으면 막대들을 렌더한다', () => {
    const { getByTestId } = wrap(
      <WaveformView {...baseProps} samples={[0.2, 0.8, 0.5]} />
    );
    expect(getByTestId('waveform-bars')).toBeTruthy();
  });

  it('samples가 비면 평탄 폴백 바를 렌더한다', () => {
    const { getByTestId } = wrap(<WaveformView {...baseProps} samples={[]} />);
    expect(getByTestId('waveform-fallback')).toBeTruthy();
  });

  it('cuts 개수만큼 구간/핸들을 렌더한다', () => {
    const { getByTestId } = wrap(
      <WaveformView
        {...baseProps}
        samples={[0.2, 0.8]}
        cuts={[{ start: 2, end: 3 }, { start: 6, end: 7 }]}
      />
    );
    expect(getByTestId('cut-0-region')).toBeTruthy();
    expect(getByTestId('cut-0-start')).toBeTruthy();
    expect(getByTestId('cut-0-end')).toBeTruthy();
    expect(getByTestId('cut-1-region')).toBeTruthy();
    expect(getByTestId('cut-1-end')).toBeTruthy();
  });

  it('구간을 탭하면 onSelectCut(index)를 호출한다', () => {
    const onSelectCut = jest.fn();
    const { getByTestId } = wrap(
      <WaveformView
        {...baseProps}
        samples={[0.2, 0.8]}
        cuts={[{ start: 2, end: 3 }]}
        onSelectCut={onSelectCut}
      />
    );
    fireEvent.press(getByTestId('cut-0-region'));
    expect(onSelectCut).toHaveBeenCalledWith(0);
  });
});
