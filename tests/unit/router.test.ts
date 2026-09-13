import { describe, it, expect } from 'vitest';
import { ProviderRouter } from '../../worker/core/router';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../../worker/providers/base';
import { AppError } from '../../worker/core/errors';

class MockPrimaryFailingProvider implements MediaProvider {
  readonly id = 'mock-failing';
  readonly name = '模拟失败解析器';
  readonly platforms = ['douyin' as const];
  supports() { return true; }
  async parse(): Promise<ProviderRawResult> {
    throw new AppError('UPSTREAM_BLOCKED', '模拟主路线故障', { isRetryable: true });
  }
}

class MockFallbackProvider implements MediaProvider {
  readonly id = 'mock-fallback';
  readonly name = '模拟降级解析器';
  readonly platforms = ['douyin' as const];
  supports() { return true; }
  async parse(input: ProviderParseInput): Promise<ProviderRawResult> {
    return {
      platform: 'douyin',
      sourceUrl: input.url.toString(),
      content: { type: 'video', title: '降级成功' },
      media: [{ type: 'video', url: 'https://cdn.example.com/test.mp4' }],
    };
  }
}

describe('Provider Router 容灾与降级测试', () => {
  it('当主 Provider 失败且可重试时，自动降级到备用 Provider', async () => {
    const router = new ProviderRouter();
    router.register(new MockPrimaryFailingProvider());
    router.register(new MockFallbackProvider());

    const fakeContext: ProviderContext = {
      signal: new AbortController().signal,
      requestId: 'req-test-123',
      env: {},
    };

    const res = await router.parse(
      {
        url: new URL('https://www.douyin.com/video/123456'),
        platform: 'douyin',
        rawInput: 'https://www.douyin.com/video/123456',
      },
      fakeContext
    );

    expect(res.success).toBe(true);
    expect(res.provider.id).toBe('mock-fallback');
    expect(res.provider.fallbackChain).toEqual(['mock-failing', 'mock-fallback']);
    expect(res.content.title).toBe('降级成功');
  });

  it('当单 Provider 平台触发熔断时，通过 Half-Open 试探自愈而不是报不支持平台', async () => {
    let callCount = 0;
    class FlakyProvider implements MediaProvider {
      readonly id = 'flaky';
      readonly name = '抖动解析器';
      readonly platforms = ['kuaishou' as const];
      supports() { return true; }
      async parse(input: ProviderParseInput): Promise<ProviderRawResult> {
        callCount++;
        if (callCount <= 3) {
          throw new AppError('PARSE_FAILED', '暂时网络抖动', { isRetryable: true });
        }
        return {
          platform: 'kuaishou',
          sourceUrl: input.url.toString(),
          content: { type: 'video', title: '自愈成功' },
          media: [{ type: 'video', url: 'https://cdn.example.com/kuaishou.mp4' }],
        };
      }
    }

    const router = new ProviderRouter();
    router.register(new FlakyProvider());

    const fakeContext: ProviderContext = {
      signal: new AbortController().signal,
      requestId: 'req-flaky',
      env: {},
    };

    const inputData = {
      url: new URL('https://v.kuaishou.com/test'),
      platform: 'kuaishou' as const,
      rawInput: 'https://v.kuaishou.com/test',
    };

    // 连续失败 3 次触发熔断
    for (let i = 0; i < 3; i++) {
      await expect(router.parse(inputData, fakeContext)).rejects.toThrow();
    }

    // 第 4 次：所有 Provider 均在 circuitOpenUntil 冷却中
    // 此时应该触发 Half-Open 试探放行，成功解析并解除熔断，而不是报 UNSUPPORTED_PLATFORM
    const res = await router.parse(inputData, fakeContext);
    expect(res.success).toBe(true);
    expect(res.content.title).toBe('自愈成功');
  });

  it('当主 Provider 抛出不可重试错误时，立即中断且不调用后续备用 Provider', async () => {
    let fallbackCalled = false;

    class MockNonRetryableProvider implements MediaProvider {
      readonly id = 'mock-non-retryable';
      readonly name = '不可重试解析器';
      readonly platforms = ['douyin' as const];
      supports() { return true; }
      async parse(): Promise<ProviderRawResult> {
        throw new AppError('CONTENT_NOT_FOUND', '该作品已被作者删除', { isRetryable: false });
      }
    }

    class SpyFallbackProvider implements MediaProvider {
      readonly id = 'spy-fallback';
      readonly name = '侦查备用解析器';
      readonly platforms = ['douyin' as const];
      supports() { return true; }
      async parse(): Promise<ProviderRawResult> {
        fallbackCalled = true;
        return {
          platform: 'douyin',
          sourceUrl: 'https://www.douyin.com/video/deleted',
          content: { type: 'video', title: '不应被调用' },
          media: [{ type: 'video', url: 'https://cdn.example.com/fail.mp4' }],
        };
      }
    }

    const router = new ProviderRouter();
    router.register(new MockNonRetryableProvider());
    router.register(new SpyFallbackProvider());

    const fakeContext: ProviderContext = {
      signal: new AbortController().signal,
      requestId: 'req-abort-test',
      env: {},
    };

    await expect(
      router.parse(
        {
          url: new URL('https://www.douyin.com/video/deleted'),
          platform: 'douyin',
          rawInput: 'https://www.douyin.com/video/deleted',
        },
        fakeContext
      )
    ).rejects.toThrow('该作品已被作者删除');

    expect(fallbackCalled).toBe(false);
  });
});