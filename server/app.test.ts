import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import type { AppConfig } from './config.js';
import type { StatsService } from './stats-service.js';

const config: AppConfig = {
  rconHost: 'minecraft', rconPort: 25575, rconPassword: 'never-return-this',
  pollIntervalSeconds: 15, historyHours: 24, rconTimeoutMs: 5000, port: 3000,
};
const apps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

function fakeStats(ready = true) {
  return {
    isReady: vi.fn(() => ready),
    getLatest: vi.fn(() => ({ connection: { state: 'starting', lastAttemptAt: null, lastSuccessAt: null, error: null, pollIntervalSeconds: 15, historyHours: 24 }, sample: null, queueDelta: null })),
    getHistory: vi.fn((hours: number) => ({ hours, points: [] })),
  } as unknown as StatsService;
}

describe('HTTP API', () => {
  it('provides liveness independently from readiness', async () => {
    const app = await createApp({ config, stats: fakeStats(false) }); apps.push(app);
    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/readyz' })).statusCode).toBe(503);
  });

  it('validates history range', async () => {
    const app = await createApp({ config, stats: fakeStats() }); apps.push(app);
    expect((await app.inject({ url: '/api/stats/history?hours=0.25' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/stats/history?hours=6' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/stats/history?hours=25' })).statusCode).toBe(400);
  });

  it('never exposes the configured password', async () => {
    const app = await createApp({ config, stats: fakeStats() }); apps.push(app);
    const response = await app.inject({ url: '/api/stats/latest' });
    expect(response.body).not.toContain(config.rconPassword);
  });
});
