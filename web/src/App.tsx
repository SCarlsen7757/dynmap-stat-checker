import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { DynmapSample, HistoryPoint, HistoryResponse, LatestResponse } from '../../shared/types';

const number = new Intl.NumberFormat('da-DK');
const historyAnchors = [1, 2, 7, 14, 30];
const maximumChartRows = 48;
const chartGlyphHeightFactor = 1.1;
const chartBandCounts = [4, 5] as const;

export function buildHistoryRanges(retentionDays: number) {
  const values = [...historyAnchors.filter((days) => days <= retentionDays), retentionDays];
  return [...new Set(values)].sort((left, right) => left - right).map((days) => ({ days, label: `${days}d` }));
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Dashboard API returned ${response.status}`);
  return response.json() as Promise<T>;
}

function formatTime(value: string | null): string {
  if (!value) return 'waiting for first sample';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
}

function stateLabel(response: LatestResponse | null): string {
  if (!response) return 'CONNECTING';
  return response.connection.state.toUpperCase();
}

export function RollingNumber({ value, duration = 2000 }: { value: number | null; duration?: number }) {
  const [displayValue, setDisplayValue] = useState<number | null>(value === null ? null : 0);
  const displayedRef = useRef<number | null>(value === null ? null : 0);
  const previousTargetRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === null) {
      displayedRef.current = null;
      previousTargetRef.current = null;
      setDisplayValue(null);
      return;
    }

    const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || duration <= 0) {
      displayedRef.current = value;
      previousTargetRef.current = value;
      setDisplayValue(value);
      return;
    }

    const firstReading = previousTargetRef.current === null;
    const startValue = firstReading ? 0 : (displayedRef.current ?? previousTargetRef.current ?? 0);
    previousTargetRef.current = value;
    if (startValue === value) return;

    let frame = 0;
    let startedAt: number | null = null;
    const tick = (timestamp: number) => {
      startedAt ??= timestamp;
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(startValue + (value - startValue) * eased);
      displayedRef.current = next;
      setDisplayValue(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, value]);

  const rendered = displayValue === null ? '—' : number.format(displayValue);
  const finalLabel = value === null ? 'No value available' : number.format(value);
  return <span className="rolling-number" role="status" aria-atomic="true" aria-label={finalLabel}><span aria-hidden="true">{rendered}</span></span>;
}

type QueueDirection = 'up' | 'down';
type QueueChange = { direction: QueueDirection; revision: number; visible: boolean };

function useQueueDirection(value: number | null, observationKey?: string) {
  const previousRef = useRef<number | null>(null);
  const initializedRef = useRef(false);
  const [change, setChange] = useState<QueueChange | null>(null);

  useEffect(() => {
    if (value === null) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      previousRef.current = value;
      return;
    }

    const previous = previousRef.current;
    previousRef.current = value;
    if (previous === null) return;
    if (previous === value) {
      setChange((current) => current ? { ...current, visible: false } : null);
      return;
    }
    setChange((current) => ({ direction: value > previous ? 'up' : 'down', revision: (current?.revision ?? 0) + 1, visible: true }));
  }, [observationKey, value]);

  useEffect(() => {
    if (!change?.visible) return;
    const revision = change.revision;
    const timer = window.setTimeout(() => setChange((current) => current?.revision === revision ? { ...current, visible: false } : current), 2400);
    return () => window.clearTimeout(timer);
  }, [change?.revision, change?.visible]);

  return change;
}

function DirectionIndicator({ direction, total = false }: { direction: QueueDirection; total?: boolean }) {
  const label = direction === 'up' ? 'Queue increased' : 'Queue decreased';
  return <span className={`direction-indicator ${direction}${total ? ' total' : ''}`} role="img" aria-label={label}><span className="triangle" aria-hidden="true" /></span>;
}

function TotalQueueNumber({ value, observationKey }: { value: number | null; observationKey?: string }) {
  const change = useQueueDirection(value, observationKey);
  const numberRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = numberRef.current;
    if (!element || !change) return;
    const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    element.classList.remove('total-flash-up', 'total-flash-down');
    void element.offsetWidth;
    element.classList.add(`total-flash-${change.direction}`);
    const finish = () => element.classList.remove('total-flash-up', 'total-flash-down');
    element.addEventListener('animationend', finish, { once: true });
    return () => {
      element.removeEventListener('animationend', finish);
    };
  }, [change?.revision]);

  return (
    <span className="total-number-group">
      <strong ref={numberRef}><RollingNumber value={value} /></strong>
      {change?.visible && <DirectionIndicator direction={change.direction} total />}
    </span>
  );
}

export function QueueDelta({ value, observationKey }: { value: number | null; observationKey?: string }) {
  const previousVisibleValueRef = useRef<number | null>(null);
  const [delta, setDelta] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');

  useEffect(() => {
    const handleVisibilityChange = () => setIsVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!isVisible || value === null) return;

    const previous = previousVisibleValueRef.current;
    previousVisibleValueRef.current = value;
    if (previous !== null) setDelta(value - previous);
  }, [isVisible, observationKey, value]);

  const direction = delta === null || delta === 0 ? '' : delta > 0 ? 'up' : 'down';
  const trend = delta === null
    ? 'awaiting change'
    : delta === 0
      ? 'no change'
      : `${delta > 0 ? 'increased' : 'decreased'} by ${number.format(Math.abs(delta))}`;
  return (
    <div className={`delta ${direction}`}>
      {trend}
    </div>
  );
}

export type AsciiColumn = {
  peak: number | null;
  closing: number | null;
  rows: number;
  ratePerMinute: number | null;
  tone: 'stable' | 'growing' | 'shrinking';
  color: string;
};

type MutableColumn = { peak: number; closing: number; observedAt: number } | null;

const heatStops = [
  { at: -1, color: '#35ef84' },
  { at: -.55, color: '#42d7b5' },
  { at: 0, color: '#63d8e8' },
  { at: .35, color: '#f2c14e' },
  { at: .7, color: '#ff8b52' },
  { at: 1, color: '#ff4964' },
] as const;

function hexChannels(hex: string): [number, number, number] {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}

export function interpolateHeatColor(value: number): string {
  const normalized = Math.max(-1, Math.min(1, value));
  const upperIndex = heatStops.findIndex((stop) => stop.at >= normalized);
  if (upperIndex <= 0) return heatStops[0].color;
  const lower = heatStops[upperIndex - 1]!;
  const upper = heatStops[upperIndex]!;
  const progress = (normalized - lower.at) / (upper.at - lower.at);
  const lowerChannels = hexChannels(lower.color);
  const upperChannels = hexChannels(upper.color);
  const channels = lowerChannels.map((channel, index) => Math.round(channel + (upperChannels[index]! - channel) * progress));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function calculateChartRowCount(height: number, glyphSize: number): number {
  const safeHeight = Number.isFinite(height) ? Math.max(0, height) : 0;
  const safeGlyphSize = Number.isFinite(glyphSize) ? Math.max(1, glyphSize) : 1;
  return Math.max(1, Math.min(maximumChartRows, Math.floor(safeHeight / (safeGlyphSize * chartGlyphHeightFactor))));
}

export type ChartScale = { ceiling: number; guides: number[] };
const chartIntervalMultipliers = Array.from({ length: 19 }, (_, index) => 1 + index * .5);

export function calculateChartScale(maximum: number): ChartScale {
  const safeMaximum = Number.isFinite(maximum) ? Math.max(0, maximum) : 0;
  if (safeMaximum === 0) return { ceiling: 0, guides: [] };

  const candidates = chartBandCounts.map((bandCount) => {
    const rawInterval = safeMaximum / bandCount;
    const magnitude = 10 ** Math.floor(Math.log10(rawInterval));
    const normalized = rawInterval / magnitude;
    const multiplier = chartIntervalMultipliers.find((value) => value > normalized + 1e-12) ?? 10;
    const interval = Math.max(1, Math.ceil(multiplier * magnitude));
    const ceiling = Number((interval * bandCount).toPrecision(12));
    const guides = Array.from({ length: bandCount - 1 }, (_, index) => Number((interval * (index + 1)).toPrecision(12)));
    return { ceiling, guides };
  });

  return candidates.reduce((best, candidate) => candidate.ceiling < best.ceiling ? candidate : best);
}

export function buildAsciiColumns(points: HistoryPoint[], from: string, to: string, requestedCount: number, requestedRows: number): AsciiColumn[] {
  const columnCount = Math.max(24, Math.min(96, Math.round(requestedCount)));
  const rowCount = Math.max(1, Math.min(maximumChartRows, Math.round(requestedRows)));
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const duration = Math.max(1, toMs - fromMs);
  const slots: MutableColumn[] = Array.from({ length: columnCount }, () => null);

  for (const point of points) {
    const observedAt = Date.parse(point.observedAt);
    if (!Number.isFinite(observedAt) || observedAt < fromMs || observedAt > toMs) continue;
    const index = Math.min(columnCount - 1, Math.max(0, Math.floor((observedAt - fromMs) / duration * columnCount)));
    const current = slots[index];
    if (!current) {
      slots[index] = { peak: point.maxTotal, closing: point.total, observedAt };
    } else {
      current.peak = Math.max(current.peak, point.maxTotal);
      if (observedAt >= current.observedAt) {
        current.closing = point.total;
        current.observedAt = observedAt;
      }
    }
  }

  const rates: Array<number | null> = slots.map((slot, index) => {
    if (!slot || index === 0) return null;
    const previous = slots[index - 1];
    if (!previous) return null;
    const elapsedMinutes = (slot.observedAt - previous.observedAt) / 60000;
    return elapsedMinutes > 0 ? (slot.closing - previous.closing) / elapsedMinutes : null;
  });
  const meaningfulRates = rates.filter((rate): rate is number => rate !== null && rate !== 0).map(Math.abs).sort((left, right) => left - right);
  const percentile90 = meaningfulRates.length ? meaningfulRates[Math.max(0, Math.ceil(meaningfulRates.length * .9) - 1)]! : 1;
  const maximum = Math.max(0, ...slots.map((slot) => slot?.peak ?? 0));
  const scale = calculateChartScale(maximum);

  return slots.map((slot, index) => {
    if (!slot) return { peak: null, closing: null, rows: 0, ratePerMinute: null, tone: 'stable', color: '#52636a' };
    const rate = rates[index] ?? null;
    const stable = rate === null || Math.abs(rate) < 1;
    const normalizedRate = rate === null ? null : Math.max(-1, Math.min(1, rate / percentile90));
    return {
      peak: slot.peak,
      closing: slot.closing,
      rows: slot.peak <= 0 || scale.ceiling <= 0 ? 0 : Math.max(1, Math.ceil(slot.peak / scale.ceiling * rowCount)),
      ratePerMinute: rate,
      tone: stable ? 'stable' : rate > 0 ? 'growing' : 'shrinking',
      color: normalizedRate === null ? '#52636a' : interpolateHeatColor(normalizedRate),
    };
  });
}

function axisTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function QueueChart({ history }: { history: HistoryResponse | null }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ columns: 64, rows: 10 });

  useEffect(() => {
    const element = chartRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const update = (width: number, height: number) => {
      const glyphSize = Number.parseFloat(window.getComputedStyle(element).fontSize);
      const next = {
        columns: Math.max(24, Math.min(96, Math.floor(width / 10))),
        rows: calculateChartRowCount(height, glyphSize),
      };
      setGeometry((current) => current.columns === next.columns && current.rows === next.rows ? current : next);
    };
    const bounds = element.getBoundingClientRect();
    update(bounds.width, bounds.height);
    const observer = new ResizeObserver((entries) => {
      const size = entries[0]?.contentRect;
      update(size?.width ?? element.clientWidth, size?.height ?? element.clientHeight);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columns = useMemo(() => history ? buildAsciiColumns(history.points, history.from, history.to, geometry.columns, geometry.rows) : [], [geometry, history]);
  const maximum = Math.max(0, ...columns.map((column) => column.peak ?? 0));
  const scale = calculateChartScale(maximum);
  const guideGutter = `${Math.max(3.4, number.format(scale.ceiling).length * .58 + .5)}rem`;
  const hasHistory = history && history.points.length > 0;

  return (
    <div className="terminal-chart">
      <div className="chart-rail chart-rail-top"><span>MAX {number.format(scale.ceiling)}</span><i /></div>
      <div ref={chartRef} className="ascii-plot" style={{ '--guide-gutter': guideGutter } as CSSProperties} role="img" aria-label={hasHistory ? `Queue history over ${history.days} days, observed maximum ${number.format(maximum)} tiles, scale zero to ${number.format(scale.ceiling)} tiles` : 'Queue history has no samples yet'}>
        {scale.guides.length > 0 ? <div className="chart-guides" aria-hidden="true">
          {scale.guides.map((value) => <span key={value} className="chart-guide" style={{ '--guide-position': `${value / scale.ceiling * 100}%` } as CSSProperties}>
            <b>{number.format(value)}</b><i />
          </span>)}
        </div> : null}
        {hasHistory ? <div className="ascii-columns" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`, '--chart-rows': geometry.rows } as CSSProperties} aria-hidden="true">
          {columns.map((column, index) => <span key={index} className={`ascii-column ${column.tone}`} style={{ '--heat-color': column.color } as CSSProperties}>
            {Array.from({ length: column.rows }, (_, row) => <i key={row}>█</i>)}
          </span>)}
        </div> : <div className="chart-empty">History begins after the first successful poll.</div>}
      </div>
      <div className="chart-rail chart-rail-bottom"><span>0</span><i /></div>
      <div className="chart-meta">
        <span>{history ? axisTime(history.from) : '—'}</span>
        <span className="chart-legend" aria-label="Heat scale from faster queue shrink through stable to faster queue growth">
          <i className="heat-scale" />
          <span className="heat-labels"><b>fast shrink</b><b>stable</b><b>fast growth</b></span>
          <em>queue change · tiles/min</em>
        </span>
        <span>{history ? axisTime(history.to) : '—'}</span>
      </div>
    </div>
  );
}

export function Counter({ label, value, accent, rolling = false, showDirection = false, observationKey }: { label: string; value: number | null; accent?: string; rolling?: boolean; showDirection?: boolean; observationKey?: string }) {
  const change = useQueueDirection(value, observationKey);
  return (
    <div className="counter">
      <span>{label}</span>
      <div className="counter-value">
        <strong className={accent}>{rolling ? <RollingNumber value={value} /> : value === null ? '—' : number.format(value)}</strong>
        {showDirection && change?.visible && <DirectionIndicator direction={change.direction} />}
      </div>
    </div>
  );
}

export function App() {
  const [latest, setLatest] = useState<LatestResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [rangeDays, setRangeDays] = useState(7);
  const [requestError, setRequestError] = useState<string | null>(null);
  const hasLatest = latest !== null;

  const loadLatest = useCallback(async () => {
    try {
      setLatest(await getJson<LatestResponse>('/api/stats/latest'));
      setRequestError(null);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Dashboard API is unavailable');
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const requestedDays = Math.min(rangeDays, latest?.connection.historyDays ?? rangeDays);
      setHistory(await getJson<HistoryResponse>(`/api/stats/history?days=${requestedDays}`));
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'History is unavailable');
    }
  }, [latest?.connection.historyDays, rangeDays]);

  useEffect(() => {
    void loadLatest();
    const timer = window.setInterval(() => void loadLatest(), (latest?.connection.pollIntervalSeconds ?? 15) * 1000);
    return () => window.clearInterval(timer);
  }, [loadLatest, latest?.connection.pollIntervalSeconds]);

  useEffect(() => {
    if (!hasLatest) return;
    void loadHistory();
    const timer = window.setInterval(() => void loadHistory(), (latest?.connection.pollIntervalSeconds ?? 15) * 1000);
    return () => window.clearInterval(timer);
  }, [hasLatest, loadHistory, latest?.connection.pollIntervalSeconds]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void loadLatest();
      if (hasLatest) void loadHistory();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible);
  }, [hasLatest, loadHistory, loadLatest]);

  const sample = latest?.sample ?? null;
  const status = latest?.connection.state ?? 'starting';
  const statusError = requestError ?? latest?.connection.error;
  const retention = latest?.connection.historyDays ?? 30;
  const ranges = useMemo(() => buildHistoryRanges(retention), [retention]);

  useEffect(() => {
    if (rangeDays > retention) setRangeDays(Math.min(7, retention));
  }, [rangeDays, retention]);

  return (
    <main className="shell">
      <header className="topline">
        <div className="brand">
          <h1 className="terminal-title" aria-label="root@minecraft : dynmap">
            <span className="prompt-host">root@minecraft</span>
            <span className="prompt-separator"> : </span>
            <span className="prompt-command">dynmap</span>
            <span className="prompt-cursor" aria-hidden="true" />
          </h1>
        </div>
        <div className={`connection state-${status}`} role="status">
          <div className="connection-line">
            <span className="status-light" />
            <span className="connection-host">rcon</span>
            <span className="connection-separator"> : </span>
            <strong className="connection-value">{stateLabel(latest).toLowerCase()}</strong>
          </div>
          <small>last sample · {formatTime(latest?.connection.lastSuccessAt ?? null)}</small>
        </div>
      </header>

      {statusError && <div className="alert"><span>!</span><p><strong>Latest poll failed</strong>{statusError}. Last valid data remains on screen.</p></div>}

      <section className="queue-stage" aria-labelledby="queue-heading">
        <div className="queue-overview">
          <div className="queue-primary">
            <span className="section-kicker">LIVE QUEUE</span>
            <h2 id="queue-heading">Total queued tiles</h2>
            <div className="queue-readout">
              <TotalQueueNumber value={sample?.queue.total ?? null} observationKey={sample?.observedAt} />
              <QueueDelta value={sample?.queue.total ?? null} observationKey={sample?.observedAt} />
            </div>
          </div>
          <div className="queue-parts">
            <Counter label="base tile queue" value={sample?.queue.tileUpdates ?? null} accent="cyan" rolling showDirection observationKey={sample?.observedAt} />
            <Counter label="zoom tile queue" value={sample?.queue.zoomOut ?? null} accent="amber" rolling showDirection observationKey={sample?.observedAt} />
            <Counter label="active render jobs" value={sample?.activeRenderJobCount ?? 0} />
            <div className="counter">
              <span>cache hit rate</span>
              <div className="counter-value">
                <strong>{sample?.cacheHitRate == null ? '—' : `${sample.cacheHitRate.toFixed(2)}%`}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="history-panel" aria-labelledby="history-heading">
        <div className="history-heading">
          <div><span className="section-kicker">QUEUE HISTORY</span><h2 id="history-heading">Backlog over time</h2></div>
          <div className="range-tabs" aria-label="History range">
            {ranges.map((range) => <button key={range.label} className={rangeDays === range.days ? 'active' : ''} aria-label={range.label} aria-pressed={rangeDays === range.days} onClick={() => setRangeDays(range.days)}>{range.label}</button>)}
          </div>
        </div>
        <QueueChart history={history} />
      </section>
    </main>
  );
}
