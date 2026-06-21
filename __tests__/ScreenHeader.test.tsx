import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ScreenHeader from '@/components/ScreenHeader';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('ScreenHeader', () => {
  it('plilog 워드마크를 렌더링한다', () => {
    const { getByText } = wrap(<ScreenHeader />);
    expect(getByText('plilog')).toBeTruthy();
  });

  it('showAddButton이 true이고 onAddPress가 있으면 추가 버튼을 누를 수 있다', () => {
    const onAddPress = jest.fn();
    const { getByTestId } = wrap(<ScreenHeader showAddButton onAddPress={onAddPress} />);

    fireEvent.press(getByTestId('icon-add'));
    expect(onAddPress).toHaveBeenCalledTimes(1);
  });

  it('showAddButton이 false면 추가 아이콘이 보이지 않는다', () => {
    const onAddPress = jest.fn();
    const { queryByTestId } = wrap(<ScreenHeader showAddButton={false} onAddPress={onAddPress} />);

    expect(queryByTestId('icon-add')).toBeNull();
  });

  it('테마 토글 버튼이 존재한다', () => {
    const { getByTestId } = wrap(<ScreenHeader showAddButton={false} />);
    expect(getByTestId('theme-toggle')).toBeTruthy();
  });
});
