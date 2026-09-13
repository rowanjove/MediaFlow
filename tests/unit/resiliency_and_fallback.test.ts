import { describe, it, expect, vi, afterEach } from 'vitest';
import { ProviderRouter } from '../../worker/core/router';
import { DouyinPrimaryProvider } from '../../worker/providers/native/douyin/primary';
import { DouyinFallbackProvider } from '../../worker/providers/native/douyin/fallback';
import { CobaltProvider } from '../../worker/providers/cobalt/provider';
import { TikTokNativeProvider } from '../../worker/providers/experimental/tiktok-native';
import { TwitterProvider } from '../../worker/providers/native/twitter';
import { YoutubeNativeProvider } from '../../worker/providers/native/youtube';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../../worker/providers/base';
import { AppError } from '../../worker/core/errors';

afterEach(() => {
  vi.unstubAllGlobals();
});

const defaultContext: ProviderContext = {
  signal: new AbortController().signal,
  requestId: 'req-resilience-test',
  env: {
    COBALT_PRIMARY_URL: 'https://cobalt-primary.internal',
    COBALT_FALLBACK_URLS: 'https://cobalt-backup.internal',
    COBALT_API_KEY: 'test-key',
  },
};

describe('系统容灾、降级与 Fallback 机制深度测试 (Resiliency & Fallback Suite)', () => {
  describe('1. 抖音双路线真实 Fallback 链路', () => {
    it('当抖音 Primary API 异常受阻 (HTTP 500) 时，自动平滑降级至 FallbackProvider (页面提取)', async () => {
      const router = new ProviderRouter();
      const primary = new DouyinPrimaryProvider();
      const fallback = new DouyinFallbackProvider();
      router.register(primary);
      router.register(fallback);

      const mockRouterHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>抖音分享</title></head>
          <body>
            <script>
              window._ROUTER_DATA = {
                "loaderData": {
                  "video_(id)/page": {
                    "videoInfoRes": {
                      "item_list": [
                        {
                          "desc": "备用解析器提取到的视频",
                          "author": { "nickname": "测试博主", "avatar_thumb": { "url_list": ["https://p1.douyinpic.com/avatar.jpg"] } },
                          "video": {
                            "play_addr": { "url_list": ["https://aweme.snssdk.com/play/?video_id=v02001"] },
                            "duration": 15000,
                            "cover": { "url_list": ["https://p1.douyinpic.com/cover.jpg"] }
                          }
                        }
                      ]
                    }
                  }
                }
              };
            </script>
          </body>
        </html>
      `;

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          const u = String(url);
          // 模拟主接口 iesdouyin.com/web/api/v2/aweme/iteminfo 挂了
          if (u.includes('iteminfo')) {
            return new Response(JSON.stringify({ error: 'Server Busy' }), { status: 500 });
          }
          // 模拟备用线路访问 iesdouyin.com/share/video/ 成功返回页面
          if (u.includes('/share/video/')) {
            return new Response(mockRouterHtml, {
              status: 200,
              headers: { 'set-cookie': 'ttwid=mock_ttwid_token; Path=/; Domain=.douyin.com' },
            });
          }
          return new Response('Not Found', { status: 404 });
        })
      );

      const result = await router.parse(
        {
          url: new URL('https://www.douyin.com/video/7123456789012345678'),
          platform: 'douyin',
          contentId: '7123456789012345678',
          rawInput: 'https://www.douyin.com/video/7123456789012345678',
        },
        defaultContext
      );

      expect(result.success).toBe(true);
      expect(result.provider.id).toBe('douyin-douyinvd');
      expect(result.provider.fallbackChain).toEqual(['douyin-native-primary', 'douyin-douyinvd']);
      expect(result.content.title).toBe('备用解析器提取到的视频');
      expect(result.media[0].url).toContain('https://aweme.snssdk.com/play/');
    });
  });

  describe('2. 国际平台双路线：Native 失败时自动降级到 Cobalt', () => {
    it('TikTok 原生解析被拦截 (403) 时，无缝降级到 CobaltProvider', async () => {
      const router = new ProviderRouter();
      router.register(new TikTokNativeProvider());
      router.register(new CobaltProvider());

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init?: any) => {
          const u = String(url);
          // 原生抓取 tiktok.com 返回 403 Forbidden
          if (u.includes('tiktok.com')) {
            return new Response('Blocked by WAF', { status: 403 });
          }
          // Cobalt 服务正常响应
          if (u.includes('cobalt-primary.internal')) {
            return new Response(
              JSON.stringify({
                status: 'stream',
                url: 'https://cdn.cobalt.tools/tiktok_video.mp4',
                filename: 'tiktok_video.mp4',
              }),
              { status: 200 }
            );
          }
          return new Response('Not Found', { status: 404 });
        })
      );

      const res = await router.parse(
        {
          url: new URL('https://www.tiktok.com/@user/video/7234567890123456789'),
          platform: 'tiktok',
          contentId: '7234567890123456789',
          rawInput: 'https://www.tiktok.com/@user/video/7234567890123456789',
        },
        defaultContext
      );

      expect(res.success).toBe(true);
      expect(res.provider.id).toBe('cobalt-provider');
      expect(res.provider.fallbackChain).toEqual(['tiktok-native', 'cobalt-provider']);
      expect(res.media[0].url).toBe('https://cdn.cobalt.tools/tiktok_video.mp4');
    });

    it('Twitter 原生 API 频控 (429) 时，无缝降级到 CobaltProvider', async () => {
      const router = new ProviderRouter();
      router.register(new TwitterProvider());
      router.register(new CobaltProvider());

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          const u = String(url);
          if (u.includes('syndication.twimg.com')) {
            return new Response('Rate limited', { status: 429 });
          }
          if (u.includes('cobalt-primary.internal')) {
            return new Response(
              JSON.stringify({
                status: 'stream',
                url: 'https://cdn.cobalt.tools/twitter_video.mp4',
                filename: 'twitter_video.mp4',
              }),
              { status: 200 }
            );
          }
          return new Response('Not Found', { status: 404 });
        })
      );

      const res = await router.parse(
        {
          url: new URL('https://x.com/user/status/1789012345678901234'),
          platform: 'twitter',
          contentId: '1789012345678901234',
          rawInput: 'https://x.com/user/status/1789012345678901234',
        },
        defaultContext
      );

      expect(res.success).toBe(true);
      expect(res.provider.id).toBe('cobalt-provider');
      expect(res.provider.fallbackChain).toEqual(['twitter-native', 'cobalt-provider']);
    });

    it('YouTube 原生 Innertube 无法识别格式时，无缝降级到 CobaltProvider', async () => {
      const router = new ProviderRouter();
      router.register(new YoutubeNativeProvider());
      router.register(new CobaltProvider());

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          const u = String(url);
          if (u.includes('youtubei/v1/player')) {
            // 返回无可播放直链的数据（如仅限会员或版权限制）
            return new Response(JSON.stringify({ playabilityStatus: { status: 'LOGIN_REQUIRED' } }), { status: 200 });
          }
          if (u.includes('cobalt-primary.internal')) {
            return new Response(
              JSON.stringify({
                status: 'stream',
                url: 'https://cdn.cobalt.tools/yt_1080p.mp4',
                filename: 'yt_1080p.mp4',
              }),
              { status: 200 }
            );
          }
          return new Response('Not Found', { status: 404 });
        })
      );

      const res = await router.parse(
        {
          url: new URL('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
          platform: 'youtube',
          contentId: 'dQw4w9WgXcQ',
          rawInput: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
        defaultContext
      );

      expect(res.success).toBe(true);
      expect(res.provider.id).toBe('cobalt-provider');
      expect(res.provider.fallbackChain).toEqual(['youtube-native', 'cobalt-provider']);
      expect(res.media[0].url).toBe('https://cdn.cobalt.tools/yt_1080p.mp4');
    });
  });

  describe('3. Cobalt 多端点集群容灾 Fallback', () => {
    it('当 Primary Cobalt 实例挂掉 (HTTP 502) 时，自动请求 FallbackUrls 中的备用实例', async () => {
      const cobaltProvider = new CobaltProvider();
      const calledUrls: string[] = [];

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          const u = String(url);
          calledUrls.push(u);
          if (u.includes('cobalt-primary.internal')) {
            return new Response('Bad Gateway', { status: 502 });
          }
          if (u.includes('cobalt-backup.internal')) {
            return new Response(
              JSON.stringify({
                status: 'stream',
                url: 'https://backup-cdn.cobalt.tools/insta.mp4',
                filename: 'insta.mp4',
              }),
              { status: 200 }
            );
          }
          return new Response('Not Found', { status: 404 });
        })
      );

      const res = await cobaltProvider.parse(
        {
          url: new URL('https://www.instagram.com/reel/C_xyz789/'),
          platform: 'instagram',
          contentId: 'C_xyz789',
          rawInput: 'https://www.instagram.com/reel/C_xyz789/',
        },
        defaultContext
      );

      expect(calledUrls.some((u) => u.includes('cobalt-primary.internal'))).toBe(true);
      expect(calledUrls.some((u) => u.includes('cobalt-backup.internal'))).toBe(true);
      expect(res.media[0].url).toBe('https://backup-cdn.cobalt.tools/insta.mp4');
    });
  });

  describe('4. 不可重试异常立即截断 (Non-retryable Error Abort)', () => {
    it('当解析到作品不存在或已删除时，立即中断抛错，严禁触发无意义的备用 Provider 消耗上游', async () => {
      let secondaryInvoked = false;

      class MockNotFoundProvider implements MediaProvider {
        readonly id = 'p-404';
        readonly name = '404提供者';
        readonly platforms = ['bilibili' as const];
        supports() { return true; }
        async parse(): Promise<ProviderRawResult> {
          throw new AppError('CONTENT_NOT_FOUND', '视频已被UP主删除或已下架', { isRetryable: false });
        }
      }

      class MockSecondaryProvider implements MediaProvider {
        readonly id = 'p-secondary';
        readonly name = '备用提供者';
        readonly platforms = ['bilibili' as const];
        supports() { return true; }
        async parse(): Promise<ProviderRawResult> {
          secondaryInvoked = true;
          return {} as any;
        }
      }

      const router = new ProviderRouter();
      router.register(new MockNotFoundProvider());
      router.register(new MockSecondaryProvider());

      await expect(
        router.parse(
          {
            url: new URL('https://www.bilibili.com/video/BV1dead'),
            platform: 'bilibili',
            rawInput: 'https://www.bilibili.com/video/BV1dead',
          },
          defaultContext
        )
      ).rejects.toThrow('视频已被UP主删除或已下架');

      expect(secondaryInvoked).toBe(false);
    });
  });

  describe('5. 熔断降级与 Half-Open 自愈恢复完整生命周期', () => {
    it('连续 3 次失败触发熔断，降级健康分，全熔断时启动 Half-Open 试探恢复', async () => {
      let shouldFail = true;

      class FragileProvider implements MediaProvider {
        readonly id = 'fragile-p';
        readonly name = '脆弱服务';
        readonly platforms = ['weibo' as const];
        supports() { return true; }
        async parse(input: ProviderParseInput): Promise<ProviderRawResult> {
          if (shouldFail) {
            throw new AppError('UPSTREAM_BLOCKED', '网络拥塞', { isRetryable: true });
          }
          return {
            platform: 'weibo',
            sourceUrl: input.url.toString(),
            content: { type: 'video', title: '网络恢复' },
            media: [{ type: 'video', url: 'https://cdn.weibo.com/recovered.mp4' }],
          };
        }
      }

      const router = new ProviderRouter();
      router.register(new FragileProvider());

      const input = {
        url: new URL('https://weibo.com/detail/123'),
        platform: 'weibo' as const,
        rawInput: 'https://weibo.com/detail/123',
      };

      // 连续 3 次失败
      for (let i = 0; i < 3; i++) {
        await expect(router.parse(input, defaultContext)).rejects.toThrow();
      }

      // 检查此时 Provider 状态
      const providerMeta = router.getAllRegisteredProviders().find((p) => p.id === 'fragile-p')!;
      expect(providerMeta.stats.consecutiveFailures).toBe(3);
      expect(providerMeta.stats.circuitOpenUntil).toBeGreaterThan(Date.now());
      expect(providerMeta.healthScore).toBeLessThan(0.7); // 健康评分显著惩罚

      // 上游服务恢复正常，发起第 4 次调用
      // 此时所有 Provider 熔断，触发 Half-Open 单次试探放行！
      shouldFail = false;
      const healedRes = await router.parse(input, defaultContext);
      expect(healedRes.success).toBe(true);
      expect(healedRes.content.title).toBe('网络恢复');

      // 验证自愈成功后，熔断标记已被消除
      const healedMeta = router.getAllRegisteredProviders().find((p) => p.id === 'fragile-p')!;
      expect(healedMeta.stats.circuitOpenUntil).toBeUndefined();
      expect(healedMeta.stats.consecutiveFailures).toBe(0);
      expect(healedMeta.stats.successes).toBe(1);
    });
  });
});
