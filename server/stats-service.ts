import type { ConnectionStatus, DynmapSample, HistoryResponse, LatestResponse } from '../shared/types.js';
import { historyResolutionSeconds } from './history.js';
import type { QueueHistoryStore } from './history.js';
import { parseDynmapStats } from './parser.js';
import type { StatsClient } from './rcon.js';

export interface StatsServiceOptions {
  pollIntervalSeconds: number;
  historyDays: number;
  password: string;
}

export class StatsService {
  private latest: DynmapSample | null = null;
  private status: ConnectionStatus;
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private pollPromise: Promise<void> | null = null;

  constructor(private readonly client: StatsClient, private readonly history: QueueHistoryStore, private readonly options: StatsServiceOptions) {
    this.status = {
      state: 'starting', lastAttemptAt: null, lastSuccessAt: null, error: null,
      pollIntervalSeconds: options.pollIntervalSeconds, historyDays: options.historyDays,
    };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.runLoop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.pollPromise?.catch(() => undefined);
    await Promise.all([this.client.disconnect(), this.history.close()]);
  }

  async pollNow(): Promise<void> {
    if (this.pollPromise) return this.pollPromise;
    this.pollPromise = this.poll().finally(() => { this.pollPromise = null; });
    return this.pollPromise;
  }

  getLatest(): LatestResponse {
    return {
      connection: { ...this.status },
      sample: this.latest,
    };
  }

  async getHistory(days: number, now = Date.now()): Promise<HistoryResponse> {
    return {
      days,
      from: new Date(now - days * 24 * 60 * 60 * 1000).toISOString(),
      to: new Date(now).toISOString(),
      resolutionSeconds: historyResolutionSeconds(days),
      points: await this.history.get(days, now),
    };
  }

  isReady(now = Date.now()): boolean {
    if (!this.status.lastSuccessAt) return false;
    const maxAge = Math.max(this.options.pollIntervalSeconds * 2, 60) * 1000;
    return now - Date.parse(this.status.lastSuccessAt) <= maxAge;
  }

  private async runLoop(): Promise<void> {
    await this.pollNow();
    if (!this.stopped) {
      this.timer = setTimeout(() => void this.runLoop(), this.options.pollIntervalSeconds * 1000);
    }
  }

  private async poll(): Promise<void> {
    const attemptedAt = new Date().toISOString();
    this.status.lastAttemptAt = attemptedAt;
    try {
      const raw = await this.client.executeStats();
      const sample = parseDynmapStats(raw, new Date().toISOString());
      await this.history.add({ observedAt: sample.observedAt, ...sample.queue });
      this.latest = sample;
      this.status = { ...this.status, state: 'connected', lastSuccessAt: sample.observedAt, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown RCON failure';
      const safeMessage = this.options.password ? message.replaceAll(this.options.password, '[redacted]') : message;
      this.status = {
        ...this.status,
        state: this.latest ? 'degraded' : 'disconnected',
        error: safeMessage.slice(0, 240),
      };
    }
  }
}
