import { describe, expect, it } from 'vitest';
import { DynmapParseError, parseDynmapStats } from './parser.js';

const currentResponse = `Tile Render Statistics:
  world.surface: processed=120, rendered=100, updated=80, transparent=2
  world_nether.flat: processed=20, rendered=18, updated=10, transparent=1
  TOTALS: processed=140, rendered=118, updated=90, transparent=3
  Triggered update queue size: 121 + 22276
  Active render jobs: world, world_nether
Chunk Loading Statistics:
  Cache hit rate: 64.15%
  Chunks processed: Cached: count=170, 0.00 msec/chunk
  Chunks processed: Load Required: count=18, 2.41 msec/chunk`;

describe('parseDynmapStats', () => {
  it('parses the dashboard values from a modern response', () => {
    const sample = parseDynmapStats(currentResponse, '2026-01-01T00:00:00.000Z');
    expect(sample.queue).toEqual({ tileUpdates: 121, zoomOut: 22276, total: 22397 });
    expect(sample.activeRenderJobCount).toBe(2);
    expect(sample.cacheHitRate).toBe(64.15);
    expect(sample.observedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('supports legacy single-value queues, formatting codes, and log prefixes', () => {
    const sample = parseDynmapStats(`[12:00:00 INFO]: §aFull/Radius renders are PAUSED
[12:00:00 INFO]: Update renders are PAUSED
[12:00:00 INFO]: Zoom-out renders are PAUSED
[12:00:00 INFO]: Triggered update queue size: 42
[12:00:00 INFO]: Active render jobs:`);
    expect(sample.queue).toEqual({ tileUpdates: 42, zoomOut: 0, total: 42 });
    expect(sample.activeRenderJobCount).toBe(0);
  });

  it('parses dashboard values from a multi-packet-sized response', () => {
    const raw = `${currentResponse}\n${'unknown diagnostic line\n'.repeat(300)}`;
    expect(raw.length).toBeGreaterThan(4096);
    expect(parseDynmapStats(raw).queue.total).toBe(22397);
  });

  it('finds the cache hit rate when RCON returns the response on one line', () => {
    const sample = parseDynmapStats('Tile Render Statistics:  world.flat: processed=1, rendered=1, updated=1, transparent=0  TOTALS: processed=1, rendered=1, updated=1, transparent=0  Triggered update queue size: 118 + 2466315  Active render jobs: Chunk Loading Statistics:  Cache hit rate: 4.91%  Chunks processed: Cached: count=16442988, 0.00 msec/chunk');
    expect(sample.cacheHitRate).toBe(4.91);
  });

  it('rejects responses without a queue instead of recording corrupt history', () => {
    expect(() => parseDynmapStats('Unknown command')).toThrow(DynmapParseError);
  });
});
