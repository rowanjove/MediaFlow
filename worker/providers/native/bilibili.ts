import type { Platform } from '../../schemas/result';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../base';
import { AppError } from '../../core/errors';
import { fetchWbiMixinKey, signWbiQuery } from './bilibili-wbi';

export class BilibiliProvider implements MediaProvider {
  readonly id = 'bilibili-native';
  readonly name = '哔哩哔哩原生解析器';
  readonly platforms: Platform[] = ['bilibili'];

  supports(platform: Platform): boolean {
    return platform === 'bilibili';
  }

  async parse(input: ProviderParseInput, context: ProviderContext): Promise<ProviderRawResult> {
    let bvid: string | undefined;
    let aid: string | undefined;

    if (input.contentId?.startsWith('BV')) {
      bvid = input.contentId;
    } else if (input.contentId?.toLowerCase().startsWith('av')) {
      aid = input.contentId.slice(2);
    }

    if (!bvid && !aid) {
      const bvMatch = input.url.pathname.match(/(BV[a-zA-Z0-9]{10})/i);
      const avMatch = input.url.pathname.match(/av(\d+)/i);
      if (bvMatch?.[1]) {
        bvid = bvMatch[1];
      } else if (avMatch?.[1]) {
        aid = avMatch[1];
      } else if (input.url.searchParams.get('aid')) {
        aid = input.url.searchParams.get('aid') || undefined;
      }
    }

    // 若依然未提取到 ID（例如未展开的短链），主动跟随一次重定向探测落地页
    if (!bvid && !aid) {
      try {
        const pingRes = await fetch(input.url.toString(), {
          signal: context.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          redirect: 'follow',
        });
        const landedUrl = new URL(pingRes.url);
        const mBv = landedUrl.pathname.match(/(BV[a-zA-Z0-9]{10})/i);
        const mAv = landedUrl.pathname.match(/av(\d+)/i);
        if (mBv?.[1]) bvid = mBv[1];
        else if (mAv?.[1]) aid = mAv[1];
      } catch {
        /* continue */
      }
    }

    if (!bvid && !aid) {
      throw new AppError('PARSE_FAILED', '未识别到有效 B站 BV号或 AV号', { platform: 'bilibili' });
    }

    // 1. 获取视频基本信息 (标题、cid、封面、UP主)
    const viewQuery = bvid ? `bvid=${bvid}` : `aid=${aid}`;
    const viewUrl = `https://api.bilibili.com/x/web-interface/view?${viewQuery}`;
    const viewRes = await fetch(viewUrl, {
      signal: context.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.bilibili.com/',
        Cookie: context.cookies?.bilibili || '',
      },
    });

    if (!viewRes.ok) {
      throw new AppError('UPSTREAM_BLOCKED', `B站 API 请求受阻 HTTP ${viewRes.status}`, {
        platform: 'bilibili',
      });
    }

    const viewData = (await viewRes.json()) as any;
    if (viewData?.code !== 0 || !viewData?.data) {
      throw new AppError('PARSE_FAILED', viewData?.message || 'B站视频不存在或已失效', {
        platform: 'bilibili',
      });
    }

    const videoData = viewData.data;
    bvid = videoData.bvid || bvid || `av${aid}`;
    const cid = videoData.cid;
    const title = videoData.title;
    const desc = videoData.desc;
    const cover = videoData.pic;
    const duration = videoData.duration;
    const author = {
      name: videoData.owner?.name,
      avatar: videoData.owner?.face,
      url: `https://space.bilibili.com/${videoData.owner?.mid}`,
    };

    const playHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: `https://www.bilibili.com/video/${bvid}`,
      Cookie: context.cookies?.bilibili || '',
    };

    const mixinKey = await fetchWbiMixinKey(context.signal, context.cookies?.bilibili);
    const signedQuery = signWbiQuery(
      {
        bvid,
        cid,
        qn: 80,
        fnval: 16,
        fnver: 0,
        fourk: 1,
      },
      mixinKey
    );

    const playUrls = [
      `https://api.bilibili.com/x/player/wbi/playurl?${signedQuery}`,
      `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=16&fnver=0&fourk=1`,
    ];

    let playData: any = null;
    for (const playApi of playUrls) {
      const playRes = await fetch(playApi, { signal: context.signal, headers: playHeaders });
      const json = (await playRes.json()) as any;
      if (json?.code === 0 && json?.data) {
        playData = json;
        break;
      }
    }

    const media: any[] = [];

    if (playData?.code === 0 && playData?.data) {
      const dash = playData.data.dash;
      const durl = playData.data.durl;

      if (dash) {
        // 提取最佳视频流
        if (Array.isArray(dash.video) && dash.video.length > 0) {
          const sortedVideos = [...dash.video].sort((a, b) => (b.id || 0) - (a.id || 0));
          const bestVideo = sortedVideos[0];
          const vUrl = bestVideo.baseUrl || bestVideo.base_url || bestVideo.backupUrl?.[0];
          if (vUrl) {
            media.push({
              type: 'video',
              url: vUrl,
              quality: '高清视频轨 (DASH)',
              width: bestVideo.width,
              height: bestVideo.height,
              filename: `bilibili_${bvid}_video.m4s`,
              direct: true,
            });
          }
        }

        // 提取独立高保真音频轨 (B站音乐/音轨爱好者必备)
        if (Array.isArray(dash.audio) && dash.audio.length > 0) {
          const sortedAudios = [...dash.audio].sort((a, b) => (b.id || 0) - (a.id || 0));
          const bestAudio = sortedAudios[0];
          const aUrl = bestAudio.baseUrl || bestAudio.base_url || bestAudio.backupUrl?.[0];
          if (aUrl) {
            media.push({
              type: 'audio',
              url: aUrl,
              quality: '高品质音频轨 (HQ Audio)',
              filename: `bilibili_${bvid}_audio.m4a`,
              direct: true,
            });
          }
        }
      } else if (Array.isArray(durl) && durl.length > 0) {
        // MP4 格式直链
        media.push({
          type: 'video',
          url: durl[0].url,
          quality: '高清视频 (MP4)',
          sizeBytes: durl[0].size,
          filename: `bilibili_${bvid}.mp4`,
          direct: true,
        });
      }
    }

    if (media.length === 0) {
      if (!context.cookies?.bilibili) {
        throw new AppError('COOKIE_REQUIRED', 'B站高清流需要配置 BILIBILI_COOKIE', {
          platform: 'bilibili',
        });
      }
      throw new AppError('PARSE_FAILED', '未能成功获取 B站 媒体流地址', { platform: 'bilibili' });
    }

    return {
      platform: 'bilibili',
      sourceUrl: input.url.toString(),
      canonicalUrl: `https://www.bilibili.com/video/${bvid}`,
      contentId: bvid,
      author,
      content: {
        type: media.some((m) => m.type === 'video') ? 'video' : 'audio',
        title,
        description: desc,
        cover,
        duration,
      },
      media,
    };
  }
}