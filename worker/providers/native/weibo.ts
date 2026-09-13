import type { Platform } from '../../schemas/result';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../base';
import { AppError } from '../../core/errors';

const UA_MOBILE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const UA_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

let visitorCookieCache = '';
let visitorCookieExpireAt = 0;
const VISITOR_TTL_MS = 25 * 60 * 1000;

function extractWeiboId(input: ProviderParseInput): string | undefined {
  const raw = input.url.toString();
  if (raw.includes('show?fid=')) return raw.match(/fid=([^&]+)/)?.[1];
  if (raw.includes('tv/show/')) return raw.match(/tv\/show\/([^?&/]+)/)?.[1];
  const colon = raw.match(/\d+:\d+/);
  if (colon) return colon[0];
  return (
    input.contentId ||
    raw.match(/(?:detail|status)\/([a-zA-Z0-9]+)/)?.[1] ||
    raw.match(/(\d{15,})/)?.[1]
  );
}

async function getVisitorCookie(signal: AbortSignal): Promise<string> {
  if (visitorCookieCache && Date.now() < visitorCookieExpireAt) return visitorCookieCache;
  const fpBody =
    'cb=gen_callback&fp={"os":"1","browser":"Safari16","fonts":"undefined","screen":"*","plugins":""}';
  const res1 = await fetch('https://visitor.passport.weibo.cn/visitor/genvisitor', {
    method: 'POST',
    headers: {
      'User-Agent': UA_MOBILE,
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://m.weibo.cn/',
    },
    body: fpBody,
    signal,
  });
  const tid = (await res1.text()).match(/"tid":"([^"]+)"/)?.[1];
  if (!tid) return '';
  const res2 = await fetch(
    `https://visitor.passport.weibo.cn/visitor/visitor?a=incarnate&t=${encodeURIComponent(tid)}&w=2&c=100&gc=&cb=cross_domain&from=weibo&_rand=${Math.random()}`,
    { headers: { 'User-Agent': UA_MOBILE, Referer: 'https://m.weibo.cn/' }, signal }
  );
  const text2 = await res2.text();
  const sub = text2.match(/"sub":"([^"]+)"/)?.[1];
  const subp = text2.match(/"subp":"([^"]+)"/)?.[1];
  if (!sub) return '';
  visitorCookieCache = `SUB=${sub}${subp ? `; SUBP=${subp}` : ''}`;
  visitorCookieExpireAt = Date.now() + VISITOR_TTL_MS;
  return visitorCookieCache;
}

async function fetchJson(url: string, init: RequestInit): Promise<any | null> {
  try {
    const res = await fetch(url, { ...init, redirect: 'follow' });
    const text = await res.text();
    if (text.trim().startsWith('<')) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function abs(u?: string): string {
  if (!u) return '';
  return u.startsWith('//') ? `https:${u}` : u;
}

export class WeiboProvider implements MediaProvider {
  readonly id = 'weibo-native';
  readonly name = '微博原生解析器';
  readonly platforms: Platform[] = ['weibo'];

  supports(platform: Platform): boolean {
    return platform === 'weibo';
  }

  async parse(input: ProviderParseInput, context: ProviderContext): Promise<ProviderRawResult> {
    const id = extractWeiboId(input);
    if (!id) throw new AppError('PARSE_FAILED', '未识别到微博 ID', { platform: 'weibo' });

    const cookie = context.cookies?.weibo || (await getVisitorCookie(context.signal));
    const jsonHeaders = {
      'User-Agent': UA_MOBILE,
      Cookie: cookie,
      Referer: 'https://m.weibo.cn/',
      'X-Requested-With': 'XMLHttpRequest',
      'MWeibo-Pwa': '1',
      Accept: 'application/json, text/plain, */*',
    };

    if (id.includes(':') || input.url.hostname.includes('video.weibo.com') || input.url.pathname.includes('/tv/show/')) {
      const cJson = await fetchJson(
        `https://weibo.com/tv/api/component?page=/tv/show/${encodeURIComponent(id)}`,
        {
          method: 'POST',
          signal: context.signal,
          headers: {
            Cookie: cookie,
            Referer: `https://weibo.com/tv/show/${id}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': UA_DESKTOP,
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: `data=${encodeURIComponent(`{"Component_Play_Playinfo":{"oid":"${id}"}}`)}`,
        }
      );
      const play = cJson?.data?.Component_Play_Playinfo;
      const urls = play?.urls ? Object.values(play.urls).filter(Boolean) : [];
      if (urls[0]) {
        return {
          platform: 'weibo',
          sourceUrl: input.url.toString(),
          contentId: id,
          author: { name: play.author || play.nickname, avatar: abs(play.avatar) },
          content: { type: 'video', title: play.title, cover: abs(play.cover_image) },
          media: [{ type: 'video', url: abs(String(urls[0])), filename: `weibo_${id}.mp4`, direct: true }],
        };
      }
    }

    const mid = id.includes(':') ? id.split(':')[1] : id;
    const data = await fetchJson(`https://m.weibo.cn/statuses/show?id=${encodeURIComponent(mid)}`, {
      signal: context.signal,
      headers: jsonHeaders,
    });
    const status = data?.data?.mblog || data?.data;
    if (!status) {
      throw new AppError(
        cookie && !context.cookies?.weibo ? 'PARSE_FAILED' : 'COOKIE_REQUIRED',
        '未查找到该微博内容或需要 WEIBO_COOKIE',
        { platform: 'weibo' }
      );
    }

    const cleanText = String(status.text || '').replace(/<[^>]+>/g, '').trim() || '微博分享';
    const author = {
      name: status.user?.screen_name,
      avatar: status.user?.avatar_large || status.user?.profile_image_url,
      url: status.user?.id ? `https://weibo.com/u/${status.user.id}` : undefined,
    };
    const pageInfo = status.page_info || {};
    const media = pageInfo.media_info || {};
    const streamUrl =
      pageInfo.media_url ||
      media.stream_url_hd ||
      media.stream_url ||
      media.mp4_hd_url ||
      media.mp4_sd_url;
    if (streamUrl) {
      return {
        platform: 'weibo',
        sourceUrl: input.url.toString(),
        canonicalUrl: `https://weibo.com/detail/${mid}`,
        contentId: mid,
        author,
        content: { type: 'video', title: cleanText, cover: abs(pageInfo.page_pic?.url) },
        media: [{ type: 'video', url: abs(streamUrl), filename: `weibo_${mid}.mp4`, direct: true }],
      };
    }

    const pics: any[] = status.pics || [];
    if (pics.length > 0) {
      const list = pics.map((pic, idx) => ({
        type: 'image' as const,
        url: pic.large?.url || pic.url,
        previewUrl: pic.url,
        filename: `weibo_${mid}_${idx + 1}.jpg`,
        direct: true,
      }));
      return {
        platform: 'weibo',
        sourceUrl: input.url.toString(),
        canonicalUrl: `https://weibo.com/detail/${mid}`,
        contentId: mid,
        author,
        content: { type: 'images', title: cleanText, cover: list[0]?.url },
        media: list,
      };
    }

    throw new AppError('PARSE_FAILED', '该微博未包含可提取的公开多媒体内容', { platform: 'weibo' });
  }
}
