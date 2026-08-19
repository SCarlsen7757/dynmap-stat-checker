import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: projectRoot,
  cacheDir: fileURLToPath(new URL('./node_modules/.vitest', import.meta.url)),
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'web/**/*.test.tsx'],
    setupFiles: ['./web/test/setup.ts'],
    environmentMatchGlobs: [['web/**/*.test.tsx', 'jsdom']],
    coverage: { reporter: ['text', 'html'] },
  },
});
