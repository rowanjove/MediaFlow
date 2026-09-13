import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  identifyPlatform,
  isShortLink,
  expandShortUrl,
} from '../../worker/core/detector';
import { extractShareUrl, validateAndSanitizeUrl, isHostAllowed, isPrivateIp } from '../../worker/core/security';
import { AppError } from '../../worker/core/errors';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('全平台检索识别与链接解析深度测试 (Retrieval & Detection Suite)', () => {
  describe('1. 全平台平台类型与 ContentId 识别覆盖', () => {
    const platformSamples: Array<{
      platform: string;
      url: string;
      expectedId?: string;
    }> = [
      { platform: 'douyin', url: 'https://www.douyin.com/video/7123456789012345678', expectedId: '7123456789012345678' },
      { platform: 'douyin', url: 'https://www.douyin.com/note/7234567890123456789', expectedId: '7234567890123456789' },
      { platform: 'xiaohongshu', url: 'https://www.xiaohongshu.com/explore/64f89abc00000000123456', expectedId: '64f89abc00000000123456' },
      { platform: 'xiaohongshu', url: 'https://www.xiaohongshu.com/discovery/item/65f89abc00000000123456', expectedId: '65f89abc00000000123456' },
      { platform: 'bilibili', url: 'https://www.bilibili.com/video/BV1xx411c7mD', expectedId: 'BV1xx411c7mD' },
      { platform: 'bilibili', url: 'https://www.bilibili.com/video/av170001', expectedId: 'av170001' },
      { platform: 'kuaishou', url: 'https://www.kuaishou.com/short-video/3xabc123', expectedId: '3xabc123' },
      { platform: 'kuaishou', url: 'https://v.kuaishou.com/f/3xphoto999', expectedId: '3xphoto999' },
      { platform: 'weibo', url: 'https://weibo.com/detail/4912345678901234', expectedId: '4912345678901234' },
      { platform: 'weibo', url: 'https://video.weibo.com/show?fid=1034:5336294365265960', expectedId: '5336294365265960' },
      { platform: 'tiktok', url: 'https://www.tiktok.com/@user/video/7234567890123456789', expectedId: '7234567890123456789' },
      { platform: 'tiktok', url: 'https://www.tiktok.com/@user/photo/7234567890123456789', expectedId: '7234567890123456789' },
      { platform: 'instagram', url: 'https://www.instagram.com/p/C_abc123DEF/', expectedId: 'C_abc123DEF' },
      { platform: 'instagram', url: 'https://www.instagram.com/reel/C_xyz789GHI/', expectedId: 'C_xyz789GHI' },
      { platform: 'twitter', url: 'https://x.com/jack/status/20', expectedId: '20' },
      { platform: 'twitter', url: 'https://twitter.com/elonmusk/status/1789012345678901234', expectedId: '1789012345678901234' },
      { platform: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
      { platform: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ', expectedId: 'dQw4w9WgXcQ' },
      { platform: 'youtube', url: 'https://www.youtube.com/shorts/abc123_-XYZ', expectedId: 'abc123_-XYZ' },
      { platform: 'qsmusic', url: 'https://qishui.douyin.com/s/abc?track_id=track_789', expectedId: 'track_789' },
      { platform: 'pipixia', url: 'https://h5.pipix.com/item/6987654321', expectedId: '6987654321' },
      { platform: 'pipigx', url: 'https://h5.pipigx.com/ppapi/share/fetch_content?pid=12345&mid=67890', expectedId: '12345' },
      { platform: 'xigua', url: 'https://www.ixigua.com/71234567890', expectedId: '71234567890' },
      { platform: 'huoshan', url: 'https://share.huoshan.com/api/item/info?item_id=888999', expectedId: '888999' },
      { platform: 'weishi', url: 'https://isee.weishi.qq.com/ws/app-pages/share/index.html?id=feed_666', expectedId: 'feed_666' },
      { platform: 'zuiyou', url: 'https://share.xiaochuankeji.cn/planck/share/post/detail_h5?pid=555444', expectedId: '555444' },
      { platform: 'lishipin', url: 'https://www.pearvideo.com/detail_1791232', expectedId: '1791232' },
      { platform: 'huya', url: 'https://v.huya.com/play/928604826.html', expectedId: '928604826' },
      { platform: 'acfun', url: 'https://www.acfun.cn/v/ac48831564', expectedId: '48831564' },
      { platform: 'meipai', url: 'https://www.meipai.com/media/6961962339685660636', expectedId: '6961962339685660636' },
      { platform: 'doupai', url: 'https://d.doupai.cc/topic/topic_998877.json', expectedId: 'topic_998877' },
      { platform: 'quanminkge', url: 'https://kg.qq.com/node/play?s=kg_song_123', expectedId: 'kg_song_123' },
      { platform: 'sixroom', url: 'https://v.6.cn/coop/mobile/index.php?vid=six_5544', expectedId: 'six_5544' },
      { platform: 'xinpianchang', url: 'https://www.xinpianchang.com/a13813473', expectedId: '13813473' },
      { platform: 'lvzhou', url: 'https://oasis.weibo.cn/v1/h5/share?sid=oasis_123' },
      { platform: 'haokan', url: 'https://haokan.baidu.com/v?vid=3321366250719491589', expectedId: '3321366250719491589' },
      { platform: 'quanmin', url: 'https://xspshare.baidu.com/share/video?vid=qm_vid_888', expectedId: 'qm_vid_888' },
    ];

    it.each(platformSamples)('平台 $platform 的 URL 均能被正确识别 ($url)', ({ platform, url, expectedId }) => {
      const result = identifyPlatform(new URL(url));
      expect(result.platform).toBe(platform);
      if (expectedId) {
        expect(result.contentId).toBe(expectedId);
      }
    });
  });

  describe('2. APP 复制口令与复杂脏文本中提取 URL', () => {
    it('提取抖音带口令文案', () => {
      const text = '7.34 04/10 V@d.oi 8:/ 赶快看看这个风景视频吧！ https://v.douyin.com/RdT8EVMUD8Q/ 复制此链接，打开Douyin搜索';
      const extracted = extractShareUrl(text);
      expect(extracted).toBe('https://v.douyin.com/RdT8EVMUD8Q/');
    });

    it('提取小红书带中文括号与标签的分享文本', () => {
      const text = '53 【今日穿搭灵感】 http://xhslink.com/o/8L6yyJlYIBm，快来看看吧！';
      const extracted = extractShareUrl(text);
      expect(extracted).toBe('http://xhslink.com/o/8L6yyJlYIBm');
    });

    it('提取带有换行、表情符号与特殊结尾标点的链接', () => {
      const text = `
        🔥🔥🔥 爆笑视频不容错过！
        https://b23.tv/xlg2vP0。
        快来B站围观~
      `;
      const extracted = extractShareUrl(text);
      expect(extracted).toBe('https://b23.tv/xlg2vP0');
    });

    it('提取裸域名（未带 http/https 前缀）并补全协议', () => {
      const text = '来看看这个短视频 v.douyin.com/abc123xyz/ 赶紧看';
      const extracted = extractShareUrl(text);
      expect(extracted).toBe('https://v.douyin.com/abc123xyz/');
    });

    it('文本中包含多个 URL 时，优先返回白名单内的受支持平台链接', () => {
      const text = '广告链接 https://spam.example.com/click 然后是视频 https://www.douyin.com/video/7123456789012345678 来看';
      const extracted = extractShareUrl(text);
      expect(extracted).toBe('https://www.douyin.com/video/7123456789012345678');
    });
  });

  describe('3. 短链识别与安全扩展 (expandShortUrl)', () => {
    it('正确识别 20 个主流平台的短链域名', () => {
      const shortHosts = [
        'v.douyin.com',
        'xhslink.com',
        'xhslink.cn',
        'xhs.link',
        'b23.tv',
        'bili2233.cn',
        't.cn',
        'vm.tiktok.com',
        'vt.tiktok.com',
        't.co',
        'youtu.be',
        'v.kuaishou.com',
        'v.kuaishouapp.com',
        'v.kuaishoup.com',
        'v.ixigua.com',
        'share.huoshan.com',
        'v.huya.com',
        'xspshare.baidu.com',
        'qishui.douyin.com',
        'ws.qq.com',
      ];
      for (const host of shortHosts) {
        expect(isShortLink(host)).toBe(true);
      }
      expect(isShortLink('www.douyin.com')).toBe(false);
      expect(isShortLink('www.bilibili.com')).toBe(false);
    });

    it('HEAD 探测成功时快速重定向展开', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: any) => {
          if (init?.method === 'HEAD') {
            return new Response(null, {
              status: 302,
              headers: { location: 'https://www.douyin.com/video/7123456789012345678' },
            });
          }
          return new Response(null, { status: 404 });
        })
      );

      const expanded = await expandShortUrl(new URL('https://v.douyin.com/short123'));
      expect(expanded.hostname).toBe('www.douyin.com');
      expect(expanded.pathname).toBe('/video/7123456789012345678');
    });

    it('HEAD 无 Location 时回退到 GET manual 探测', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: any) => {
          if (init?.method === 'HEAD') {
            return new Response(null, { status: 200 }); // 无 Location
          }
          if (init?.method === 'GET' && init?.redirect === 'manual') {
            return new Response(null, {
              status: 302,
              headers: { location: 'https://www.bilibili.com/video/BV1xx411c7mD' },
            });
          }
          return new Response(null, { status: 404 });
        })
      );

      const expanded = await expandShortUrl(new URL('https://b23.tv/short456'));
      expect(expanded.hostname).toBe('www.bilibili.com');
      expect(expanded.pathname).toBe('/video/BV1xx411c7mD');
    });

    it('短链重定向到了非法协议时抛出 INVALID_URL 异常', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          return new Response(null, {
            status: 302,
            headers: { location: 'javascript:alert(1)' },
          });
        })
      );

      await expect(expandShortUrl(new URL('https://v.douyin.com/evil'))).rejects.toThrow(AppError);
    });

    it('短链重定向到了不受信任的钓鱼域名时抛出安全异常', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://phishing-site.com/login' },
          });
        })
      );

      await expect(expandShortUrl(new URL('https://v.douyin.com/phish'))).rejects.toThrow('不受信任的域名');
    });
  });

  describe('4. 输入校验与 SSRF 私有 IP 防御 (Security & Sanitization)', () => {
    it('正确拦截各类内网与保留 IP 地址', () => {
      expect(isPrivateIp('localhost')).toBe(true);
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('192.168.1.100')).toBe(true);
      expect(isPrivateIp('169.254.169.254')).toBe(true); // 云厂商元数据地址
      expect(isPrivateIp('::1')).toBe(true);
      expect(isPrivateIp('douyin.com')).toBe(false);
      expect(isPrivateIp('bilibili.com')).toBe(false);
    });

    it('输入空字符串或纯空格抛出 INVALID_URL', () => {
      expect(() => validateAndSanitizeUrl('')).toThrow('URL 输入不能为空');
      expect(() => validateAndSanitizeUrl('   ')).toThrow('URL 输入不能为空');
    });

    it('输入非 HTTP(S) 协议抛出 INVALID_URL', () => {
      expect(() => validateAndSanitizeUrl('ftp://ftp.example.com/file')).toThrow('不支持的协议');
      expect(() => validateAndSanitizeUrl('file:///etc/passwd')).toThrow('不支持的协议');
    });

    it('输入未授权的恶意第三方域名抛出 UNSUPPORTED_PLATFORM', () => {
      expect(() => validateAndSanitizeUrl('https://evil-hacker.com/malware.exe')).toThrow('不支持的平台域名');
    });

    it('输入形如 douyin.com.evil.com 的域名欺骗攻击应被安全拦截', () => {
      expect(isHostAllowed('douyin.com.evil.com')).toBe(false);
      expect(() => validateAndSanitizeUrl('https://douyin.com.evil.com/video/123')).toThrow('不支持的平台域名');
    });
  });
});
