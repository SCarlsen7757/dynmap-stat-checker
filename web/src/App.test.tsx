// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LatestResponse } from '../../shared/types';
import { App, buildAsciiColumns, buildHistoryRanges, Counter, interpolateHeatColor, QueueDelta, RollingNumber } from './App';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const latest: LatestResponse = {
  connection: { state: 'connected', lastAttemptAt: '2026-01-01T00:00:00Z', lastSuccessAt: '2026-01-01T00:00:00Z', error: null, pollIntervalSeconds: 15, historyDays: 30 },
  sample: {
    observedAt: '2026-01-01T00:00:00Z', queue: { tileUpdates: 10, zoomOut: 2, total: 12 },
    activeRenderJobCount: 1, cacheHitRate: 88.5,
  },
};

describe('App', () => {
  it('renders populated monitoring data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(JSON.stringify(url.includes('/history') ? {
        days: 7,
        from: '2025-12-25T00:00:00Z',
        to: '2026-01-01T00:00:00Z',
        resolutionSeconds: 3600,
        points: [{ observedAt: '2026-01-01T00:00:00Z', total: latest.sample!.queue.total, maxTotal: 12 }],
      } : latest), { status: 200 });
    }));
    render(<App />);
    await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'root@minecraft : dynmap' })).toBeInTheDocument();
    expect(screen.getByText('88.50%')).toBeInTheDocument();
    expect(screen.getByText('base tile queue')).toBeInTheDocument();
    expect(screen.getByText('zoom tile queue')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Maps and worlds' })).not.toBeInTheDocument();
    expect(screen.getByText('awaiting change')).toBeInTheDocument();
  });

  it('gives direction when the API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    render(<App />);
    await waitFor(() => expect(screen.getByText('Latest poll failed')).toBeInTheDocument());
    expect(screen.getAllByLabelText('No value available')).toHaveLength(3);
  });
});

describe('QueueDelta', () => {
  it('compares a resumed queue with the last value visible to the user', async () => {
    let visibilityState: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    const { rerender } = render(<QueueDelta value={100} observationKey="poll-1" />);

    visibilityState = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    rerender(<QueueDelta value={80} observationKey="poll-2" />);
    rerender(<QueueDelta value={65} observationKey="poll-3" />);

    visibilityState = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(await screen.findByText('decreased by 35')).toBeInTheDocument();
  });

  it('uses consecutive observations while the page remains visible', async () => {
    const { rerender } = render(<QueueDelta value={100} observationKey="poll-1" />);
    rerender(<QueueDelta value={112} observationKey="poll-2" />);
    expect(await screen.findByText('increased by 12')).toBeInTheDocument();
  });
});

describe('RollingNumber', () => {
  it('eases from zero to the first queue value', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    render(<RollingNumber value={200} duration={2000} />);

    act(() => frames.shift()?.(0));
    act(() => frames.shift()?.(1000));
    expect(screen.getByText('175')).toBeInTheDocument();
    act(() => frames.shift()?.(2000));
    expect(screen.getByText('200')).toBeInTheDocument();
  });
});

describe('queue direction indicators', () => {
  it('shows red up and green down states only after a value changes', async () => {
    const { rerender } = render(<Counter label="queue" value={10} showDirection />);
    expect(screen.queryByLabelText('Queue increased')).not.toBeInTheDocument();

    rerender(<Counter label="queue" value={20} showDirection />);
    expect(await screen.findByLabelText('Queue increased')).toHaveClass('up');

    rerender(<Counter label="queue" value={5} showDirection />);
    expect(await screen.findByLabelText('Queue decreased')).toHaveClass('down');
  });

  it('clears the indicator when the queue stays unchanged', async () => {
    const { rerender } = render(<Counter label="queue" value={10} showDirection observationKey="poll-1" />);
    rerender(<Counter label="queue" value={20} showDirection observationKey="poll-2" />);
    expect(await screen.findByLabelText('Queue increased')).toBeInTheDocument();
    rerender(<Counter label="queue" value={20} showDirection observationKey="poll-3" />);
    await waitFor(() => expect(screen.queryByLabelText('Queue increased')).not.toBeInTheDocument());
  });
});

describe('buildHistoryRanges', () => {
  it('caps anchors at short retention and includes the exact configured limit', () => {
    expect(buildHistoryRanges(1).map((range) => range.label)).toEqual(['1d']);
    expect(buildHistoryRanges(10).map((range) => range.label)).toEqual(['1d', '2d', '7d', '10d']);
  });

  it('adds configured long retention without duplicating standard filters', () => {
    expect(buildHistoryRanges(30).map((range) => range.label)).toEqual(['1d', '2d', '7d', '14d', '30d']);
    expect(buildHistoryRanges(90).at(-1)?.label).toBe('90d');
  });
});

describe('buildAsciiColumns', () => {
  const from = '2026-01-01T00:00:00.000Z';
  const to = '2026-01-02T00:00:00.000Z';
  const historyPoint = (observedAt: string, total: number, maxTotal = total) => ({
    observedAt, total, maxTotal,
  });

  it('preserves peaks while combining points into visual columns', () => {
    const columns = buildAsciiColumns([
      historyPoint('2026-01-01T00:10:00.000Z', 10, 20),
      historyPoint('2026-01-01T00:20:00.000Z', 5, 90),
    ], from, to, 24);
    expect(columns[0]).toMatchObject({ peak: 90, closing: 5, rows: 10 });
  });

  it('keeps gaps empty and leaves the following rate neutral', () => {
    const columns = buildAsciiColumns([
      historyPoint('2026-01-01T00:10:00.000Z', 10),
      historyPoint('2026-01-01T03:10:00.000Z', 30),
    ], from, to, 24);
    expect(columns[1]?.peak).toBeNull();
    expect(columns[3]).toMatchObject({ ratePerMinute: null, tone: 'stable' });
  });

  it('uses direction and a continuous heat color for meaningful adjacent rates', () => {
    const columns = buildAsciiColumns([
      historyPoint('2026-01-01T00:10:00.000Z', 10),
      historyPoint('2026-01-01T01:10:00.000Z', 130),
      historyPoint('2026-01-01T02:10:00.000Z', 10),
    ], from, to, 24);
    expect(columns[1]?.tone).toBe('growing');
    expect(columns[2]?.tone).toBe('shrinking');
    expect(columns[1]?.color).not.toBe(columns[2]?.color);
    expect(columns[0]?.color).toBe('#52636a');
  });

  it('interpolates distinct colors across the full signed rate scale', () => {
    const colors = [-1, -.75, -.25, 0, .2, .5, .8, 1].map(interpolateHeatColor);
    expect(new Set(colors).size).toBe(colors.length);
    expect(interpolateHeatColor(-1)).toBe('#35ef84');
    expect(interpolateHeatColor(0)).toBe('#63d8e8');
    expect(interpolateHeatColor(1)).toBe('#ff4964');
  });
});
