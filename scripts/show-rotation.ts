/**
 * reel:rotation — print what every reel kind is SCHEDULED to draw, per lane,
 * for the next N days.
 *
 *     npm run reel:rotation                  (14 days from today, ET)
 *     npm run reel:rotation -- --days 30
 *     npm run reel:rotation -- --from 2026-08-01 --days 7
 *     npm run reel:rotation -- --lane stinger
 *
 * The companion to reel:check's rotation warnings: the check says "the stinger
 * lane repeats every 4 days", this shows the four days so the claim can be
 * read rather than trusted. Read-only — touches no disk asset and builds
 * nothing.
 *
 * ⚠ Shows the SCHEDULE, not the outcome. A member missing from disk drops out
 * of that day's resolution and shifts the pick; reel:check reports that
 * separately. See the header of reel-rotation-health.ts.
 */
import {
  LANES, dailyKinds, laneReport, comboDistinct, comboPeriod, addDays, PERIOD_WARN_BELOW,
} from './reel-rotation-health';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const eq = argv.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const from = flag('from') ?? TODAY;
const days = Math.max(1, Math.min(120, Number(flag('days') ?? 14)));
const only = flag('lane');

if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
  console.error(`ABORT: --from must be YYYY-MM-DD (got "${from}").`);
  process.exit(1);
}
const lanes = only ? LANES.filter(l => l.name === only) : LANES;
if (!lanes.length) {
  console.error(`ABORT: unknown lane "${only}". Known: ${LANES.map(l => l.name).join(', ')}.`);
  process.exit(1);
}

const kinds = dailyKinds();
const W = 12;
const cell = (s: string) => (s.length > W - 1 ? s.slice(0, W - 1) : s).padEnd(W);

/**
 * Strip the prefix every member of a lane shares, so the column shows the part
 * that actually differs.
 *
 * Both special cases below are bugs this replaces, kept as comments because
 * each produced a table that looked plausible and said nothing:
 *   • `anchor_intro.mp4` is the rotation's entry 0 and stripping the shared
 *     `anchor_intro_` prefix left it EMPTY — the standard intro rendered as a
 *     blank cell, reading as "no intro scheduled".
 *   • carrier files are `<kind>_carrier[_<variant>].mp4`, so stripping only
 *     `_carrier` left the kind prefix in place and every cell truncated to the
 *     same 11 characters — nine identical columns implying nothing rotates,
 *     on the very lane that had just been fixed.
 */
function short(s: string | null, kind: string): string {
  if (!s) return '—';
  const base = s.replace(/\.mp4$/, '');
  if (base.startsWith(`${kind}_carrier`) || /_carrier/.test(base)) {
    const v = base.replace(/^.*_carrier_?/, '');
    return v || 'incumbent';
  }
  if (base.startsWith('anchor_intro')) return base.replace(/^anchor_intro_?/, '') || 'standard';
  return base;
}

console.log(`\nROTATION SCHEDULE — ${days} days from ${from}${from === TODAY ? ' (today, ET)' : ''}\n`);

for (const lane of lanes) {
  const r = laneReport(lane, from, days, kinds);
  const pools = [...new Set(r.rotating.map(k => r.poolSizes[k]))].sort((a, b) => a - b).join('/');
  const cycle = r.period ? `${r.period}-day cycle` : 'no fixed cycle';
  const recur = r.minGap
    ? `closest identical arrangement ${r.minGap}d apart (${r.minGapAt?.[0]} → ${r.minGapAt?.[1]})`
    : 'no full repeat in 300d';
  const alarm = r.minGap && r.minGap < PERIOD_WARN_BELOW ? '  ⚠ inside a week' : '';

  console.log(`═══ ${lane.name.toUpperCase()} — ${r.rotating.length} rotating · pool ${pools || 'n/a'} · ${cycle} · ${recur}${alarm}`);
  console.log('  ' + 'date'.padEnd(W) + kinds.map(cell).join(''));
  for (const row of r.rows) {
    const flagged = row.dupes > 0 ? `  ${row.dupes} repeat${row.dupes > 1 ? 's' : ''}` : '';
    console.log('  ' + row.date.padEnd(W) + row.picks.map((p, i) => cell(short(p, kinds[i]))).join('') + flagged);
  }
  if (!lane.sharedPool) {
    console.log(`  note: sets are per-kind and disjoint, so repeats above count kinds sharing a SET POSITION (lockstep), not a shared file.`);
  }
  console.log('');
}

if (!only) {
  console.log('═══ COMBINATION DEPTH — intro × stinger × endcard × carrier, per kind');
  console.log('  kind             distinct   repeats after');
  for (const k of kinds.map(k => ({ k, n: comboDistinct(k, from), p: comboPeriod(k, from) })).sort((a, b) => a.n - b.n)) {
    const mark = k.n < 14 ? ' ⚠ thin' : '';
    console.log(`  ${k.k.padEnd(16)} ${String(k.n).padStart(6)}   ${k.p ? `${k.p}d` : '>300d'}${mark}`);
  }
  console.log(`\n  DISTINCT is how many arrangements the assets can produce — the number to`);
  console.log(`  budget against. REPEATS AFTER is how long the schedule takes to come back`);
  console.log(`  round, which the reshuffle stretches. A kind can be thin and still never`);
  console.log(`  visibly repeat; only new assets raise the left-hand column.`);
}
console.log(`\n  Window: ${from} → ${addDays(from, days - 1)}\n`);
