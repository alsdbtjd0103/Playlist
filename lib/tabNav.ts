// 하단 탭을 눌렀을 때의 동작(순수 로직). 다른 탭에 갔다 돌아오거나 현재 탭을 다시 누르면
// 그 탭의 첫 화면(목록)으로 간다. 예전에 열었던 상세 화면이 그대로 보여 헷갈리던 문제를 막는다.

export const ROOT_SCREEN_BY_TAB: Record<string, string> = {
  HomeTab: 'Home',
  PlaylistTab: 'Playlists',
  MemoTab: 'MemoFeed',
  SettingsTab: 'Settings',
};

export type TabPressAction = 'none' | 'navigate' | 'popToRoot' | 'navigateToRoot';

export function tabPressAction({
  isFocused,
  nestedIndex,
}: {
  isFocused: boolean;
  /** 탭 안 스택의 현재 인덱스(아직 한 번도 열지 않은 탭이면 undefined) */
  nestedIndex: number | undefined;
}): TabPressAction {
  const deep = (nestedIndex ?? 0) > 0;
  if (isFocused) return deep ? 'popToRoot' : 'none';
  return deep ? 'navigateToRoot' : 'navigate';
}
