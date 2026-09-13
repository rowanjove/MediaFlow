import type { Platform, ParseResult } from '../schemas/result';
import type { MediaProvider, ProviderContext, ProviderParseInput } from '../providers/base';
import { AppError } from './errors';
import { normalizeResult } from './normalize';

export interface ProviderStats {
  successes: number;
  failures: number;
  consecutiveFailures: number;
  avgLatency: number;
  circuitOpenUntil?: number;
}

const CIRCUIT_OPEN_MS = 5 * 60 * 1000;
const CIRCUIT_FAILURES = 3;

function healthScore(stat: ProviderStats): number {
  const total = stat.successes + stat.failures;
  const successRate = total === 0 ? 0.7 : stat.successes / total;
  const latencyScore = stat.avgLatency <= 0 ? 0.5 : Math.max(0, 1 - stat.avgLatency / 8000);
  const penalty = stat.consecutiveFailures * 0.15;
  return successRate + latencyScore - penalty;
}

function recordLatency(stat: ProviderStats, latency: number): void {
  stat.avgLatency = stat.avgLatency <= 0 ? latency : stat.avgLatency * 0.7 + latency * 0.3;
}

export class ProviderRouter {
  private providers: Map<string, MediaProvider> = new Map();
  private stats: Map<string, ProviderStats> = new Map();
  private platformMap: Map<Platform, string[]> = new Map();

  register(provider: MediaProvider, priorityPlatforms?: Platform[]): void {
    this.providers.set(provider.id, provider);
    this.stats.set(provider.id, {
      successes: 0,
      failures: 0,
      consecutiveFailures: 0,
      avgLatency: 0,
    });

    const platforms = priorityPlatforms || provider.platforms;
    for (const p of platforms) {
      const list = this.platformMap.get(p) || [];
      if (!list.includes(provider.id)) {
        list.push(provider.id);
        this.platformMap.set(p, list);
      }
    }
  }

  getProvidersForPlatform(platform: Platform): MediaProvider[] {
    const ids = this.platformMap.get(platform) || [];
    const now = Date.now();
    const scored: { provider: MediaProvider; score: number }[] = [];
    const allRegistered: MediaProvider[] = [];

    for (const id of ids) {
      const p = this.providers.get(id);
      if (!p) continue;
      allRegistered.push(p);
      const stat = this.stats.get(id);
      if (stat?.circuitOpenUntil && stat.circuitOpenUntil > now) {
        continue;
      }
      scored.push({ provider: p, score: stat ? healthScore(stat) : 0 });
    }

    if (scored.length > 0) {
      scored.sort((a, b) => b.score - a.score);
      return scored.map((s) => s.provider);
    }

    // 若全部熔断但平台确实注册过 Provider，启动 Half-Open 试探恢复
    // 挑选最有望自愈的 Provider 试探执行，避免 5 分钟死锁与误报 UNSUPPORTED_PLATFORM
    if (allRegistered.length > 0) {
      allRegistered.sort((a, b) => {
        const statA = this.stats.get(a.id);
        const statB = this.stats.get(b.id);
        const openA = statA?.circuitOpenUntil ?? 0;
        const openB = statB?.circuitOpenUntil ?? 0;
        return openA - openB;
      });
      return [allRegistered[0]];
    }

    return [];
  }

  getAllRegisteredProviders(): {
    id: string;
    name: string;
    platforms: Platform[];
    stats: ProviderStats;
    healthScore: number;
  }[] {
    const list = [];
    for (const [id, p] of this.providers.entries()) {
      const stat = this.stats.get(id) || {
        successes: 0,
        failures: 0,
        consecutiveFailures: 0,
        avgLatency: 0,
      };
      list.push({
        id: p.id,
        name: p.name,
        platforms: p.platforms,
        stats: stat,
        healthScore: Number(healthScore(stat).toFixed(3)),
      });
    }
    return list;
  }

  async parse(
    input: ProviderParseInput,
    context: ProviderContext
  ): Promise<ParseResult> {
    const available = this.getProvidersForPlatform(input.platform);
    if (available.length === 0) {
      throw new AppError(
        'UNSUPPORTED_PLATFORM',
        `当前暂无可用解析器支持平台: ${input.platform}`,
        { platform: input.platform }
      );
    }

    const fallbackChain: string[] = [];
    let lastError: any = null;

    for (const provider of available) {
      fallbackChain.push(provider.id);
      const startTime = Date.now();

      try {
        const rawResult = await provider.parse(input, context);
        const latency = Date.now() - startTime;

        const stat = this.stats.get(provider.id);
        if (stat) {
          stat.successes++;
          stat.consecutiveFailures = 0;
          stat.circuitOpenUntil = undefined;
          recordLatency(stat, latency);
        }

        return normalizeResult(
          rawResult,
          provider.id,
          context.requestId,
          latency,
          fallbackChain.length > 1 ? fallbackChain : undefined
        );
      } catch (err: any) {
        const latency = Date.now() - startTime;
        console.warn(
          JSON.stringify({
            type: 'provider_error',
            requestId: context.requestId,
            provider: provider.id,
            error: err instanceof AppError ? err.code : 'PARSE_FAILED',
            latencyMs: latency,
          })
        );

        const stat = this.stats.get(provider.id);
        if (stat) {
          stat.failures++;
          stat.consecutiveFailures++;
          recordLatency(stat, latency);
          if (stat.consecutiveFailures >= CIRCUIT_FAILURES) {
            stat.circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
          }
        }

        lastError = err;

        if (err instanceof AppError && !err.isRetryable) {
          throw err;
        }
      }
    }

    if (lastError instanceof AppError) {
      throw lastError;
    }
    throw new AppError(
      'PARSE_FAILED',
      `所有解析尝试均未成功: ${lastError?.message || '未知错误'}`,
      { platform: input.platform }
    );
  }
}
