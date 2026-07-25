// lib/brief/computeBrief.ts
//
// Per-scope daily brief computation — the in-app equivalent of the morning
// brief runbook (docs/morning_brief.md) and the Node PDF scripts. Pure,
// READ-ONLY: reads current slate_snapshots / histories / daily_intelligence /
// app_config and writes nothing, so it never touches the engine and does not
// trip the no-regen rule.
//
// All yesterday-validation numbers are FAITHFUL (slate ∩ histories), never the
// stored daily_intelligence hit flags (BUG-162). The 90d footprint is restricted
// to the top-10 jurisdictions by 30d box correlation (Query 3 semantics) so it
// stays a breadth signal, not a where-to-bet directive — the operator plays all
// states. Calibrated P(hit) replicates docs/queries/pick_probabilities.sql
// (CALIB-01b logistic) in TS.
//
// Logic parity source: scripts/generate-jurisdiction-report.ts +
// generate-morning-brief-pdf.ts. Keep them in sync; if this drifts, the in-app
// brief and the committed PDF will disagree.
//
// Full-brief (cross-scope) layer on top: reorder validation, Daily-Workflow
// freshness (engine_daily_report), midday pos 1–2 exclusion, unit allocation.
// These are decision-layer only and have no PDF counterpart.

import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET } from '@/lib/dateUtils';

export type Scope = 'midday' | 'evening' | 'allday';
export const SCOPES: Scope[] = ['midday', 'evening', 'allday'];

// Midday structural rank inversion — 4× confirmed (z≈2.6, deep scope 7/23):
// slate positions 1–2 underperform 3–5. Excluded from play/allocation, flagged
// in the tier table. Positions are slate JSON ordinality, not DI rank.
export const MIDDAY_EXCLUDED_POS = new Set([1, 2]);

export interface BriefPick {
  scope: Scope;
  slatePos: number;
  combo: string;
  comboSet: string;
  bestOrder: string;
  tag: string;
  hits14d: number;
  multiplicity: string;
  pHit: number;          // percent, 1dp
  footprint90: number;   // top-10-JX-restricted box appearances
  topJx: string;         // "MI:4, NY:4, DC:2" — 90d per-JX breakdown (top 5)
  convScopes: Scope[];   // scopes whose slate carries this set today
  tier: string;          // 'T1×Conv' | 'T1' | 'T2·Conv' | 'T2·Overdue' | 'T3' | 'T4'
  tierRank: number;      // 1..7 for sorting
  excluded: boolean;     // midday pos 1–2 rule — never in play/allocation
}

export interface BriefAllocation {
  units: number;         // stake units, top-down from T1 (2/2/1)
  combo: string;
  comboSet: string;
  bestOrder: string;
  scopes: Scope[];       // slates carrying this set today
  tier: string;
  footprint90: number;
  pHit: number;          // best calibrated P(hit) across carrying scopes
  topJx: string;
  withStraight: boolean; // strongest pick also plays the straight order
}

export interface RollWindow { hit: number; tot: number; pct: number | null }

export interface ScopeBrief {
  scope: Scope;
  // [1] yesterday validation (faithful)
  yesterday: {
    slateHit: boolean;
    picksHit: number;
    stateInst: number;
    hittingCombos: string[];   // sorted-set digit strings, e.g. "059"
    pick1Combo: string | null;
    pick1Hit: boolean;
  };
  rolling: { d7: RollWindow; d30: RollWindow };
  // [2] today pre-flight
  preflight: {
    status: 'PASS' | 'WARN' | 'FAIL' | 'MISSING';
    pickCount: number;
    pick1Combo: string | null;
    pick1Tag: string | null;
    pick1Straight: string | null;
    engineVersion: string | null;
  };
  // [3] this scope's picks, tier-sorted
  picks: BriefPick[];
  // [4] recommended play (1-2 strongest by evidence)
  play: BriefPick[];
  // [5] red flags
  flags: string[];
}

export interface BriefData {
  date: string;
  yesterday: string;
  calibFittedAt: string | null;
  calibAgeDays: number | null;
  top10: { j: string; pct: number; box: number; draws: number }[];
  scopes: Record<Scope, ScopeBrief>;
  // full-brief (cross-scope) additions
  reorder: { hit: number; total: number };            // yesterday pick #1 outcomes
  workflow: { reportUpdatedAt: string | null; stale: boolean }; // Daily Workflow Step 5 freshness (today only)
  allocation: BriefAllocation[];
  globalFlags: string[];
}

// ── helpers ────────────────────────────────────────────────────────────────
function addDays(d: string, n: number): string {
  const dt = new Date(d + 'T12:00:00');
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}
function round1(x: number): number { return Math.round(x * 10) / 10; }
function setToDigits(cs: string): string {
  // "{0,5,9}" -> "059"
  return cs.replace(/[{}\s]/g, '').split(',').join('');
}

async function paginate<T>(build: (off: number) => string, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let off = 0; off < 60000; off += size) {
    const page = await fetchFromSupabase<T[]>({ path: build(off) });
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < size) break;
  }
  return out;
}

function pHitSingles(calib: any, scope: Scope, box: number, pb: number, co: number, dgc: number): number {
  const feats = [scope === 'evening' ? 1 : 0, scope === 'midday' ? 1 : 0, box, pb, co, dgc];
  let z = calib.b;
  for (let i = 0; i < 6; i++) z += calib.w[i] * ((feats[i] - calib.mean[i]) / (calib.std[i] || 1));
  return 1 / (1 + Math.exp(-z));
}

function tierOf(footprint90: number, multiScope: boolean, tag: string): { tier: string; tierRank: number } {
  if (footprint90 >= 10 && multiScope) return { tier: 'T1×Conv', tierRank: 1 };
  if (footprint90 >= 10) return { tier: 'T1', tierRank: 2 };
  if (multiScope) return { tier: 'T2·Conv', tierRank: 3 };
  if (tag === 'overdue') return { tier: 'T2·Overdue', tierRank: 4 };
  if (footprint90 >= 6) return { tier: 'T3', tierRank: 5 };
  if (tag === 'strong') return { tier: 'T3', tierRank: 6 };
  return { tier: 'T4', tierRank: 7 };
}

// ── main ─────────────────────────────────────────────────────────────────────
// opts.middayPosRule: when true (admin BriefView), midday slate positions 1–2
// are excluded from per-scope `play`. Default false so buildSocialBrief — which
// publishes `play` to the subscriber groups — keeps its exact prior behavior
// (subscriber surfaces are hands-off). `excluded`/`allocation`/flags are
// admin-only consumers and always honor the rule.
export async function computeBrief(date: string, opts: { middayPosRule?: boolean } = {}): Promise<BriefData> {
  const middayPosRule = opts.middayPosRule ?? false;
  const YEST = addDays(date, -1);
  const win30Start = addDays(date, -30);
  const win90Start = addDays(date, -90);

  // --- fetches (read-only) ---
  const [todaySlates, slates30, hist30, hist90, di, calRows, reportRows] = await Promise.all([
    fetchFromSupabase<any[]>({ path: `/rest/v1/slate_snapshots?select=scope,slate_date,top_k_straights_json,horizons_present_json,updated_at_et&deleted_at=is.null&mode=eq.balanced&slate_date=eq.${date}&order=scope.asc` }),
    paginate<any>(off => `/rest/v1/slate_snapshots?select=scope,slate_date,top_k_straights_json&deleted_at=is.null&mode=eq.balanced&slate_date=gte.${win30Start}&slate_date=lte.${YEST}&limit=1000&offset=${off}`),
    paginate<any>(off => `/rest/v1/histories?select=date_et,session,jurisdiction,comboset_sorted,result_digits&date_et=gte.${win30Start}&date_et=lte.${YEST}&order=date_et.desc&limit=1000&offset=${off}`),
    paginate<any>(off => `/rest/v1/histories?select=date_et,jurisdiction,comboset_sorted&date_et=gte.${win90Start}&date_et=lt.${date}&order=date_et.desc&limit=1000&offset=${off}`),
    fetchFromSupabase<any[]>({ path: `/rest/v1/daily_intelligence?select=scope,rank,combo,best_order,multiplicity,signal_box,signal_pburst,signal_co,signal_dgc&mode=eq.balanced&on_slate=is.true&slate_date=eq.${date}` }),
    fetchFromSupabase<any[]>({ path: `/rest/v1/app_config?select=value&key=eq.pick_prob_calibration` }),
    fetchFromSupabase<any[]>({ path: `/rest/v1/engine_daily_report?select=scope,updated_at&slate_date=eq.${YEST}` }),
  ]);

  // Daily Workflow freshness (OPS-01: Step 5 is the sole writer; no crons).
  // Only meaningful when the brief is for today — historical updated_at values
  // can't reconstruct whether the workflow was on time back then.
  const reportUpdatedAt = reportRows?.length
    ? reportRows.map(r => String(r.updated_at)).sort().slice(-1)[0]
    : null;
  const workflowStale = date === getTodayET()
    && (!reportUpdatedAt || Date.now() - new Date(reportUpdatedAt).getTime() > 12 * 3600_000);

  const calib = calRows?.length ? (typeof calRows[0].value === 'string' ? JSON.parse(calRows[0].value) : calRows[0].value) : null;
  const calibFittedAt = calib?.fitted_at ?? null;
  const calibAgeDays = calibFittedAt
    ? Math.round((new Date(date + 'T12:00:00').getTime() - new Date(String(calibFittedAt).slice(0, 10) + 'T12:00:00').getTime()) / 86400000)
    : null;

  // index slates by date|scope
  type Idx = { combosets: Set<string>; picks: any[] };
  const idx = new Map<string, Idx>();
  for (const s of slates30) {
    const picks = Array.isArray(s.top_k_straights_json) ? s.top_k_straights_json : [];
    idx.set(`${s.slate_date}|${s.scope}`, { combosets: new Set(picks.map((p: any) => String(p.comboSet))), picks });
  }

  // draws indexes
  const drawsByDate = new Map<string, any[]>();
  const drawsByDateScope = new Map<string, any[]>();
  for (const d of hist30) {
    if (!drawsByDate.has(d.date_et)) drawsByDate.set(d.date_et, []);
    drawsByDate.get(d.date_et)!.push(d);
    const k = `${d.date_et}|${d.session}`;
    if (!drawsByDateScope.has(k)) drawsByDateScope.set(k, []);
    drawsByDateScope.get(k)!.push(d);
  }
  const relevantDraws = (scope: Scope, d: string) =>
    scope === 'allday' ? (drawsByDate.get(d) ?? []) : (drawsByDateScope.get(`${d}|${scope}`) ?? []);

  // top-10 jurisdictions by 30d box correlation
  const jxAgg = new Map<string, { draws: number; box: number }>();
  for (const d of hist30) {
    const ss = idx.get(`${d.date_et}|${d.session}`);
    const al = idx.get(`${d.date_et}|allday`);
    const boxHit = (ss?.combosets.has(d.comboset_sorted) ?? false) || (al?.combosets.has(d.comboset_sorted) ?? false);
    const a = jxAgg.get(d.jurisdiction) ?? { draws: 0, box: 0 };
    a.draws++; if (boxHit) a.box++;
    jxAgg.set(d.jurisdiction, a);
  }
  const top10 = [...jxAgg.entries()].filter(([, a]) => a.draws >= 20)
    .map(([j, a]) => ({ j, draws: a.draws, box: a.box, pct: round1(100 * a.box / a.draws) }))
    .sort((x, y) => y.pct - x.pct || y.box - x.box).slice(0, 10);
  const top10Set = new Set(top10.map(r => r.j));

  // 90d footprint restricted to top-10 JX, with per-JX breakdown
  const footprint = new Map<string, number>();
  const footprintJx = new Map<string, Map<string, number>>();
  for (const d of hist90) {
    if (!top10Set.has(d.jurisdiction)) continue;
    footprint.set(d.comboset_sorted, (footprint.get(d.comboset_sorted) ?? 0) + 1);
    if (!footprintJx.has(d.comboset_sorted)) footprintJx.set(d.comboset_sorted, new Map());
    const jm = footprintJx.get(d.comboset_sorted)!;
    jm.set(d.jurisdiction, (jm.get(d.jurisdiction) ?? 0) + 1);
  }
  const topJxOf = (cs: string): string => {
    const jm = footprintJx.get(cs);
    if (!jm) return '';
    return [...jm.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5).map(([j, n]) => `${j}:${n}`).join(', ');
  };

  // today: slate metadata + convergence
  const slateMeta = new Map<string, any>();   // scope|combo
  const convergence = new Map<string, Set<Scope>>();
  const preflightByScope = new Map<Scope, ScopeBrief['preflight']>();
  for (const s of todaySlates) {
    const scope = s.scope as Scope;
    const picks = Array.isArray(s.top_k_straights_json) ? s.top_k_straights_json : [];
    const p1 = picks[0];
    const hp = s.horizons_present_json ?? {};
    const status: ScopeBrief['preflight']['status'] =
      picks.length !== 6 ? 'FAIL'
      : !p1?.tag ? 'WARN'
      : hp._recent7dMatchRatePct == null ? 'WARN'
      : 'PASS';
    preflightByScope.set(scope, {
      status, pickCount: picks.length,
      pick1Combo: p1 ? String(p1.combo) : null,
      pick1Tag: p1 ? String(p1.tag ?? '') : null,
      pick1Straight: p1 ? String(p1.bestOrder ?? p1.combo) : null,
      engineVersion: hp._engineVersion ?? null,
    });
    for (const p of picks) {
      const cs = String(p.comboSet);
      slateMeta.set(`${scope}|${String(p.combo)}`, {
        slatePos: Number(p.rank), comboSet: cs, bestOrder: String(p.bestOrder ?? p.combo),
        tag: String(p.tag ?? ''), hits14d: Number(p.recentStateHits14d ?? 0),
      });
      if (!convergence.has(cs)) convergence.set(cs, new Set());
      convergence.get(cs)!.add(scope);
    }
  }

  // score every on-slate pick
  const allPicks: BriefPick[] = [];
  for (const d of di) {
    const scope = d.scope as Scope;
    const meta = slateMeta.get(`${scope}|${String(d.combo)}`);
    const num = (v: any) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    const box = num(d.signal_box), pb = num(d.signal_pburst), co = num(d.signal_co), dgc = num(d.signal_dgc);
    const pHit = !calib ? 0
      : d.multiplicity !== 'singles' ? (calib.base_rates?.[scope] ?? 0)
      : pHitSingles(calib, scope, box, pb, co, dgc);
    const cs = meta?.comboSet ?? '';
    const convScopes = (cs ? [...(convergence.get(cs) ?? [])] : []).sort() as Scope[];
    const fp = footprint.get(cs) ?? 0;
    const { tier, tierRank } = tierOf(fp, convScopes.length > 1, meta?.tag ?? '');
    const excluded = scope === 'midday' && meta != null && MIDDAY_EXCLUDED_POS.has(meta.slatePos);
    allPicks.push({
      scope, slatePos: meta?.slatePos ?? Number(d.rank), combo: String(d.combo), comboSet: cs,
      bestOrder: meta?.bestOrder ?? d.best_order ?? d.combo, tag: meta?.tag ?? '', hits14d: meta?.hits14d ?? 0,
      multiplicity: d.multiplicity, pHit: round1(pHit * 100), footprint90: fp, topJx: topJxOf(cs),
      convScopes, tier, tierRank, excluded,
    });
  }

  // assemble per-scope
  const scopes = {} as Record<Scope, ScopeBrief>;
  for (const scope of SCOPES) {
    // yesterday
    const sl = idx.get(`${YEST}|${scope}`);
    const yDraws = relevantDraws(scope, YEST);
    let picksHit = 0, stateInst = 0; const hittingCombos: string[] = [];
    if (sl) {
      for (const cs of sl.combosets) {
        const matches = yDraws.filter(d => d.comboset_sorted === cs);
        if (matches.length) { picksHit++; stateInst += matches.length; hittingCombos.push(setToDigits(cs)); }
      }
    }
    const yp1 = sl?.picks?.[0];
    const yp1Set = yp1 ? String(yp1.comboSet) : null;

    // rolling
    const roll = (days: number): RollWindow => {
      let hit = 0, tot = 0;
      for (let i = 1; i <= days; i++) {
        const dd = addDays(date, -i);
        const s = idx.get(`${dd}|${scope}`);
        const draws = relevantDraws(scope, dd);
        if (!s || draws.length === 0) continue;
        tot++;
        if ([...s.combosets].some(cs => draws.some(d => d.comboset_sorted === cs))) hit++;
      }
      return { hit, tot, pct: tot ? round1(100 * hit / tot) : null };
    };
    const d7 = roll(7), d30 = roll(30);

    // this scope's picks, tier-sorted
    const picks = allPicks.filter(p => p.scope === scope)
      .sort((a, b) => a.tierRank - b.tierRank || b.footprint90 - a.footprint90 || b.pHit - a.pHit || a.slatePos - b.slatePos);

    // recommended play: strongest evidence, singles only, top 2.
    // Under the admin pos-rule, midday pos 1–2 never qualify (structural
    // inversion, 4× confirmed).
    const play = [...picks]
      .filter(p => p.multiplicity === 'singles' && (!middayPosRule || !p.excluded))
      .sort((a, b) => {
        const score = (p: BriefPick) => p.footprint90 + p.pHit + (p.convScopes.length > 1 ? 12 : 0) + p.hits14d;
        return score(b) - score(a);
      })
      .slice(0, 2);

    // red flags
    const flags: string[] = [];
    if (scope === 'midday' && picks.some(p => p.excluded)) {
      const ex = picks.filter(p => p.excluded).map(p => `${p.combo} (#${p.slatePos})`).join(', ');
      flags.push(`Midday structural inversion (4× confirmed, z≈2.6): positions 1–2 excluded from play — bet positions 3–5 only. Excluded today: ${ex}.`);
    }
    if (d7.pct != null && d30.pct != null && d7.pct < d30.pct - 10) {
      flags.push(`7d slate rate ${d7.pct}% vs 30d ${d30.pct}% (${Math.round(d7.pct - d30.pct)}pp) — scope cooling.`);
    }
    if (scope === 'evening' && d7.pct != null && d7.pct < 75) {
      flags.push(`Evening 7d (${d7.pct}%) trips the <75% CONFIG-15 trigger by the letter — but CO is already at 10 (CONFIG-18, lever spent). No config ship off a 7d window.`);
    }
    const pf = preflightByScope.get(scope);
    if (pf?.pick1Tag === 'overdue') {
      flags.push(`Pick #1 ${pf.pick1Combo} is overdue-tagged — the convergence/footprint picks above usually carry stronger evidence than the headline #1.`);
    }
    // CALIB-02 scale: on-slate-calibrated levels run ~15-35% by scope (was ~1-10% on the old top-30-pool scale).
    if (picks.length && picks.every(p => p.pHit < 12)) {
      flags.push(`Structurally soft scope today: every calibrated P(hit) < 12%.`);
    }
    if (calibAgeDays != null && calibAgeDays > 14) {
      flags.push(`⚠️ Calibration ${calibAgeDays}d old — run npm run calibrate:picks and re-check the Brier gate before trusting P(hit).`);
    }
    flags.push(`House edge: at uniform ~90% RTP every bet carries ~−10% EV (BUG-162). Picks maximize hit probability, not positive EV.`);

    scopes[scope] = {
      scope,
      yesterday: {
        slateHit: picksHit > 0, picksHit, stateInst, hittingCombos,
        pick1Combo: yp1 ? String(yp1.combo) : null,
        pick1Hit: yp1Set ? yDraws.some(d => d.comboset_sorted === yp1Set) : false,
      },
      rolling: { d7, d30 },
      preflight: pf ?? { status: 'MISSING', pickCount: 0, pick1Combo: null, pick1Tag: null, pick1Straight: null, engineVersion: null },
      picks, play, flags,
    };
  }

  // reorder validation: yesterday pick #1 outcomes across scopes with a slate
  const reorderScopes = SCOPES.filter(s => scopes[s].yesterday.pick1Combo != null);
  const reorder = {
    hit: reorderScopes.filter(s => scopes[s].yesterday.pick1Hit).length,
    total: reorderScopes.length,
  };

  // cross-scope allocation: singles, midday pos-rule respected, dedup by
  // comboSet (a convergence set allocates once), top-down from T1 at 2/2/1 units
  const bySet = new Map<string, BriefPick[]>();
  for (const p of allPicks) {
    if (p.multiplicity !== 'singles' || p.excluded || !p.comboSet) continue;
    if (!bySet.has(p.comboSet)) bySet.set(p.comboSet, []);
    bySet.get(p.comboSet)!.push(p);
  }
  const UNITS = [2, 2, 1];
  const allocation: BriefAllocation[] = [...bySet.values()]
    .map(group => {
      const best = [...group].sort((a, b) => a.tierRank - b.tierRank || b.footprint90 - a.footprint90 || b.pHit - a.pHit)[0];
      return { best, pHit: Math.max(...group.map(g => g.pHit)) };
    })
    .sort((a, b) => a.best.tierRank - b.best.tierRank || b.best.footprint90 - a.best.footprint90 || b.pHit - a.pHit)
    .slice(0, UNITS.length)
    .map(({ best, pHit }, i) => ({
      units: UNITS[i], combo: best.combo, comboSet: best.comboSet, bestOrder: best.bestOrder,
      scopes: best.convScopes.length ? best.convScopes : [best.scope],
      tier: best.tier, footprint90: best.footprint90, pHit, topJx: best.topJx,
      withStraight: i === 0,
    }));

  // cross-scope red flags for the full brief
  const globalFlags: string[] = [];
  if (workflowStale) {
    globalFlags.push(`Daily Workflow hasn't run today (report ${reportUpdatedAt ? 'stale' : 'missing'}) — import results + click it before 8:30am ET. OPS-01: no background job will do this.`);
  }
  if (scopes.midday.picks.some(p => p.excluded)) {
    globalFlags.push('Midday: bet slate positions 3–5 only, never 1–2 (structural inversion, 4× confirmed z≈2.6). Excluded picks are struck in the tier table.');
  }
  const ev7 = scopes.evening.rolling.d7.pct;
  if (ev7 != null && ev7 < 75) {
    globalFlags.push(`Evening 7d slate rate ${ev7}% — below the 75% tripwire (CO already at 10, lever spent; no config ship off a 7d window).`);
  }
  if (reorder.total > 0 && reorder.hit === 0) {
    globalFlags.push(`Reorder check: 0/${reorder.total} pick #1s hit yesterday — consistent with the rank-1 inversion; headline #1 is not the strongest bet.`);
  }
  if (calibAgeDays != null && calibAgeDays > 14) {
    globalFlags.push(`Calibration ${calibAgeDays}d old — run npm run calibrate:picks and re-check the Brier gate before trusting P(hit).`);
  }
  globalFlags.push('House edge: at uniform ~90% RTP every bet carries ~−10% EV (BUG-162). Picks maximize hit probability, not positive EV.');

  return { date, yesterday: YEST, calibFittedAt, calibAgeDays, top10, scopes, reorder, workflow: { reportUpdatedAt, stale: workflowStale }, allocation, globalFlags };
}
