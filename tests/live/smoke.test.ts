import { describe, it, expect } from 'vitest';
import worker from '../../worker/index';

const enabled =
  process.env.RUN_LIVE_PARSE === '1' || process.env.npm_lifecycle_event === 'test:live';

const cases: Array<{ platform: string; url: string; mustSucceed?: boolean }> = [
  { platform: 'douyin', url: 'https://v.douyin.com/RdT8EVMUD8Q/', mustSucceed: true },
  { platform: 'bilibili', url: 'https://b23.tv/xlg2vP0', mustSucceed: true },
  { platform: 'xiaohongshu', url: 'https://xhslink.cn/o/8L6yyJlYIBm', mustSucceed: true },
  { platform: 'qsmusic', url: 'https://qishui.douyin.com/s/iXfucf4F/', mustSucceed: true },
  { platform: 'twitter', url: 'https://x.com/AYi_AInotes/status/2094403099234386187', mustSucceed: true },
  { platform: 'lishipin', url: 'https://www.pearvideo.com/detail_1791232', mustSucceed: true },
  { platform: 'weibo', url: 'https://weibo.com/1956700750/5338266484347047', mustSucceed: true },
  { platform: 'haokan', url: 'https://haokan.baidu.com/v?vid=3321366250719491589', mustSucceed: true },
  { platform: 'acfun', url: 'https://www.acfun.cn/v/ac48831564', mustSucceed: true },
  { platform: 'huya', url: 'https://v.huya.com/play/928604826.html', mustSucceed: true },
  { platform: 'youtube', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' },
  { platform: 'weibo', url: 'https://video.weibo.com/show?fid=1034:5336294365265960' },
  { platform: 'xinpianchang', url: 'https://www.xinpianchang.com/a13813473' },
  { platform: 'meipai', url: 'https://www.meipai.com/media/6961962339685660636' },
];

async function parse(url: string) {
  const req = new Request('http://localhost/api/v1/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' },
    body: JSON.stringify({ url }),
  });
  const res = await worker.fetch(
    req,
    { COBALT_PRIMARY_URL: 'https://api.cobalt.tools', RATE_LIMIT_COUNT: '1000' },
    {} as any
  );
  return (await res.json()) as any;
}

describe.skipIf(!enabled)('真实链接冒烟', () => {
  it.each(cases)('$platform $url', async ({ platform, url, mustSucceed }) => {
    const data = await parse(url);
    console.log(
      JSON.stringify({
        platform,
        ok: Boolean(data.success),
        got: data.platform,
        media: data.media?.length || 0,
        error: data.error?.code,
        message: data.error?.message,
        provider: data.provider?.id,
      })
    );
    expect(data.requestId).toBeTruthy();
    if (data.success) {
      expect(data.platform).toBe(platform);
      expect(data.media.length).toBeGreaterThan(0);
      expect(data.media[0].url).toMatch(/^https?:\/\//);
    } else if (mustSucceed) {
      expect.fail(`${platform} 必须解析成功: ${data.error?.code} ${data.error?.message}`);
    } else {
      expect(data.error?.code).toBeTruthy();
    }
  }, 30000);
});
