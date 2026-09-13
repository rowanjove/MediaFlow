import type { ParseRequestBody } from '../schemas/request';
import type { ProviderRouter } from '../core/router';
import { detectPlatform } from '../core/detector';
import { getCacheKey, getCachedResult, setCachedResult } from '../core/cache';
import { AppError } from '../core/errors';
import { assertRateLimit } from '../core/ratelimit';
import { createTimeout, PARSE_TIMEOUT_MS } from '../core/timeout';
import { hashUrl, logParse } from '../core/log';

const MAX_BODY_BYTES = 8 * 1024;

export async function handleParse(
  request: Request,
  env: Record<string, any>,
  router: ProviderRouter,
  requestId: string
): Promise<Response> {
  const started = Date.now();

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({
        success: false,
        requestId,
        error: { code: 'INVALID_URL', message: '请使用 POST 请求' },
      }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    assertRateLimit(request, env);
  } catch (err: any) {
    if (err instanceof AppError) {
      return jsonError(err, requestId);
    }
    throw err;
  }

  const contentLength = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return jsonError(new AppError('INVALID_URL', '请求体过大'), requestId);
  }

  let body: ParseRequestBody;
  try {
    body = (await request.json()) as ParseRequestBody;
  } catch {
    return jsonError(new AppError('INVALID_URL', '请求体必须为合法 JSON'), requestId);
  }

  try {
    const { url: rawUrl } = body;
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new AppError('INVALID_URL', 'URL 字段不能为空');
    }
    if (rawUrl.length > 4000) {
      throw new AppError('INVALID_URL', 'URL 过长');
    }

    const detection = await detectPlatform(rawUrl);
    const canonicalStr = detection.url.toString();
    const urlHash = await hashUrl(canonicalStr);

    const cacheKey = await getCacheKey(detection.platform, canonicalStr);
    const cached = await getCachedResult(cacheKey);
    if (cached) {
      logParse({
        requestId,
        platform: detection.platform,
        provider: cached.provider?.id,
        durationMs: Date.now() - started,
        result: 'success',
        fallbackCount: 0,
        contentId: detection.contentId,
        urlHash,
      });
      return new Response(JSON.stringify(cached), {
        headers: {
          'Content-Type': 'application/json',
          'X-Cache-Status': 'HIT',
          'X-Request-Id': requestId,
        },
      });
    }

    const timeout = createTimeout(PARSE_TIMEOUT_MS);
    const context = {
      signal: timeout.signal,
      requestId,
      cookies: {
        douyin: env.DOUYIN_COOKIE,
        bilibili: env.BILIBILI_COOKIE,
        weibo: env.WEIBO_COOKIE,
      },
      env,
    };

    let result;
    try {
      result = await router.parse(
        {
          url: detection.url,
          platform: detection.platform,
          contentId: detection.contentId,
          rawInput: rawUrl,
        },
        context
      );
    } finally {
      timeout.clear();
    }

    const ttl = result.media.some((m) => m.expiresAt) ? 30 : 60;
    await setCachedResult(cacheKey, result, ttl);

    logParse({
      requestId,
      platform: result.platform,
      provider: result.provider.id,
      durationMs: Date.now() - started,
      result: 'success',
      fallbackCount: result.provider.fallbackChain ? result.provider.fallbackChain.length - 1 : 0,
      contentId: result.source.contentId,
      urlHash,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache-Status': 'MISS',
        'X-Request-Id': requestId,
      },
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      logParse({
        requestId,
        platform: err.platform,
        durationMs: Date.now() - started,
        result: 'error',
        errorCode: err.code,
      });
      return jsonError(err, requestId);
    }

    const aborted = err?.name === 'AbortError';
    const mapped = new AppError(
      aborted ? 'UPSTREAM_TIMEOUT' : 'INTERNAL_ERROR',
      aborted ? '解析超时，请稍后重试' : '内部服务解析异常，请稍后重试'
    );
    logParse({
      requestId,
      durationMs: Date.now() - started,
      result: 'error',
      errorCode: mapped.code,
    });
    return jsonError(mapped, requestId);
  }
}

function jsonError(err: AppError, requestId: string): Response {
  return new Response(JSON.stringify(err.toResponse(requestId)), {
    status: err.statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
  });
}
