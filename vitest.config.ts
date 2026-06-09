import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests need no running engines and run on every push.
    // Integration tests live under test/integration and self-skip unless
    // RUN_INTEGRATION=1 is set (see test/integration/*.test.ts), so it is safe
    // to include them here: in CI without engines they simply skip.
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The engine adapters and the CLI/factory wiring are exercised by the
      // integration tests (not run in `npm test`), and type-only modules have no
      // runtime to cover, so the threshold applies to the pure, unit-tested
      // logic: the query translators, the compare maths, errors and validation.
      exclude: [
        'src/engines/**',
        'src/cli/index.ts',
        'src/index.ts',
        'src/types.ts',
        'src/engine.ts',
        'src/query/types.ts',
        'src/query/compiled.ts',
        'src/query/opensearch.ts',
      ],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
