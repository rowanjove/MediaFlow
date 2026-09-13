/**
 * 结构化日志。禁止记录完整分享 URL，只记 hash / contentId / 错误码。
 */
export async function hashUrl(url: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.slice(0, 16);
}

export interface ParseLogEvent {
  requestId: string;
  platform?: string;
  provider?: string;
  durationMs: number;
  result: 'success' | 'error';
  fallbackCount?: number;
  contentId?: string;
  urlHash?: string;
  errorCode?: string;
}

export function logParse(event: ParseLogEvent): void {
  console.log(JSON.stringify({ type: 'parse', ...event }));
}
