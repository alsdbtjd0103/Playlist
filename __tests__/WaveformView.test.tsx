import React from 'react';
import { render } from '@testing-library/react-native';
import { WaveformView } from '../components/WaveformView';

describe('WaveformView', () => {
  it('samples가 있으면 막대들을 렌더한다', () => {
    const { getByTestId } = render(
      <WaveformView samples={[0.2, 0.8, 0.5]} duration={10} range={{ start: 0, end: 10 }} onChangeRange={jest.fn()} width={300} />
    );
    expect(getByTestId('waveform-bars')).toBeTruthy();
    expect(getByTestId('trim-handle-start')).toBeTruthy();
    expect(getByTestId('trim-handle-end')).toBeTruthy();
  });

  it('samples가 비면 평탄 폴백 바를 렌더한다', () => {
    const { getByTestId } = render(
      <WaveformView samples={[]} duration={10} range={{ start: 0, end: 10 }} onChangeRange={jest.fn()} width={300} />
    );
    expect(getByTestId('waveform-fallback')).toBeTruthy();
  });
});
