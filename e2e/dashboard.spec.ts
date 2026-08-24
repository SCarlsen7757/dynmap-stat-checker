import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/stats/latest', (route) => route.fulfill({ json: {
    connection: { state: 'connected', lastAttemptAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), error: null, pollIntervalSeconds: 15, historyDays: 30 },
    sample: {
      observedAt: new Date().toISOString(), queue: { tileUpdates: 121, zoomOut: 2879, total: 3000 },
      activeRenderJobCount: 1, cacheHitRate: 88.45,
    },
  }}));
  await page.route('**/api/stats/history?days=*', (route) => route.fulfill({ json: {
    days: 7,
    from: new Date(Date.now() - 7 * 86400000).toISOString(),
    to: new Date().toISOString(),
    resolutionSeconds: 3600,
    points: Array.from({ length: 120 }, (_, index) => {
      const total = 3000 + Math.round(Math.sin(index / 6) * 900) - index * 4;
      return { observedAt: new Date(Date.now() - (120 - index) * 3600000).toISOString(), total, maxTotal: total + 80 };
    }),
  }}));
});

test('shows live queue statistics and historical ASCII columns', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'root@minecraft : dynmap' })).toBeVisible();
  await expect(page.getByText('3.000')).toBeVisible();
  await expect(page.getByText('88.45%')).toBeVisible();
  await expect(page.getByText('base tile queue')).toBeVisible();
  await expect(page.getByText('zoom tile queue')).toBeVisible();
  await expect(page.getByRole('button', { name: '1d', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '2d', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '7d', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '14d', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '30d', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Queue history over 7 days/ })).toBeVisible();
  await expect(page.getByText('fast shrink')).toBeVisible();
  await expect(page.locator('.heat-scale')).toBeVisible();
  await expect(page.locator('.ascii-column.growing').first()).toBeVisible();
  await expect(page.locator('.ascii-column.shrinking').first()).toBeVisible();
  await expect(page.locator('.ascii-column i').first()).toHaveText('█');
  await expect(page.locator('.chart-guide')).toHaveCount(3);
  await page.locator('.history-panel').screenshot({ path: testInfo.outputPath('backlog-chart.png') });
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
});

test('keeps useful scale headroom just above two million tiles', async ({ page }, testInfo) => {
  const fromMs = Date.parse('2026-08-17T08:00:00.000Z');
  const toMs = Date.parse('2026-08-24T08:00:00.000Z');
  await page.unroute('**/api/stats/history?days=*');
  await page.route('**/api/stats/history?days=*', (route) => route.fulfill({ json: {
    days: 7,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    resolutionSeconds: 3600,
    points: Array.from({ length: 120 }, (_, index) => {
      const total = 1_000_000 + Math.round((.5 + Math.sin(index / 8) * .5) * 950_000);
      return {
        observedAt: new Date(fromMs + (toMs - fromMs) * index / 119).toISOString(),
        total,
        maxTotal: index === 60 ? 2_000_001 : total + 5_000,
      };
    }),
  }}));

  await page.goto('/');
  const chart = page.getByRole('img', { name: /observed maximum 2\.000\.001 tiles, scale zero to 2\.500\.000 tiles/ });
  await expect(chart).toBeVisible();
  await expect(page.locator('.chart-rail-top')).toContainText('MAX 2.500.000');
  await expect(page.locator('.chart-guide b')).toHaveText(['500.000', '1.000.000', '1.500.000', '2.000.000']);
  await page.locator('.history-panel').screenshot({ path: testInfo.outputPath('backlog-chart-over-two-million.png') });
});
