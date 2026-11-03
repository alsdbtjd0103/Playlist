import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ScreenHeader from '@/components/ScreenHeader';
import BottomSheet, { SheetAction } from '@/components/BottomSheet';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('ScreenHeader', () => {
  it('워드마크 모드에서 plilog 를 렌더링한다', () => {
    expect(wrap(<ScreenHeader showWordmark />).getByText('plilog')).toBeTruthy();
  });

  it('제목과 뒤로가기 버튼을 보여 주고 뒤로가기를 누르면 콜백을 부른다', () => {
    const onBack = jest.fn();
    const r = wrap(<ScreenHeader title="내 플레이리스트" onBack={onBack} />);
    expect(r.getByText('내 플레이리스트')).toBeTruthy();
    fireEvent.press(r.getByTestId('header-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('액션은 화면에 맞는 접근성 라벨과 testID 로 렌더링된다', () => {
    const onPress = jest.fn();
    const r = wrap(
      <ScreenHeader title="플레이리스트" actions={[{ icon: 'add', label: '플레이리스트 만들기', onPress, testID: 'add-playlist-button' }]} />
    );
    fireEvent.press(r.getByLabelText('플레이리스트 만들기'));
    expect(onPress).toHaveBeenCalled();
    expect(r.getByTestId('add-playlist-button')).toBeTruthy();
  });
});

describe('BottomSheet', () => {
  it('제목과 액션을 보여 주고 액션을 누르면 콜백을 부른다', () => {
    const onPress = jest.fn();
    const r = wrap(
      <BottomSheet visible onClose={() => {}} title="버전 #3">
        <SheetAction icon="trash-outline" label="삭제" destructive onPress={onPress} testID="sheet-delete" />
      </BottomSheet>
    );
    expect(r.getByText('버전 #3')).toBeTruthy();
    fireEvent.press(r.getByTestId('sheet-delete'));
    expect(onPress).toHaveBeenCalled();
  });
});
