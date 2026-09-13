import type { Platform } from '../../../schemas/result';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../../base';
import { AppError } from '../../../core/errors';

export class DouyinPrimaryProvider implements MediaProvider {
  readonly id = 'douyin-native-primary';
  readonly name = '抖音原生主解析器';
  readonly platforms: Platform[] = ['douyin'];

  supports(platform: Platform): boolean {
    return platform === 'douyin';
  }

  async parse(input: ProviderParseInput, context: ProviderContext): Promise<ProviderRawResult> {
    let itemId = input.contentId;

    // 如果还没有提取出 ID，尝试从 pathname 再次提取
    if (!itemId) {
      const match = input.url.pathname.match(/(?:video|note)\/(\d+)/);
      itemId = match?.[1];
    }

    // 若仍无 ID（例如短链展开后的重定向页面）
    if (!itemId) {
      const res = await fetch(input.url.toString(), {
        signal: context.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
          Cookie: context.cookies?.douyin || '',
        },
      });
      const html = await res.text();
      const m = html.match(/(?:video|note)\/(\d+)/) || html.match(/"aweme_id":"(\d+)"/);
      itemId = m?.[1];
    }

    if (!itemId) {
      throw new AppError('PARSE_FAILED', '未能从抖音链接中识别作品 ID', { platform: 'douyin' });
    }

    // 请求公开移动端 API
    const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${itemId}`;
    const response = await fetch(apiUrl, {
      signal: context.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        Referer: 'https://www.douyin.com/',
        Cookie: context.cookies?.douyin || '',
      },
    });

    if (!response.ok) {
      throw new AppError('UPSTREAM_BLOCKED', `抖音接口响应异常: HTTP ${response.status}`, {
        platform: 'douyin',
      });
    }

    const data = (await response.json()) as any;
    const item = data?.item_list?.[0];

    if (!item) {
      throw new AppError('PARSE_FAILED', '抖音未返回内容或视频已删除/设为私密', {
        platform: 'douyin',
      });
    }

    const title = item.desc || '抖音作品';
    const authorName = item.author?.nickname || item.author?.unique_id;
    const authorAvatar = item.author?.avatar_thumb?.url_list?.[0];
    const cover = item.video?.cover?.url_list?.[0];
    const duration = item.duration ? Math.round(item.duration / 1000) : undefined;

    // 判断是图集还是视频
    const isImageAlbum = Array.isArray(item.images) && item.images.length > 0;

    if (isImageAlbum) {
      const media = item.images.map((img: any, idx: number) => {
        const directUrl = img.url_list?.[img.url_list.length - 1] || img.url_list?.[0];
        return {
          type: 'image' as const,
          url: directUrl,
          previewUrl: img.url_list?.[0],
          filename: `douyin_${itemId}_${idx + 1}.jpeg`,
          direct: true,
        };
      });

      // 如果有背景音乐，也加入媒体列表
      if (item.music?.play_url?.url_list?.[0]) {
        media.push({
          type: 'audio' as const,
          url: item.music.play_url.url_list[0],
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
          name: authorName,
          avatar: authorAvatar,
        },
        content: {
          type: 'images',
          title,
          description: item.desc,
          cover,
          createdAt: item.create_time ? new Date(item.create_time * 1000).toISOString() : undefined,
          duration,
        },
        media,
      };
    }

    // 视频处理：将 playwm 替换成 play 获得去水印直链
    let playUrl: string = item.video?.play_addr?.url_list?.[0] || '';
    if (playUrl.includes('playwm')) {
      playUrl = playUrl.replace('playwm', 'play');
    }

    return {
      platform: 'douyin',
      sourceUrl: input.url.toString(),
      canonicalUrl: `https://www.douyin.com/video/${itemId}`,
      contentId: itemId,
      author: {
        name: authorName,
        avatar: authorAvatar,
      },
      content: {
        type: 'video',
        title,
        description: item.desc,
        cover,
        createdAt: item.create_time ? new Date(item.create_time * 1000).toISOString() : undefined,
        duration,
      },
      media: [
        {
          type: 'video',
          url: playUrl,
          quality: '1080P/原画',
          filename: `douyin_${itemId}.mp4`,
          direct: true,
        },
      ],
    };
  }
}