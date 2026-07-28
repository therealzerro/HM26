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
// Output goes straight to public/reel-panels/ — the one copy the app loads by
// URI during capture. Nothing is bundled into the native app.
//
// Usage: tsx scripts/build-panels.ts [--print-hashes]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PANELS, PANEL_W, FEATHER, PUBLIC_DIR } from './panel-config';
import { sourcePath, publicPath, sha256 } from './reel-panels';

const ASSETS = resolve('assets/marketing');
const printHashes = process.argv.includes('--print-hashes');

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


mkdirSync(resolve(PUBLIC_DIR), { recursive: true });

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

  const dst = publicPath(p);
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

  console.log(`✔ ${p.label.padEnd(16)} ${p.file.padEnd(20)} band y${band.y0}-${band.y1} → ${PANEL_W}x${finalH}  (feathered ${FEATHER}px → ${PUBLIC_DIR}/)`);
  hashes.push(`  { file: '${p.file}', ... sha256: '${sha256(src)}' },`);
}

console.log(`\n${PANELS.length - warned}/${PANELS.length} panels built → ${PUBLIC_DIR}/`);
if (printHashes) {
  console.log('\nClearance hashes (paste into scripts/panel-config.ts after reviewing the artwork):');
  hashes.forEach(h => console.log(h));
}
