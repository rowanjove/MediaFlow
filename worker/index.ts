import { ProviderRouter } from './core/router';
import { DouyinPrimaryProvider } from './providers/native/douyin/primary';
import { DouyinFallbackProvider } from './providers/native/douyin/fallback';
import { XiaohongshuProvider } from './providers/native/xiaohongshu';
import { KuaishouProvider } from './providers/native/kuaishou';
import { BilibiliProvider } from './providers/native/bilibili';
import { WeiboProvider } from './providers/native/weibo';
import { TwitterProvider } from './providers/native/twitter';
import { TikTokNativeProvider } from './providers/experimental/tiktok-native';
import { YoutubeNativeProvider } from './providers/native/youtube';
import { CobaltProvider } from './providers/cobalt/provider';
import { extendedProviders } from './providers/native/extended';

import { handleParse } from './routes/parse';
import { handlePlatforms } from './routes/platforms';
import { handleHealth } from './routes/health';
import { handleAdmin } from './routes/admin';

const router = new ProviderRouter();

router.register(new DouyinPrimaryProvider());
router.register(new DouyinFallbackProvider());
router.register(new XiaohongshuProvider());
router.register(new KuaishouProvider());
router.register(new BilibiliProvider());
router.register(new WeiboProvider());
router.register(new TwitterProvider());
router.register(new TikTokNativeProvider());
router.register(new YoutubeNativeProvider());
router.register(new CobaltProvider());
for (const provider of extendedProviders) {
  router.register(provider);
}

export interface Env {
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  DOUYIN_COOKIE?: string;
  BILIBILI_COOKIE?: string;
  WEIBO_COOKIE?: string;
  ADMIN_SECRET?: string;
  COBALT_PRIMARY_URL?: string;
  COBALT_FALLBACK_URLS?: string;
  COBALT_API_KEY?: string;
  RATE_LIMIT_COUNT?: string;
  RATE_LIMIT_WINDOW?: string;
  [key: string]: any;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    let response: Response | undefined;

    try {
      if (url.pathname === '/api/v1/parse') {
        response = await handleParse(request, env, router, requestId);
      } else if (url.pathname === '/api/v1/platforms') {
        response = handlePlatforms();
      } else if (url.pathname === '/health') {
        response = handleHealth(router);
      } else if (url.pathname.startsWith('/api/v1/admin/')) {
        response = await handleAdmin(request, env, router);
      } else if (env.ASSETS) {
        response = await env.ASSETS.fetch(request);
      } else {
        response = new Response('Not Found', { status: 404 });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Worker 运行时异常';
      console.error(JSON.stringify({ type: 'fatal', requestId, error: 'INTERNAL_ERROR' }));
      response = new Response(
        JSON.stringify({
          success: false,
          requestId,
          error: { code: 'INTERNAL_ERROR', message },
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('X-Content-Type-Options', 'nosniff');
    newHeaders.set('X-Frame-Options', 'DENY');
    newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    newHeaders.set('X-Request-Id', requestId);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
