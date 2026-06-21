import React from 'react';
import { Text, Pressable } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';

function Probe() {
  const { colors, mode, cycleMode } = useTheme();
  return (
    <>
      <Text testID="bg">{colors.bg}</Text>
      <Text testID="mode">{mode}</Text>
      <Pressable testID="cycle" onPress={cycleMode}>
        <Text>x</Text>
      </Pressable>
    </>
  );
}

describe('ThemeProvider', () => {
  it('기본 모드는 system 이고 색 토큰을 제공한다', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    await waitFor(() => expect(getByTestId('mode').props.children).toBe('system'));
    expect(['#f4ecdd', '#1a1815']).toContain(getByTestId('bg').props.children);
  });

  it('cycleMode 는 system→light→dark 로 순환한다', async () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    await waitFor(() => expect(getByTestId('mode').props.children).toBe('system'));
    fireEvent.press(getByTestId('cycle'));
    expect(getByTestId('mode').props.children).toBe('light');
    expect(getByTestId('bg').props.children).toBe('#f4ecdd');
    fireEvent.press(getByTestId('cycle'));
    expect(getByTestId('mode').props.children).toBe('dark');
    expect(getByTestId('bg').props.children).toBe('#1a1815');
  });
});
