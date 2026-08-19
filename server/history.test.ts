import { describe, expect, it } from 'vitest';
import { HistoryStore } from './history.js';

describe('HistoryStore', () => {
  it('prunes samples outside configured retention and filters requested ranges', () => {
    const store = new HistoryStore(1);
    store.add({ observedAt: '2026-01-01T00:00:00.000Z', tileUpdates: 3, zoomOut: 0, total: 3 });
    store.add({ observedAt: '2026-01-01T01:01:00.000Z', tileUpdates: 2, zoomOut: 0, total: 2 });
    store.add({ observedAt: '2026-01-01T01:30:00.000Z', tileUpdates: 1, zoomOut: 0, total: 1 });

    expect(store.get(1, Date.parse('2026-01-01T01:30:00.000Z'))).toHaveLength(2);
    expect(store.get(0.25, Date.parse('2026-01-01T01:30:00.000Z'))).toHaveLength(1);
  });
});
