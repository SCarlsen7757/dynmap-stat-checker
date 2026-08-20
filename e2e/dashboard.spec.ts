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
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
});
