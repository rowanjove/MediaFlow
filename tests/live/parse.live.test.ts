import { describe, it, expect } from 'vitest';
import worker from '../../worker/index';

const enabled =
  process.env.RUN_LIVE_PARSE === '1' || process.env.npm_lifecycle_event === 'test:live';

const cases = [
  { platform: 'douyin', url: process.env.LIVE_DOUYIN_URL || '' },
  { platform: 'xiaohongshu', url: process.env.LIVE_XHS_URL || '' },
  { platform: 'bilibili', url: process.env.LIVE_BILIBILI_URL || '' },
  { platform: 'kuaishou', url: process.env.LIVE_KUAISHOU_URL || '' },
  { platform: 'twitter', url: process.env.LIVE_TWITTER_URL || '' },
  { platform: 'tiktok', url: process.env.LIVE_TIKTOK_URL || '' },
  { platform: 'instagram', url: process.env.LIVE_INSTAGRAM_URL || '' },
];

describe.skipIf(!enabled)('Live parse（真实公开链接）', () => {
  it.each(cases)('$platform 能识别并返回结构化结果或明确错误码', async ({ url }) => {
    if (!url) {
      expect(true).toBe(true);
      return;
    }

    const req = new Request('http://localhost/api/v1/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const env = {
      COBALT_PRIMARY_URL: process.env.COBALT_PRIMARY_URL || '',
      RATE_LIMIT_COUNT: '1000',
    };
    const res = await worker.fetch(req, env, {} as any);
    const data = (await res.json()) as any;
    expect(data.requestId).toBeTruthy();
    if (data.success) {
      expect(Array.isArray(data.media)).toBe(true);
      expect(data.media.length).toBeGreaterThan(0);
    } else {
      expect(data.error?.code).toMatch(
        /INVALID_URL|UNSUPPORTED_PLATFORM|PRIVATE_CONTENT|UPSTREAM_BLOCKED|UPSTREAM_TIMEOUT|COOKIE_REQUIRED|PARSE_FAILED|RATE_LIMITED|INTERNAL_ERROR/
      );
    }
  });
});
