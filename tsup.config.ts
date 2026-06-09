import { defineConfig } from 'tsup';

/**
 * Build config. esbuild under the hood, so builds are fast.
 *
 * For now we only ship the library entry (src/index.ts). The CLI entry
 * (src/cli/index.ts) gets added here on Day 8 once the commander commands exist;
 * at that point we add it to `entry` and set a shebang banner for the bin.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  dts: true,
  sourcemap: true,
  clean: true,
});
