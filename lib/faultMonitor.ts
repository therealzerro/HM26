// ─── faultMonitor.ts ─────────────────────────────────────────────────────────
// FAULT-MON-01 (2026-10-25) — the GROSS-FAULT monitor proposed in ENG-REVIEW-04.
//
// Premise (settled in the audit): a fair pick-3 draw carries no forward
// information, so every documented fixed-odds edge in this game came from a
// NON-UNIFORM DRAW — a machine or RNG fault (PA 1980 rig; AZ 2013 RNG bug that
// excluded digits for 55 days; AZ 2017 seed fault; DC 2026-03-31→04-21 Smartplay
// recert bug that could not draw repeated digits). DC's fault was in our own
// ledger (13/13 DC midday singles) and nobody was looking. This module looks.
//
// Pure functions, no I/O, no React Native — shared by the CLI
// (scripts/monitor/fault-monitor.ts) and the reel pre-flight (read-only,
// fail-open NOTE). Never touches the engine. Never writes.
//
// Detectors, per jurisdiction×session stream:
//   A. CLASS MIX e-process — anytime-valid Bayes factor on the
//      single/double/triple mix vs the fair .72/.27/.01, from fixed monthly
//      anchors. Mixture of a point alternative ("no repeated digits", the DC
//      fault class: per-draw ratio 1/.72) and a Dirichlet(1,1,1)-multinomial
//      (any other class skew). A mixture of e-processes is an e-process, so
//      the operator may read it after ANY draw with no peeking penalty.
//   B. DIGIT-POSITION e-process — Dirichlet(1¹⁰)-multinomial vs uniform on
//      each position's digit counts, same anchors (AZ-2013 class, slow burn).
//   C. DIGIT ABSENCE — current run of draws since a digit last appeared in a
//      position (the fast detector for an excluded digit; (10/9)^run is its
//      e-value).
//   D. ZERO DOUBLES screen — no double or triple in the trailing 20 draws
//      (P = .72^20 = .0014). Spec (a) from ENG-REVIEW-04; WATCH only.
//   E. EXACT REPEAT screen — the same three digits drawn back-to-back, twice
//      inside 14 days, trailing 60 days (stuck-ball / stuck-seed class). WATCH only.
//
// Thresholds are set for the MULTIPLICITY actually in play (≈75 streams, 225
// position cells, 2,250 digit cells, ≈7 monthly anchors a year), not per cell:
//   A  WATCH e ≥ 100   FLAG e ≥ 1,000     (525 stream-anchors → ≤ .5 false FLAG / yr, loose bound)
//   B  WATCH e ≥ 1,000 FLAG e ≥ 10,000    (1,575 cell-anchors)
//   C  WATCH run ≥ 90  FLAG run ≥ 120     (P(run≥120)=3.2e-6 × 2,250 cells ≈ .007 at any instant,
//                                          ≈ .3 new false FLAGs a year; WATCH ≈ .17 at any instant)
//   D, E  WATCH only, trailing 60 days (E = back-to-back exact repeat twice in 14 days,
//         P ≈ 4e-4 per stream-window → ≈ .4 chance WATCH a year across 70 streams).
// Validation (see __tests__/faultMonitor.test.ts): DC midday as the ledger has
// it (first row 4/9, 13 singles through 4/21) reads e ≈ 36 — rising, below
// WATCH (so were MI evening and CO midday that day: 13 straight singles is a
// 1-in-70 run and the ledger had 69 streams). The class-mix e-value crosses
// WATCH on the 17th consecutive single from an anchor and FLAG on the 24th;
// had DC been ingested from 3/31 (22 fault draws per session) the midday
// stream reads WATCH on 4/16 and would have FLAGGED on the 24th draw had the
// fault run two more days. Faster FLAGs need more streams to agree (the DC
// fault hit midday AND evening) — read the top-e list, not just the FLAG line. A FLAG means: THAT state's draw is not uniform right now; every
// single-set box ticket there pays 1.25 on the dollar until the lottery fixes
// it. Expected frequency: a few per decade across ~40 games. Operator reads the
// output; nothing here is scheduled (ops_no_auto_crons).

export interface FaultDraw {
  /** ISO date (ET) of the draw */
  date: string;
  /** exactly three digits as drawn, e.g. '217' */
  digits: string;
}

export type FaultSeverity = 'FLAG' | 'WATCH';
export type FaultKind = 'class-mix' | 'digit-position' | 'digit-absence' | 'zero-doubles' | 'exact-repeat';

export interface FaultSignal {
  stream: string;
  kind: FaultKind;
  severity: FaultSeverity;
  /** the statistic that crossed, formatted */
  stat: string;
  /** one line the operator can act on */
  detail: string;
  /** draws the statistic was computed on */
  n: number;
}

export interface EValueRow {
  stream: string;
  kind: 'class-mix' | 'digit-position';
  /** position 0..2 for digit-position; undefined for class-mix */
  position?: number;
  anchor: string;
  n: number;
  e: number;
  /** e.g. 'singles 13 doubles 0 triples 0' */
  counts: string;
}

export interface FaultScan {
  streams: number;
  draws: number;
  anchors: string[];
  signals: FaultSignal[];
  /** every stream×anchor e-value, descending — the operator's "what is rising" view */
  eValues: EValueRow[];
}

export const CLASS_P = { single: 0.72, double: 0.27, triple: 0.01 } as const;
export const THRESHOLDS = {
  classMix: { watch: 100, flag: 1_000 },
  digitPosition: { watch: 1_000, flag: 10_000 },
  absenceRun: { watch: 90, flag: 120 },
  zeroDoublesWindow: 20,
  repeatWithinDraws: 1,
  repeatWindowDays: 14,
  screenTrailingDays: 60,
  minDrawsForE: 5,
} as const;

export function classOf(digits: string): 'single' | 'double' | 'triple' {
  const [a, b, c] = digits;
  if (a === b && b === c) return 'triple';
  if (a === b || b === c || a === c) return 'double';
  return 'single';
}

// ── integer log-gamma via memoised log-factorial (all our arguments are integers) ──
const LOG_FACT: number[] = [0];
export function logFactorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) throw new Error(`logFactorial: ${n}`);
  while (LOG_FACT.length <= n) LOG_FACT.push(LOG_FACT[LOG_FACT.length - 1] + Math.log(LOG_FACT.length));
  return LOG_FACT[n];
}
/** ln Γ(k) for integer k ≥ 1 */
export function logGammaInt(k: number): number { return logFactorial(k - 1); }

/**
 * log Bayes factor of a Dirichlet(1,…,1)-multinomial marginal against fixed
 * category probabilities p. Positive = data favour "some other composition".
 * Under p this is a non-negative martingale with expectation 1 (an e-process).
 */
export function logBfDirichlet(counts: number[], p: number[]): number {
  if (counts.length !== p.length) throw new Error('logBfDirichlet: length mismatch');
  const K = counts.length;
  const n = counts.reduce((s, c) => s + c, 0);
  let lm = logGammaInt(K) - logGammaInt(K + n);
  let l0 = 0;
  for (let i = 0; i < K; i++) {
    lm += logGammaInt(counts[i] + 1);
    l0 += counts[i] * Math.log(p[i]);
  }
  return lm - l0;
}

/**
 * Point alternative "the draw cannot repeat a digit" (DC 2026 class): every
 * draw is a single, uniform over the 720 single straights. Per-draw likelihood
 * ratio vs fair = (1/720)/(1/1000) = 1/.72; dies (0) at the first double/triple.
 */
export function logBfNoRepeats(singles: number, doubles: number, triples: number): number {
  if (doubles + triples > 0) return -Infinity;
  return -singles * Math.log(CLASS_P.single);
}

/** e-value of the class-mix mixture (½ point-alternative + ½ Dirichlet). */
export function classMixE(singles: number, doubles: number, triples: number): number {
  const ePoint = Math.exp(logBfNoRepeats(singles, doubles, triples));
  const eDir = Math.exp(logBfDirichlet([singles, doubles, triples], [CLASS_P.single, CLASS_P.double, CLASS_P.triple]));
  return 0.5 * (Number.isFinite(ePoint) ? ePoint : 0) + 0.5 * eDir;
}

/** e-value of a position's digit counts vs uniform. */
export function digitPositionE(counts10: number[]): number {
  return Math.exp(logBfDirichlet(counts10, new Array(10).fill(0.1)));
}

/** First-of-month anchors from `from` through `to` (inclusive of `from` itself). */
export function monthlyAnchors(from: string, to: string): string[] {
  const out = new Set<string>([from]);
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  while (d.toISOString().slice(0, 10) <= to) {
    const iso = d.toISOString().slice(0, 10);
    if (iso >= from) out.add(iso);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return [...out].sort();
}

function fmt(e: number): string {
  if (!Number.isFinite(e)) return '∞';
  if (e >= 1000) return e.toExponential(1);
  return e >= 10 ? e.toFixed(0) : e.toFixed(1);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Scan one stream (draws in chronological order). Returns its signals and its
 * e-value rows for every anchor that has at least `minDrawsForE` draws.
 */
export function scanStream(stream: string, draws: FaultDraw[], anchors: string[]): { signals: FaultSignal[]; eValues: EValueRow[] } {
  const signals: FaultSignal[] = [];
  const eValues: EValueRow[] = [];
  const n = draws.length;
  if (n === 0) return { signals, eValues };

  // A + B — e-processes from each anchor
  for (const anchor of anchors) {
    const sub = draws.filter(d => d.date >= anchor);
    if (sub.length < THRESHOLDS.minDrawsForE) continue;
    let s = 0, dbl = 0, tri = 0;
    const pos: number[][] = [new Array(10).fill(0), new Array(10).fill(0), new Array(10).fill(0)];
    for (const d of sub) {
      const c = classOf(d.digits);
      if (c === 'single') s++; else if (c === 'double') dbl++; else tri++;
      for (let i = 0; i < 3; i++) pos[i][Number(d.digits[i])]++;
    }
    const eMix = classMixE(s, dbl, tri);
    eValues.push({ stream, kind: 'class-mix', anchor, n: sub.length, e: eMix, counts: `singles ${s} doubles ${dbl} triples ${tri}` });
    if (eMix >= THRESHOLDS.classMix.watch) {
      signals.push({
        stream, kind: 'class-mix', severity: eMix >= THRESHOLDS.classMix.flag ? 'FLAG' : 'WATCH', n: sub.length,
        stat: `e=${fmt(eMix)} from ${anchor}`,
        detail: `${stream}: single/double/triple mix ${s}/${dbl}/${tri} over ${sub.length} draws since ${anchor} (fair ≈ ${(sub.length * 0.72).toFixed(0)}/${(sub.length * 0.27).toFixed(0)}/${(sub.length * 0.01).toFixed(1)})${dbl + tri === 0 ? ' — NO repeated digits drawn: DC-2026 fault class, single-set box pays 1.25 there while it lasts' : ''}`,
      });
    }
    for (let i = 0; i < 3; i++) {
      const eP = digitPositionE(pos[i]);
      eValues.push({ stream, kind: 'digit-position', position: i, anchor, n: sub.length, e: eP, counts: pos[i].join(' ') });
      if (eP >= THRESHOLDS.digitPosition.watch) {
        signals.push({
          stream, kind: 'digit-position', severity: eP >= THRESHOLDS.digitPosition.flag ? 'FLAG' : 'WATCH', n: sub.length,
          stat: `e=${fmt(eP)} pos ${i + 1} from ${anchor}`,
          detail: `${stream}: position ${i + 1} digit counts [${pos[i].join(' ')}] over ${sub.length} draws since ${anchor} are not uniform`,
        });
      }
    }
  }

  // C — current absence run per (position, digit), measured back from the newest draw
  for (let i = 0; i < 3; i++) {
    for (let dg = 0; dg <= 9; dg++) {
      let run = 0;
      for (let k = n - 1; k >= 0; k--) { if (Number(draws[k].digits[i]) === dg) break; run++; }
      if (run >= THRESHOLDS.absenceRun.watch) {
        const sinceAll = run === n; // never seen in the window
        signals.push({
          stream, kind: 'digit-absence', severity: run >= THRESHOLDS.absenceRun.flag ? 'FLAG' : 'WATCH', n,
          stat: `digit ${dg} absent from pos ${i + 1} for ${run}${sinceAll ? '+' : ''} draws`,
          detail: `${stream}: digit ${dg} has not appeared in position ${i + 1} for ${run}${sinceAll ? ' (the whole window)' : ''} draws (fair P = ${(0.9 ** run).toExponential(1)}; e=(10/9)^${run}=${fmt((10 / 9) ** run)}) — AZ-2013 excluded-digit class`,
        });
      }
    }
  }

  // D — zero doubles/triples in the trailing window
  if (n >= THRESHOLDS.zeroDoublesWindow) {
    const tail = draws.slice(-THRESHOLDS.zeroDoublesWindow);
    if (tail.every(d => classOf(d.digits) === 'single')) {
      signals.push({
        stream, kind: 'zero-doubles', severity: 'WATCH', n: tail.length,
        stat: `0 doubles in last ${tail.length}`,
        detail: `${stream}: no double or triple in the trailing ${tail.length} draws (${tail[0].date}→${tail[tail.length - 1].date}; fair P = ${(0.72 ** tail.length).toExponential(1)}) — watch the class-mix e-value`,
      });
    }
  }

  // E — back-to-back exact repeats, twice inside 14 days, trailing 60 days only
  const repeats: { date: string; digits: string; gap: number }[] = [];
  const screenFrom = (() => { const d = new Date(`${draws[n - 1].date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - THRESHOLDS.screenTrailingDays); return d.toISOString().slice(0, 10); })();
  for (let k = 1; k < n; k++) {
    if (draws[k].date < screenFrom) continue;
    for (let g = 1; g <= THRESHOLDS.repeatWithinDraws && k - g >= 0; g++) {
      if (draws[k].digits === draws[k - g].digits) { repeats.push({ date: draws[k].date, digits: draws[k].digits, gap: g }); break; }
    }
  }
  for (let a = 0; a + 1 < repeats.length; a++) {
    if (daysBetween(repeats[a].date, repeats[a + 1].date) <= THRESHOLDS.repeatWindowDays) {
      signals.push({
        stream, kind: 'exact-repeat', severity: 'WATCH', n,
        stat: `${repeats[a].digits} (${repeats[a].date}) + ${repeats[a + 1].digits} (${repeats[a + 1].date})`,
        detail: `${stream}: two back-to-back exact repeats inside ${THRESHOLDS.repeatWindowDays} days — ${repeats[a].digits} on ${repeats[a].date} (gap ${repeats[a].gap}) and ${repeats[a + 1].digits} on ${repeats[a + 1].date} (gap ${repeats[a + 1].gap}); stuck-ball / stuck-seed class`,
      });
      break;
    }
  }

  return { signals, eValues };
}

/**
 * Scan every stream. `rows` need not be sorted; `asOf` (inclusive) truncates
 * the ledger so the monitor can be replayed on any past date.
 */
export function scanFaults(
  rows: { stream: string; date: string; digits: string; order?: string }[],
  opts: { from: string; asOf: string },
): FaultScan {
  const byStream = new Map<string, FaultDraw[]>();
  let draws = 0;
  for (const r of rows) {
    if (r.date < opts.from || r.date > opts.asOf) continue;
    if (!/^\d{3}$/.test(r.digits)) continue;
    draws++;
    const list = byStream.get(r.stream) ?? [];
    list.push({ date: r.date, digits: r.digits, ...(r.order ? { order: r.order } : {}) } as FaultDraw);
    byStream.set(r.stream, list);
  }
  const anchors = monthlyAnchors(opts.from, opts.asOf);
  const signals: FaultSignal[] = [];
  const eValues: EValueRow[] = [];
  for (const [stream, list] of byStream) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : ((a as any).order ?? '') < ((b as any).order ?? '') ? -1 : 1));
    const r = scanStream(stream, list, anchors);
    signals.push(...r.signals);
    eValues.push(...r.eValues);
  }
  const rank = (s: FaultSignal) => (s.severity === 'FLAG' ? 0 : 1);
  signals.sort((a, b) => rank(a) - rank(b) || a.stream.localeCompare(b.stream));
  eValues.sort((a, b) => b.e - a.e);
  return { streams: byStream.size, draws, anchors, signals, eValues };
}

/** Human-readable report lines (no I/O). */
export function formatFaultReport(scan: FaultScan, opts: { from: string; asOf: string; top?: number }): string[] {
  const top = opts.top ?? 5;
  const lines: string[] = [];
  const flags = scan.signals.filter(s => s.severity === 'FLAG');
  const watches = scan.signals.filter(s => s.severity === 'WATCH');
  lines.push(`fault-monitor: window ${opts.from}→${opts.asOf} · ${scan.draws.toLocaleString()} draws · ${scan.streams} streams · anchors ${scan.anchors.join(', ')}`);
  lines.push(`fault-monitor: FLAG ${flags.length} · WATCH ${watches.length}`);
  for (const s of flags) lines.push(`fault-monitor: ⚠ FLAG [${s.kind}] ${s.detail}`);
  for (const s of watches) lines.push(`fault-monitor: WATCH [${s.kind}] ${s.detail}`);
  const topMix = scan.eValues.filter(r => r.kind === 'class-mix').slice(0, top);
  const topPos = scan.eValues.filter(r => r.kind === 'digit-position').slice(0, top);
  lines.push(`fault-monitor: top class-mix e-values: ${topMix.map(r => `${r.stream} ${fmt(r.e)} (${r.counts}, n ${r.n} from ${r.anchor})`).join(' · ') || 'none'}`);
  lines.push(`fault-monitor: top digit-position e-values: ${topPos.map(r => `${r.stream} pos ${(r.position ?? 0) + 1} ${fmt(r.e)} (n ${r.n} from ${r.anchor})`).join(' · ') || 'none'}`);
  if (flags.length === 0) lines.push('fault-monitor: no stream is drawing non-uniformly at the FLAG level — every set is as good as every other today');
  else lines.push('fault-monitor: a FLAG is the only mathematically positive bet this game offers — confirm against the official draw list, then bet single-set box in that state at full size until the lottery announces a fix');
  return lines;
}
