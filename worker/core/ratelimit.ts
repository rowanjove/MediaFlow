import { AppError } from './errors';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 4000;

export function resetRateLimitForTests(): void {
  buckets.clear();
}

function prune(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
  if (buckets.size >= MAX_BUCKETS) {
    const first = buckets.keys().next().value;
    if (first) buckets.delete(first);
  }
}

/**
 * 单 Isolate 滑动窗口限流。
 * Cloudflare 仪表盘 Rate Limiting 仍是生产级补充；这里保证未配 WAF 时也有下限。
 */
export function assertRateLimit(request: Request, env: Record<string, any>): void {
  const max = Number(env.RATE_LIMIT_COUNT ?? 60);
  const windowSec = Number(env.RATE_LIMIT_WINDOW ?? 60);
  if (!Number.isFinite(max) || max <= 0) return;
  if (!Number.isFinite(windowSec) || windowSec <= 0) return;

  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'local';

  const now = Date.now();
  prune(now);

  let bucket = buckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowSec * 1000 };
    buckets.set(ip, bucket);
  }

  bucket.count += 1;
  if (bucket.count > max) {
    const retrySec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    throw new AppError(
      'RATE_LIMITED',
      `请求过于频繁，请 ${retrySec} 秒后再试`,
      { statusCode: 429 }
    );
  }
}
