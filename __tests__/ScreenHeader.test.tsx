import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ScreenHeader from '@/components/ScreenHeader';

describe('ScreenHeader', () => {
  it('로고 텍스트 "Playlist"를 렌더링한다', () => {
    const { getByText } = render(<ScreenHeader />);
    expect(getByText('Playlist')).toBeTruthy();
  });

  it('showAddButton이 true이고 onAddPress가 있으면 추가 버튼을 누를 수 있다', () => {
    const onAddPress = jest.fn();
    const { getByTestId } = render(<ScreenHeader showAddButton onAddPress={onAddPress} />);

    fireEvent.press(getByTestId('icon-add'));
    expect(onAddPress).toHaveBeenCalledTimes(1);
  });

  it('showAddButton이 false면 추가 아이콘이 보이지 않는다', () => {
    const onAddPress = jest.fn();
    const { queryByTestId } = render(<ScreenHeader showAddButton={false} onAddPress={onAddPress} />);

    expect(queryByTestId('icon-add')).toBeNull();
  });
});
