const DB_FLOOR = -60;

function dbToLevel(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const clamped = Math.max(DB_FLOOR, Math.min(0, db));
  return (clamped - DB_FLOOR) / -DB_FLOOR; // -60→0, 0→1
}

export function normalizeWaveform(samplesDb: number[], buckets = 80): number[] {
  if (!samplesDb || samplesDb.length === 0) return [];
  const levels = samplesDb.map(dbToLevel);
  if (levels.length <= buckets) return levels;
  const out: number[] = [];
  const size = levels.length / buckets;
  for (let i = 0; i < buckets; i++) {
    const startIdx = Math.floor(i * size);
    const endIdx = Math.floor((i + 1) * size);
    let sum = 0, n = 0;
    for (let j = startIdx; j < endIdx; j++) { sum += levels[j]; n++; }
    out.push(n > 0 ? sum / n : 0);
  }
  return out;
}
