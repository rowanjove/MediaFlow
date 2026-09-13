import type { Platform } from '../../schemas/result';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../base';
import { AppError } from '../../core/errors';

export class XiaohongshuProvider implements MediaProvider {
  readonly id = 'xiaohongshu-native';
  readonly name = '小红书原生解析器';
  readonly platforms: Platform[] = ['xiaohongshu'];

  supports(platform: Platform): boolean {
    return platform === 'xiaohongshu';
  }

  async parse(input: ProviderParseInput, context: ProviderContext): Promise<ProviderRawResult> {
    const urlStr = input.url.toString();

    const res = await fetch(urlStr, {
      signal: context.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        Referer: 'https://www.xiaohongshu.com/',
      },
    });

    if (!res.ok) {
      throw new AppError('UPSTREAM_BLOCKED', `小红书请求受阻: HTTP ${res.status}`, {
        platform: 'xiaohongshu',
      });
    }

    const html = await res.text();

    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?)\s*<\/script>/);

    if (!stateMatch) {
      const ogVideo =
        html.match(/property="og:video"[^>]*content="([^"]+)"/i)?.[1] ||
        html.match(/content="([^"]+)"[^>]*property="og:video"/i)?.[1];
      const ogImage =
        html.match(/property="og:image"[^>]*content="([^"]+)"/i)?.[1] ||
        html.match(/content="([^"]+)"[^>]*property="og:image"/i)?.[1];
      const ogTitle =
        html.match(/property="og:title"[^>]*content="([^"]+)"/i)?.[1] ||
        html.match(/<title>([^<]+)<\/title>/i)?.[1] ||
        '小红书笔记';

      if (ogVideo || ogImage) {
        return {
          platform: 'xiaohongshu',
          sourceUrl: urlStr,
          canonicalUrl: urlStr,
          contentId: input.contentId,
          content: {
            type: ogVideo ? 'video' : 'images',
            title: ogTitle,
            cover: ogImage,
          },
          media: ogVideo
            ? [{ type: 'video', url: ogVideo, filename: `xhs_${Date.now()}.mp4`, direct: true }]
            : [{ type: 'image', url: ogImage!, filename: `xhs_${Date.now()}.jpg`, direct: true }],
        };
      }

      throw new AppError('PARSE_FAILED', '无法从小红书页面提取结构化数据', {
        platform: 'xiaohongshu',
      });
    }

    let state: any;
    try {
      // 替换 undefined 为 null 避免 JSON.parse 出错，并剥离尾部分号
      const jsonStr = stateMatch[1]
        .trim()
        .replace(/;\s*$/, '')
        .replace(/:\s*undefined/g, ': null');
      state = JSON.parse(jsonStr);
    } catch {
      throw new AppError('PARSE_FAILED', '小红书页面状态数据 JSON 反序列化失败', {
        platform: 'xiaohongshu',
      });
    }

    const detailMap = state?.note?.noteDetailMap || {};
    const note =
      state?.noteData?.data?.noteData ||
      detailMap[state?.note?.firstNoteId]?.note ||
      state?.note?.note ||
      (Object.values(detailMap)[0] as any)?.note;

    if (!note) {
      throw new AppError('CONTENT_NOT_FOUND', '小红书笔记不存在或已被删除', {
        platform: 'xiaohongshu',
        isRetryable: false,
      });
    }

    const title = note.title || note.desc || '小红书笔记';
    const desc = note.desc;
    const author = {
      name: note.user?.nickname || note.user?.name,
      avatar: note.user?.avatar,
      url: note.user?.userId ? `https://www.xiaohongshu.com/user/profile/${note.user.userId}` : undefined,
    };

    const isVideo = note.type === 'video' || Boolean(note.video);

    if (isVideo) {
      const stream = note.video?.media?.stream;
      const videoUrl =
        stream?.h264?.[0]?.masterUrl ||
        stream?.h265?.[0]?.masterUrl ||
        note.video?.url;

      if (!videoUrl) {
        throw new AppError('PARSE_FAILED', '未能获取到小红书视频播放直链', {
          platform: 'xiaohongshu',
        });
      }

      return {
        platform: 'xiaohongshu',
        sourceUrl: urlStr,
        canonicalUrl: `https://www.xiaohongshu.com/explore/${note.noteId}`,
        contentId: note.noteId,
        author,
        content: {
          type: 'video',
          title,
          description: desc,
          cover: note.imageList?.[0]?.urlDefault || note.video?.cover,
          duration: note.video?.duration,
        },
        media: [
          {
            type: 'video',
            url: videoUrl,
            quality: '高清视频',
            filename: `xhs_${note.noteId}.mp4`,
            direct: true,
          },
        ],
      };
    }

    // 图文笔记处理
    const imageList: any[] = note.imageList || [];
    const media = imageList.map((img, idx) => {
      let rawUrl =
        img.urlDefault ||
        img.urlOriginal ||
        img.infoList?.find((x: any) => x.imageScene === 'H5_DTL')?.url ||
        img.url;
      if (rawUrl && rawUrl.includes('?')) {
        rawUrl = rawUrl.split('?')[0];
      }
      return {
        type: 'image' as const,
        url: rawUrl,
        previewUrl: img.urlDefault || img.url,
        filename: `xhs_${note.noteId}_${idx + 1}.jpg`,
        direct: true,
      };
    });

    return {
      platform: 'xiaohongshu',
      sourceUrl: urlStr,
      canonicalUrl: `https://www.xiaohongshu.com/explore/${note.noteId}`,
      contentId: note.noteId,
      author,
      content: {
        type: 'images',
        title,
        description: desc,
        cover: media[0]?.url,
      },
      media,
    };
  }
}