import { describe, it, expect } from 'vitest';
import { identifyPlatform, isShortLink } from '../../worker/core/detector';

describe('Platform Detector 平台与短链识别', () => {
  it('正确识别各主流平台的标准链接与 ID', () => {
    const dy = identifyPlatform(new URL('https://www.douyin.com/video/7123456789012345678'));
    expect(dy.platform).toBe('douyin');
    expect(dy.contentId).toBe('7123456789012345678');

    const bili = identifyPlatform(new URL('https://www.bilibili.com/video/BV1xx411c7mD'));
    expect(bili.platform).toBe('bilibili');
    expect(bili.contentId).toBe('BV1xx411c7mD');

    const xhs = identifyPlatform(new URL('https://www.xiaohongshu.com/explore/64f89abc00000000123456'));
    expect(xhs.platform).toBe('xiaohongshu');
    expect(xhs.contentId).toBe('64f89abc00000000123456');

    const kw = identifyPlatform(new URL('https://www.kuaishou.com/short-video/3xabc123'));
    expect(kw.platform).toBe('kuaishou');
    expect(kw.contentId).toBe('3xabc123');

    const wb = identifyPlatform(new URL('https://weibo.com/detail/4912345678901234'));
    expect(wb.platform).toBe('weibo');
    expect(wb.contentId).toBe('4912345678901234');

    const qs = identifyPlatform(new URL('https://qishui.douyin.com/s/abc?track_id=123'));
    expect(qs.platform).toBe('qsmusic');

    const px = identifyPlatform(new URL('https://h5.pipix.com/item/abc123'));
    expect(px.platform).toBe('pipixia');

    const ac = identifyPlatform(new URL('https://www.acfun.cn/v/ac123456'));
    expect(ac.platform).toBe('acfun');

    const amemv = identifyPlatform(new URL('https://www.amemv.com/share/video/7123456789012345678'));
    expect(amemv.platform).toBe('douyin');
    expect(amemv.contentId).toBe('7123456789012345678');

    const biliAv = identifyPlatform(new URL('https://www.bilibili.com/video/av170001'));
    expect(biliAv.platform).toBe('bilibili');
    expect(biliAv.contentId).toBe('av170001');

    const xhsLink = identifyPlatform(new URL('https://xhs.link/explore/64f89abc00000000123456'));
    expect(xhsLink.platform).toBe('xiaohongshu');
  });

  it('正确识别常见短链域名', () => {
    expect(isShortLink('v.douyin.com')).toBe(true);
    expect(isShortLink('b23.tv')).toBe(true);
    expect(isShortLink('bili2233.cn')).toBe(true);
    expect(isShortLink('xhslink.com')).toBe(true);
    expect(isShortLink('xhs.link')).toBe(true);
    expect(isShortLink('t.cn')).toBe(true);
    expect(isShortLink('www.douyin.com')).toBe(false);
    expect(isShortLink('v.kuaishou.com')).toBe(true);
    expect(isShortLink('v.kuaishouapp.com')).toBe(true);
    expect(isShortLink('ws.qq.com')).toBe(true);
  });
});