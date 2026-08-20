import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const required = { RCON_HOST: 'minecraft', RCON_PASSWORD: 'secret', DATABASE_URL: 'postgresql://dynmap:secret@postgres/dynmap' };

describe('loadConfig', () => {
  it('uses documented defaults', () => {
    const config = loadConfig(required);
    expect(config.pollIntervalSeconds).toBe(15);
    expect(config.historyDays).toBe(30);
  });

  it('requires a direct RCON_PASSWORD', () => {
    expect(() => loadConfig({ RCON_HOST: 'minecraft', DATABASE_URL: required.DATABASE_URL })).toThrow('RCON_PASSWORD is required');
  });

  it('requires a PostgreSQL connection string', () => {
    expect(() => loadConfig({ RCON_HOST: 'minecraft', RCON_PASSWORD: 'secret' })).toThrow('DATABASE_URL is required');
    expect(() => loadConfig({ ...required, DATABASE_URL: 'mysql://database/dynmap' })).toThrow('DATABASE_URL must be a PostgreSQL connection string');
  });

  it('validates retention bounds', () => {
    expect(() => loadConfig({ ...required, HISTORY_DAYS: '3651' })).toThrow();
    expect(loadConfig({ ...required, HISTORY_DAYS: '1827' }).historyDays).toBe(1827);
  });
});
