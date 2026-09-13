import { describe, it, expect, beforeEach } from 'vitest';
import { assertRateLimit, resetRateLimitForTests } from '../../worker/core/ratelimit';
import { AppError } from '../../worker/core/errors';

describe('Rate Limit', () => {
  beforeEach(() => resetRateLimitForTests());

  it('超过窗口阈值抛出 RATE_LIMITED', () => {
    const env = { RATE_LIMIT_COUNT: '3', RATE_LIMIT_WINDOW: '60' };
    const req = () =>
      new Request('http://localhost/api/v1/parse', {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '203.0.113.8' },
      });

    assertRateLimit(req(), env);
    assertRateLimit(req(), env);
    assertRateLimit(req(), env);
    expect(() => assertRateLimit(req(), env)).toThrow(AppError);
    try {
      assertRateLimit(req(), env);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('RATE_LIMITED');
    }
  });

  it('max<=0 时关闭限流', () => {
    const env = { RATE_LIMIT_COUNT: '0', RATE_LIMIT_WINDOW: '60' };
    const req = new Request('http://localhost/api/v1/parse', { method: 'POST' });
    expect(() => assertRateLimit(req, env)).not.toThrow();
  });
});
