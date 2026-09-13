import type { ParseResult, MediaResource } from '../schemas/result';
import type { ProviderRawResult } from '../providers/base';

export function sanitizeFilename(name?: string): string | undefined {
  if (!name) return undefined;
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export function normalizeResult(
  raw: ProviderRawResult,
  providerId: string,
  requestId: string,
  latencyMs: number,
  fallbackChain?: string[]
): ParseResult {
  const media: MediaResource[] = raw.media
    .filter((m) => Boolean(m.url))
    .map((m) => {
      let cleanUrl = m.url.trim();
      if (cleanUrl.startsWith('//')) {
        cleanUrl = 'https:' + cleanUrl;
      }

      let preview = m.previewUrl?.trim();
      if (preview && preview.startsWith('//')) {
        preview = 'https:' + preview;
      }

      return {
        type: m.type,
        url: cleanUrl,
        previewUrl: preview,
        quality: m.quality,
        width: m.width,
        height: m.height,
        bitrate: m.bitrate,
        mime: m.mime,
        filename: sanitizeFilename(m.filename),
        sizeBytes: m.sizeBytes,
        direct: m.direct ?? true,
        expiresAt: m.expiresAt,
      };
    });

  let cover = raw.content.cover?.trim();
  if (cover && cover.startsWith('//')) {
    cover = 'https:' + cover;
  }

  let avatar = raw.author?.avatar?.trim();
  if (avatar && avatar.startsWith('//')) {
    avatar = 'https:' + avatar;
  }

  return {
    success: true,
    requestId,
    platform: raw.platform,
    source: {
      url: raw.sourceUrl,
      canonicalUrl: raw.canonicalUrl || raw.sourceUrl,
      contentId: raw.contentId,
    },
    author: raw.author
      ? {
          id: raw.author.id,
          name: raw.author.name?.trim(),
          avatar,
          url: raw.author.url,
        }
      : undefined,
    content: {
      type: raw.content.type,
      title: raw.content.title?.trim() || undefined,
      description: raw.content.description?.trim() || undefined,
      cover,
      createdAt: raw.content.createdAt,
      duration: raw.content.duration,
    },
    media,
    provider: {
      id: providerId,
      latencyMs,
      fallbackChain,
    },
  };
}
