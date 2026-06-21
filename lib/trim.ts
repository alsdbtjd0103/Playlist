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
