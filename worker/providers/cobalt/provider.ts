import type { Platform, MediaResource } from '../../schemas/result';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../base';
import { CobaltAuthError, CobaltClient } from './client';
import { AppError } from '../../core/errors';
import { assertSafeUpstream } from '../../core/security';
import { COBALT_TIMEOUT_MS, createTimeout } from '../../core/timeout';

function isHostedCobalt(raw: string): boolean {
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === 'api.cobalt.tools' || host.endsWith('.cobalt.tools');
  } catch {
    return false;
  }
}

export class CobaltProvider implements MediaProvider {
  readonly id = 'cobalt-provider';
  readonly name = 'Cobalt 外部解析服务';
  readonly platforms: Platform[] = ['tiktok', 'instagram', 'twitter', 'youtube'];

  supports(platform: Platform): boolean {
    return this.platforms.includes(platform);
  }

  async parse(input: ProviderParseInput, context: ProviderContext): Promise<ProviderRawResult> {
    const apiKey = String(context.env.COBALT_API_KEY || '').trim();
    const primaryUrl = String(context.env.COBALT_PRIMARY_URL || '').trim();
    const fallbackUrls = String(context.env.COBALT_FALLBACK_URLS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const endpoints = [primaryUrl, ...fallbackUrls].filter((url) => {
      if (!url) return false;
      if (!apiKey && isHostedCobalt(url)) return false;
      return true;
    });

    if (endpoints.length === 0) {
      throw new AppError(
        'PARSE_FAILED',
        '该国际平台需要自建 Cobalt。公共 api.cobalt.tools 已要求密钥，未配置 COBALT_API_KEY 时不会调用。请改用抖音 / 小红书 / B站 / 微博等国内链接。',
        { platform: input.platform, isRetryable: false }
      );
    }

    let lastError: any = null;

    for (const endpoint of endpoints) {
      try {
        assertSafeUpstream(endpoint);
        const client = new CobaltClient(endpoint, apiKey);
        const timeout = createTimeout(COBALT_TIMEOUT_MS);
        try {
          const resp = await client.parse({ url: input.url.toString(), videoQuality: '1080' }, timeout.signal);

          if (resp.status === 'error') {
            throw new AppError('PARSE_FAILED', 'Cobalt 解析返回错误状态', {
              platform: input.platform,
            });
          }

          if (resp.status === 'picker' && resp.picker) {
            const media: MediaResource[] = resp.picker.map((item, idx) => ({
              type: item.type === 'photo' ? 'image' : 'video',
              url: item.url,
              previewUrl: item.thumb,
              filename: `${input.platform}_${idx + 1}.${item.type === 'photo' ? 'jpg' : 'mp4'}`,
              direct: true,
            }));

            return {
              platform: input.platform,
              sourceUrl: input.url.toString(),
              canonicalUrl: input.url.toString(),
              content: {
                type: media.every((m) => m.type === 'image') ? 'images' : 'mixed',
                title: resp.text || `${input.platform.toUpperCase()} 图集`,
                cover: media[0]?.previewUrl || media[0]?.url,
              },
              media,
            };
          }

          if (resp.url) {
            const isAudio = /\.(mp3|m4a|ogg|wav|opus)(\?|$)/i.test(resp.filename || resp.url);
            return {
              platform: input.platform,
              sourceUrl: input.url.toString(),
              canonicalUrl: input.url.toString(),
              content: {
                type: isAudio ? 'audio' : 'video',
                title: resp.filename || `${input.platform.toUpperCase()} 媒体`,
              },
              media: [
                {
                  type: isAudio ? 'audio' : 'video',
                  url: resp.url,
                  filename: resp.filename,
                  quality: '高清',
                  direct: true,
                },
              ],
            };
          }
        } finally {
          timeout.clear();
        }
      } catch (err) {
        lastError = err;
        if (err instanceof CobaltAuthError) {
          throw new AppError('PARSE_FAILED', err.message, {
            platform: input.platform,
            isRetryable: false,
          });
        }
        if (err instanceof AppError && !err.isRetryable) {
          throw err;
        }
      }
    }

    throw new AppError(
      'PARSE_FAILED',
      lastError instanceof Error ? lastError.message : '国际平台解析失败',
      { platform: input.platform, isRetryable: false }
    );
  }
}
