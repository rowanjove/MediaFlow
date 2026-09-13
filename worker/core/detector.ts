import type { Platform } from '../schemas/result';
import { AppError } from './errors';
import { isDomainMatch, isHostAllowed, validateAndSanitizeUrl } from './security';

export interface DetectionResult {
  platform: Platform;
  url: URL;
  contentId?: string;
  isShortUrl: boolean;
}

export function isShortLink(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === 'v.douyin.com' ||
    h === 'xhslink.com' ||
    h === 'xhslink.cn' ||
    h === 'xhs.link' ||
    h === 'b23.tv' ||
    h === 'bili2233.cn' ||
    h === 't.cn' ||
    h === 'vm.tiktok.com' ||
    h === 'vt.tiktok.com' ||
    h === 't.co' ||
    h === 'youtu.be' ||
    h === 'v.kuaishou.com' ||
    h === 'v.kuaishouapp.com' ||
    h === 'v.kuaishoup.com' ||
    h === 'v.ixigua.com' ||
    h === 'share.huoshan.com' ||
    h === 'v.huya.com' ||
    h === 'xspshare.baidu.com' ||
    h === 'qishui.douyin.com' ||
    h === 'ws.qq.com'
  );
}

export function identifyPlatform(url: URL): { platform: Platform; contentId?: string } {
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const q = url.searchParams;

  if (isDomainMatch(host, 'qishui.douyin.com') || isDomainMatch(host, 'music.douyin.com')) {
    return {
      platform: 'qsmusic',
      contentId: q.get('track_id') || q.get('ugc_video_id') || undefined,
    };
  }

  if (isDomainMatch(host, 'pipix.com')) {
    const m = path.match(/item\/([^/?]+)/);
    return { platform: 'pipixia', contentId: m?.[1] };
  }

  if (isDomainMatch(host, 'pipigx.com')) {
    return { platform: 'pipigx', contentId: q.get('pid') || undefined };
  }

  if (isDomainMatch(host, 'huoshan.com')) {
    return { platform: 'huoshan', contentId: q.get('item_id') || undefined };
  }

  if (isDomainMatch(host, 'weishi.qq.com') || isDomainMatch(host, 'ws.qq.com')) {
    const feedMatch = path.match(/(?:feed|item|play)\/([a-zA-Z0-9_-]+)/);
    return { platform: 'weishi', contentId: q.get('id') || q.get('feedid') || feedMatch?.[1] || undefined };
  }

  if (isDomainMatch(host, 'ixigua.com')) {
    const m = path.match(/\/(\d+)/);
    return { platform: 'xigua', contentId: m?.[1] };
  }

  if (
    isDomainMatch(host, 'izuiyou.com') ||
    isDomainMatch(host, 'xiaochuankeji.com') ||
    isDomainMatch(host, 'xiaochuankeji.cn')
  ) {
    return { platform: 'zuiyou', contentId: q.get('pid') || undefined };
  }

  if (isDomainMatch(host, 'pearvideo.com')) {
    const m = path.match(/detail_(\d+)/);
    return { platform: 'lishipin', contentId: m?.[1] };
  }

  if (isDomainMatch(host, 'huya.com')) {
    const m = path.match(/\/(\d+)\.html/);
    return { platform: 'huya', contentId: m?.[1] };
  }

  if (isDomainMatch(host, 'acfun.cn')) {
    const m = path.match(/\/ac(\d+)/i);
    return { platform: 'acfun', contentId: m?.[1] };
  }

  if (isDomainMatch(host, 'meipai.com')) {
    const m = path.match(/\/media\/(\d+)/);
    return { platform: 'meipai', contentId: m?.[1] };
  }

  if (isDomainMatch(host, 'doupai.cc')) {
    return {
      platform: 'doupai',
      contentId: q.get('id') || path.match(/\/topic\/([A-Za-z0-9_-]+)/)?.[1],
    };
  }

  if (isDomainMatch(host, 'kg.qq.com')) {
    return { platform: 'quanminkge', contentId: q.get('s') || undefined };
  }

  if (isDomainMatch(host, '6.cn')) {
    return {
      platform: 'sixroom',
      contentId: q.get('vid') || path.replace(/^\/v\//, '').replace(/\/$/, '') || undefined,
    };
  }

  if (isDomainMatch(host, 'xinpianchang.com')) {
    const m = path.match(/\/a(\d+)/);
    return { platform: 'xinpianchang', contentId: m?.[1] };
  }

  if (isDomainMatch(host, 'haokan.baidu.com') || isDomainMatch(host, 'haokan.hao123.com')) {
    return { platform: 'haokan', contentId: q.get('vid') || undefined };
  }

  if (
    isDomainMatch(host, 'quanmin.baidu.com') ||
    isDomainMatch(host, 'xspshare.baidu.com') ||
    isDomainMatch(host, 'hao222.com')
  ) {
    return { platform: 'quanmin', contentId: q.get('vid') || undefined };
  }

  if (
    path.includes('/oasis') ||
    host.includes('oasis') ||
    (isDomainMatch(host, 'weibo.cn') && (path.includes('oasis') || host.includes('oasis')))
  ) {
    return { platform: 'lvzhou' };
  }

  if (
    isDomainMatch(host, 'douyin.com') ||
    isDomainMatch(host, 'iesdouyin.com') ||
    isDomainMatch(host, 'amemv.com')
  ) {
    const videoMatch = path.match(/video\/(\d+)/);
    const noteMatch = path.match(/note\/(\d+)/);
    return { platform: 'douyin', contentId: videoMatch?.[1] || noteMatch?.[1] };
  }

  if (isDomainMatch(host, 'tiktok.com') || isDomainMatch(host, 'tiktokv.com')) {
    const match = path.match(/video\/(\d+)/) || path.match(/photo\/(\d+)/);
    return { platform: 'tiktok', contentId: match?.[1] };
  }

  if (
    isDomainMatch(host, 'xiaohongshu.com') ||
    isDomainMatch(host, 'xhslink.com') ||
    isDomainMatch(host, 'xhslink.cn') ||
    isDomainMatch(host, 'xhs.link')
  ) {
    const match =
      path.match(/explore\/([a-zA-Z0-9]+)/) ||
      path.match(/discovery\/item\/([a-zA-Z0-9]+)/) ||
      path.match(/item\/([a-zA-Z0-9]+)/);
    return { platform: 'xiaohongshu', contentId: match?.[1] };
  }

  if (
    isDomainMatch(host, 'kuaishou.com') ||
    isDomainMatch(host, 'kuaishouapp.com') ||
    isDomainMatch(host, 'kuaishoup.com') ||
    isDomainMatch(host, 'kwai.com') ||
    isDomainMatch(host, 'gifshow.com')
  ) {
    const match =
      path.match(/short-video\/([a-zA-Z0-9_-]+)/) ||
      path.match(/photo\/([a-zA-Z0-9_-]+)/) ||
      path.match(/f\/([a-zA-Z0-9_-]+)/);
    return { platform: 'kuaishou', contentId: match?.[1] };
  }

  if (
    isDomainMatch(host, 'bilibili.com') ||
    isDomainMatch(host, 'b23.tv') ||
    isDomainMatch(host, 'bili2233.cn')
  ) {
    const bvMatch = path.match(/(BV[a-zA-Z0-9]{10})/i);
    const avMatch = path.match(/av(\d+)/i);
    return {
      platform: 'bilibili',
      contentId: bvMatch?.[1] || (avMatch ? `av${avMatch[1]}` : undefined),
    };
  }

  if (
    isDomainMatch(host, 'weibo.com') ||
    isDomainMatch(host, 'weibo.cn') ||
    isDomainMatch(host, 't.cn')
  ) {
    const match =
      path.match(/detail\/(\d+)/) ||
      path.match(/status\/([a-zA-Z0-9]+)/) ||
      path.match(/\/(\d{10,})$/);
    return {
      platform: 'weibo',
      contentId: url.searchParams.get('fid')?.split(':').pop() || match?.[1],
    };
  }

  if (isDomainMatch(host, 'twitter.com') || isDomainMatch(host, 'x.com')) {
    const match = path.match(/status\/(\d+)/);
    return { platform: 'twitter', contentId: match?.[1] };
  }

  if (isDomainMatch(host, 'instagram.com')) {
    const match = path.match(/(?:p|reel|tv)\/([a-zA-Z0-9_-]+)/);
    return { platform: 'instagram', contentId: match?.[1] };
  }

  if (isDomainMatch(host, 'youtube.com') || isDomainMatch(host, 'youtu.be')) {
    let id: string | undefined;
    if (isDomainMatch(host, 'youtu.be')) {
      id = path.replace(/^\//, '').split('/')[0] || undefined;
    } else {
      id = url.searchParams.get('v') || path.match(/shorts\/([a-zA-Z0-9_-]+)/)?.[1] || undefined;
    }
    return { platform: 'youtube', contentId: id };
  }

  return { platform: 'unknown' };
}

export async function expandShortUrl(
  initialUrl: URL,
  maxRedirects: number = 4
): Promise<URL> {
  let currentUrl = initialUrl;
  let redirectsCount = 0;

  while (redirectsCount < maxRedirects) {
    if (!isShortLink(currentUrl.hostname)) {
      break;
    }

    try {
      const headers = {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      };

      let location: string | null = null;
      const headRes = await fetch(currentUrl.toString(), {
        method: 'HEAD',
        redirect: 'manual',
        headers,
      });
      location = headRes.headers.get('location');

      if (!location) {
        const getRes = await fetch(currentUrl.toString(), {
          method: 'GET',
          redirect: 'manual',
          headers,
        });
        location = getRes.headers.get('location');
      }

      if (!location) {
        try {
          const followRes = await fetch(currentUrl.toString(), {
            method: 'GET',
            redirect: 'follow',
            headers,
          });
          if (followRes.url && followRes.url !== currentUrl.toString()) {
            const landing = new URL(followRes.url);
            if (isHostAllowed(landing.hostname)) {
              currentUrl = landing;
              break;
            }
          }
        } catch {
          /* continue */
        }
        break;
      }

      const nextUrl = new URL(location, currentUrl);
      if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
        throw new AppError('INVALID_URL', '短链重定向到了非法协议');
      }
      if (!isHostAllowed(nextUrl.hostname)) {
        throw new AppError('INVALID_URL', '短链重定向到了不受信任的域名');
      }
      currentUrl = nextUrl;
      redirectsCount++;
    } catch (err) {
      if (err instanceof AppError) throw err;
      break;
    }
  }

  return currentUrl;
}

export async function detectPlatform(rawInput: string): Promise<DetectionResult> {
  const initialUrl = validateAndSanitizeUrl(rawInput);
  const isShort = isShortLink(initialUrl.hostname);

  const expandedUrl = isShort ? await expandShortUrl(initialUrl) : initialUrl;
  const { platform, contentId } = identifyPlatform(expandedUrl);

  if (platform === 'unknown') {
    throw new AppError(
      'UNSUPPORTED_PLATFORM',
      `暂未支持该链接的平台解析 (${expandedUrl.hostname})`
    );
  }

  return {
    platform,
    url: expandedUrl,
    contentId,
    isShortUrl: isShort,
  };
}
