import { describe, it, expect } from 'vitest';
import { isPrivateIp, isHostAllowed, validateAndSanitizeUrl } from '../../worker/core/security';
import { AppError } from '../../worker/core/errors';

describe('Security & SSRF 防护测试', () => {
  it('正确识别并拦截所有内网/保留 IP', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('localhost')).toBe(true);
    expect(isPrivateIp('192.168.1.100')).toBe(true);
    expect(isPrivateIp('10.254.1.1')).toBe(true);
    expect(isPrivateIp('172.20.1.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true); // 云服务元数据地址
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('douyin.com')).toBe(false);
  });

  it('正确校验白名单允许的媒体域名', () => {
    expect(isHostAllowed('v.douyin.com')).toBe(true);
    expect(isHostAllowed('www.bilibili.com')).toBe(true);
    expect(isHostAllowed('b23.tv')).toBe(true);
    expect(isHostAllowed('xhslink.com')).toBe(true);
    expect(isHostAllowed('evil-phishing-site.com')).toBe(false);
    expect(isHostAllowed('192.168.1.1')).toBe(false);
  });

  it('能从用户黏贴的各种口令杂乱文本中抽取出真实链接', () => {
    const raw = '7.12 复制打开抖音，看看【科技阿杰的作品】 https://v.douyin.com/iJyPabc/ 12/28 复制此链接';
    const parsed = validateAndSanitizeUrl(raw);
    expect(parsed.hostname).toBe('v.douyin.com');
    expect(parsed.pathname).toBe('/iJyPabc/');
  });

  it('支持紧贴中文的分享口令和无协议短链', () => {
    const glued = validateAndSanitizeUrl('打开抖音看看https://v.douyin.com/iJyPabc/复制此链接');
    expect(glued.hostname).toBe('v.douyin.com');
    expect(glued.pathname).toBe('/iJyPabc/');

    const xhs = '阿茶发布了一篇小红书笔记，快来看吧！http://xhslink.com/a/AbC123 ，复制本条信息打开小红书';
    expect(validateAndSanitizeUrl(xhs).hostname).toBe('xhslink.com');

    const bare = '分享一条 b23.tv/BV1xx411c7mD 给你';
    expect(validateAndSanitizeUrl(bare).hostname).toBe('b23.tv');
  });

  it('非法协议或恶意地址抛出 INVALID_URL AppError', () => {
    expect(() => validateAndSanitizeUrl('file:///etc/passwd')).toThrow(AppError);
    expect(() => validateAndSanitizeUrl('http://127.0.0.1/admin')).toThrow(AppError);
  });

  it('拦截 Cobalt 上游指向内网', async () => {
    const { assertSafeUpstream } = await import('../../worker/core/security');
    expect(() => assertSafeUpstream('http://127.0.0.1:9000')).toThrow(AppError);
    expect(assertSafeUpstream('https://api.example.com').hostname).toBe('api.example.com');
  });

  it('isDomainMatch 严格防止形如 douyin.com.evil.com 或 evil-bilibili.com 的域名伪造绕过', async () => {
    const { isDomainMatch } = await import('../../worker/core/security');
    expect(isDomainMatch('v.douyin.com', 'douyin.com')).toBe(true);
    expect(isDomainMatch('douyin.com', 'douyin.com')).toBe(true);
    expect(isDomainMatch('iesdouyin.com', 'iesdouyin.com')).toBe(true);
    expect(isDomainMatch('douyin.com.evil.com', 'douyin.com')).toBe(false);
    expect(isDomainMatch('evildouyin.com', 'douyin.com')).toBe(false);
    expect(isDomainMatch('not-bilibili.com', 'bilibili.com')).toBe(false);
  });
});