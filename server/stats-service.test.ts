import { describe, expect, it, vi } from 'vitest';
import type { StatsClient } from './rcon.js';
import { StatsService } from './stats-service.js';

const response = (queue: string) => `TOTALS: processed=1, rendered=1, updated=1, transparent=0\nTriggered update queue size: ${queue}\nActive render jobs:`;

function client(executeStats: StatsClient['executeStats']): StatsClient {
  return { executeStats, disconnect: vi.fn(async () => undefined) };
}

describe('StatsService', () => {
  it('retains the last valid sample, reports deltas, and recovers after a failure', async () => {
    const executeStats = vi.fn()
      .mockResolvedValueOnce(response('10 + 2'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response('7 + 1'));
    const service = new StatsService(client(executeStats), { pollIntervalSeconds: 15, historyHours: 24, password: 'secret' });

    await service.pollNow();
    expect(service.getLatest().sample?.queue.total).toBe(12);
    await service.pollNow();
    expect(service.getLatest().connection.state).toBe('degraded');
    expect(service.getLatest().sample?.queue.total).toBe(12);
    await service.pollNow();
    expect(service.getLatest().connection.state).toBe('connected');
    expect(service.getLatest().queueDelta).toBe(-4);
  });

  it('redacts the configured password from surfaced errors', async () => {
    const service = new StatsService(client(async () => { throw new Error('auth bad-password failed'); }), {
      pollIntervalSeconds: 15, historyHours: 24, password: 'bad-password',
    });
    await service.pollNow();
    expect(JSON.stringify(service.getLatest())).not.toContain('bad-password');
    expect(service.getLatest().connection.error).toContain('[redacted]');
  });

  it('coalesces concurrent polls', async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { release = resolve; });
    const executeStats = vi.fn(() => pending);
    const service = new StatsService(client(executeStats), { pollIntervalSeconds: 15, historyHours: 24, password: 'x' });
    const first = service.pollNow();
    const second = service.pollNow();
    release(response('1'));
    await Promise.all([first, second]);
    expect(executeStats).toHaveBeenCalledTimes(1);
  });
});
