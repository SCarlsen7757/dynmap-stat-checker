import { describe, expect, it, vi } from 'vitest';
import type { QueueHistoryStore } from './history.js';
import type { StatsClient } from './rcon.js';
import { StatsService } from './stats-service.js';

const response = (queue: string) => `TOTALS: processed=1, rendered=1, updated=1, transparent=0\nTriggered update queue size: ${queue}\nActive render jobs:`;

function client(executeStats: StatsClient['executeStats']): StatsClient {
  return { executeStats, disconnect: vi.fn(async () => undefined) };
}

function history(overrides: Partial<QueueHistoryStore> = {}): QueueHistoryStore {
  return {
    initialize: vi.fn(async () => undefined),
    add: vi.fn(async () => undefined),
    get: vi.fn(async () => []),
    close: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('StatsService', () => {
  it('retains the last valid sample, reports deltas, and recovers after a failure', async () => {
    const executeStats = vi.fn()
      .mockResolvedValueOnce(response('10 + 2'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(response('7 + 1'));
    const store = history();
    const service = new StatsService(client(executeStats), store, { pollIntervalSeconds: 15, historyDays: 30, password: 'secret' });

    await service.pollNow();
    expect(service.getLatest().sample?.queue.total).toBe(12);
    await service.pollNow();
    expect(service.getLatest().connection.state).toBe('degraded');
    expect(service.getLatest().sample?.queue.total).toBe(12);
    await service.pollNow();
    expect(service.getLatest().connection.state).toBe('connected');
    expect(service.getLatest().sample?.queue.total).toBe(8);
    expect(store.add).toHaveBeenCalledTimes(2);
  });

  it('redacts the configured password from surfaced errors', async () => {
    const service = new StatsService(client(async () => { throw new Error('auth bad-password failed'); }), history(), {
      pollIntervalSeconds: 15, historyDays: 30, password: 'bad-password',
    });
    await service.pollNow();
    expect(JSON.stringify(service.getLatest())).not.toContain('bad-password');
    expect(service.getLatest().connection.error).toContain('[redacted]');
  });

  it('coalesces concurrent polls', async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { release = resolve; });
    const executeStats = vi.fn(() => pending);
    const service = new StatsService(client(executeStats), history(), { pollIntervalSeconds: 15, historyDays: 30, password: 'x' });
    const first = service.pollNow();
    const second = service.pollNow();
    release(response('1'));
    await Promise.all([first, second]);
    expect(executeStats).toHaveBeenCalledTimes(1);
  });

  it('does not publish a sample that could not be persisted', async () => {
    const service = new StatsService(client(async () => response('10 + 2')), history({
      add: vi.fn(async () => { throw new Error('database unavailable'); }),
    }), { pollIntervalSeconds: 15, historyDays: 30, password: 'x' });

    await service.pollNow();
    expect(service.getLatest().sample).toBeNull();
    expect(service.getLatest().connection).toMatchObject({ state: 'disconnected', error: 'database unavailable' });
  });
});
