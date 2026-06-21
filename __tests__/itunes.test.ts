describe('searchTracks', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  const okResponse = (body: any) => ({ ok: true, status: 200, json: async () => body });

  it('빈/공백 검색어는 네트워크 호출 없이 빈 배열', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    const { searchTracks } = require('../lib/itunes');
    expect(await searchTracks('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('iTunes 응답을 ITunesTrack[]로 매핑하고 country=kr/media=music로 호출', async () => {
    const fetchMock = jest.fn(async () => okResponse({
      results: [
        { trackId: 1, trackName: '좋은날', artistName: '아이유', artworkUrl100: 'http://a/100.jpg', previewUrl: 'http://a/p.m4a' },
      ],
    }));
    global.fetch = fetchMock as any;
    const { searchTracks } = require('../lib/itunes');
    const res = await searchTracks('아이유');
    expect(res).toEqual([
      { itunesTrackId: 1, trackName: '좋은날', artistName: '아이유', artworkUrl: 'http://a/100.jpg', previewUrl: 'http://a/p.m4a' },
    ]);
    const calledUrl = (fetchMock.mock.calls[0][0] as string);
    expect(calledUrl).toContain('country=kr');
    expect(calledUrl).toContain('media=music');
    expect(calledUrl).toContain(encodeURIComponent('아이유'));
  });

  it('trackName/artistName/trackId 없는 항목은 걸러낸다', async () => {
    global.fetch = jest.fn(async () => okResponse({ results: [
      { trackId: 1, trackName: 'A', artistName: 'B' },
      { trackName: 'NoId', artistName: 'X' },
      { trackId: 2, artistName: 'Y' },
    ] })) as any;
    const { searchTracks } = require('../lib/itunes');
    const res = await searchTracks('q');
    expect(res).toHaveLength(1);
    expect(res[0].itunesTrackId).toBe(1);
  });

  it('HTTP 비정상 응답이면 throw', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as any;
    const { searchTracks } = require('../lib/itunes');
    await expect(searchTracks('q')).rejects.toThrow();
  });
});
