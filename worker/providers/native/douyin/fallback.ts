import type { Platform } from '../../../schemas/result';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../../base';
import { AppError } from '../../../core/errors';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

function extractTtwid(res: Response): string {
  const bags: string[] = [];
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === 'function') {
    bags.push(...anyHeaders.getSetCookie());
  } else {
    const raw = res.headers.get('set-cookie');
    if (raw) bags.push(raw);
  }
  for (const sc of bags) {
    const m = sc.match(/ttwid=([^;]+)/);
    if (m) return `ttwid=${m[1]}`;
  }
  return '';
}

function pickItem(parsed: any): any {
  const keys = ['video_(id)/page', 'note_(id)/page', 'story_(id)/page'];
  for (const key of keys) {
    const item = parsed?.loaderData?.[key]?.videoInfoRes?.item_list?.[0];
    if (item) return item;
  }
  return null;
}

export class DouyinFallbackProvider implements MediaProvider {
  readonly id = 'douyin-douyinvd';
  readonly name = '抖音 douyinVd 备用解析器';
  readonly platforms: Platform[] = ['douyin'];

  supports(platform: Platform): boolean {
    return platform === 'douyin';
  }

  async parse(input: ProviderParseInput, context: ProviderContext): Promise<ProviderRawResult> {
    const kind = input.url.pathname.includes('/note/') ? 'note' : 'video';
    const match = input.url.pathname.match(/(?:video|note|story)\/(\d+)/);
    const itemId = input.contentId || match?.[1] || input.url.toString().match(/(\d{15,})/)?.[1];

    if (!itemId) {
      throw new AppError('PARSE_FAILED', '备用解析器未能定位作品 ID', { platform: 'douyin' });
    }

    const shareUrl = `https://www.iesdouyin.com/share/${kind}/${itemId}`;
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Cookie: context.cookies?.douyin || '',
    };

    let res = await fetch(shareUrl, { signal: context.signal, headers });
    if (!res.ok) {
      throw new AppError('UPSTREAM_BLOCKED', `抖音分享页访问失败 HTTP ${res.status}`, { platform: 'douyin' });
    }

    let html = await res.text();
    const ttwid = extractTtwid(res);
    if (ttwid && !html.includes('item_list')) {
      const retryHeaders = {
        ...headers,
        Cookie: [headers.Cookie, ttwid].filter(Boolean).join('; '),
      };
      res = await fetch(shareUrl, { signal: context.signal, headers: retryHeaders });
      html = await res.text();
    }

    const routerMatch = html.match(/window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
    if (!routerMatch) {
      throw new AppError('PARSE_FAILED', '未能从分享页中提取路由数据', { platform: 'douyin' });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(routerMatch[1]);
    } catch {
      throw new AppError('PARSE_FAILED', '解析页面结构数据失败', { platform: 'douyin' });
    }

    const item = pickItem(parsed);
    if (!item) {
      throw new AppError('PARSE_FAILED', '未查找到视频信息', { platform: 'douyin' });
    }

    const title = item.desc || '抖音内容';
    const cover = item.video?.cover?.url_list?.[0];
    const images: any[] = Array.isArray(item.images) ? item.images : [];
    const playAddr = item.video?.play_addr || {};
    const duration = item.video?.duration || 0;
    const isVideo = images.length === 0 && (playAddr.url_list?.[0] || playAddr.uri) && duration > 0;

    if (!isVideo && images.length > 0) {
      const media: ProviderRawResult['media'] = images.map((img: any, idx: number) => ({
        type: 'image' as const,
        url: img.url_list?.[img.url_list.length - 1] || img.url_list?.[0],
        filename: `douyin_${itemId}_${idx + 1}.jpeg`,
        direct: true,
      }));
      const music = item.music?.play_url?.url_list?.[0];
      if (music) {
        media.push({
          type: 'audio' as const,
          url: music,
          filename: `douyin_${itemId}_bgm.mp3`,
          direct: true,
        });
      }
      return {
        platform: 'douyin',
        sourceUrl: input.url.toString(),
        canonicalUrl: `https://www.douyin.com/note/${itemId}`,
        contentId: itemId,
        author: {
          name: item.author?.nickname,
          avatar: item.author?.avatar_thumb?.url_list?.[0],
        },
        content: { type: 'images', title, description: item.desc, cover: cover || media[0]?.url },
        media,
      };
    }

    let playUrl: string = playAddr.url_list?.[0] || '';
    if (playUrl.includes('playwm')) playUrl = playUrl.replace('playwm', 'play');
    if (!playUrl && playAddr.uri && !String(playAddr.uri).startsWith('http')) {
      playUrl = `https://www.iesdouyin.com/aweme/v1/play/?video_id=${playAddr.uri}&ratio=1080p&line=0`;
    }
    if (!playUrl) {
      throw new AppError('PARSE_FAILED', '未找到抖音播放地址', { platform: 'douyin' });
    }

    return {
      platform: 'douyin',
      sourceUrl: input.url.toString(),
      canonicalUrl: `https://www.douyin.com/video/${itemId}`,
      contentId: itemId,
      author: {
        name: item.author?.nickname,
        avatar: item.author?.avatar_thumb?.url_list?.[0],
      },
      content: { type: 'video', title, description: item.desc, cover },
      media: [
        {
          type: 'video',
          url: playUrl,
          quality: '高清直链',
          filename: `douyin_${itemId}.mp4`,
          direct: true,
        },
      ],
    };
  }
}
