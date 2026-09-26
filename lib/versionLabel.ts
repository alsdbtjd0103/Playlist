import type { Version } from '@/types';

type VersionLike = Pick<Version, 'id' | 'songId' | 'recordedAt'>;

// 곡 안에서 녹음 순서대로 1부터 번호를 매긴다(저장하지 않고 매번 계산).
export function getVersionNumberMap(versions: VersionLike[]): Map<string, number> {
  const bySong = new Map<string, VersionLike[]>();
  for (const v of versions) {
    const list = bySong.get(v.songId);
    if (list) list.push(v);
    else bySong.set(v.songId, [v]);
  }

  const map = new Map<string, number>();
  for (const list of bySong.values()) {
    list
      .slice()
      .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
      .forEach((v, i) => map.set(v.id, i + 1));
  }
  return map;
}

export function formatVersionNumber(n?: number): string {
  return n ? `#${n}` : '';
}
