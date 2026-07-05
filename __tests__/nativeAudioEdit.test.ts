jest.mock('../modules/audio-edit', () => ({
  getAudioEditModule: jest.fn(),
}));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///doc' },
  Directory: class {
    uri: string;
    constructor(...parts: any[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return true;
    }
    create() {}
  },
  File: class {
    uri: string;
    constructor(dir: any, name?: string) {
      this.uri = name ? `${dir.uri}/${name}` : dir;
    }
  },
}));

import { getAudioEditModule } from '../modules/audio-edit';
import { isAudioEditAvailable, renderCutsToFile } from '../lib/nativeAudioEdit';

const mockGet = getAudioEditModule as jest.Mock;

describe('nativeAudioEdit', () => {
  beforeEach(() => mockGet.mockReset());

  it('모듈 없으면 미가용 + renderCutsToFile은 throw', async () => {
    mockGet.mockReturnValue(null);
    expect(isAudioEditAvailable()).toBe(false);
    await expect(renderCutsToFile('file:///a.m4a', [{ start: 2, end: 5 }], 10, 's1')).rejects.toThrow();
  });

  it('cuts를 keepSegments로 변환해 네이티브 renderCuts 호출', async () => {
    const renderCuts = jest.fn(async () => ({ uri: 'file:///out.m4a', duration: 7 }));
    mockGet.mockReturnValue({ renderCuts });
    expect(isAudioEditAvailable()).toBe(true);

    const r = await renderCutsToFile('file:///a.m4a', [{ start: 2, end: 5 }], 10, 's1');

    expect(renderCuts).toHaveBeenCalledTimes(1);
    const [inputUri, keep, outputUri] = renderCuts.mock.calls[0];
    expect(inputUri).toBe('file:///a.m4a');
    // 10초에서 [2,5] 삭제 → 남길 구간 [0,2],[5,10]
    expect(keep).toEqual([{ start: 0, end: 2 }, { start: 5, end: 10 }]);
    expect(typeof outputUri).toBe('string');
    expect(outputUri).toContain('s1');
    expect(r.uri).toBe('file:///out.m4a');
    expect(r.duration).toBe(7);
  });

  it('네이티브가 duration 미제공 시 editedDuration으로 보정', async () => {
    const renderCuts = jest.fn(async (i: string, k: any, out: string) => ({ uri: out, duration: 0 }));
    mockGet.mockReturnValue({ renderCuts });
    const r = await renderCutsToFile('file:///a.m4a', [{ start: 2, end: 5 }], 10, 's1');
    expect(r.duration).toBeCloseTo(7);
  });

  it('남길 구간이 없으면(전체 삭제) throw', async () => {
    mockGet.mockReturnValue({ renderCuts: jest.fn() });
    await expect(renderCutsToFile('file:///a.m4a', [{ start: 0, end: 10 }], 10, 's1')).rejects.toThrow();
  });
});
