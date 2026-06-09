import { defineConfig } from 'tsup';

/**
 * Two build entries:
 *   - the library (src/index.ts -> dist/index.js, with types), and
 *   - the CLI (src/cli/index.ts -> dist/cli/index.js, with a node shebang).
 *
 * The shebang must go ONLY on the CLI: Node strips a shebang from the entry it
 * runs, but a shebang inside an imported module is a syntax error, so the
 * library build must not have one. `clean` is handled by the build script
 * (rm -rf dist) so the two entries don't race to wipe each other's output.
 */
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node22',
    dts: true,
    sourcemap: true,
    clean: false,
  },
  {
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    target: 'node22',
    sourcemap: true,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
  },
]);
