/* eslint-disable @typescript-eslint/no-var-requires */

// @testing-library/react-native v12.4+ 는 매처(toBeOnTheScreen 등)가 기본 내장되어
// 별도의 extend-expect import가 필요하지 않다.

// --- AsyncStorage: 결정론적 in-memory 목 ---
// 라이브러리 기본 목 동작에 의존하지 않고 직접 메모리 저장소를 구현해
// 테스트마다 깨끗한 상태를 보장한다.
jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    __resetStore: () => {
      store = {};
    },
    setItem: jest.fn((key, value) => {
      store[key] = value;
      return Promise.resolve();
    }),
    getItem: jest.fn((key) => Promise.resolve(key in store ? store[key] : null)),
    removeItem: jest.fn((key) => {
      delete store[key];
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      store = {};
      return Promise.resolve();
    }),
    getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
    multiGet: jest.fn((keys) =>
      Promise.resolve(keys.map((k) => [k, k in store ? store[k] : null]))
    ),
    multiSet: jest.fn((pairs) => {
      pairs.forEach(([k, v]) => {
        store[k] = v;
      });
      return Promise.resolve();
    }),
    multiRemove: jest.fn((keys) => {
      keys.forEach((k) => delete store[k]);
      return Promise.resolve();
    }),
  };
});

// --- expo-vector-icons: 네이티브 폰트 로딩 없이 가벼운 스텁 ---
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  // 아이콘 testID 는 prop 으로 넘어온 아이콘 이름(name)을 기준으로 부여한다.
  // 예: <Ionicons name="add" /> -> testID="icon-add"
  const Icon = (props) =>
    React.createElement(Text, { ...props, testID: props.testID ?? `icon-${props.name}` }, props.name);
  return new Proxy(
    {},
    {
      get: () => Icon,
    }
  );
});

// 각 테스트 전 저장소 초기화
beforeEach(() => {
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  AsyncStorage.__resetStore?.();
  jest.clearAllMocks();
});
