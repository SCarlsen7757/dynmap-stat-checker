import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppConfig } from './config.js';
import type { StatsService } from './stats-service.js';

export interface AppDependencies {
  config: AppConfig;
  stats: StatsService;
  frontendPath?: string;
}

export async function createApp({ config, stats, frontendPath }: AppDependencies) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_request, reply) => {
    if (!stats.isReady()) return reply.code(503).send({ status: 'not-ready' });
    return { status: 'ready' };
  });
  app.get('/api/stats/latest', async () => stats.getLatest());
  app.get('/api/stats/history', async (request, reply) => {
    const raw = (request.query as { days?: string }).days;
    const days = Number(raw);
    if (!Number.isFinite(days) || days <= 0 || days > config.historyDays) {
      return reply.code(400).send({ error: `days must be greater than 0 and at most ${config.historyDays}` });
    }
    return stats.getHistory(days);
  });

  const clientRoot = frontendPath ?? resolve(process.cwd(), 'dist/client');
  if (existsSync(clientRoot)) {
    await app.register(fastifyStatic, { root: clientRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url === '/healthz' || request.url === '/readyz') {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
