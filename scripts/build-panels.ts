// MKT-11 — one-time panel prep, run when panel artwork is dropped in.
//
// Each source PNG is a ~3:2 image whose centred horizontal band is the artwork,
// with a generator watermark below it. This crops to that band, scales to the
// frame width and feathers the edges.
//
// Band aspects vary a lot in practice (measured 2.97:1 to 4.40:1), so each
// panel KEEPS ITS NATIVE HEIGHT — the app lays them out with aspectRatio, so
// there is no strip to fit and forcing a common aspect would only distort or
// crop the artwork.
//
// Built artwork is uploaded to the public `app-panels` Supabase bucket, which
// is what the app loads at runtime on web AND native. Nothing is bundled, so
// swapping artwork needs no app release.
//
// Usage: tsx scripts/build-panels.ts [--print-hashes]
import { config as loadEnv } from 'dotenv';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PANELS, PANEL_W, FEATHER, BUILT_DIR } from './panel-config';
import { PANEL_BUCKET } from '../constants/reelPanels';
import { sourcePath, builtPath, sha256 } from './reel-panels';

// Service-role creds for the bucket upload live here, same as publish-reels.
loadEnv({ path: resolve('.env.backtest'), quiet: true });

const ASSETS = resolve('assets/marketing');
const printHashes = process.argv.includes('--print-hashes');

/**
 * Publish built artwork to the public `app-panels` bucket — what the app loads
 * at runtime. Service-role credentials come from .env.backtest, the same source
 * publish-reels.ts uses; anon has no write path to storage (SEC-05).
 *
 * Upload failure is a WARNING, not an abort: the local build is still correct
 * and re-running picks up where it left off. A stale bucket surfaces in
 * reel:check, which fetches each panel and compares it to the local file.
 */
async function uploadAll(): Promise<void> {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log('⚠️  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — built locally but NOT uploaded. The app will keep serving whatever is already in the bucket.');
    return;
  }
  let ok = 0;
  for (const p of PANELS) {
    const f = builtPath(ASSETS, p);
    if (!existsSync(f)) continue;
    const body = readFileSync(f);
    const res = await fetch(`${url}/storage/v1/object/${PANEL_BUCKET}/${p.file}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'image/png', 'x-upsert': 'true' },
      body: new Uint8Array(body) as unknown as BodyInit,
    });
    if (!res.ok) {
      console.log(`⚠️  ${p.file} — upload failed HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      continue;
    }
    console.log(`  ↑ ${PANEL_BUCKET}/${p.file} (${(body.length / 1e3).toFixed(0)}KB)`);
    ok++;
  }
  console.log(`${ok}/${PANELS.length} published to the ${PANEL_BUCKET} bucket — live in the app immediately.`);
}

/**
 * Largest contiguous run of rows carrying artwork. Uses the longest run rather
 * than min/max of all content rows, so the watermark sitting below the band
 * (consistently y~1411-1500 in the delivered set) is excluded.
 */
function detectBand(file: string): { y0: number; y1: number; w: number; h: number } {
  const out = execSync(
    `python3 -c "
import sys
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert('RGB'), dtype=np.float32)
v = a.std(axis=1).max(axis=1) > 3.0
runs, s = [], None
for i, m in enumerate(v):
    if m and s is None: s = i
    elif not m and s is not None: runs.append((s, i-1)); s = None
if s is not None: runs.append((s, len(v)-1))
runs.sort(key=lambda r: r[1]-r[0], reverse=True)
y0, y1 = runs[0]
print(y0, y1, a.shape[1], a.shape[0])
" "${file}"`,
    { shell: '/bin/bash' },
  ).toString().trim().split(/\s+/).map(Number);
  return { y0: out[0], y1: out[1], w: out[2], h: out[3] };
}


mkdirSync(join(ASSETS, BUILT_DIR), { recursive: true });

let warned = 0;
const hashes: string[] = [];

for (const p of PANELS) {
  const src = sourcePath(ASSETS, p);
  if (!existsSync(src)) {
    console.log(`⚠️  ${p.file} — not present, skipped (rotation drops it until delivered)`);
    warned++;
    continue;
  }
  const band = detectBand(src);
  const bh = band.y1 - band.y0 + 1;
  const outH = Math.round((PANEL_W * bh) / band.w);

  const finalH = outH;

  const dst = builtPath(ASSETS, p);
  // Feather all four edges via a geq alpha ramp so the panel dissolves into the
  // app background whatever its own backing is.
  const f = FEATHER;
  execSync(
    `ffmpeg -y -loglevel error -i "${src}" -vf ` +
      `"crop=${band.w}:${bh}:0:${band.y0},scale=${PANEL_W}:${finalH}:flags=lanczos,format=rgba,` +
      `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':` +
      `a='alpha(X,Y)*min(1,min(min(X,W-1-X)/${f},min(Y,H-1-Y)/${f}))'" ` +
      `-frames:v 1 "${dst}"`,
    { stdio: 'inherit' },
  );

  console.log(`✔ ${p.label.padEnd(16)} ${p.file.padEnd(20)} band y${band.y0}-${band.y1} → ${PANEL_W}x${finalH}  (feathered ${FEATHER}px)`);
  hashes.push(`  { file: '${p.file}', ... sha256: '${sha256(src)}' },`);
}

console.log(`\n${PANELS.length - warned}/${PANELS.length} panels built.`);
if (printHashes) {
  console.log('\nClearance hashes (paste into scripts/panel-config.ts after reviewing the artwork):');
  hashes.forEach(h => console.log(h));
}
void uploadAll();
