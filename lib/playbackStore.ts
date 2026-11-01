import type { Version } from '../types';

// 재생 중인 큐가 들고 있는 버전 정보가 편집(cuts)으로 바뀌었을 때 플레이어에 알리는 통로.
// PlayerProvider 밖의 화면(편집기)에서도 TrackPlayer 의존 없이 호출할 수 있게 순수 모듈로 둔다.
type Listener = (version: Version) => void;
const listeners = new Set<Listener>();

export const onVersionUpdated = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const notifyVersionUpdated = (version: Version): void => {
  listeners.forEach((listener) => listener(version));
};
