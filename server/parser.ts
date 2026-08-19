import type { DynmapSample, RenderCounters } from '../shared/types.js';

export class DynmapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DynmapParseError';
  }
}

function counters(match: RegExpMatchArray): RenderCounters {
  return {
    processed: Number(match[2]),
    rendered: Number(match[3]),
    updated: Number(match[4]),
    transparent: Number(match[5]),
  };
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
  const maps: DynmapSample['maps'] = [];
  const chunks: DynmapSample['chunks'] = [];
  const pause = { fullRadius: false, updates: false, zoomOut: false };
  let queue: DynmapSample['queue'] | null = null;
  let totals: RenderCounters | null = null;
  let activeRenderJobs: string[] = [];
  const responseCacheMatch = unformattedRaw.match(/Cache hit rate:\s*([\d.]+)%/i);
  let cacheHitRate: number | null = responseCacheMatch ? Number(responseCacheMatch[1]) : null;

  const statsPattern = /^(.+?):\s*processed=(\d+),\s*rendered=(\d+),\s*updated=(\d+),\s*transparent=(\d+)\s*$/i;

  for (const line of lines) {
    if (/Full\/Radius renders are PAUSED/i.test(line)) pause.fullRadius = true;
    if (/Update renders are PAUSED/i.test(line)) pause.updates = true;
    if (/Zoomout renders are PAUSED|Zoom-out renders are PAUSED/i.test(line)) pause.zoomOut = true;

    const queueMatch = line.match(/Triggered update queue size:\s*(\d+)(?:\s*\+\s*(\d+))?/i);
    if (queueMatch) {
      const tileUpdates = Number(queueMatch[1]);
      const zoomOut = Number(queueMatch[2] ?? 0);
      queue = { tileUpdates, zoomOut, total: tileUpdates + zoomOut };
      continue;
    }

    const statsMatch = line.match(statsPattern);
    if (statsMatch) {
      if (statsMatch[1]?.toUpperCase() === 'TOTALS') totals = counters(statsMatch);
      else maps.push({ id: statsMatch[1] ?? 'unknown', ...counters(statsMatch) });
      continue;
    }

    const jobsMatch = line.match(/^Active render jobs:\s*(.*)$/i);
    if (jobsMatch) {
      activeRenderJobs = (jobsMatch[1] ?? '').split(/\s*,\s*/).map((job) => job.trim()).filter(Boolean);
      continue;
    }

    const cacheMatch = line.match(/^Cache hit rate:\s*([\d.]+)%/i);
    if (cacheMatch) {
      cacheHitRate = Number(cacheMatch[1]);
      continue;
    }

    const chunkMatch = line.match(/^Chunks processed:\s*(.+?):\s*count=(\d+),\s*([\d.]+)\s*msec\/chunk/i);
    if (chunkMatch) {
      chunks.push({
        category: chunkMatch[1] ?? 'Unknown',
        count: Number(chunkMatch[2]),
        millisecondsPerChunk: Number(chunkMatch[3]),
      });
    }
  }

  if (!queue) throw new DynmapParseError('Dynmap response did not contain a tile queue');

  return { observedAt, queue, maps, totals, activeRenderJobs, pause, cacheHitRate, chunks, raw };
}
