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

// 버전이 삭제되면 재생 큐에서도 빼야 한다(지워진 파일을 재생하다 멈추지 않게).
type RemovedListener = (versionIds: string[]) => void;
const removedListeners = new Set<RemovedListener>();

export const onVersionsRemoved = (listener: RemovedListener): (() => void) => {
  removedListeners.add(listener);
  return () => {
    removedListeners.delete(listener);
  };
};

export const notifyVersionsRemoved = (versionIds: string[]): void => {
  if (versionIds.length === 0) return;
  removedListeners.forEach((listener) => listener(versionIds));
};
