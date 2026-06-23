jest.mock('../modules/audio-denoise', () => ({
  getAudioDenoiseModule: jest.fn(),
  addDenoiseProgressListener: jest.fn(),
}));

import {
  getAudioDenoiseModule,
  addDenoiseProgressListener,
} from '../modules/audio-denoise';
import {
  isNativeDenoiseAvailable,
  denoiseToFile,
  onDenoiseProgress,
} from '../lib/nativeDenoise';

const mockGet = getAudioDenoiseModule as jest.Mock;
const mockListener = addDenoiseProgressListener as jest.Mock;

describe('nativeDenoise', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockListener.mockReset();
  });

  it('모듈 없으면 미가용 + denoiseToFile은 throw', async () => {
    mockGet.mockReturnValue(null);
    expect(isNativeDenoiseAvailable()).toBe(false);
    await expect(denoiseToFile('file:///a.m4a')).rejects.toThrow();
  });

  it('모듈 있으면 가용 + denoise 결과 반환', async () => {
    const denoise = jest.fn(async () => ({ uri: 'file:///out.m4a', waveform: [0.1, 0.2] }));
    mockGet.mockReturnValue({ denoise });
    expect(isNativeDenoiseAvailable()).toBe(true);
    const r = await denoiseToFile('file:///a.m4a');
    expect(denoise).toHaveBeenCalledWith('file:///a.m4a');
    expect(r.uri).toBe('file:///out.m4a');
    expect(r.waveform).toEqual([0.1, 0.2]);
  });

  it('onDenoiseProgress는 모듈 리스너로 위임', () => {
    const sub = { remove: jest.fn() };
    mockListener.mockReturnValue(sub);
    const cb = jest.fn();
    const result = onDenoiseProgress(cb);
    expect(mockListener).toHaveBeenCalledWith(cb);
    expect(result).toBe(sub);
  });

  it('onDenoiseProgress는 미가용 시 null', () => {
    mockListener.mockReturnValue(null);
    expect(onDenoiseProgress(jest.fn())).toBeNull();
  });
});
