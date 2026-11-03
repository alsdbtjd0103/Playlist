// 녹음 저장: 빈 파일을 버전으로 만들지 않는다
const mockFiles: Record<string, number> = {};
const mockCopy = jest.fn(async ({ from, to }: { from: string; to: string }) => {
  mockFiles[to] = mockFiles[from] ?? 0;
});
jest.mock('expo-file-system/legacy', () => ({ copyAsync: (a: any) => mockCopy(a) }));
jest.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() { return true; }
    create() {}
  }
  class File {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() { return this.uri in mockFiles; }
    get size() { return mockFiles[this.uri] ?? 0; }
    delete() { delete mockFiles[this.uri]; }
  }
  return { Paths: { document: { uri: 'doc' } }, Directory, File };
});

import { saveAudioLocally, EmptyRecordingError } from '../lib/storage';

beforeEach(() => {
  for (const k of Object.keys(mockFiles)) delete mockFiles[k];
  mockCopy.mockClear();
});

describe('saveAudioLocally', () => {
  it('녹음 파일을 곡 폴더로 복사한다', async () => {
    mockFiles['cache/rec.m4a'] = 1000;
    const { localUri } = await saveAudioLocally('s1', 'cache/rec.m4a');
    expect(localUri).toContain('recordings/s1/');
    expect(mockFiles[localUri]).toBe(1000);
  });

  it('비어 있는(0바이트) 녹음은 저장하지 않고 EmptyRecordingError 를 던진다', async () => {
    mockFiles['cache/empty.m4a'] = 0;
    await expect(saveAudioLocally('s1', 'cache/empty.m4a')).rejects.toBeInstanceOf(EmptyRecordingError);
    expect(mockCopy).not.toHaveBeenCalled();
  });

  it('복사 결과가 비어 있으면 실패로 알리고 빈 사본을 지운다', async () => {
    mockFiles['cache/rec.m4a'] = 1000;
    mockCopy.mockImplementationOnce(async ({ to }) => {
      mockFiles[to] = 0;
    });
    await expect(saveAudioLocally('s1', 'cache/rec.m4a')).rejects.toThrow('복사하지 못했어요');
    expect(Object.keys(mockFiles).filter((k) => k.includes('recordings/'))).toEqual([]);
  });
});
