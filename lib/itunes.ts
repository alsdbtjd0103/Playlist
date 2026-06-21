export interface ITunesTrack {
  itunesTrackId: number;
  trackName: string;
  artistName: string;
  artworkUrl?: string;
  previewUrl?: string;
}

const ENDPOINT = 'https://itunes.apple.com/search';
const TIMEOUT_MS = 8000;

export async function searchTracks(term: string): Promise<ITunesTrack[]> {
  const trimmed = term.trim();
  if (trimmed.length === 0) return [];

  const url = `${ENDPOINT}?term=${encodeURIComponent(trimmed)}&country=kr&media=music&limit=20`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`iTunes 검색 실패: ${res.status}`);
    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    return results
      .filter((r: any) => r && r.trackName && r.artistName && typeof r.trackId === 'number')
      .map((r: any) => ({
        itunesTrackId: r.trackId,
        trackName: String(r.trackName),
        artistName: String(r.artistName),
        artworkUrl: r.artworkUrl100 ?? undefined,
        previewUrl: r.previewUrl ?? undefined,
      }));
  } finally {
    clearTimeout(timeout);
  }
}
