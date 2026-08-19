import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { MinecraftRconClient } from './rcon.js';
import { StatsService } from './stats-service.js';

const config = loadConfig();
const client = new MinecraftRconClient({
  host: config.rconHost,
  port: config.rconPort,
  password: config.rconPassword,
  timeoutMs: config.rconTimeoutMs,
});
const stats = new StatsService(client, {
  pollIntervalSeconds: config.pollIntervalSeconds,
  historyHours: config.historyHours,
  password: config.rconPassword,
});
const app = await createApp({ config, stats });

const shutdown = async () => {
  await stats.stop();
  await app.close();
};
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

await app.listen({ host: '0.0.0.0', port: config.port });
stats.start();
