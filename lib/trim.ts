export interface TrimRange { start: number; end: number }

export function clampTrimRange(range: TrimRange, duration: number, minLen = 0.5): TrimRange {
  const max = Math.max(duration, minLen);
  let start = Math.max(0, Math.min(range.start, max));
  let end = Math.max(0, Math.min(range.end, max));
  if (end - start < minLen) {
    end = Math.min(max, start + minLen);
    start = Math.max(0, end - minLen);
  }
  return { start, end };
}

export function trimmedDuration(range: TrimRange): number {
  return range.end - range.start;
}

export function isPastTrimEnd(positionSec: number, trim?: TrimRange): boolean {
  if (!trim) return false;
  return positionSec >= trim.end;
}

// === 멀티 구간(cuts) — 삭제할 구간들의 집합 ===

const EPS = 1e-3;

/** 클램프·정렬·중첩(인접) 병합·유효성 정리. */
export function normalizeCuts(cuts: TrimRange[], duration: number, _minKeep = 0.3): TrimRange[] {
  const cleaned = cuts
    .map((c) => ({
      start: Math.max(0, Math.min(c.start, duration)),
      end: Math.max(0, Math.min(c.end, duration)),
    }))
    .filter((c) => c.end - c.start > EPS)
    .sort((a, b) => a.start - b.start);
  const merged: TrimRange[] = [];
  for (const c of cleaned) {
    const last = merged[merged.length - 1];
    if (last && c.start <= last.end + EPS) last.end = Math.max(last.end, c.end);
    else merged.push({ ...c });
  }
  return merged;
}

/** 남길 구간 목록(= [0,duration]에서 cuts의 여집합). */
export function keepSegments(cuts: TrimRange[], duration: number): TrimRange[] {
  const norm = normalizeCuts(cuts, duration);
  const keep: TrimRange[] = [];
  let cursor = 0;
  for (const c of norm) {
    if (c.start - cursor > EPS) keep.push({ start: cursor, end: c.start });
    cursor = Math.max(cursor, c.end);
  }
  if (duration - cursor > EPS) keep.push({ start: cursor, end: duration });
  return keep;
}

/** 편집 후 총 길이(남길 구간 합). */
export function editedDuration(cuts: TrimRange[], duration: number): number {
  return keepSegments(cuts, duration).reduce((s, k) => s + (k.end - k.start), 0);
}

/**
 * 재생 위치가 cut 안이면 그 cut의 끝(다음 남길 지점)을, 남길 구간이면 현재 위치를 반환.
 * 더 재생할 게 없으면 null(정지).
 */
export function nextKeepStart(pos: number, cuts: TrimRange[], duration: number): number | null {
  const norm = normalizeCuts(cuts, duration);
  for (const c of norm) {
    if (pos >= c.start - EPS && pos < c.end - EPS) {
      return c.end < duration - EPS ? c.end : null;
    }
  }
  return pos < duration - EPS ? pos : null;
}

/** 레거시 단일 trim{start,end}("[start,end] 남김")을 cuts("앞뒤 삭제")로 변환. */
export function legacyTrimToCuts(
  trim: { start: number; end: number } | undefined,
  duration: number
): TrimRange[] {
  if (!trim) return [];
  const out: TrimRange[] = [];
  if (trim.start > EPS) out.push({ start: 0, end: trim.start });
  if (duration - trim.end > EPS) out.push({ start: trim.end, end: duration });
  return out;
}

/** 버전에서 유효 cuts를 얻는다: cuts 우선, 없으면 레거시 trim 변환. */
export function getEffectiveCuts(
  v: { cuts?: TrimRange[]; trim?: { start: number; end: number } },
  duration: number
): TrimRange[] {
  if (v.cuts && v.cuts.length) return normalizeCuts(v.cuts, duration);
  return legacyTrimToCuts(v.trim, duration);
}
