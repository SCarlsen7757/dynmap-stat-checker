export type ConnectionState = 'starting' | 'connected' | 'degraded' | 'disconnected';

export interface QueueStats {
  tileUpdates: number;
  zoomOut: number;
  total: number;
}

export interface DynmapSample {
  observedAt: string;
  queue: QueueStats;
  activeRenderJobCount: number;
  cacheHitRate: number | null;
}

export interface HistoryPoint {
  observedAt: string;
  total: number;
  maxTotal: number;
}

export interface ConnectionStatus {
  state: ConnectionState;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  error: string | null;
  pollIntervalSeconds: number;
  historyDays: number;
}

export interface LatestResponse {
  connection: ConnectionStatus;
  sample: DynmapSample | null;
}

export interface HistoryResponse {
  days: number;
  from: string;
  to: string;
  resolutionSeconds: number;
  points: HistoryPoint[];
}
