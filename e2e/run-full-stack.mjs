import { spawnSync } from 'node:child_process';

const compose = ['compose', '-f', 'compose.integration.yml'];
const dashboardUrl = 'http://127.0.0.1:33000';

function docker(...args) {
  const result = spawnSync('docker', [...compose, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`docker ${[...compose, ...args].join(' ')} failed`);
  }
  return result.stdout.trim();
}

async function waitForReady(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${dashboardUrl}/readyz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('dashboard did not become ready');
}

try {
  docker('up', '-d', '--build', '--wait');
  await waitForReady();

  const latest = await fetch(`${dashboardUrl}/api/stats/latest`).then((response) => response.json());
  if (latest.sample?.queue?.tileUpdates !== 121 || latest.sample?.queue?.zoomOut !== 2879) {
    throw new Error(`unexpected latest sample: ${JSON.stringify(latest)}`);
  }

  const history = await fetch(`${dashboardUrl}/api/stats/history?days=1`).then((response) => response.json());
  if (!history.points?.some((point) => point.total === 3000)) {
    throw new Error(`persisted history was not returned: ${JSON.stringify(history)}`);
  }

  const stored = docker('exec', '-T', 'postgres', 'psql', '-U', 'dynmap', '-d', 'dynmap', '-tAc',
    'SELECT base_queue_tiles || \',\' || zoom_queue_tiles FROM queue_samples ORDER BY observed_at DESC LIMIT 1');
  if (stored !== '121,2879') throw new Error(`unexpected PostgreSQL row: ${stored}`);

  docker('exec', '-T', 'postgres', 'psql', '-U', 'dynmap', '-d', 'dynmap', '-c',
    "INSERT INTO queue_samples VALUES (now() - interval '31 days', 1, 2)");
  docker('restart', 'dynmap-stats');
  await waitForReady();

  const expiredRows = docker('exec', '-T', 'postgres', 'psql', '-U', 'dynmap', '-d', 'dynmap', '-tAc',
    "SELECT count(*) FROM queue_samples WHERE observed_at < now() - interval '30 days'");
  if (expiredRows !== '0') throw new Error(`retention cleanup left ${expiredRows} expired row(s)`);

  process.stdout.write('Full-stack PostgreSQL test passed: poll, persistence, history query, restart, and retention cleanup.\n');
} finally {
  try {
    docker('down', '--volumes', '--remove-orphans');
  } catch (error) {
    process.stderr.write(`${error}\n`);
  }
}
