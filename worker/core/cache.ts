import type { ParseResult } from '../schemas/result';

const GENERATION_KEY = 'https://media-cache.internal/generation';
let localGeneration = 1;

function getDefaultCache(): Cache | null {
  try {
    return typeof caches !== 'undefined' ? ((caches as any).default as Cache) : null;
  } catch {
    return null;
  }
}

export async function getCacheGeneration(): Promise<number> {
  try {
    const cache = getDefaultCache();
    if (cache) {
      const hit = await cache.match(new Request(GENERATION_KEY));
      if (hit) {
        const n = Number(await hit.text());
        if (Number.isFinite(n) && n > 0) {
          localGeneration = n;
          return n;
        }
      }
    }
  } catch (err) {
    console.warn('Cache generation read error');
  }
  return localGeneration;
}

export async function bumpCacheGeneration(): Promise<number> {
  localGeneration += 1;
  try {
    const cache = getDefaultCache();
    if (cache) {
      await cache.put(
        new Request(GENERATION_KEY),
        new Response(String(localGeneration), {
          headers: { 'Cache-Control': 'public, max-age=86400' },
        })
      );
    }
  } catch (err) {
    console.warn('Cache generation write error');
  }
  return localGeneration;
}

export async function getCacheKey(platform: string, canonicalUrl: string): Promise<string> {
  const gen = await getCacheGeneration();
  const encoder = new TextEncoder();
  const data = encoder.encode(`${gen}:${platform}:${canonicalUrl}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `https://media-cache.internal/${hashHex}`;
}

export async function getCachedResult(cacheKeyUrl: string): Promise<ParseResult | null> {
  try {
    const defaultCache = getDefaultCache();
    if (!defaultCache) return null;
    const response = await defaultCache.match(new Request(cacheKeyUrl));
    if (response) {
      return (await response.json()) as ParseResult;
    }
  } catch (err) {
    console.warn('Cache read error');
  }
  return null;
}

export async function setCachedResult(
  cacheKeyUrl: string,
  result: ParseResult,
  ttlSeconds: number = 60
): Promise<void> {
  try {
    const defaultCache = getDefaultCache();
    if (!defaultCache) return;
    const response = new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${ttlSeconds}`,
      },
    });
    await defaultCache.put(new Request(cacheKeyUrl), response);
  } catch (err) {
    console.warn('Cache write error');
  }
}
