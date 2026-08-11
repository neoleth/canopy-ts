import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Use e2e test files
    include: ['src/__tests__/e2e/**/*.test.ts'],

    // Global setup/teardown for Docker lifecycle
    globalSetup: ['tests/e2e/global-setup.ts'],

    // Timeout for e2e tests (they're slower)
    testTimeout: 60_000,

    // Serial execution to avoid Docker port conflicts
    threads: false,
    singleThread: true,

    // Environment for running tests
    environment: 'node',

    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
