import type { Platform, MediaResource } from '../../schemas/result';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../base';
import { AppError } from '../../core/errors';
import { isDomainMatch } from '../../core/security';

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function inferPlatformFromUrl(u: string): Platform {
  try {
    const host = new URL(u).hostname.toLowerCase();
    if (isDomainMatch(host, 'acfun.cn')) return 'acfun';
    if (isDomainMatch(host, 'haokan.baidu.com') || isDomainMatch(host, 'haokan.hao123.com')) return 'haokan';
    if (isDomainMatch(host, 'huoshan.com')) return 'huoshan';
    if (isDomainMatch(host, 'weishi.qq.com') || isDomainMatch(host, 'ws.qq.com')) return 'weishi';
    if (isDomainMatch(host, 'ixigua.com')) return 'xigua';
    if (isDomainMatch(host, 'pipix.com')) return 'pipixia';
    if (isDomainMatch(host, 'pipigx.com')) return 'pipigx';
    if (isDomainMatch(host, 'qishui.douyin.com') || isDomainMatch(host, 'music.douyin.com')) return 'qsmusic';
    if (isDomainMatch(host, 'izuiyou.com') || isDomainMatch(host, 'xiaochuankeji.com') || isDomainMatch(host, 'xiaochuankeji.cn')) return 'zuiyou';
    if (isDomainMatch(host, 'pearvideo.com')) return 'lishipin';
    if (isDomainMatch(host, 'huya.com')) return 'huya';
    if (isDomainMatch(host, 'quanmin.baidu.com') || isDomainMatch(host, 'xspshare.baidu.com') || isDomainMatch(host, 'hao222.com')) return 'quanmin';
    if (isDomainMatch(host, 'kg.qq.com')) return 'quanminkge';
    if (isDomainMatch(host, '6.cn')) return 'sixroom';
    if (isDomainMatch(host, 'doupai.cc')) return 'doupai';
    if (isDomainMatch(host, 'xinpianchang.com')) return 'xinpianchang';
    if (u.includes('oasis') || (isDomainMatch(host, 'weibo.cn') && u.includes('oasis'))) return 'lvzhou';
    if (isDomainMatch(host, 'meipai.com')) return 'meipai';
  } catch {}
  return 'unknown';
}

function fail(platform: Platform, message: string, isBlocked: boolean = false): never {
  throw new AppError(isBlocked ? 'UPSTREAM_BLOCKED' : 'PARSE_FAILED', message, { platform });
}

function result(
  platform: Platform,
  input: ProviderParseInput,
  data: {
    title?: string;
    author?: string;
    avatar?: string;
    cover?: string;
    url?: string;
    audio?: boolean;
    mediaList?: MediaResource[];
  }
): ProviderRawResult {
  const media: MediaResource[] = data.mediaList?.length
    ? data.mediaList
    : data.url
    ? [
        {
          type: data.audio ? 'audio' : 'video',
          url: data.url,
          filename: `${platform}_${input.contentId || Date.now()}.${data.audio ? 'm4a' : 'mp4'}`,
          direct: true,
        },
      ]
    : [];

  return {
    platform,
    sourceUrl: input.url.toString(),
    contentId: input.contentId,
    author: data.author || data.avatar ? { name: data.author, avatar: data.avatar } : undefined,
    content: {
      type: data.audio ? 'audio' : 'video',
      title: data.title,
      cover: data.cover,
    },
    media,
  };
}

async function fetchText(
  url: string,
  ctx: ProviderContext,
  headers: Record<string, string> = {},
  explicitPlatform?: Platform
): Promise<string> {
  const res = await fetch(url, {
    signal: ctx.signal,
    headers: { 'User-Agent': MOBILE_UA, ...headers },
  });
  if (!res.ok) {
    const plat = explicitPlatform || inferPlatformFromUrl(url);
    const isBlocked = res.status === 403 || res.status === 429;
    fail(plat, `上游 HTTP ${res.status}`, isBlocked);
  }
  return res.text();
}

async function fetchJson(
  url: string,
  ctx: ProviderContext,
  init: RequestInit = {},
  explicitPlatform?: Platform
): Promise<any> {
  const res = await fetch(url, {
    signal: ctx.signal,
    ...init,
    headers: { 'User-Agent': MOBILE_UA, ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const plat = explicitPlatform || inferPlatformFromUrl(url);
    const isBlocked = res.status === 403 || res.status === 429;
    fail(plat, `上游 HTTP ${res.status}`, isBlocked);
  }
  return res.json();
}

async function follow(url: string, ctx: ProviderContext): Promise<string> {
  const res = await fetch(url, { signal: ctx.signal, redirect: 'follow', headers: { 'User-Agent': MOBILE_UA } });
  return res.url || url;
}

class FnProvider implements MediaProvider {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly platforms: Platform[],
    private readonly run: (input: ProviderParseInput, ctx: ProviderContext) => Promise<ProviderRawResult>
  ) {}
  supports(platform: Platform): boolean {
    return this.platforms.includes(platform);
  }
  parse(input: ProviderParseInput, context: ProviderContext): Promise<ProviderRawResult> {
    return this.run(input, context);
  }
}

async function parseAcfun(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const html = await fetchText(input.url.toString(), ctx, { 'User-Agent': DESKTOP_UA });
  let title = '';
  let cover = '';
  let mediaList: MediaResource[] = [];

  const ksRaw = html.match(/"ksPlayJson":"((?:\\.|[^"\\])*)"/);
  if (ksRaw?.[1]) {
    try {
      const play = JSON.parse(JSON.parse(`"${ksRaw[1]}"`));
      const reps: any[] = play.adaptationSet?.[0]?.representation || [];
      if (reps.length > 0) {
        mediaList = reps
          .filter((r: any) => Boolean(r.url))
          .map((r: any, idx: number) => ({
            type: 'video' as const,
            url: r.url,
            quality: r.qualityLabel || `${r.height || ''}P`,
            bitrate: r.bitrate,
            width: r.width,
            height: r.height,
            filename: `acfun_${input.contentId || Date.now()}_${idx + 1}.mp4`,
            direct: true,
          }));
      }
    } catch { /* ignore */ }
  }

  const vi = html.match(/window\.videoInfo\s*=\s*(\{[\s\S]*?\});/);
  if (vi?.[1]) {
    try {
      const o = JSON.parse(vi[1]);
      title = o.title || title;
      cover = o.coverUrl || o.cover || cover;
      if (mediaList.length === 0) {
        const ks = o.currentVideoInfo?.ksPlayJson;
        const play = typeof ks === 'string' ? JSON.parse(ks) : ks;
        const reps: any[] = play?.adaptationSet?.[0]?.representation || [];
        if (reps.length > 0) {
          mediaList = reps
            .filter((r: any) => Boolean(r.url))
            .map((r: any, idx: number) => ({
              type: 'video' as const,
              url: r.url,
              quality: r.qualityLabel || `${r.height || ''}P`,
              bitrate: r.bitrate,
              width: r.width,
              height: r.height,
              filename: `acfun_${input.contentId || Date.now()}_${idx + 1}.mp4`,
              direct: true,
            }));
        }
      }
    } catch { /* ignore */ }
  }

  if (mediaList.length === 0) {
    const pi = html.match(/var playInfo\s*=\s*(.*?);/s);
    if (pi?.[1]) {
      try {
        const playUrls = JSON.parse(pi[1].trim()).streams?.[0]?.playUrls || [];
        if (playUrls[0]) {
          mediaList = [
            {
              type: 'video',
              url: playUrls[0],
              filename: `acfun_${input.contentId || Date.now()}.mp4`,
              direct: true,
            },
          ];
        }
      } catch { /* ignore */ }
    }
  }

  if (mediaList.length === 0) fail('acfun', '未找到 AcFun 播放地址');
  return result('acfun', input, { title, cover, mediaList });
}

async function parseHaokan(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const vid = input.contentId || input.url.searchParams.get('vid');
  if (!vid) fail('haokan', '无法解析 vid');
  const json = await fetchJson(`https://haokan.baidu.com/v?_format=json&vid=${vid}`, ctx);
  const data = json.data?.apiData?.curVideoMeta;
  const clarity = Array.isArray(data?.clarityUrl)
    ? [...data.clarityUrl].sort((a: any, b: any) => Number(b.videoSize || 0) - Number(a.videoSize || 0))
    : [];
  const play = clarity.find((x: any) => String(x.url || '').startsWith('http'))?.url || data?.playurl;
  if (!play) fail('haokan', '未找到播放地址');
  return result('haokan', input, {
    title: data?.title,
    author: data?.mth?.author_name,
    avatar: data?.mth?.author_photo,
    cover: data?.poster,
    url: play,
  });
}

async function parseHuoshan(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const followed = await follow(input.url.toString(), ctx);
  const itemId = new URL(followed).searchParams.get('item_id') || input.contentId;
  if (!itemId) fail('huoshan', '无法解析 item_id');
  const json = await fetchJson(`https://share.huoshan.com/api/item/info?item_id=${itemId}`, ctx);
  const data = json?.data?.item_info;
  if (!data?.url) fail('huoshan', '火山解析失败');
  return result('huoshan', input, { cover: data.cover, url: data.url });
}

async function parseWeishi(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const id = input.contentId || input.url.searchParams.get('id');
  if (!id) fail('weishi', '无法解析微视 id');
  const json = await fetchJson(
    `https://h5.weishi.qq.com/webapp/json/weishi/WSH5GetPlayPage?feedid=${id}`,
    ctx
  );
  const data = json.data?.feeds?.[0];
  if (!data?.video_url) fail('weishi', '未找到微视视频');
  return result('weishi', input, {
    title: data.feed_desc_withat,
    author: data.poster?.nick,
    avatar: data.poster?.avatar,
    cover: data.images?.[0]?.url,
    url: data.video_url,
  });
}

async function parseXigua(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  let videoId = input.contentId;
  if (!videoId) {
    const followed = await follow(input.url.toString(), ctx);
    const path = new URL(followed).pathname.replace(/^\/+|\/+$/g, '');
    videoId = path.replace(/^video\//, '');
  }
  if (!videoId) fail('xigua', '无法解析西瓜视频 id');
  const html = await fetchText(
    `https://m.ixigua.com/douyin/share/video/${videoId}?aweme_type=107&schema_type=1`,
    ctx,
    { 'User-Agent': DESKTOP_UA }
  );
  const m = html.match(/window\._ROUTER_DATA\s*=\s*(.*?)<\/script>/is);
  if (!m?.[1]) fail('xigua', '西瓜页面解析失败');
  const json = JSON.parse(m[1].trim());
  const videoData = json?.loaderData?.['video_(id)/page']?.videoInfoRes?.item_list?.[0];
  const play = videoData?.video?.play_addr?.url_list?.[0];
  if (!play) fail('xigua', '未找到播放地址');
  return result('xigua', input, {
    title: videoData.desc,
    author: videoData.author?.nickname,
    avatar: videoData.author?.avatar_thumb?.url_list?.[0],
    cover: videoData.video?.cover?.url_list?.[0],
    url: play,
  });
}

async function parsePipixia(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const followed = await follow(input.url.toString(), ctx);
  const id = followed.match(/item\/([^?&]+)/)?.[1] || input.contentId;
  if (!id) fail('pipixia', '无法提取皮皮虾 ID');
  const json = await fetchJson(
    `https://h5.pipix.com/bds/cell/cell_h5_comment/?count=5&aid=1319&app_name=super&cell_id=${id}`,
    ctx
  );
  const item =
    json?.data?.cell_comments?.[1]?.comment_info?.item ||
    json?.data?.cell_comments?.[0]?.comment_info?.item;
  const url = item?.video?.video_high?.url_list?.[0]?.url;
  if (!url) fail('pipixia', '未找到皮皮虾视频');
  return result('pipixia', input, {
    title: item.content,
    author: item.author?.name,
    avatar: item.author?.avatar?.download_list?.[0]?.url,
    cover: item.cover?.download_list?.[0]?.url,
    url,
  });
}

async function parsePipigx(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const pid = input.url.searchParams.get('pid');
  const mid = input.url.searchParams.get('mid');
  if (!pid || !mid) fail('pipigx', '皮皮搞笑链接缺少 pid/mid');
  const json = await fetchJson('https://h5.pipigx.com/ppapi/share/fetch_content', ctx, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid: Number(pid), mid: Number(mid), type: 'post' }),
  });
  const post = json?.data?.post;
  const videos = Array.isArray(post?.videos) ? post.videos : Object.values(post?.videos || {});
  const first: any = videos.find((v: any) => v?.url);
  if (!first?.url) fail('pipigx', '未找到皮皮搞笑视频');
  return result('pipigx', input, {
    title: post.content,
    cover: first.thumb ? `https://file.ippzone.com/img/frame/id/${first.thumb}` : undefined,
    url: first.url,
  });
}

async function parseQsmusic(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const followed = await follow(input.url.toString(), ctx);
  const u = new URL(followed);
  const trackId = u.searchParams.get('track_id');
  const ugcId = u.searchParams.get('ugc_video_id');
  if (!trackId && !ugcId) fail('qsmusic', '无法提取汽水音乐 ID');
  const html = await fetchText(followed, ctx);
  const m = html.match(/_ROUTER_DATA\s*=\s*({[\s\S]*?});/);
  if (!m?.[1]) fail('qsmusic', '未找到汽水音乐信息');
  const json = JSON.parse(m[1].trim());
  const loader = json.loaderData || {};
  if (trackId) {
    const audio = loader.track_page?.audioWithLyricsOption || {};
    if (!audio.url) fail('qsmusic', '未找到音频地址');
    return result('qsmusic', input, {
      title: audio.trackName,
      author: audio.artistName,
      cover: audio.coverURL,
      url: audio.url,
      audio: true,
    });
  }
  const options = loader.ugc_video_page?.videoOptions || {};
  if (!options.url) fail('qsmusic', '未找到视频地址');
  return result('qsmusic', input, {
    title: options.videoName,
    author: options.artistName,
    cover: options.coverURL,
    url: options.url,
  });
}

async function parseZuiyou(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const pid = Number(input.contentId || input.url.searchParams.get('pid'));
  if (!pid) fail('zuiyou', '无法解析最右 pid');
  const json = await fetchJson('https://share.xiaochuankeji.cn/planck/share/post/detail_h5', ctx, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ h_av: '5.2.13.011', pid }),
  });
  const post = json?.data?.post;
  const videoKey = post?.imgs?.[0]?.id;
  const play = videoKey ? post.videos?.[String(videoKey)]?.url : '';
  if (!play) fail('zuiyou', '未找到最右视频');
  return result('zuiyou', input, {
    title: post.content,
    author: post.member?.name,
    avatar: post.member?.avatar_urls?.origin?.urls?.[0],
    cover: post.videos?.[String(videoKey)]?.cover_urls?.[0],
    url: play,
  });
}

async function parseLishipin(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const videoId =
    input.contentId || input.url.pathname.replace(/^\/detail_/, '').replace(/\/$/, '');
  if (!videoId) fail('lishipin', '无法解析梨视频 id');
  const mrd = Math.floor(Date.now() / 1000);
  const json = await fetchJson(
    `https://www.pearvideo.com/videoStatus.jsp?contId=${videoId}&mrd=${mrd}`,
    ctx,
    { headers: { Referer: `https://www.pearvideo.com/detail_${videoId}`, 'User-Agent': DESKTOP_UA } }
  );
  const src = json.videoInfo?.videos?.srcUrl;
  if (!src) fail('lishipin', '梨视频数据缺失');
  const timer = String(json.systemTime || '');
  const url = timer ? src.replace(timer, `cont-${videoId}`) : src;
  return result('lishipin', input, { cover: json.videoInfo?.video_image, url });
}

async function parseHuya(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const videoId = input.contentId || input.url.toString().match(/\/(\d+)\.html/)?.[1];
  if (!videoId) fail('huya', '无法解析虎牙视频 id');
  const json = await fetchJson(`https://liveapi.huya.com/moment/getMomentContent?videoId=${videoId}`, ctx, {
    headers: { Referer: 'https://v.huya.com/', 'User-Agent': DESKTOP_UA },
  });
  const videoData = json?.data?.moment?.videoInfo;
  const url = videoData?.definitions?.[0]?.url;
  if (!url) fail('huya', '虎牙视频解析失败');
  return result('huya', input, {
    title: videoData.videoTitle,
    author: videoData.actorNick,
    avatar: videoData.actorAvatarUrl,
    cover: videoData.videoCover,
    url,
  });
}

async function parseQuanmin(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const vid = input.contentId || input.url.searchParams.get('vid');
  if (!vid) fail('quanmin', '无法解析度小视 vid');
  const json = await fetchJson(
    `https://quanmin.hao222.com/wise/growth/api/sv/immerse?source=share-h5&pd=qm_share_mvideo&_format=json&vid=${vid}`,
    ctx
  );
  const data = json.data;
  const url = data?.meta?.video_info?.clarityUrl?.[1]?.url || data?.meta?.video_info?.clarityUrl?.[0]?.url;
  if (!url) fail('quanmin', '未找到度小视视频');
  return result('quanmin', input, {
    title: data?.meta?.title || data?.shareInfo?.title,
    author: data?.author?.name,
    avatar: data?.author?.icon,
    cover: data?.meta?.image,
    url,
  });
}

async function parseQuanminkge(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const s = input.contentId || input.url.searchParams.get('s');
  if (!s) fail('quanminkge', '无法解析全民K歌参数');
  const html = await fetchText(`https://kg.qq.com/node/play?s=${s}`, ctx, { 'User-Agent': DESKTOP_UA });
  const m = html.match(/window\.__DATA__\s*=\s*(.*?);/s);
  if (!m?.[1]) fail('quanminkge', '全民K歌页面解析失败');
  const data = JSON.parse(m[1].trim())?.detail;
  const playUrl = data?.playurl_video || data?.playurl;
  if (!playUrl) fail('quanminkge', '未找到作品播放地址');
  return result('quanminkge', input, {
    title: data.content,
    author: data.nick,
    avatar: data.avatar,
    cover: data.cover,
    url: playUrl,
    audio: !data.playurl_video && Boolean(data.playurl),
  });
}

async function parseSixroom(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  let videoId = input.contentId;
  if (!videoId) {
    videoId = input.url.searchParams.get('vid') || input.url.pathname.replace(/^\/v\//, '').replace(/\/$/, '');
  }
  if (!videoId) fail('sixroom', '无法解析六间房 vid');
  const json = await fetchJson(
    `https://v.6.cn/coop/mobile/index.php?padapi=minivideo-watchVideo.php&av=3.0&encpass=&logiuid=&isnew=1&from=0&vid=${videoId}`,
    ctx,
    { headers: { Referer: `https://m.6.cn/v/${videoId}` } }
  );
  const data = json?.content;
  if (!data?.playurl) fail('sixroom', '六间房解析失败');
  return result('sixroom', input, {
    title: data.title,
    author: data.alias,
    avatar: data.picuser,
    cover: data.picurl,
    url: data.playurl,
  });
}

async function parseDoupai(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const id =
    input.contentId ||
    input.url.searchParams.get('id') ||
    input.url.pathname.match(/\/topic\/([A-Za-z0-9]+)/)?.[1];
  if (!id) fail('doupai', '无法解析逗拍 id');
  const json = await fetchJson(`https://v2.doupai.cc/topic/${id}.json`, ctx);
  const data = json?.data;
  if (!data?.videoUrl) fail('doupai', '逗拍解析失败');
  return result('doupai', input, {
    title: data.name,
    author: data.userId?.name,
    avatar: data.userId?.avatar,
    cover: data.imageUrl,
    url: data.videoUrl,
  });
}

async function parseXinpianchang(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const html = await fetchText(input.url.toString(), ctx, {
    'User-Agent': DESKTOP_UA,
    Referer: 'https://www.xinpianchang.com/',
  });
  const m = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m?.[1]) fail('xinpianchang', '新片场页面无数据');
  const data = JSON.parse(m[1].trim())?.props?.pageProps?.detail;
  const progressives: any[] = data?.video?.content?.progressive || [];
  if (progressives.length === 0) fail('xinpianchang', '未找到新片场视频');

  const mediaList: MediaResource[] = progressives
    .filter((p: any) => Boolean(p.url))
    .map((p: any, idx: number) => ({
      type: 'video' as const,
      url: p.url,
      quality: p.profile_desc || p.profile || `${p.height || ''}P`,
      width: p.width,
      height: p.height,
      bitrate: p.bitrate,
      filename: `xinpianchang_${input.contentId || Date.now()}_${p.profile || idx + 1}.mp4`,
      direct: true,
    }));

  return result('xinpianchang', input, {
    title: data.title,
    author: data.author?.userinfo?.username,
    avatar: data.author?.userinfo?.avatar,
    cover: data.cover,
    mediaList: mediaList.length > 0 ? mediaList : undefined,
    url: mediaList.length === 0 ? progressives[0].url : undefined,
  });
}

async function parseLvzhou(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const html = await fetchText(input.url.toString(), ctx);
  const videoUrl = html.match(/<video[^>]+src="([^"]+)"/)?.[1];
  if (!videoUrl) fail('lvzhou', '绿洲页面未找到视频');
  return result('lvzhou', input, {
    title: html.match(/class="status-title"[^>]*>([^<]+)</)?.[1]?.trim(),
    author: html.match(/class="nickname"[^>]*>([^<]+)</)?.[1]?.trim(),
    avatar: html.match(/<a[^>]+class="avatar"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1],
    cover: html.match(/background-image:url\(([^)]+)\)/)?.[1],
    url: videoUrl,
  });
}

function decodeMeipai(videoBs64: string): string {
  const reversed = [...videoBs64].reverse().join('');
  const hexStr = reversed.slice(-10);
  const dec = parseInt(hexStr, 16);
  const hex1 = Math.floor(dec / 1000);
  const str1 = videoBs64.slice(0, -10);
  const strN = String(hex1);
  const pre = parseInt(strN.slice(0, 3), 10);
  const tail = strN.slice(3).split('').reverse();
  const d = [...str1].reverse().join('').slice(0, pre).split('').reverse().join('');
  let first = 0;
  for (let i = 0; i < tail.length; i++) {
    if (tail[i] !== '0') {
      first = i;
      break;
    }
  }
  const p = first + 1 + parseInt([...tail].reverse().join(''), 10);
  const kk = [...d].reverse().join('').slice(0, p).split('').reverse().join('');
  return `https:${atob(kk)}`;
}

async function parseMeipai(input: ProviderParseInput, ctx: ProviderContext): Promise<ProviderRawResult> {
  const html = await fetchText(input.url.toString(), ctx, { 'User-Agent': DESKTOP_UA });
  const bs64 = html.match(/data-video="([^"]+)"/)?.[1];
  if (!bs64) fail('meipai', '无法解析美拍视频参数');
  let url: string;
  try {
    url = decodeMeipai(bs64);
  } catch {
    fail('meipai', '美拍地址解码失败');
  }
  const cover = html.match(/<img[^>]+src="([^"]+)"/)?.[1];
  return result('meipai', input, {
    title: html.match(/class="detail-cover-title"[^>]*>([^<]+)</)?.[1]?.trim(),
    author: html.match(/class="detail-avatar"[^>]+alt="([^"]+)"/)?.[1],
    cover: cover?.startsWith('//') ? `https:${cover}` : cover,
    url,
  });
}

export const extendedProviders: MediaProvider[] = [
  new FnProvider('acfun-native', 'AcFun', ['acfun'], parseAcfun),
  new FnProvider('haokan-native', '好看视频', ['haokan'], parseHaokan),
  new FnProvider('huoshan-native', '火山', ['huoshan'], parseHuoshan),
  new FnProvider('weishi-native', '微视', ['weishi'], parseWeishi),
  new FnProvider('xigua-native', '西瓜视频', ['xigua'], parseXigua),
  new FnProvider('pipixia-native', '皮皮虾', ['pipixia'], parsePipixia),
  new FnProvider('pipigx-native', '皮皮搞笑', ['pipigx'], parsePipigx),
  new FnProvider('qsmusic-native', '汽水音乐', ['qsmusic'], parseQsmusic),
  new FnProvider('zuiyou-native', '最右', ['zuiyou'], parseZuiyou),
  new FnProvider('lishipin-native', '梨视频', ['lishipin'], parseLishipin),
  new FnProvider('huya-native', '虎牙', ['huya'], parseHuya),
  new FnProvider('quanmin-native', '度小视', ['quanmin'], parseQuanmin),
  new FnProvider('quanminkge-native', '全民K歌', ['quanminkge'], parseQuanminkge),
  new FnProvider('sixroom-native', '六间房', ['sixroom'], parseSixroom),
  new FnProvider('doupai-native', '逗拍', ['doupai'], parseDoupai),
  new FnProvider('xinpianchang-native', '新片场', ['xinpianchang'], parseXinpianchang),
  new FnProvider('lvzhou-native', '绿洲', ['lvzhou'], parseLvzhou),
  new FnProvider('meipai-native', '美拍', ['meipai'], parseMeipai),
];
