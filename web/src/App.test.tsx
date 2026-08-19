// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LatestResponse } from '../../shared/types';
import { App, buildHistoryRanges, Counter, RollingNumber } from './App';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const latest: LatestResponse = {
  connection: { state: 'connected', lastAttemptAt: '2026-01-01T00:00:00Z', lastSuccessAt: '2026-01-01T00:00:00Z', error: null, pollIntervalSeconds: 15, historyHours: 24 },
  queueDelta: -4,
  sample: {
    observedAt: '2026-01-01T00:00:00Z', queue: { tileUpdates: 10, zoomOut: 2, total: 12 },
    maps: [{ id: 'world.surface', processed: 5, rendered: 5, updated: 4, transparent: 0 }],
    totals: { processed: 5, rendered: 5, updated: 4, transparent: 0 }, activeRenderJobs: ['world'],
    pause: { fullRadius: false, updates: false, zoomOut: false }, cacheHitRate: 88.5, chunks: [], raw: 'Triggered update queue size: 10 + 2',
  },
};

describe('App', () => {
  it('renders populated monitoring data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return new Response(JSON.stringify(url.includes('/history') ? { hours: 1, points: [{ observedAt: '2026-01-01T00:00:00Z', ...latest.sample!.queue }] } : latest), { status: 200 });
    }));
    render(<App />);
    await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'root@minecraft : dynmap' })).toBeInTheDocument();
    expect(screen.getByText('88.50%')).toBeInTheDocument();
    expect(screen.getByText('base tile queue')).toBeInTheDocument();
    expect(screen.getByText('zoom tile queue')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Maps and worlds' })).not.toBeInTheDocument();
    expect(screen.getByText('-4 since last poll')).toBeInTheDocument();
    expect(screen.getAllByText('ENABLED')).toHaveLength(3);
    expect(screen.queryByText('RUNNING')).not.toBeInTheDocument();
  });

  it('gives direction when the API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    render(<App />);
    await waitFor(() => expect(screen.getByText('Latest poll failed')).toBeInTheDocument());
    expect(screen.getAllByLabelText('No value available')).toHaveLength(3);
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
    expect(buildHistoryRanges(6).map((range) => range.label)).toEqual(['5m', '15m', '30m', '1h', '6h']);
    expect(buildHistoryRanges(12).map((range) => range.label)).toEqual(['5m', '15m', '30m', '1h', '6h', '12h']);
  });

  it('adds readable long-retention options without duplicating anchors', () => {
    expect(buildHistoryRanges(48).map((range) => range.label)).toEqual(['5m', '15m', '30m', '1h', '6h', '24h', '48h']);
    expect(buildHistoryRanges(168).at(-1)?.label).toBe('7d');
  });
});
