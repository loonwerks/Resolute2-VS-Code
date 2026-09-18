import * as esbuild from 'esbuild';

await Promise.all([
  esbuild.build({
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    sourcemap: true
  }),
  esbuild.build({
    entryPoints: ['src/server/main.ts'],
    outfile: 'dist/server.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    sourcemap: true
  }),
  esbuild.build({
    entryPoints: ['test/corpus.test.ts'],
    outfile: 'dist/corpus.test.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    sourcemap: true
  }),
  esbuild.build({
    entryPoints: ['test/libraries.test.ts'],
    outfile: 'dist/libraries.test.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    sourcemap: true
  }),
  esbuild.build({
    entryPoints: ['test/debug-logging.test.ts'],
    outfile: 'dist/debug-logging.test.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    sourcemap: true
  }),
  esbuild.build({
    entryPoints: ['test/core-language.test.ts'],
    outfile: 'dist/core-language.test.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    sourcemap: true
  }),
  esbuild.build({
    entryPoints: ['test/file-access.test.ts'],
    outfile: 'dist/file-access.test.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    sourcemap: true
  }),
  esbuild.build({
    entryPoints: ['test/model-integration.test.ts'],
    outfile: 'dist/model-integration.test.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    sourcemap: true
  }),
  esbuild.build({
    entryPoints: ['test/sireum-integration.test.ts'],
    outfile: 'dist/sireum-integration.test.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    sourcemap: true
  }),
]);
