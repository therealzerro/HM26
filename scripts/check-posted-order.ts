/**
 * check-posted-order.ts — guard against the combo-vs-posted-order defect class.
 *
 * Every pick carries TWO 3-digit strings:
 *   • `combo`      — the engine's 000..999 enumeration index. Not sorted, never
 *                    posted, part of the adaptive_tracking idempotency key.
 *   • `bestOrder`  — the permutation actually shown on the slate, cards and
 *                    reels (adaptive_tracking.posted_order since ENG-AT-POSTED-01).
 *
 * A STRAIGHT is `result_digits === bestOrder`. Comparing the draw against
 * `combo` mislabels box hits as straights (and vice-versa) whenever the two
 * differ (~2/3 of picks). This has shipped four times: BUG-155 (hit detection),
 * BUG-158 (three display sites), BUG-184 (replay), BUG-185 (track record,
 * results tiers, admin tracking view), BUG-186 (Book save / share).
 *
 * This script fails the build when a straight comparison is written against a
 * `combo`-named value. It is deliberately narrow: only `result_digits` on one
 * side and a bare `combo` / `.combo` on the other.
 *
 * Usage:   npm run check:posted-order
 * Exit:    0 clean · 1 findings
 *
 * To mark a legitimate exception (there should be none), append the comment
 * `// posted-order-ok` to the line and say why.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib', 'engines', 'supabase/functions', 'scripts'];
const EXTS = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.expo', 'dist', 'build', '__tests__']);

// result_digits === x.combo   |   result_digits === combo
const RHS = /result_digits\s*===?\s*(?:[A-Za-z_$][\w$]*\.)*combo\b/;
// x.combo === result_digits   |   combo === x.result_digits
const LHS = /(?:^|[^\w$.])(?:[A-Za-z_$][\w$]*\.)*combo\s*===?\s*(?:[A-Za-z_$][\w$]*\.)*result_digits\b/;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.has(name.slice(name.lastIndexOf('.')))) out.push(full);
  }
}

const files: string[] = [];
for (const d of SCAN_DIRS) {
  try { if (statSync(join(ROOT, d)).isDirectory()) walk(join(ROOT, d), files); } catch { /* absent dir */ }
}

const findings: string[] = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, ''); // ignore trailing comments
    if (line.includes('posted-order-ok')) return;
    if (RHS.test(code) || LHS.test(code)) {
      findings.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (findings.length === 0) {
  console.log(`check:posted-order — OK (${files.length} files scanned, 0 straight comparisons against combo)`);
  process.exit(0);
}
console.error(`check:posted-order — ${findings.length} finding(s). A straight is result_digits === bestOrder / posted_order, never === combo (BUG-155).`);
for (const x of findings) console.error('  ' + x);
process.exit(1);
