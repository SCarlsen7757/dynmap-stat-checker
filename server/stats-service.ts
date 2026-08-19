import type { ConnectionStatus, DynmapSample, HistoryResponse, LatestResponse } from '../shared/types.js';
import { HistoryStore } from './history.js';
import { parseDynmapStats } from './parser.js';
import type { StatsClient } from './rcon.js';

export interface StatsServiceOptions {
  pollIntervalSeconds: number;
  historyHours: number;
  password: string;
}

export class StatsService {
  private readonly history: HistoryStore;
  private latest: DynmapSample | null = null;
  private status: ConnectionStatus;
  private timer: NodeJS.Timeout | null = null;
  private stopped = true;
  private pollPromise: Promise<void> | null = null;

  constructor(private readonly client: StatsClient, private readonly options: StatsServiceOptions) {
    this.history = new HistoryStore(options.historyHours);
    this.status = {
      state: 'starting', lastAttemptAt: null, lastSuccessAt: null, error: null,
      pollIntervalSeconds: options.pollIntervalSeconds, historyHours: options.historyHours,
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
    await this.client.disconnect();
  }

  async pollNow(): Promise<void> {
    if (this.pollPromise) return this.pollPromise;
    this.pollPromise = this.poll().finally(() => { this.pollPromise = null; });
    return this.pollPromise;
  }

  getLatest(): LatestResponse {
    const [previous, current] = this.history.latestPair();
    return {
      connection: { ...this.status },
      sample: this.latest,
      queueDelta: previous && current ? current.total - previous.total : null,
    };
  }

  getHistory(hours: number): HistoryResponse {
    return { hours, points: this.history.get(hours) };
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
      this.latest = sample;
      this.history.add({ observedAt: sample.observedAt, ...sample.queue });
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
