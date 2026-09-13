import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DouyinPrimaryProvider } from '../../worker/providers/native/douyin/primary';
import { XiaohongshuProvider } from '../../worker/providers/native/xiaohongshu';
import { BilibiliProvider } from '../../worker/providers/native/bilibili';
import { TikTokNativeProvider } from '../../worker/providers/experimental/tiktok-native';
import { KuaishouProvider } from '../../worker/providers/native/kuaishou';
import type { ProviderContext, ProviderParseInput } from '../../worker/providers/base';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(join(dir, '..', 'fixtures', name), 'utf8');

const ctx: ProviderContext = {
  signal: new AbortController().signal,
  requestId: 'fixture-1',
  env: {},
};

function input(url: string, platform: ProviderParseInput['platform'], contentId?: string): ProviderParseInput {
  return { url: new URL(url), platform, contentId, rawInput: url };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Parser fixture 回归', () => {
  it('抖音 iteminfo fixture 产出去水印视频直链', async () => {
    const body = fixture('douyin-iteminfo.json');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }))
    );
    const result = await new DouyinPrimaryProvider().parse(
      input('https://www.douyin.com/video/7123456789012345678', 'douyin', '7123456789012345678'),
      ctx
    );
    expect(result.content.title).toBe('测试航拍视频');
    expect(result.media[0].url).toContain('/play/');
    expect(result.media[0].url).not.toContain('playwm');
  });

  it('小红书 INITIAL_STATE fixture 产出原图', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(fixture('xiaohongshu.html'), { status: 200 }))
    );
    const result = await new XiaohongshuProvider().parse(
      input('https://www.xiaohongshu.com/explore/64f89abc00000000123456', 'xiaohongshu', '64f89abc00000000123456'),
      ctx
    );
    expect(result.content.type).toBe('images');
    expect(result.media[0].url).toBe('https://sns-img-qc.xhscdn.com/img1.jpg');
  });

  it('B 站 view+playurl fixture 产出视频轨和音频轨', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/view')) {
          return new Response(fixture('bilibili-view.json'), { status: 200 });
        }
        return new Response(fixture('bilibili-playurl.json'), { status: 200 });
      })
    );
    const result = await new BilibiliProvider().parse(
      input('https://www.bilibili.com/video/BV1xx411c7mD', 'bilibili', 'BV1xx411c7mD'),
      ctx
    );
    expect(result.media.some((m) => m.type === 'video')).toBe(true);
    expect(result.media.some((m) => m.type === 'audio')).toBe(true);
  });

  it('TikTok UNIVERSAL_DATA fixture 产出视频地址', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(fixture('tiktok.html'), { status: 200 }))
    );
    const result = await new TikTokNativeProvider().parse(
      input('https://www.tiktok.com/@demo/video/7234567890', 'tiktok', '7234567890'),
      ctx
    );
    expect(result.content.type).toBe('video');
    expect(result.media[0].url).toContain('tiktok.com/video.mp4');
  });

  it('B 站支持解析 av 号链接并获取正确内容与标准 BV 号', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/view?aid=170001')) {
          return new Response(
            JSON.stringify({
              code: 0,
              data: {
                bvid: 'BV17x411w7KC',
                aid: 170001,
                cid: 279786,
                title: '【金坷垃】保加利亚妖王',
                desc: '经典鬼畜',
                pic: 'https://i0.hdslb.com/bfs/archive/test.jpg',
                owner: { name: 'UP主', face: 'https://i0.hdslb.com/face.jpg', mid: 123 },
              },
            }),
            { status: 200 }
          );
        }
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              durl: [{ url: 'https://cn-bj.bilivideo.com/test.mp4', size: 1024 }],
            },
          }),
          { status: 200 }
        );
      })
    );

    const provider = new BilibiliProvider();
    const result = await provider.parse(
      input('https://www.bilibili.com/video/av170001', 'bilibili', 'av170001'),
      ctx
    );

    expect(result.contentId).toBe('BV17x411w7KC');
    expect(result.content.title).toBe('【金坷垃】保加利亚妖王');
    expect(result.media[0].url).toBe('https://cn-bj.bilivideo.com/test.mp4');
  });

  it('快手解析器支持解析相册/图集 (images)', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head><title>快手图集</title></head>
        <body>
          <script>
            window.INIT_STATE = {
              "photo": {
                "photoId": "photo_987654",
                "caption": "今日穿搭分享",
                "userName": "时尚达人",
                "images": [
                  { "url": "https://p1.kuaishou.com/img1.jpg" },
                  { "url": "https://p2.kuaishou.com/img2.jpg" }
                ]
              }
            };
          </script>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(mockHtml, { status: 200 })));

    const provider = new KuaishouProvider();
    const result = await provider.parse(
      input('https://www.kuaishou.com/short-video/photo_987654', 'kuaishou', 'photo_987654'),
      ctx
    );

    expect(result.content.type).toBe('images');
    expect(result.content.title).toBe('今日穿搭分享');
    expect(result.media.length).toBe(2);
    expect(result.media[0].url).toBe('https://p1.kuaishou.com/img1.jpg');
    expect(result.media[1].url).toBe('https://p2.kuaishou.com/img2.jpg');
  });

  it('新片场支持解析并返回多清晰度 progressive 列表', async () => {
    const { extendedProviders } = await import('../../worker/providers/native/extended');
    const xpcProvider = extendedProviders.find((p) => p.supports('xinpianchang'))!;

    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <script id="__NEXT_DATA__" type="application/json">
            {
              "props": {
                "pageProps": {
                  "detail": {
                    "title": "电影级短片",
                    "cover": "https://xpc.example.com/cover.jpg",
                    "video": {
                      "content": {
                        "progressive": [
                          { "profile": "1080P", "profile_desc": "1080P 高清", "width": 1920, "height": 1080, "bitrate": 4000, "url": "https://xpc.example.com/1080.mp4" },
                          { "profile": "720P", "profile_desc": "720P 标清", "width": 1280, "height": 720, "bitrate": 2000, "url": "https://xpc.example.com/720.mp4" }
                        ]
                      }
                    }
                  }
                }
              }
            }
          </script>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(mockHtml, { status: 200 })));

    const result = await xpcProvider.parse(
      input('https://www.xinpianchang.com/a123456', 'xinpianchang', '123456'),
      ctx
    );

    expect(result.content.title).toBe('电影级短片');
    expect(result.media.length).toBe(2);
    expect(result.media[0].quality).toBe('1080P 高清');
    expect(result.media[0].url).toBe('https://xpc.example.com/1080.mp4');
    expect(result.media[1].quality).toBe('720P 标清');
    expect(result.media[1].url).toBe('https://xpc.example.com/720.mp4');
  });

  it('Twitter 解析器支持识别并提取 animated_gif 为 MP4 视频', async () => {
    const { TwitterProvider } = await import('../../worker/providers/native/twitter');
    const provider = new TwitterProvider();

    const mockTweet = {
      text: 'Funny GIF meme',
      user: { name: 'MemeMaster', screen_name: 'memes' },
      animated_gif: {
        poster: 'https://pbs.twimg.com/poster.jpg',
        variants: [
          { content_type: 'video/mp4', bitrate: 0, src: 'https://video.twimg.com/tweet_gif.mp4' }
        ]
      }
    };

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(mockTweet), { status: 200 })));

    const result = await provider.parse(
      input('https://x.com/memes/status/987654321', 'twitter', '987654321'),
      ctx
    );

    expect(result.content.type).toBe('video');
    expect(result.content.title).toBe('Funny GIF meme');
    expect(result.media[0].url).toBe('https://video.twimg.com/tweet_gif.mp4');
  });

  it('汽水音乐 track_id 页面准确设置 content.type 为 audio', async () => {
    const { extendedProviders } = await import('../../worker/providers/native/extended');
    const qsProvider = extendedProviders.find((p) => p.supports('qsmusic'))!;

    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <script>
            window._ROUTER_DATA = {
              "loaderData": {
                "track_page": {
                  "audioWithLyricsOption": {
                    "trackName": "海阔天空",
                    "artistName": "Beyond",
                    "coverURL": "https://music.douyin.com/cover.jpg",
                    "url": "https://music.douyin.com/track.m4a"
                  }
                }
              }
            };
          </script>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(mockHtml, { status: 200 })));

    const result = await qsProvider.parse(
      input('https://music.douyin.com/qishui/share/track?track_id=track_9988', 'qsmusic', 'track_9988'),
      ctx
    );

    expect(result.content.type).toBe('audio');
    expect(result.content.title).toBe('海阔天空');
    expect(result.author?.name).toBe('Beyond');
    expect(result.media[0].type).toBe('audio');
    expect(result.media[0].url).toBe('https://music.douyin.com/track.m4a');
  });

  it('B站 WBI 签名与轻量级 MD5 运算正确性校验', async () => {
    const { md5, signWbiQuery } = await import('../../worker/providers/native/bilibili-wbi');
    // 标准 MD5 校验
    expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');

    const signed = signWbiQuery(
      { bvid: 'BV1xx411c7mD', cid: 123456, qn: 80 },
      'test_mixin_key_1234567890123456'
    );
    expect(signed).toContain('bvid=BV1xx411c7mD');
    expect(signed).toContain('cid=123456');
    expect(signed).toContain('wts=');
    expect(signed).toContain('w_rid=');
    const wRidMatch = signed.match(/w_rid=([a-f0-9]{32})/);
    expect(wRidMatch?.[1]).toBeDefined();
  });

  it('CobaltClient 完整序列化并传递 videoQuality、downloadMode 等选项', async () => {
    const { CobaltClient } = await import('../../worker/providers/cobalt/client');
    let capturedBody: any = null;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: any) => {
        capturedBody = JSON.parse(init.body);
        return new Response(JSON.stringify({ status: 'redirect', url: 'https://cdn.example.com/video.mp4' }), {
          status: 200,
        });
      })
    );

    const client = new CobaltClient('https://cobalt.internal');
    await client.parse({
      url: 'https://www.youtube.com/watch?v=123',
      videoQuality: '1080',
      downloadMode: 'auto',
    });

    expect(capturedBody).toBeDefined();
    expect(capturedBody.url).toBe('https://www.youtube.com/watch?v=123');
    expect(capturedBody.videoQuality).toBe('1080');
    expect(capturedBody.downloadMode).toBe('auto');
  });

  it('小红书笔记已被删除时抛出不可重试的 CONTENT_NOT_FOUND', async () => {
    const { AppError } = await import('../../worker/core/errors');
    const { XiaohongshuProvider } = await import('../../worker/providers/native/xiaohongshu');
    const provider = new XiaohongshuProvider();

    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <body>
          <script>
            window.__INITIAL_STATE__ = {
              "note": {
                "firstNoteId": "non_existent_note",
                "noteDetailMap": {}
              }
            };
          </script>
        </body>
      </html>
    `;

    vi.stubGlobal('fetch', vi.fn(async () => new Response(mockHtml, { status: 200 })));

    let caughtErr: any = null;
    try {
      await provider.parse(
        input('https://www.xiaohongshu.com/explore/non_existent_note', 'xiaohongshu', 'non_existent_note'),
        ctx
      );
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeInstanceOf(AppError);
    expect(caughtErr.code).toBe('CONTENT_NOT_FOUND');
    expect(caughtErr.isRetryable).toBe(false);
  });
});
