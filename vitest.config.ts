import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // e2e tests require a live Docker devnet and have their own config
    // (vitest.config.e2e.ts, run via `npm run test:e2e`) — exclude them here
    // so `npm test` stays fast and dependency-free.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/__tests__/e2e/**', 'tests/e2e/**'],
  },
});
