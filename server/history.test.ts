import { describe, expect, it } from 'vitest';
import { historyResolutionSeconds } from './history.js';

describe('historyResolutionSeconds', () => {
  it('uses five-minute buckets through two days and hourly buckets for longer ranges', () => {
    expect(historyResolutionSeconds(1)).toBe(300);
    expect(historyResolutionSeconds(2)).toBe(300);
    expect(historyResolutionSeconds(7)).toBe(3600);
  });
});
