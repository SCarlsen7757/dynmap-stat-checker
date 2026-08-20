import type { DynmapSample } from '../shared/types.js';

export class DynmapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DynmapParseError';
  }
}

function cleanLine(line: string): string {
  return line
    .replace(/\u00a7[0-9A-FK-OR]/gi, '')
    .replace(/^(?:\[[^\]]+\]\s*)+(?::\s*)?/, '')
    .replace(/^\s*(?:INFO|WARN|ERROR)\s*:?\s*/i, '')
    .trim();
}

export function parseDynmapStats(raw: string, observedAt = new Date().toISOString()): DynmapSample {
  const unformattedRaw = raw.replace(/\u00a7[0-9A-FK-OR]/gi, '');
  const lines = unformattedRaw.replace(/\r/g, '').split('\n').map(cleanLine).filter(Boolean);
  let queue: DynmapSample['queue'] | null = null;
  let activeRenderJobCount = 0;
  const responseCacheMatch = unformattedRaw.match(/Cache hit rate:\s*([\d.]+)%/i);
  let cacheHitRate: number | null = responseCacheMatch ? Number(responseCacheMatch[1]) : null;

  for (const line of lines) {
    const queueMatch = line.match(/Triggered update queue size:\s*(\d+)(?:\s*\+\s*(\d+))?/i);
    if (queueMatch) {
      const tileUpdates = Number(queueMatch[1]);
      const zoomOut = Number(queueMatch[2] ?? 0);
      queue = { tileUpdates, zoomOut, total: tileUpdates + zoomOut };
      continue;
    }

    const jobsMatch = line.match(/^Active render jobs:\s*(.*)$/i);
    if (jobsMatch) {
      activeRenderJobCount = (jobsMatch[1] ?? '').split(/\s*,\s*/).filter((job) => job.trim()).length;
      continue;
    }

    const cacheMatch = line.match(/^Cache hit rate:\s*([\d.]+)%/i);
    if (cacheMatch) {
      cacheHitRate = Number(cacheMatch[1]);
    }
  }

  if (!queue) throw new DynmapParseError('Dynmap response did not contain a tile queue');

  return { observedAt, queue, activeRenderJobCount, cacheHitRate };
}
