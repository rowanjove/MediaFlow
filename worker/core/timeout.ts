/**
 * 统一超时：返回可取消的 AbortSignal。
 * 各 Provider 必须尊重 context.signal，避免拖垮 Worker。
 */
export function createTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(id),
  };
}

export const PARSE_TIMEOUT_MS = 20_000;
export const PROVIDER_TIMEOUT_MS = 8_000;
export const COBALT_TIMEOUT_MS = 6_000;
