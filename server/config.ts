export interface AppConfig {
  rconHost: string;
  rconPort: number;
  rconPassword: string;
  pollIntervalSeconds: number;
  historyHours: number;
  rconTimeoutMs: number;
  port: number;
}

function required(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

function integer(name: string, raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    rconHost: required('RCON_HOST', env.RCON_HOST),
    rconPort: integer('RCON_PORT', env.RCON_PORT, 25575, 1, 65535),
    rconPassword: required('RCON_PASSWORD', env.RCON_PASSWORD),
    pollIntervalSeconds: integer('POLL_INTERVAL_SECONDS', env.POLL_INTERVAL_SECONDS, 15, 5, 3600),
    historyHours: integer('HISTORY_HOURS', env.HISTORY_HOURS, 24, 1, 168),
    rconTimeoutMs: integer('RCON_TIMEOUT_MS', env.RCON_TIMEOUT_MS, 5000, 1000, 30000),
    port: integer('PORT', env.PORT, 3000, 1, 65535),
  };
}
