import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/stats/latest', (route) => route.fulfill({ json: {
    connection: { state: 'connected', lastAttemptAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), error: null, pollIntervalSeconds: 15, historyHours: 48 },
    queueDelta: -31,
    sample: {
      observedAt: new Date().toISOString(), queue: { tileUpdates: 121, zoomOut: 2879, total: 3000 },
      maps: [
        { id: 'world.surface', processed: 19872, rendered: 19001, updated: 12044, transparent: 87 },
        { id: 'world.flat', processed: 14222, rendered: 14082, updated: 9104, transparent: 12 },
      ],
      totals: { processed: 34094, rendered: 33083, updated: 21148, transparent: 99 }, activeRenderJobs: ['world:surface fullrender'],
      pause: { fullRadius: false, updates: false, zoomOut: false }, cacheHitRate: 88.45,
      chunks: [{ category: 'Cached', count: 40510, millisecondsPerChunk: 0 }, { category: 'Load Required', count: 861, millisecondsPerChunk: 1.42 }],
      raw: 'Triggered update queue size: 121 + 2879',
    },
  }}));
  await page.route('**/api/stats/history?hours=*', (route) => route.fulfill({ json: {
    hours: 1,
    points: Array.from({ length: 40 }, (_, index) => ({ observedAt: new Date(Date.now() - (40 - index) * 15000).toISOString(), tileUpdates: 121, zoomOut: 4000 - index * 28, total: 4121 - index * 28 })),
  }}));
});

test('shows the queue and full runtime statistics', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'root@minecraft : dynmap' })).toBeVisible();
  await expect(page.getByText('3,000')).toBeVisible();
  await expect(page.getByText('88.45%')).toBeVisible();
  await expect(page.getByText('base tile queue')).toBeVisible();
  await expect(page.getByText('zoom tile queue')).toBeVisible();
  await expect(page.getByRole('button', { name: '5m', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '15m', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '30m', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '1h', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '48h', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Maps and worlds' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Loading paths' })).toHaveCount(0);
  await expect(page.getByText('ENABLED')).toHaveCount(3);
  await expect(page.getByText('RUNNING')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
});
