import { describe, it, expect } from 'vitest';
import worker from '../../worker/index';

describe('Worker HTTP API 路由与鉴权测试', () => {
  it('OPTIONS 请求返回 CORS 允许响应头', async () => {
    const req = new Request('http://localhost/api/v1/parse', { method: 'OPTIONS' });
    const res = await worker.fetch(req, {}, {} as any);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('GET /health 返回各 Provider 健康概要', async () => {
    const req = new Request('http://localhost/health', { method: 'GET' });
    const res = await worker.fetch(req, {}, {} as any);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe('ok');
    expect(data.providers).toBeDefined();
    expect(data.providers['douyin-native-primary']).toBe('healthy');
    expect(data.providers['acfun-native']).toBe('healthy');
    expect(data.providers['qsmusic-native']).toBe('healthy');
  });

  it('GET /api/v1/platforms 返回所有支持平台及能力矩阵', async () => {
    const req = new Request('http://localhost/api/v1/platforms', { method: 'GET' });
    const res = await worker.fetch(req, {}, {} as any);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(Array.isArray(data.platforms)).toBe(true);
    expect(data.platforms.some((p: any) => p.id === 'douyin')).toBe(true);
    expect(data.platforms.some((p: any) => p.id === 'xiaohongshu')).toBe(true);
    expect(data.platforms.some((p: any) => p.id === 'bilibili')).toBe(true);
    expect(data.platforms.some((p: any) => p.id === 'youtube' && p.status === 'extended')).toBe(true);
    expect(data.platforms.find((p: any) => p.id === 'tiktok').status).toBe('beta');
    expect(data.platforms.length).toBeGreaterThanOrEqual(24);
    expect(data.platforms.some((p: any) => p.id === 'pipixia')).toBe(true);
    expect(data.platforms.some((p: any) => p.id === 'qsmusic')).toBe(true);
    expect(data.platforms.some((p: any) => p.id === 'acfun')).toBe(true);
  });

  it('POST /api/v1/parse 当未传入 url 时返回 400 校验错误', async () => {
    const req = new Request('http://localhost/api/v1/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await worker.fetch(req, {}, {} as any);
    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_URL');
  });

  it('GET /api/v1/admin/stats 未配置密钥时关闭管理接口', async () => {
    const req = new Request('http://localhost/api/v1/admin/stats', { method: 'GET' });
    const res = await worker.fetch(req, {}, {} as any);
    expect(res.status).toBe(503);
  });

  it('GET /api/v1/admin/stats 错误密钥被 401 拦截', async () => {
    const req = new Request('http://localhost/api/v1/admin/stats', {
      method: 'GET',
      headers: { Authorization: 'Bearer wrong' },
    });
    const res = await worker.fetch(req, { ADMIN_SECRET: 'test-admin-secret' }, {} as any);
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/admin/stats 携带正确密钥成功返回管理指标', async () => {
    const req = new Request('http://localhost/api/v1/admin/stats', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-admin-secret' },
    });
    const res = await worker.fetch(req, { ADMIN_SECRET: 'test-admin-secret' }, {} as any);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.data.providers).toBeDefined();
  });

  it('GET /api/v1/admin/stats 拒绝通过 URL Query 参数传递管理密钥', async () => {
    const req = new Request('http://localhost/api/v1/admin/stats?key=test-admin-secret', {
      method: 'GET',
    });
    const res = await worker.fetch(req, { ADMIN_SECRET: 'test-admin-secret' }, {} as any);
    expect(res.status).toBe(401);
  });
});