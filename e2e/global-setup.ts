import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

export default async function startStaticServer() {
  const root = resolve('dist/client');
  const types: Record<string, string> = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const candidate = resolve(root, `.${pathname}`);
    const safeCandidate = candidate.startsWith(`${root}${sep}`) ? candidate : '';
    const file = safeCandidate && existsSync(safeCandidate) && extname(safeCandidate) ? safeCandidate : resolve(root, 'index.html');
    response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    createReadStream(file).pipe(response);
  });

  await new Promise<void>((resolveStarted) => server.listen(4173, '127.0.0.1', resolveStarted));
  return async () => {
    server.closeAllConnections();
    await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
  };
}
