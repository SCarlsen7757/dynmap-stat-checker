import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';
import type { HistoryPoint } from '../shared/types.js';
import { historyResolutionSeconds } from './history.js';
import type { QueueHistoryStore, QueueSample } from './history.js';

const cleanupIntervalMs = 24 * 60 * 60 * 1000;

interface HistoryRow extends QueryResultRow {
  observedAt: Date;
  total: string;
  maxTotal: string;
}

export class PostgresHistoryStore implements QueueHistoryStore {
  private readonly pool: Pool;
  private lastCleanupAt = 0;

  constructor(connectionString: string, private readonly retentionDays: number) {
    this.pool = new Pool({ connectionString, max: 5 });
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS queue_samples (
        observed_at timestamptz PRIMARY KEY,
        base_queue_tiles integer NOT NULL CHECK (base_queue_tiles >= 0),
        zoom_queue_tiles integer NOT NULL CHECK (zoom_queue_tiles >= 0)
      )
    `);
    await this.cleanup(Date.now());
  }

  async add(sample: QueueSample): Promise<void> {
    await this.pool.query(
      `INSERT INTO queue_samples (observed_at, base_queue_tiles, zoom_queue_tiles)
       VALUES ($1, $2, $3)
       ON CONFLICT (observed_at) DO UPDATE SET
         base_queue_tiles = EXCLUDED.base_queue_tiles,
         zoom_queue_tiles = EXCLUDED.zoom_queue_tiles`,
      [sample.observedAt, sample.tileUpdates, sample.zoomOut],
    );

    const now = Date.now();
    if (now - this.lastCleanupAt >= cleanupIntervalMs) await this.cleanup(now);
  }

  async get(days: number, now = Date.now()): Promise<HistoryPoint[]> {
    const resolutionSeconds = historyResolutionSeconds(days);
    const from = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(now).toISOString();
    const result = await this.pool.query<HistoryRow>(`
      WITH bucketed AS (
        SELECT
          date_bin($1 * interval '1 second', observed_at, timestamptz '1970-01-01 00:00:00+00') AS bucket_start,
          observed_at,
          base_queue_tiles::bigint + zoom_queue_tiles::bigint AS total
        FROM queue_samples
        WHERE observed_at >= $2::timestamptz AND observed_at <= $3::timestamptz
      ), ranked AS (
        SELECT
          bucket_start,
          total,
          max(total) OVER (PARTITION BY bucket_start) AS max_total,
          row_number() OVER (PARTITION BY bucket_start ORDER BY observed_at DESC) AS row_number
        FROM bucketed
      )
      SELECT bucket_start AS "observedAt", total, max_total AS "maxTotal"
      FROM ranked
      WHERE row_number = 1
      ORDER BY bucket_start
    `, [resolutionSeconds, from, to]);

    return result.rows.map((row) => ({
      observedAt: row.observedAt.toISOString(),
      total: Number(row.total),
      maxTotal: Number(row.maxTotal),
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async cleanup(now: number): Promise<void> {
    const cutoff = new Date(now - this.retentionDays * 24 * 60 * 60 * 1000).toISOString();
    await this.pool.query('DELETE FROM queue_samples WHERE observed_at < $1::timestamptz', [cutoff]);
    this.lastCleanupAt = now;
  }
}
