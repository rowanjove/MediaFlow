import { describe, it, expect, afterEach, vi } from 'vitest';
import { expandShortUrl } from '../../worker/core/detector';
import { AppError } from '../../worker/core/errors';

afterEach(() => vi.unstubAllGlobals());

describe('短链展开逐跳校验', () => {
  it('允许跳转到平台白名单域名', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://www.douyin.com/video/123' },
        })
      )
    );
    const out = await expandShortUrl(new URL('https://v.douyin.com/abc/'));
    expect(out.hostname).toBe('www.douyin.com');
  });

  it('拒绝跳转到内网或未知域名', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://127.0.0.1/secret' },
        })
      )
    );
    await expect(expandShortUrl(new URL('https://v.douyin.com/abc/'))).rejects.toBeInstanceOf(AppError);
  });
});
