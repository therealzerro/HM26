// STAT-01 PHASE 2 — THE ANALYTIC BASE RATE. Closed form over the Phase 1 ledger.
//
// Reads docs/stat01/ledger.csv (never the DB) and, for every SURVIVING row,
// sets the null per-draw box probability to the EXACT SUM over the board's
// picks of their class probability (six-way .006 / double .003 / triple .001 —
// the 220 box classes partition the 1000 outcomes, so distinct classes are
// disjoint against one draw). Straights: each ordered pick is 1/1000.
//
// ⚠ EVERY z HERE IS CRUDE (order §2.3): it assumes independent draw events and
// an unconditional null. One board is graded against many correlated events
// and the composition effect is only approximately handled. It exists to say
// whether Phase 3 is worth running. It is never the result. Do not quote it.
//
// ⛔ No permutation, no p-value, no DUE-01 here (Phase 3, gated).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const CLASS_P: Record<string, number> = { sixway: 0.006, double: 0.003, triple: 0.001 };
const dir = join(process.cwd(), 'docs', 'stat01');
const csv = readFileSync(join(dir, 'ledger.csv'), 'utf8');
const ledgerHash = createHash('sha256').update(csv).digest('hex');
const lines = csv.trim().split('\n');
// RFC-4180 reader (the tri-state jurisdiction is "ME,NH,VT", written quoted).
function parseLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur); return out;
}
const header = parseLine(lines[0]);
const col = (name: string) => { const i = header.indexOf(name); if (i < 0) throw new Error('missing col ' + name); return i; };
const C = {
  date: col('date'), scope: col('scope'), jur: col('jurisdiction'), session: col('session'), digits: col('winning_digits'),
  board: col('board_id'), combos: col('board_combos'), best: col('board_best_orders'),
  n6: col('n_sixway'), n2: col('n_double'), n1: col('n_triple'),
  box: col('box_match'), straight: col('straight_match'), matched: col('matched_combo'), excluded: col('excluded'),
};
interface Row { date: string; scope: string; jur: string; session: string; digits: string; board: string; combos: string[]; best: string[];
  pBox: number; pStr: number; box: number; straight: number; matched: string; straightByCombo: number; setOfDraw: string }
const toSet = (d: string) => d.split('').sort().join('');
const rows: Row[] = [];
for (const line of lines.slice(1)) {
  const f = parseLine(line);
  if (f.length !== header.length) throw new Error('column count mismatch: ' + line.slice(0, 80));
  if (f[C.excluded] === '1') continue;
  const n6 = +f[C.n6], n2 = +f[C.n2], n1 = +f[C.n1];
  const combos = f[C.combos].split(' ').filter(Boolean);
  const best = f[C.best].split(' ').filter(Boolean);
  const digits = f[C.digits];
  rows.push({
    date: f[C.date], scope: f[C.scope], jur: f[C.jur], session: f[C.session], digits, board: f[C.board], combos, best,
    pBox: n6 * CLASS_P.sixway + n2 * CLASS_P.double + n1 * CLASS_P.triple,
    pStr: new Set(best).size / 1000,
    box: +f[C.box], straight: +f[C.straight], matched: f[C.matched],
    straightByCombo: combos.includes(digits) ? 1 : 0,   // definition sensitivity: straight vs `combo` instead of `bestOrder ?? combo`
    setOfDraw: toSet(digits),
  });
}

function summarize(rs: Row[], label: string) {
  const scopes = ['allday', 'midday', 'evening'];
  const out: any = { label, rows: rs.length };
  const perScope: any = {};
  const dayKeys = (subset: Row[]) => {
    const m = new Map<string, { pNo: number; pNoStr: number; obs: number; obsStr: number }>();
    for (const r of subset) {
      const k = `${r.scope}|${r.date}`;
      const e = m.get(k) ?? { pNo: 1, pNoStr: 1, obs: 0, obsStr: 0 };
      e.pNo *= 1 - r.pBox; e.pNoStr *= 1 - r.pStr; e.obs += r.box; e.obsStr += r.straight;
      m.set(k, e);
    }
    return m;
  };
  const block = (subset: Row[]) => {
    const expBox = subset.reduce((a, r) => a + r.pBox, 0);
    const obsBox = subset.reduce((a, r) => a + r.box, 0);
    const expStr = subset.reduce((a, r) => a + r.pStr, 0);
    const obsStr = subset.reduce((a, r) => a + r.straight, 0);
    const obsStrByCombo = subset.reduce((a, r) => a + r.straightByCombo, 0);
    const days = dayKeys(subset);
    const expDays = [...days.values()].reduce((a, e) => a + (1 - e.pNo), 0);
    const obsDays = [...days.values()].filter(e => e.obs > 0).length;
    const expDaysStr = [...days.values()].reduce((a, e) => a + (1 - e.pNoStr), 0);
    const obsDaysStr = [...days.values()].filter(e => e.obsStr > 0).length;
    const boardDays = new Set(subset.map(r => `${r.scope}|${r.date}`)).size;
    const dates = new Set(subset.map(r => r.date)).size;
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    return {
      graded_draw_events: subset.length, board_days: boardDays, distinct_dates: dates,
      draws_per_board_day: r3(subset.length / boardDays),
      mean_board_p_per_draw: r3(expBox / subset.length * 1000) / 1000,
      box: { observed: obsBox, expected: r3(expBox), lift: r3(obsBox / expBox), crude_poisson_z_DO_NOT_QUOTE: r3((obsBox - expBox) / Math.sqrt(expBox)),
             per_1000_draws_observed: r3(obsBox / subset.length * 1000), per_1000_draws_expected: r3(expBox / subset.length * 1000) },
      straight: { observed: obsStr, expected: r3(expStr), lift: r3(obsStr / expStr), crude_poisson_z_DO_NOT_QUOTE: r3((obsStr - expStr) / Math.sqrt(expStr)),
                  observed_if_graded_against_combo_not_bestOrder: obsStrByCombo },
      days_with_ge1_box: { observed: obsDays, expected: r3(expDays), of: boardDays },
      days_with_ge1_straight: { observed: obsDaysStr, expected: r3(expDaysStr), of: boardDays },
    };
  };
  for (const s of scopes) perScope[s] = block(rs.filter(r => r.scope === s));
  out.per_scope = perScope;
  out.pooled_three_boards = block(rs);
  // Day-level (any board) — the instrument reference for 0.5 / Addition B
  const byDate = new Map<string, { pNoStr: number; obsStr: number; pNoBox: number; obsBox: number }>();
  for (const r of rs) {
    const e = byDate.get(r.date) ?? { pNoStr: 1, obsStr: 0, pNoBox: 1, obsBox: 0 };
    e.pNoStr *= 1 - r.pStr; e.obsStr += r.straight; e.pNoBox *= 1 - r.pBox; e.obsBox += r.box; byDate.set(r.date, e);
  }
  const nd = byDate.size;
  out.any_board_per_calendar_day = {
    dates: nd,
    straight: { expected_per_day: +(rs.reduce((a, r) => a + r.pStr, 0) / nd).toFixed(3),
                expected_days_with_ge1: +[...byDate.values()].reduce((a, e) => a + (1 - e.pNoStr), 0).toFixed(1),
                observed_days_with_ge1: [...byDate.values()].filter(e => e.obsStr > 0).length },
    box: { expected_per_day: +(rs.reduce((a, r) => a + r.pBox, 0) / nd).toFixed(3),
           expected_days_with_ge1: +[...byDate.values()].reduce((a, e) => a + (1 - e.pNoBox), 0).toFixed(1),
           observed_days_with_ge1: [...byDate.values()].filter(e => e.obsBox > 0).length },
  };
  return out;
}

const primary = summarize(rows, 'PRIMARY 2026-04-18 → 2026-09-19');
const secondary = summarize(rows.filter(r => r.date >= '2026-07-23'), 'SECONDARY (corroborated era) 2026-07-23 → 2026-09-19');

// ── The record reel's window, reproduced from the re-graded ledger (G2 copy rule) ──
const rec = rows.filter(r => r.date >= '2026-08-20' && r.date <= '2026-09-18');
const recMatches = rec.filter(r => r.box || r.straight);
const reelKey = new Set(recMatches.map(r => `${r.date}|${r.scope}|${r.matched}|${r.jur}`));
const reelKeyStraight = new Set(recMatches.filter(r => r.straight).map(r => `${r.date}|${r.scope}|${r.matched}|${r.jur}`));
const perScopeRec: any = {};
for (const s of ['allday', 'midday', 'evening']) {
  const sub = recMatches.filter(r => r.scope === s);
  perScopeRec[s] = { ledger_grain_matches: sub.length, reel_key_dedupe: new Set(sub.map(r => `${r.date}|${r.scope}|${r.matched}|${r.jur}`)).size,
                     straights: sub.filter(r => r.straight).length };
}
const recordWindow = {
  window: '2026-08-20 → 2026-09-18 (the 9/18 record_public reel)',
  reel_rendered: { matches: 159, split: { allday: 75, evening: 55, midday: 29 }, exact: 15, days: 29, juris: 38, source: 'adaptive_tracking stored flags, live boards, dedupe (date|scope|combo|state)' },
  ledger_regraded: {
    ledger_grain_matches_pooled: recMatches.length, reel_key_dedupe_pooled: reelKey.size, per_scope: perScopeRec,
    straights_pooled: recMatches.filter(r => r.straight).length, straights_reel_key_dedupe: reelKeyStraight.size,
    days_with_ge1_any_board: new Set(recMatches.map(r => r.date)).size, of_days: new Set(rec.map(r => r.date)).size,
    distinct_jurisdictions_matched: new Set(recMatches.map(r => r.jur)).size,
    expected_box_pooled_crude: +rec.reduce((a, r) => a + r.pBox, 0).toFixed(1),
    expected_straight_pooled_crude: +rec.reduce((a, r) => a + r.pStr, 0).toFixed(1),
    expected_days_with_ge1_any_board_crude: +(() => { const m = new Map<string, number>(); for (const r of rec) m.set(r.date, (m.get(r.date) ?? 1) * (1 - r.pBox)); return [...m.values()].reduce((a, p) => a + (1 - p), 0); })().toFixed(1),
    boards_in_window_surviving: new Set(rec.map(r => `${r.scope}|${r.date}`)).size,
  },
};

// bestOrder ≠ combo on surviving boards (definition note for the straight read)
const boardSeen = new Map<string, { combos: string[]; best: string[] }>();
for (const r of rows) if (!boardSeen.has(r.board)) boardSeen.set(r.board, { combos: r.combos, best: r.best });
let picks = 0, diverge = 0;
for (const b of boardSeen.values()) for (let i = 0; i < b.combos.length; i++) { picks++; if (b.combos[i] !== b.best[i]) diverge++; }

const summary = { ledger_sha256: ledgerHash, class_p: CLASS_P, surviving_boards: boardSeen.size, surviving_picks: picks, bestOrder_ne_combo: diverge,
  primary, secondary, record_reel_window: recordWindow,
  caption: 'ALL z VALUES ARE CRUDE (independent-draws, unconditional null) — Phase 3 replaces them. Never quote.' };
writeFileSync(join(dir, 'phase2_summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
