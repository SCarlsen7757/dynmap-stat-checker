import type { HistoryPoint } from '../shared/types.js';

export class HistoryStore {
  private readonly points: HistoryPoint[] = [];

  constructor(private readonly retentionHours: number) {}

  add(point: HistoryPoint): void {
    this.points.push(point);
    this.prune(Date.parse(point.observedAt));
  }

  get(hours: number, now = Date.now()): HistoryPoint[] {
    const cutoff = now - hours * 60 * 60 * 1000;
    return this.points.filter((point) => Date.parse(point.observedAt) >= cutoff);
  }

  latestPair(): [HistoryPoint | undefined, HistoryPoint | undefined] {
    return [this.points.at(-2), this.points.at(-1)];
  }

  private prune(now: number): void {
    const cutoff = now - this.retentionHours * 60 * 60 * 1000;
    let removeCount = 0;
    while (removeCount < this.points.length && Date.parse(this.points[removeCount]!.observedAt) < cutoff) {
      removeCount += 1;
    }
    if (removeCount) this.points.splice(0, removeCount);
  }
}
