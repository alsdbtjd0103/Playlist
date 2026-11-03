import type { SongWithVersions } from '../types';
import type { HomeSort } from './settings';

// 홈 곡 목록 정렬. 최근 녹음: 마지막 녹음(없으면 곡 수정 시각) 최신순, 제목: 가나다순,
// 별점: 대표(없으면 최신) 버전 별점 높은 순(같으면 최근 녹음 순).
const lastActivity = (s: SongWithVersions): number =>
  Math.max(s.latestVersion?.recordedAt.getTime() ?? 0, s.updatedAt.getTime());

const ratingOf = (s: SongWithVersions): number => (s.defaultVersion ?? s.latestVersion)?.rating ?? 0;

export function sortSongRows<T extends SongWithVersions>(rows: T[], mode: HomeSort): T[] {
  const copy = rows.slice();
  if (mode === 'title') {
    copy.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  } else if (mode === 'rating') {
    copy.sort((a, b) => ratingOf(b) - ratingOf(a) || lastActivity(b) - lastActivity(a));
  } else {
    copy.sort((a, b) => lastActivity(b) - lastActivity(a));
  }
  return copy;
}

/** "방금 전", "3분 전", "어제", "3일 전", "2주 전", "2026.3.4" */
export function relativeTime(date: Date, now: Date = new Date()): string {
  const diff = Math.max(0, now.getTime() - date.getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day === 1) return '어제';
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
}
