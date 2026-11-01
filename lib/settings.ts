import AsyncStorage from '@react-native-async-storage/async-storage';

// 앱 설정. AsyncStorage 한 키에 JSON 으로 저장하고, 읽을 때 기본값과 병합한다.
// React 밖(플레이어·분석·햅틱)에서도 동기적으로 읽을 수 있도록 모듈 캐시를 둔다.

export type RepeatModeSetting = 'none' | 'one' | 'all';
export type HomeSort = 'recent' | 'title' | 'rating';

export interface AppSettings {
  autoOpenPlayer: boolean;
  repeatMode: RepeatModeSetting;
  skipSeconds: 5 | 10 | 15;
  defaultRating: number;
  recordingQuality: 'high' | 'low';
  keepAwakeWhileRecording: boolean;
  haptics: boolean;
  analytics: boolean;
  homeSort: HomeSort;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoOpenPlayer: false,
  repeatMode: 'all',
  skipSeconds: 10,
  defaultRating: 3,
  recordingQuality: 'high',
  keepAwakeWhileRecording: true,
  haptics: true,
  analytics: true,
  homeSort: 'recent',
};

const STORAGE_KEY = '@settings';

// 저장값마다 허용 범위를 확인해, 깨졌거나 예전 버전의 값이면 기본값을 쓴다.
const validators: { [K in keyof AppSettings]: (v: unknown) => boolean } = {
  autoOpenPlayer: (v) => typeof v === 'boolean',
  repeatMode: (v) => v === 'none' || v === 'one' || v === 'all',
  skipSeconds: (v) => v === 5 || v === 10 || v === 15,
  defaultRating: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5,
  recordingQuality: (v) => v === 'high' || v === 'low',
  keepAwakeWhileRecording: (v) => typeof v === 'boolean',
  haptics: (v) => typeof v === 'boolean',
  analytics: (v) => typeof v === 'boolean',
  homeSort: (v) => v === 'recent' || v === 'title' || v === 'rating',
};

export const sanitizeSettings = (raw: unknown): AppSettings => {
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  const record = raw as Record<string, unknown>;
  (Object.keys(validators) as (keyof AppSettings)[]).forEach((key) => {
    if (validators[key](record[key])) {
      (out as any)[key] = record[key];
    }
  });
  return out;
};

let cache: AppSettings = { ...DEFAULT_SETTINGS };
const listeners = new Set<(s: AppSettings) => void>();

export const getSettings = (): AppSettings => cache;

export const subscribeSettings = (listener: (s: AppSettings) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const publish = () => listeners.forEach((l) => l(cache));

export const loadSettings = async (): Promise<AppSettings> => {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    cache = sanitizeSettings(json ? JSON.parse(json) : null);
  } catch (error) {
    console.error('설정 읽기 실패:', error);
    cache = { ...DEFAULT_SETTINGS };
  }
  publish();
  return cache;
};

export const updateSettings = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
  cache = sanitizeSettings({ ...cache, ...patch });
  publish();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('설정 저장 실패:', error);
  }
  return cache;
};
