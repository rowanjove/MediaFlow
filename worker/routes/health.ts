import type { ProviderRouter } from '../core/router';

export function handleHealth(router: ProviderRouter): Response {
  const providers = router.getAllRegisteredProviders();
  const summary: Record<string, string> = {};
  let degraded = 0;

  for (const p of providers) {
    const isCircuitOpen =
      p.stats.circuitOpenUntil && p.stats.circuitOpenUntil > Date.now();
    if (isCircuitOpen) {
      summary[p.id] = 'degraded';
      degraded++;
    } else if (p.stats.consecutiveFailures > 0) {
      summary[p.id] = 'warning';
    } else {
      summary[p.id] = 'healthy';
    }
  }

  return new Response(
    JSON.stringify({
      status: degraded > 0 ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      providers: summary,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
