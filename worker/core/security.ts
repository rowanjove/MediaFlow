import { AppError } from './errors';

export const ALLOWED_HOST_SUFFIXES: string[] = [
  'douyin.com',
  'iesdouyin.com',
  'douyinvod.com',
  'amemv.com',
  'tiktok.com',
  'tiktokv.com',
  'tiktokcdn.com',
  'xiaohongshu.com',
  'xhslink.com',
  'xhslink.cn',
  'xhs.link',
  'xhscdn.com',
  'kuaishou.com',
  'kuaishouapp.com',
  'kuaishoup.com',
  'kwai.com',
  'gifshow.com',
  'chenzhongtech.com',
  'bilibili.com',
  'b23.tv',
  'bili2233.cn',
  'bilivideo.com',
  'hdslb.com',
  'weibo.com',
  'weibo.cn',
  't.cn',
  'sinaimg.cn',
  'video.weibo.com',
  'weibocdn.com',
  'miaopai.com',
  'twitter.com',
  'x.com',
  't.co',
  'twimg.com',
  'instagram.com',
  'cdninstagram.com',
  'threads.net',
  'youtube.com',
  'youtu.be',
  'googlevideo.com',
  'ytimg.com',
  'pipix.com',
  'pipigx.com',
  'huoshan.com',
  'weishi.qq.com',
  'ws.qq.com',
  'ixigua.com',
  'izuiyou.com',
  'xiaochuankeji.com',
  'xiaochuankeji.cn',
  'pearvideo.com',
  'huya.com',
  'meipai.com',
  'doupai.cc',
  'kg.qq.com',
  '6.cn',
  'xinpianchang.com',
  'haokan.baidu.com',
  'haokan.hao123.com',
  'hao222.com',
  'acfun.cn',
  'quanmin.baidu.com',
  'xspshare.baidu.com',
  'ippzone.com',
];

export function isPrivateIp(ipOrHost: string): boolean {
  const host = ipOrHost.toLowerCase().trim().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::'
  ) {
    return true;
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;

  if (
    host.startsWith('fc') ||
    host.startsWith('fd') ||
    host.startsWith('fe80') ||
    host.includes('::ffff:127.') ||
    host.includes('::ffff:10.') ||
    host.includes('::ffff:192.168.')
  ) {
    return true;
  }

  return false;
}

export function isHostAllowed(hostname: string): boolean {
  const lowerHost = hostname.toLowerCase();
  if (isPrivateIp(lowerHost)) return false;
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => lowerHost === suffix || lowerHost.endsWith('.' + suffix)
  );
}

/** 严格校验 hostname 是否为目标 domain 或其子域名，防止 douyin.com.evil.com 绕过 */
export function isDomainMatch(hostname: string, targetDomain: string): boolean {
  const h = hostname.toLowerCase();
  const d = targetDomain.toLowerCase();
  return h === d || h.endsWith('.' + d);
}

export function assertSafeUpstream(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AppError('INVALID_URL', '上游地址无法解析');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('INVALID_URL', `不支持的上游协议: ${parsed.protocol}`);
  }
  if (isPrivateIp(parsed.hostname)) {
    throw new AppError('INVALID_URL', '禁止将上游指向内部网络');
  }
  return parsed;
}

const SHARE_URL_RE =
  /https?:\/\/[^\s\u4e00-\u9fa5<>"'（）()【】\[\]{}|\\^`，。！？、；：]+/gi;
const TRAILING_JUNK_RE = /[.,;:!?）】》>'"]+$/g;
const BARE_HOST_RE =
  /(?:^|[\s\u4e00-\u9fa5，。！])((?:v\.|www\.|m\.|h5\.|share\.)?(?:douyin\.com|iesdouyin\.com|amemv\.com|xiaohongshu\.com|xhslink\.com|xhslink\.cn|xhs\.link|kuaishou\.com|kuaishouapp\.com|bilibili\.com|b23\.tv|bili2233\.cn|weibo\.com|weibo\.cn|t\.cn|tiktok\.com|instagram\.com|youtube\.com|youtu\.be|twitter\.com|x\.com|pipix\.com|pipigx\.com|huoshan\.com|weishi\.qq\.com|ixigua\.com|izuiyou\.com|pearvideo\.com|huya\.com|meipai\.com|doupai\.cc|kg\.qq\.com|6\.cn|xinpianchang\.com|acfun\.cn|haokan\.baidu\.com)\/[^\s\u4e00-\u9fa5<>"'，。！？]+)/i;

function cleanCandidate(raw: string): string {
  return raw.replace(TRAILING_JUNK_RE, '').replace(/[，。！？、；：]+$/g, '');
}

/** 从分享口令、口播文案里抽出第一条可用媒体链接 */
export function extractShareUrl(rawInput: string): string {
  const text = rawInput.trim();
  if (!text) return text;

  const matches = text.match(SHARE_URL_RE) || [];
  const cleaned = matches.map(cleanCandidate).filter(Boolean);

  for (const candidate of cleaned) {
    try {
      const parsed = new URL(candidate);
      if (isHostAllowed(parsed.hostname)) return candidate;
    } catch {
      /* try next */
    }
  }
  if (cleaned[0]) return cleaned[0];

  const bare = text.match(BARE_HOST_RE);
  if (bare?.[1]) {
    return `https://${cleanCandidate(bare[1])}`;
  }

  return text;
}

export function validateAndSanitizeUrl(rawInput: string): URL {
  if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
    throw new AppError('INVALID_URL', 'URL 输入不能为空');
  }

  const target = extractShareUrl(rawInput);

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    throw new AppError('INVALID_URL', '无法解析该链接，请确认链接格式正确');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('INVALID_URL', `不支持的协议: ${parsed.protocol}`);
  }

  if (isPrivateIp(parsed.hostname)) {
    throw new AppError('INVALID_URL', '禁止访问内部网络或本地地址');
  }

  if (!isHostAllowed(parsed.hostname)) {
    throw new AppError(
      'UNSUPPORTED_PLATFORM',
      `不支持的平台域名: ${parsed.hostname}。目前支持抖音、快手、小红书、B站、微博、汽水音乐、皮皮虾、西瓜、虎牙、AcFun、TikTok、Instagram、X、YouTube 等。`
    );
  }

  return parsed;
}
