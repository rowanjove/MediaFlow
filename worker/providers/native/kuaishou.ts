import type { Platform } from '../../schemas/result';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../base';
import { AppError } from '../../core/errors';

export class KuaishouProvider implements MediaProvider {
  readonly id = 'kuaishou-native';
  readonly name = '快手原生解析器';
  readonly platforms: Platform[] = ['kuaishou'];

  supports(platform: Platform): boolean {
    return platform === 'kuaishou';
  }

  async parse(input: ProviderParseInput, context: ProviderContext): Promise<ProviderRawResult> {
    const urlStr = input.url.toString();

    const res = await fetch(urlStr, {
      signal: context.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        Referer: 'https://v.kuaishou.com/',
      },
    });

    if (!res.ok) {
      throw new AppError('UPSTREAM_BLOCKED', `快手响应异常: HTTP ${res.status}`, {
        platform: 'kuaishou',
      });
    }

    const html = await res.text();

    // 匹配页面中的视频/图集 JSON 数据
    const stateMatch =
      html.match(/window\.INIT_STATE\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i) ||
      html.match(/window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/i);

    let photo: any;
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]);
        photo =
          state?.photo ||
          Object.values(state).find(
            (v: any) => v?.photoUrl || v?.mainMvUrls || v?.images || v?.imageUrls
          );
      } catch {}
    }

    // 检查是否包含快手图集 (photo / images)
    const rawImages: any[] =
      (Array.isArray(photo?.images) ? photo.images : null) ||
      (Array.isArray(photo?.imageUrls) ? photo.imageUrls : null) ||
      (Array.isArray(photo?.ext_params?.atlas?.list) ? photo.ext_params.atlas.list : null) ||
      [];

    // 若未通过 INIT_STATE 解析成功，尝试正则提取视频地址与封面
    let playUrl = photo?.photoUrl || photo?.mainMvUrls?.[0]?.url;
    if (!playUrl) {
      const videoMatch = html.match(/"srcNoMark":\s*"([^"]+)"/) || html.match(/"url":\s*"([^"]+\.mp4[^"]*)"/);
      playUrl = videoMatch?.[1];
    }

    const captionMatch = html.match(/"caption":\s*"([^"]*)"/);
    const title = photo?.caption || captionMatch?.[1] || '快手作品';
    const authorMatch = html.match(/"userName":\s*"([^"]*)"/);
    const avatarMatch = html.match(/"headUrl":\s*"([^"]*)"/);
    const coverMatch = html.match(/"coverUrl":\s*"([^"]*)"/);
    const cover = photo?.coverUrl || coverMatch?.[1];
    const photoId = photo?.photoId || String(Date.now());

    // 处理图集
    if (!playUrl && rawImages.length > 0) {
      const media = rawImages.map((img: any, idx: number) => {
        let u = typeof img === 'string' ? img : img?.url || img?.path || img?.cdnList?.[0]?.url;
        if (u) {
          u = u.replace(/\\u002F/g, '/').replace(/\\/g, '');
        }
        return {
          type: 'image' as const,
          url: u,
          previewUrl: u,
          filename: `kuaishou_${photoId}_${idx + 1}.jpg`,
          direct: true,
        };
      }).filter((m: any) => Boolean(m.url));

      if (media.length > 0) {
        return {
          platform: 'kuaishou',
          sourceUrl: urlStr,
          canonicalUrl: urlStr,
          contentId: photoId,
          author: {
            name: photo?.userName || authorMatch?.[1],
            avatar: photo?.headUrl || avatarMatch?.[1],
          },
          content: {
            type: 'images',
            title,
            cover: cover || media[0]?.url,
          },
          media,
        };
      }
    }

    if (!playUrl) {
      throw new AppError('PARSE_FAILED', '未能在快手页面中定位到视频或图集地址', {
        platform: 'kuaishou',
      });
    }

    // 解码可能存在的 unicode 或反斜杠
    playUrl = playUrl.replace(/\\u002F/g, '/').replace(/\\/g, '');

    return {
      platform: 'kuaishou',
      sourceUrl: urlStr,
      canonicalUrl: urlStr,
      contentId: photo?.photoId,
      author: {
        name: photo?.userName || authorMatch?.[1],
        avatar: photo?.headUrl || avatarMatch?.[1],
      },
      content: {
        type: 'video',
        title,
        cover,
      },
      media: [
        {
          type: 'video',
          url: playUrl,
          quality: '无水印高清',
          filename: `kuaishou_${Date.now()}.mp4`,
          direct: true,
        },
      ],
    };
  }
}