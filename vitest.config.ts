import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config. Each test file picks the right environment via the
 * `// @vitest-environment <env>` directive at the top:
 *   - `node` (default) for `packages/node/test/**`
 *   - `happy-dom` for browser-flavoured tests in `packages/web/test/**`
 *
 * Run from the repo root:
 *   npm test                    # one-shot
 *   npm run test:watch          # watch mode
 *   npm run test:coverage       # with v8 coverage
 */
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.spec.ts'],
    environment: 'node',
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: [
        'packages/node/src/tracing/profile.ts',
        'packages/web/src/profile.ts',
        'packages/web/src/processor.ts',
        'packages/web/src/errors.ts',
      ],
      thresholds: {
        // Pure logic should be 100% covered. Bumping these ratchets the
        // CI guarantee.
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 90,
      },
    },
  },
});
