import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('uses documented defaults', () => {
    const config = loadConfig({ RCON_HOST: 'minecraft', RCON_PASSWORD: 'secret' });
    expect(config.pollIntervalSeconds).toBe(15);
    expect(config.historyHours).toBe(24);
  });

  it('requires a direct RCON_PASSWORD', () => {
    expect(() => loadConfig({ RCON_HOST: 'minecraft' })).toThrow('RCON_PASSWORD is required');
  });

  it('validates retention bounds', () => {
    expect(() => loadConfig({ RCON_HOST: 'minecraft', RCON_PASSWORD: 'x', HISTORY_HOURS: '169' })).toThrow();
  });
});
