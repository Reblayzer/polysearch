import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests need no running engines and run on every push.
    // Integration tests live under test/integration and self-skip unless
    // RUN_INTEGRATION=1 is set (see test/integration/*.test.ts), so it is safe
    // to include them here: in CI without engines they simply skip.
    include: ['test/**/*.test.ts'],
  },
});
