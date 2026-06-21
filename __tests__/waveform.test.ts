import { normalizeWaveform } from '../lib/waveform';

describe('normalizeWaveform', () => {
  it('빈 입력은 빈 배열', () => {
    expect(normalizeWaveform([])).toEqual([]);
  });
  it('-60dB 이하는 0, 0dB는 1로 정규화', () => {
    const out = normalizeWaveform([-60, -60, 0, 0], 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(1, 5);
  });
  it('지정한 buckets 수로 다운샘플링', () => {
    const out = normalizeWaveform([-30, -30, -30, -30, -30, -30], 3);
    expect(out).toHaveLength(3);
    out.forEach((v) => { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); });
  });
});
