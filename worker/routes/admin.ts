import type { ProviderRouter } from '../core/router';
import { bumpCacheGeneration } from '../core/cache';

const startedAt = Date.now();

export async function handleAdmin(
  request: Request,
  env: Record<string, any>,
  router: ProviderRouter
): Promise<Response> {
  const url = new URL(request.url);
  const token =
    request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ||
    request.headers.get('X-Admin-Key');

  const adminSecret = env.ADMIN_SECRET;
  if (!adminSecret) {
    return new Response(
      JSON.stringify({ success: false, message: '未配置 ADMIN_SECRET，管理接口已关闭' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!token || token !== adminSecret) {
    return new Response(
      JSON.stringify({ success: false, message: '未授权或管理密钥不正确' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const path = url.pathname;

  if (path === '/api/v1/admin/stats') {
    const providers = router.getAllRegisteredProviders();
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          uptime: Math.floor((Date.now() - startedAt) / 1000),
          providers,
          cookiesConfigured: {
            douyin: Boolean(env.DOUYIN_COOKIE),
            bilibili: Boolean(env.BILIBILI_COOKIE),
            weibo: Boolean(env.WEIBO_COOKIE),
          },
          cobaltEndpoint: env.COBALT_PRIMARY_URL || null,
        },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (path === '/api/v1/admin/cache-purge' && request.method === 'POST') {
    const generation = await bumpCacheGeneration();
    return new Response(
      JSON.stringify({
        success: true,
        message: '已提升缓存世代，旧解析结果将失效',
        generation,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ success: false, message: '未知的管理操作' }),
    { status: 404, headers: { 'Content-Type': 'application/json' } }
  );
}
