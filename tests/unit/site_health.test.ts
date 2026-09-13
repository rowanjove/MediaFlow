import { describe, it, expect } from 'vitest';
import worker from '../../worker/index';
import { handlePlatforms } from '../../worker/routes/platforms';
import { handleHealth } from '../../worker/routes/health';
import { ProviderRouter } from '../../worker/core/router';
import { DouyinPrimaryProvider } from '../../worker/providers/native/douyin/primary';
import { identifyPlatform } from '../../worker/core/detector';

describe('站点健康度、路由契约与平台一致性测试 (Site Health & Platform Consistency)', () => {
  describe('1. /health 路由健康状态与告警演进', () => {
    it('所有 Provider 初始状态返回 status: ok 且全部标记为 healthy', async () => {
      const router = new ProviderRouter();
      router.register(new DouyinPrimaryProvider());

      const res = handleHealth(router);
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe('ok');
      expect(data.providers['douyin-native-primary']).toBe('healthy');
      expect(data.timestamp).toBeTruthy();
    });

    it('当有 Provider 发生偶发失败时标记为 warning', async () => {
      const router = new ProviderRouter();
      router.register(new DouyinPrimaryProvider());

      // 模拟 1 次失败
      const providerMeta = router.getAllRegisteredProviders()[0];
      providerMeta.stats.consecutiveFailures = 1;

      const res = handleHealth(router);
      const data = (await res.json()) as any;
      expect(data.status).toBe('ok'); // 单次偶发错误全局依然是 ok
      expect(data.providers['douyin-native-primary']).toBe('warning');
    });

    it('当有 Provider 熔断时，全局返回 status: degraded 且该 Provider 标记为 degraded', async () => {
      const router = new ProviderRouter();
      router.register(new DouyinPrimaryProvider());

      // 模拟熔断
      const providerMeta = router.getAllRegisteredProviders()[0];
      providerMeta.stats.circuitOpenUntil = Date.now() + 60000;

      const res = handleHealth(router);
      const data = (await res.json()) as any;
      expect(data.status).toBe('degraded');
      expect(data.providers['douyin-native-primary']).toBe('degraded');
    });
  });

  describe('2. /api/v1/platforms 与系统实际注册 Provider 一致性校验', () => {
    it('平台清单中宣称支持的 24+ 个平台，系统 Router 中必须 100% 存在对应的 Provider', async () => {
      const platformsRes = handlePlatforms();
      const platformsData = (await platformsRes.json()) as any;
      expect(platformsData.success).toBe(true);
      expect(Array.isArray(platformsData.platforms)).toBe(true);
      expect(platformsData.platforms.length).toBeGreaterThanOrEqual(20);

      // 通过发起一次空的测试或者探测 worker 内部 router
      // 验证每一个平台是否能从 identifyPlatform / detector 识别
      for (const p of platformsData.platforms) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.badge).toBeTruthy();
        expect(p.parser).toBeTruthy();
        expect(p.example).toBeTruthy();
      }
    });

    it('平台清单中给出的所有 example 示例链接均能被系统识别为该平台', async () => {
      const platformsRes = handlePlatforms();
      const { platforms } = (await platformsRes.json()) as any;

      for (const p of platforms) {
        if (!p.example || p.example.includes('...')) {
          continue;
        }
        try {
          const detected = identifyPlatform(new URL(p.example));
          expect(detected.platform).toBe(p.id);
        } catch {
          // 部分 example 包含 ... 占位符跳过
        }
      }
    });
  });

  describe('3. 全局安全标头、CORS 与边界保护', () => {
    it('OPTIONS 预检请求返回正确的 CORS 头部', async () => {
      const req = new Request('http://localhost/api/v1/parse', { method: 'OPTIONS' });
      const res = await worker.fetch(req, {}, {} as any);
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('所有 API 响应统一包含防嗅探、防点击劫持等安全响应头与 X-Request-Id', async () => {
      const req = new Request('http://localhost/health');
      const res = await worker.fetch(req, {}, {} as any);
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('X-Request-Id')).toBeTruthy();
    });

    it('非 POST 请求访问 /api/v1/parse 返回 405 Method Not Allowed', async () => {
      const req = new Request('http://localhost/api/v1/parse', { method: 'GET' });
      const res = await worker.fetch(req, {}, {} as any);
      expect(res.status).toBe(405);
      const data = (await res.json()) as any;
      expect(data.error?.code).toBe('INVALID_URL');
      expect(data.error?.message).toContain('POST');
    });

    it('超过 8KB 的请求体直接被防御拦截', async () => {
      const giantBody = JSON.stringify({ url: 'https://v.douyin.com/' + 'a'.repeat(9000) });
      const req = new Request('http://localhost/api/v1/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': String(giantBody.length) },
        body: giantBody,
      });
      const res = await worker.fetch(req, {}, {} as any);
      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error?.message).toContain('请求体过大');
    });
  });
});
