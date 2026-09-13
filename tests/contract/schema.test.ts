import { describe, it, expect } from 'vitest';
import { normalizeResult } from '../../worker/core/normalize';
import type { ProviderRawResult } from '../../worker/providers/base';

describe('Unified Schema 契约校验测试', () => {
  it('正确规范化清洗各平台 Provider 媒体数据', () => {
    const raw: ProviderRawResult = {
      platform: 'douyin',
      sourceUrl: 'https://www.douyin.com/video/123456789',
      canonicalUrl: 'https://www.douyin.com/video/123456789',
      contentId: '123456789',
      author: {
        id: 'u123',
        name: ' 极客测试员 ',
        avatar: '//p3.douyinpic.com/avatar.jpg',
      },
      content: {
        type: 'video',
        title: ' 精彩航拍视频 ',
        description: '发布于三亚海滩',
        cover: '//p3.douyinpic.com/cover.jpg',
        duration: 35,
      },
      media: [
        {
          type: 'video',
          url: '//v3-dy-y.zjcdn.com/video.mp4',
          quality: '1080P',
        },
      ],
    };

    const res = normalizeResult(raw, 'douyin-native-primary', 'req-001', 280);

    expect(res.success).toBe(true);
    expect(res.requestId).toBe('req-001');
    expect(res.platform).toBe('douyin');
    expect(res.author?.name).toBe('极客测试员');
    expect(res.author?.avatar).toBe('https://p3.douyinpic.com/avatar.jpg');
    expect(res.content.cover).toBe('https://p3.douyinpic.com/cover.jpg');
    expect(res.content.title).toBe('精彩航拍视频');
    expect(res.media[0].url).toBe('https://v3-dy-y.zjcdn.com/video.mp4');
    expect(res.media[0].direct).toBe(true);
    expect(res.provider.latencyMs).toBe(280);
    expect(res.provider.id).toBe('douyin-native-primary');
  });

  it('清洗非法文件名字符', async () => {
    const { sanitizeFilename } = await import('../../worker/core/normalize');
    expect(sanitizeFilename('a/b:c*.mp4')).toBe('a_b_c_.mp4');
  });
});