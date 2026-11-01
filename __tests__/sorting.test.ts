import { sortSongRows, relativeTime } from '../lib/sorting';
import type { SongWithVersions } from '../types';

const d = (s: string) => new Date(s);
const song = (id: string, title: string, updated: string, latest?: { at: string; rating: number }, def?: number): SongWithVersions => {
  const latestVersion = latest
    ? { id: `${id}-v`, songId: id, fileName: '', storageUrl: '', rating: latest.rating, recordedAt: d(latest.at) }
    : undefined;
  return {
    id,
    title,
    createdAt: d(updated),
    updatedAt: d(updated),
    versions: latestVersion ? [latestVersion] : [],
    latestVersion,
    defaultVersion: def !== undefined && latestVersion ? { ...latestVersion, rating: def } : undefined,
  };
};

const rows = [
  song('a', '하늘', '2026-01-01', { at: '2026-03-01', rating: 3 }),
  song('b', '가을', '2026-02-01', { at: '2026-02-01', rating: 5 }),
  song('c', '나비', '2026-04-01'),
];

describe('sortSongRows', () => {
  it('최근 녹음(또는 수정)순', () => {
    expect(sortSongRows(rows, 'recent').map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
  it('제목 가나다순', () => {
    expect(sortSongRows(rows, 'title').map((r) => r.title)).toEqual(['가을', '나비', '하늘']);
  });
  it('별점 높은 순(대표 버전 우선), 녹음 없는 곡은 맨 뒤', () => {
    expect(sortSongRows(rows, 'rating').map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });
  it('원본 배열을 바꾸지 않는다', () => {
    const before = rows.map((r) => r.id);
    sortSongRows(rows, 'title');
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe('relativeTime', () => {
  const now = d('2026-11-02T12:00:00');
  it.each([
    ['2026-11-02T11:59:40', '방금 전'],
    ['2026-11-02T11:30:00', '30분 전'],
    ['2026-11-02T09:00:00', '3시간 전'],
    ['2026-11-01T10:00:00', '어제'],
    ['2026-10-29T12:00:00', '4일 전'],
    ['2026-10-19T12:00:00', '2주 전'],
    ['2026-03-04T12:00:00', '2026.3.4'],
  ])('%s → %s', (at, label) => {
    expect(relativeTime(d(at), now)).toBe(label);
  });
});
