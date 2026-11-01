jest.mock('expo-file-system', () => ({ Paths: {}, Directory: class {}, File: class {} }));
jest.mock('../lib/database', () => ({ getAllVersions: jest.fn(async () => []) }));

import { findOrphans, normalizeUri, formatBytes } from '../lib/storageCleanup';

describe('저장 공간 정리 판정', () => {
  it('어떤 버전도 참조하지 않는 파일만 고아로 본다(file:// 표기 차이 무시)', () => {
    const files = [
      { uri: 'file:///data/recordings/s1/a.m4a', size: 10 },
      { uri: 'file:///data/recordings/s1/b.m4a', size: 20 },
      { uri: 'file:///data/recordings/s2/%ED%95%9C.m4a', size: 5 },
    ];
    const referenced = ['file:/data/recordings/s1/a.m4a', 'file:///data/recordings/s2/한.m4a'];
    expect(findOrphans(files, referenced).map((f) => f.uri)).toEqual(['file:///data/recordings/s1/b.m4a']);
  });

  it('참조 목록의 빈 값은 무시한다', () => {
    expect(findOrphans([{ uri: 'file:///x.m4a', size: 1 }], ['']).length).toBe(1);
  });

  it('경로 정규화', () => {
    expect(normalizeUri('file:///a/b/')).toBe('/a/b');
    expect(normalizeUri('file:/a/b')).toBe('/a/b');
  });

  it('용량 표기', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536 * 1024)).toBe('1.5 MB');
  });
});
