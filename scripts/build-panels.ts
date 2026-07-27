// MKT-11 — one-time panel prep, run when panel artwork is dropped in.
//
// Each source PNG is a ~3:2 image whose centred horizontal band is the artwork,
// with a generator watermark below it. This crops to that band, scales to the
// frame width and feathers the edges, writing assets/marketing/panels/built/.
//
// Band aspects vary a lot in practice (measured 2.97:1 to 4.40:1), so each
// panel KEEPS ITS NATIVE HEIGHT rather than being forced to one strip size:
// forcing a common aspect would either distort, crop the artwork, or pad it —
// and padding is visibly wrong for the full-bleed purple panels, whose backing
// is nothing like the app's. Heights land inside the 428px dead zone either way
// and the assembler centres each panel there.
//
// Usage: tsx scripts/build-panels.ts [--print-hashes]
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PANELS, PANEL_W, FEATHER, ZONE_TOP, ZONE_BOTTOM, APP_BG } from './panel-config';
import { sourcePath, builtPath, sha256, BUILT_DIR } from './reel-panels';

const ASSETS = resolve('assets/marketing');
const ZONE_H = ZONE_BOTTOM - ZONE_TOP + 1;
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

/** Mean RGB just inside the band's left edge — the panel's own backing. */
function bandBacking(file: string, y: number): [number, number, number] {
  const out = execSync(
    `python3 -c "
import sys
from PIL import Image
import numpy as np
a = np.asarray(Image.open(sys.argv[1]).convert('RGB'), dtype=np.float32)
c = a[int(sys.argv[2]), 0:10].mean(axis=0)
print(int(round(c[0])), int(round(c[1])), int(round(c[2])))
" "${file}" ${y}`,
    { shell: '/bin/bash' },
  ).toString().trim().split(/\s+/).map(Number);
  return [out[0], out[1], out[2]];
}

const hex = (c: readonly number[]) => '#' + c.map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();

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

  if (outH > ZONE_H) {
    console.log(`⚠️  ${p.file} — band ${band.w}x${bh} scales to ${PANEL_W}x${outH}, taller than the ${ZONE_H}px dead zone; it will be capped.`);
    warned++;
  }
  const finalH = Math.min(outH, ZONE_H);

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

  const backing = bandBacking(src, band.y0 + Math.floor(bh / 2));
  const delta = Math.max(...backing.map((c, i) => Math.abs(c - APP_BG[i])));
  const note = delta > 24 ? ' (full-bleed artwork — feather carries the edge)' : '';
  console.log(
    `✔ ${p.label.padEnd(16)} ${p.file.padEnd(20)} band y${band.y0}-${band.y1} → ${PANEL_W}x${finalH}` +
      `  backing ${hex(backing)} vs app ${hex(APP_BG)} (Δ${delta})${note}`,
  );
  hashes.push(`  { file: '${p.file}', ... sha256: '${sha256(src)}' },`);
}

console.log(`\n${PANELS.length - warned}/${PANELS.length} panels built → assets/marketing/${BUILT_DIR}/`);
if (printHashes) {
  console.log('\nClearance hashes (paste into scripts/panel-config.ts after reviewing the artwork):');
  hashes.forEach(h => console.log(h));
}
