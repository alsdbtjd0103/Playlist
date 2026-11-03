import { logEvent } from '../lib/analytics';
import { updateSettings } from '../lib/settings';

describe('analytics 설정 연동', () => {
  const fetchMock = jest.fn(async () => ({ ok: true }));
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockClear();
    (global as any).fetch = fetchMock;
  });
  afterAll(() => {
    (global as any).fetch = originalFetch;
  });

  it('사용 통계 보내기를 끄면 전송하지 않는다', async () => {
    await updateSettings({ analytics: false });
    await logEvent('test_event');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('사용 통계 보내기가 켜져 있으면 전송한다', async () => {
    await updateSettings({ analytics: true });
    await logEvent('test_event', { a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toContain('/capture/');
    expect(JSON.parse(init.body).event).toBe('test_event');
  });
});
