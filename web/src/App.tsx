import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DynmapSample, HistoryPoint, HistoryResponse, LatestResponse } from '../../shared/types';

const number = new Intl.NumberFormat('da-DK');
const historyAnchors = [5 / 60, 15 / 60, 30 / 60, 1, 6, 24];

function formatRange(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours <= 48 || hours % 24 !== 0) return `${hours}h`;
  return `${hours / 24}d`;
}

export function buildHistoryRanges(retentionHours: number) {
  const values = [...historyAnchors.filter((hours) => hours <= retentionHours), retentionHours];
  return [...new Set(values)].sort((left, right) => left - right).map((hours) => ({ hours, label: formatRange(hours) }));
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

function QueueChart({ points }: { points: HistoryPoint[] }) {
  const plotted = useMemo(() => {
    if (points.length <= 240) return points;
    const step = Math.ceil(points.length / 240);
    return points.filter((_, index) => index % step === 0 || index === points.length - 1);
  }, [points]);

  if (!plotted.length) return <div className="chart-empty">History begins after the first successful poll.</div>;

  const width = 1000;
  const height = 250;
  const maximum = Math.max(1, ...plotted.map((point) => point.total));
  const coordinates = plotted.map((point, index) => ({
    x: plotted.length === 1 ? 0 : index * width / (plotted.length - 1),
    y: height - point.total / maximum * (height - 16) - 8,
  }));
  const line = coordinates.map(({ x, y }, index) => `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Queue history, maximum ${number.format(maximum)} tiles`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="queue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--cyan)" stopOpacity=".32" />
            <stop offset="1" stopColor="var(--cyan)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((row) => <line key={row} className="chart-grid" x1="0" x2={width} y1={row * height / 4} y2={row * height / 4} />)}
        <path d={area} fill="url(#queue-fill)" />
        <path d={line} className="chart-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="chart-max">{number.format(maximum)}</span>
      <span className="chart-zero">0</span>
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
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [rangeHours, setRangeHours] = useState(1);
  const [requestError, setRequestError] = useState<string | null>(null);

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
      const response = await getJson<HistoryResponse>(`/api/stats/history?hours=${rangeHours}`);
      setHistory(response.points);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'History is unavailable');
    }
  }, [rangeHours]);

  useEffect(() => {
    void loadLatest();
    const timer = window.setInterval(() => void loadLatest(), (latest?.connection.pollIntervalSeconds ?? 15) * 1000);
    return () => window.clearInterval(timer);
  }, [loadLatest, latest?.connection.pollIntervalSeconds]);

  useEffect(() => {
    void loadHistory();
    const timer = window.setInterval(() => void loadHistory(), (latest?.connection.pollIntervalSeconds ?? 15) * 1000);
    return () => window.clearInterval(timer);
  }, [loadHistory, latest?.connection.pollIntervalSeconds]);

  const sample = latest?.sample ?? null;
  const status = latest?.connection.state ?? 'starting';
  const statusError = requestError ?? latest?.connection.error;
  const retention = latest?.connection.historyHours ?? 24;
  const ranges = useMemo(() => buildHistoryRanges(retention), [retention]);

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
              <div className={`delta ${(latest?.queueDelta ?? 0) > 0 ? 'up' : 'down'}`}>
                {latest?.queueDelta == null ? 'awaiting trend' : `${latest.queueDelta > 0 ? '+' : ''}${number.format(latest.queueDelta)} since last poll`}
              </div>
            </div>
          </div>
          <div className="queue-parts">
            <Counter label="base tile queue" value={sample?.queue.tileUpdates ?? null} accent="cyan" rolling showDirection observationKey={sample?.observedAt} />
            <Counter label="zoom tile queue" value={sample?.queue.zoomOut ?? null} accent="amber" rolling showDirection observationKey={sample?.observedAt} />
            <Counter label="active render jobs" value={sample?.activeRenderJobs.length ?? 0} />
          </div>
        </div>
      </section>

      <section className="panel history-panel" aria-labelledby="history-heading">
        <div className="panel-heading">
          <div><span className="section-kicker">QUEUE HISTORY</span><h2 id="history-heading">Backlog over time</h2></div>
          <div className="range-tabs" aria-label="History range">
            {ranges.map((range) => <button key={range.label} className={rangeHours === range.hours ? 'active' : ''} aria-pressed={rangeHours === range.hours} onClick={() => setRangeHours(range.hours)}>{range.label}</button>)}
          </div>
        </div>
        <QueueChart points={history} />
      </section>

      <section className="panel runtime-panel" aria-labelledby="runtime-heading">
        <div className="panel-heading"><div><span className="section-kicker">RUNTIME</span><h2 id="runtime-heading">Renderer state</h2></div></div>
        <dl className="runtime-list">
          <div><dt>Cache hit rate</dt><dd>{sample?.cacheHitRate == null ? '—' : `${sample.cacheHitRate.toFixed(2)}%`}</dd></div>
          <div><dt>Full / radius</dt><dd className={sample?.pause.fullRadius ? 'fault' : 'ok'}>{sample?.pause.fullRadius ? 'PAUSED' : 'ENABLED'}</dd></div>
          <div><dt>Tile updates</dt><dd className={sample?.pause.updates ? 'fault' : 'ok'}>{sample?.pause.updates ? 'PAUSED' : 'ENABLED'}</dd></div>
          <div><dt>Zoom-out</dt><dd className={sample?.pause.zoomOut ? 'fault' : 'ok'}>{sample?.pause.zoomOut ? 'PAUSED' : 'ENABLED'}</dd></div>
        </dl>
        <h3>Active jobs</h3>
        <div className="job-list">{sample?.activeRenderJobs.length ? sample.activeRenderJobs.map((job) => <code key={job}>{job}</code>) : <span>none reported</span>}</div>
      </section>

      <details className="raw-panel">
        <summary>Raw RCON response <span>for parser troubleshooting</span></summary>
        <pre>{sample?.raw ?? 'No successful response received.'}</pre>
      </details>

      <footer><span>read-only RCON monitor</span><span>poll {latest?.connection.pollIntervalSeconds ?? 15}s · memory {retention}h</span></footer>
    </main>
  );
}
