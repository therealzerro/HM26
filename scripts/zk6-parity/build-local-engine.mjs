/**
 * build-local-engine.mjs — esbuild bundler for engines/zk6.ts.
 *
 * Runs once per harness invocation. Produces a self-contained ESM bundle
 * with the same compute-slate logic the RN client runs, but with:
 *   - expo-constants → our Node-friendly shim (returns SUPABASE_URL/anon from env)
 *   - react-native   → empty stub (engines/zk6.ts never invokes any RN API)
 *
 * Output: scripts/zk6-parity/.build/zk6-local.mjs
 */

import { build } from 'esbuild';
import { resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = pathResolve(fileURLToPath(import.meta.url), '..');
const buildDir  = pathResolve(__dirname, '.build');
mkdirSync(buildDir, { recursive: true });

const projectRoot = pathResolve(__dirname, '../..');

export async function buildLocalEngine() {
  const outfile = pathResolve(buildDir, 'zk6-local.mjs');
  await build({
    entryPoints: [pathResolve(projectRoot, 'engines/zk6.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile,
    logLevel: 'error',
    alias: {
      'expo-constants': pathResolve(__dirname, 'shim-expo-constants.mjs'),
      'react-native':   pathResolve(__dirname, 'shim-empty.mjs'),
    },
    tsconfigRaw: JSON.stringify({
      compilerOptions: {
        baseUrl: projectRoot,
        paths: { '@/*': ['./*'] },
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'preserve',
        strict: false,
      },
    }),
  });
  return outfile;
}

// Allow direct CLI invocation: `tsx scripts/zk6-parity/build-local-engine.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  buildLocalEngine().then(p => console.log(`[build] wrote ${p}`)).catch(e => {
    console.error('[build] failed:', e);
    process.exit(1);
  });
}
