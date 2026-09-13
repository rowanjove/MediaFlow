import type { Platform } from '../../schemas/result';
import type { MediaProvider, ProviderContext, ProviderParseInput, ProviderRawResult } from '../base';
import { AppError } from '../../core/errors';

function videoIdOf(input: ProviderParseInput): string | undefined {
  if (input.contentId) return input.contentId;
  if (input.url.hostname.includes('youtu.be')) return input.url.pathname.replace(/^\//, '').split('/')[0];
  return input.url.searchParams.get('v') || input.url.pathname.match(/shorts\/([a-zA-Z0-9_-]+)/)?.[1];
}

async function innertube(
  videoId: string,
  signal: AbortSignal
): Promise<{ url: string; title?: string; cover?: string } | null> {
  const clients = [
    {
      clientName: 'ANDROID',
      clientVersion: '19.09.37',
      ua: 'com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip',
    },
    {
      clientName: 'WEB',
      clientVersion: '2.20240815.00.00',
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  ];

  for (const c of clients) {
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua },
        body: JSON.stringify({
          context: {
            client: {
              clientName: c.clientName,
              clientVersion: c.clientVersion,
              hl: 'en',
              gl: 'US',
              androidSdkVersion: c.clientName === 'ANDROID' ? 34 : undefined,
            },
          },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });
      const json = (await res.json()) as any;
      const formats = [
        ...(json?.streamingData?.formats || []),
        ...(json?.streamingData?.adaptiveFormats || []),
      ];
      const picked =
        formats.find((f: any) => f.url && String(f.mimeType || '').includes('video/mp4')) ||
        formats.find((f: any) => f.url);
      if (picked?.url) {
        return {
          url: picked.url,
          title: json.videoDetails?.title,
          cover: json.videoDetails?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url,
        };
      }
    } catch {
      /* try next client */
    }
  }
  return null;
}

export class YoutubeNativeProvider implements MediaProvider {
  readonly id = 'youtube-native';
  readonly name = 'YouTube 原生解析器';
  readonly platforms: Platform[] = ['youtube'];

  supports(platform: Platform): boolean {
    return platform === 'youtube';
  }

  async parse(input: ProviderParseInput, context: ProviderContext): Promise<ProviderRawResult> {
    const id = videoIdOf(input);
    if (!id) throw new AppError('PARSE_FAILED', '未识别到 YouTube 视频 ID', { platform: 'youtube' });
    const got = await innertube(id, context.signal);
    if (!got) {
      throw new AppError('PARSE_FAILED', 'YouTube 播放地址不可用（地区限制或需 Cobalt）', {
        platform: 'youtube',
      });
    }
    return {
      platform: 'youtube',
      sourceUrl: input.url.toString(),
      contentId: id,
      content: { type: 'video', title: got.title, cover: got.cover },
      media: [{ type: 'video', url: got.url, filename: `youtube_${id}.mp4`, direct: true }],
    };
  }
}
