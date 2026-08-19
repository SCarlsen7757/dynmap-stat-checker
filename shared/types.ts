export type ConnectionState = 'starting' | 'connected' | 'degraded' | 'disconnected';

export interface QueueStats {
  tileUpdates: number;
  zoomOut: number;
  total: number;
}

export interface RenderCounters {
  processed: number;
  rendered: number;
  updated: number;
  transparent: number;
}

export interface MapStats extends RenderCounters {
  id: string;
}

export interface ChunkStats {
  category: string;
  count: number;
  millisecondsPerChunk: number;
}

export interface PauseState {
  fullRadius: boolean;
  updates: boolean;
  zoomOut: boolean;
}

export interface DynmapSample {
  observedAt: string;
  queue: QueueStats;
  maps: MapStats[];
  totals: RenderCounters | null;
  activeRenderJobs: string[];
  pause: PauseState;
  cacheHitRate: number | null;
  chunks: ChunkStats[];
  raw: string;
}

export interface HistoryPoint extends QueueStats {
  observedAt: string;
}

export interface ConnectionStatus {
  state: ConnectionState;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  error: string | null;
  pollIntervalSeconds: number;
  historyHours: number;
}

export interface LatestResponse {
  connection: ConnectionStatus;
  sample: DynmapSample | null;
  queueDelta: number | null;
}

export interface HistoryResponse {
  hours: number;
  points: HistoryPoint[];
}
