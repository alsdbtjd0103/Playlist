import { getVersionNumberMap, formatVersionNumber } from '../lib/versionLabel';

const v = (id: string, songId: string, iso: string) => ({ id, songId, recordedAt: new Date(iso) });

describe('getVersionNumberMap', () => {
  it('곡 안에서 먼저 녹음한 버전이 #1이다 (입력 순서와 무관)', () => {
    const map = getVersionNumberMap([
      v('c', 's1', '2026-01-03'),
      v('a', 's1', '2026-01-01'),
      v('b', 's1', '2026-01-02'),
    ]);
    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBe(2);
    expect(map.get('c')).toBe(3);
  });

  it('곡마다 번호를 독립적으로 매긴다', () => {
    const map = getVersionNumberMap([
      v('a', 's1', '2026-01-01'),
      v('x', 's2', '2026-01-02'),
      v('b', 's1', '2026-01-03'),
    ]);
    expect(map.get('a')).toBe(1);
    expect(map.get('b')).toBe(2);
    expect(map.get('x')).toBe(1);
  });

  it('중간 버전이 빠지면 뒤 번호가 당겨진다', () => {
    const map = getVersionNumberMap([v('a', 's1', '2026-01-01'), v('c', 's1', '2026-01-03')]);
    expect(map.get('c')).toBe(2);
  });

  it('직렬화된 문자열 날짜도 처리한다', () => {
    const map = getVersionNumberMap([
      { id: 'b', songId: 's', recordedAt: '2026-01-02T00:00:00Z' as any },
      { id: 'a', songId: 's', recordedAt: '2026-01-01T00:00:00Z' as any },
    ]);
    expect(map.get('a')).toBe(1);
  });
});

describe('formatVersionNumber', () => {
  it('#n 형식', () => {
    expect(formatVersionNumber(3)).toBe('#3');
    expect(formatVersionNumber(undefined)).toBe('');
  });
});
