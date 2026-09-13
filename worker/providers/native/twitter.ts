import type { Platform } from '../../schemas/result';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../base';
import { AppError } from '../../core/errors';

function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/[0.]/g, '');
}

export class TwitterProvider implements MediaProvider {
  readonly id = 'twitter-native';
  readonly name = 'X/Twitter 原生解析器';
  readonly platforms: Platform[] = ['twitter'];

  supports(platform: Platform): boolean {
    return platform === 'twitter';
  }

  async parse(input: ProviderParseInput, context: ProviderContext): Promise<ProviderRawResult> {
    const match = input.url.pathname.match(/status\/(\d+)/);
    const statusId = input.contentId || match?.[1];

    if (!statusId) {
      throw new AppError('PARSE_FAILED', '未识别到推文 ID', { platform: 'twitter' });
    }

    const token = syndicationToken(statusId);
    const apiUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${statusId}&lang=en&token=${token}`;
    const res = await fetch(apiUrl, {
      signal: context.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://platform.twitter.com/',
      },
    });

    if (!res.ok) {
      throw new AppError('UPSTREAM_BLOCKED', `X/Twitter API 响应 HTTP ${res.status}`, {
        platform: 'twitter',
      });
    }

    const data = (await res.json()) as any;
    if (!data || data.tombstone) {
      throw new AppError('PRIVATE_CONTENT', '该推文不存在或受隐私保护', { platform: 'twitter' });
    }

    const title = data.text || 'X/Twitter 动态';
    const author = {
      name: data.user?.name,
      avatar: data.user?.profile_image_url_https,
      url: `https://x.com/${data.user?.screen_name}`,
    };

    const targetData = data.video || data.photos?.length ? data : (data.quoted_tweet || data);
    const videoObj = targetData.video || targetData.animated_gif;

    if (videoObj) {
      const variants: any[] = videoObj.variants || [];
      const mp4s = variants
        .filter((v) => v.content_type === 'video/mp4')
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      const media = (mp4s.length ? mp4s : variants)
        .filter((v) => v.src)
        .slice(0, 3)
        .map((best: any) => ({
          type: 'video' as const,
          url: best.src,
          quality: best.bitrate ? `${Math.round(best.bitrate / 1000)}k` : '高清',
          filename: `twitter_${statusId}.mp4`,
          direct: true,
        }));

      if (media.length > 0) {
        return {
          platform: 'twitter',
          sourceUrl: input.url.toString(),
          canonicalUrl: `https://x.com/i/status/${statusId}`,
          contentId: statusId,
          author,
          content: {
            type: 'video',
            title,
            cover: videoObj.poster,
            duration: videoObj.durationMillis ? Math.round(videoObj.durationMillis / 1000) : undefined,
          },
          media,
        };
      }
    }

    const photos = targetData.photos;
    if (Array.isArray(photos) && photos.length > 0) {
      const media = photos.map((p: any, idx: number) => ({
        type: 'image' as const,
        url: p.url,
        previewUrl: p.url,
        width: p.width,
        height: p.height,
        filename: `twitter_${statusId}_${idx + 1}.jpg`,
        direct: true,
      }));

      return {
        platform: 'twitter',
        sourceUrl: input.url.toString(),
        canonicalUrl: `https://x.com/i/status/${statusId}`,
        contentId: statusId,
        author,
        content: {
          type: 'images',
          title,
          cover: media[0]?.url,
        },
        media,
      };
    }

    throw new AppError('PARSE_FAILED', '推文中未检测到可下载的多媒体内容', { platform: 'twitter' });
  }
}
