import type { HistoryPoint, QueueStats } from '../shared/types.js';

export type QueueSample = QueueStats & { observedAt: string };

export interface QueueHistoryStore {
  initialize(): Promise<void>;
  add(sample: QueueSample): Promise<void>;
  get(days: number, now?: number): Promise<HistoryPoint[]>;
  close(): Promise<void>;
}

export function historyResolutionSeconds(days: number): number {
  return days <= 2 ? 5 * 60 : 60 * 60;
}
