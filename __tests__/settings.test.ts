import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_SETTINGS,
  getSettings,
  loadSettings,
  updateSettings,
  subscribeSettings,
  sanitizeSettings,
} from '../lib/settings';

beforeEach(() => {
  (AsyncStorage as any).__resetStore();
});

describe('설정 저장소', () => {
  it('저장값이 없으면 기본값', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('깨진 JSON 이면 기본값으로 동작한다', async () => {
    await AsyncStorage.setItem('@settings', '{oops');
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('일부 키만 저장돼 있으면 나머지는 기본값과 병합한다', async () => {
    await AsyncStorage.setItem('@settings', JSON.stringify({ skipSeconds: 5, haptics: false }));
    const s = await loadSettings();
    expect(s.skipSeconds).toBe(5);
    expect(s.haptics).toBe(false);
    expect(s.repeatMode).toBe(DEFAULT_SETTINGS.repeatMode);
  });

  it('허용 범위 밖의 값은 기본값으로 바꾼다', () => {
    const s = sanitizeSettings({ skipSeconds: 7, defaultRating: 9, repeatMode: 'shuffle' });
    expect(s.skipSeconds).toBe(10);
    expect(s.defaultRating).toBe(3);
    expect(s.repeatMode).toBe('all');
  });

  it('변경하면 캐시·구독자·저장소에 모두 반영된다', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeSettings(listener);
    await updateSettings({ autoOpenPlayer: true });
    unsubscribe();
    expect(getSettings().autoOpenPlayer).toBe(true);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ autoOpenPlayer: true }));
    expect(JSON.parse((await AsyncStorage.getItem('@settings'))!).autoOpenPlayer).toBe(true);
  });
});
