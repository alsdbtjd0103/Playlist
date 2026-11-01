import { tabPressAction } from '../lib/tabNav';

describe('tabPressAction — 탭 누름 동작', () => {
  it('현재 탭을 다시 누르면 상세 화면에서 첫 화면으로 돌아간다', () => {
    expect(tabPressAction({ isFocused: true, nestedIndex: 1 })).toBe('popToRoot');
  });
  it('현재 탭이 이미 첫 화면이면 아무것도 하지 않는다', () => {
    expect(tabPressAction({ isFocused: true, nestedIndex: 0 })).toBe('none');
  });
  it('다른 탭에서 돌아올 때 그 탭이 상세 화면에 머물러 있으면 첫 화면으로 연다', () => {
    expect(tabPressAction({ isFocused: false, nestedIndex: 1 })).toBe('navigateToRoot');
  });
  it('한 번도 열지 않았거나 첫 화면인 탭은 그냥 이동한다', () => {
    expect(tabPressAction({ isFocused: false, nestedIndex: undefined })).toBe('navigate');
    expect(tabPressAction({ isFocused: false, nestedIndex: 0 })).toBe('navigate');
  });
});
