import type { Platform } from '../../schemas/result';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../base';
import { AppError } from '../../core/errors';

function decodeHtml(jsonText: string): string {
  return jsonText
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function pickItem(html: string): any | null {
  const uni = html.match(
    /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i
  );
  if (uni?.[1]) {
    try {
      const json = JSON.parse(decodeHtml(uni[1]));
      const item =
        json?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct ||
        json?.__DEFAULT_SCOPE__?.['webapp.reflow.video.detail']?.itemInfo?.itemStruct;
      if (item) return item;
    } catch {
      /* continue */
    }
  }

  const sigi = html.match(/<script[^>]*id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/i);
  if (sigi?.[1]) {
    try {
      const json = JSON.parse(decodeHtml(sigi[1]));
      const items = json?.ItemModule;
      if (items && typeof items === 'object') {
        const first = Object.values(items)[0];
        if (first) return first;
      }
    } catch {
      /* continue */
    }
  }

  return null;
}

function bestPlayUrl(item: any): string | undefined {
  const play =
    item?.video?.playAddr ||
    item?.video?.downloadAddr ||
    item?.video?.bitrateInfo?.[0]?.PlayAddr;
  const list = play?.url_list || play?.UrlList || play?.urlList;
  if (Array.isArray(list) && list[0]) return String(list[0]).replace(/\\u002F/g, '/');
  if (typeof play === 'string') return play;
  return undefined;
}

export class TikTokNativeProvider implements MediaProvider {
  readonly id = 'tiktok-native';
  readonly name = 'TikTok 原生实验解析器';
  readonly platforms: Platform[] = ['tiktok'];

  supports(platform: Platform): boolean {
    return platform === 'tiktok';
  }

  async parse(input: ProviderParseInput, context: ProviderContext): Promise<ProviderRawResult> {
    const res = await fetch(input.url.toString(), {
      signal: context.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        Referer: 'https://www.tiktok.com/',
      },
    });

    if (!res.ok) {
      throw new AppError('UPSTREAM_BLOCKED', `TikTok 页面响应 HTTP ${res.status}`, {
        platform: 'tiktok',
      });
    }

    const html = await res.text();
    const item = pickItem(html);
    if (!item) {
      throw new AppError('PARSE_FAILED', '未能从 TikTok 页面提取作品数据', {
        platform: 'tiktok',
      });
    }

    const contentId = String(item.id || input.contentId || '');
    const title = item.desc || item.title || 'TikTok 作品';
    const author = {
      id: item.author?.id || item.author?.uniqueId,
      name: item.author?.nickname || item.author?.uniqueId,
      avatar: item.author?.avatarThumb || item.author?.avatarMedium,
      url: item.author?.uniqueId ? `https://www.tiktok.com/@${item.author.uniqueId}` : undefined,
    };

    const images: any[] = item.imagePost?.images || [];
    if (images.length > 0) {
      const media: ProviderRawResult['media'] = images.map((img: any, idx: number) => {
        const url =
          img.imageURL?.urlList?.[img.imageURL.urlList.length - 1] ||
          img.imageURL?.url_list?.[0] ||
          img.url;
        return {
          type: 'image' as const,
          url,
          filename: `tiktok_${contentId}_${idx + 1}.jpeg`,
          direct: true,
        };
      });
      const music = item.music?.playUrl || item.music?.play_url?.url_list?.[0];
      if (music) {
        media.push({
          type: 'audio',
          url: typeof music === 'string' ? music : music.urlList?.[0] || music.url_list?.[0],
          filename: `tiktok_${contentId}_bgm.mp3`,
          direct: true,
        });
      }
      return {
        platform: 'tiktok',
        sourceUrl: input.url.toString(),
        canonicalUrl: contentId ? `https://www.tiktok.com/@/video/${contentId}` : input.url.toString(),
        contentId,
        author,
        content: {
          type: 'images',
          title,
          description: item.desc,
          cover: media[0]?.url,
        },
        media,
      };
    }

    const playUrl = bestPlayUrl(item);
    if (!playUrl) {
      throw new AppError('PARSE_FAILED', 'TikTok 未返回可下载的视频地址', { platform: 'tiktok' });
    }

    const media: ProviderRawResult['media'] = [
      {
        type: 'video',
        url: playUrl,
        quality: '原画',
        filename: `tiktok_${contentId}.mp4`,
        direct: true,
      },
    ];
    const music = item.music?.playUrl;
    if (typeof music === 'string') {
      media.push({
        type: 'audio',
        url: music,
        filename: `tiktok_${contentId}_bgm.mp3`,
        direct: true,
      });
    }

    return {
      platform: 'tiktok',
      sourceUrl: input.url.toString(),
      canonicalUrl: contentId ? `https://www.tiktok.com/@/video/${contentId}` : input.url.toString(),
      contentId,
      author,
      content: {
        type: 'video',
        title,
        description: item.desc,
        cover: item.video?.cover || item.video?.originCover,
        duration: item.video?.duration,
      },
      media,
    };
  }
}
