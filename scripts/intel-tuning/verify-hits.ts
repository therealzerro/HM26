#!/usr/bin/env tsx
/**
 * verify-hits.ts — Reconcile adaptive_tracking + daily_intelligence +
 * slate_snapshots hit annotations against current `histories` ground truth
 * for a given date (or range). Clears stale annotations that survived from
 * before a ledger re-import corrected the underlying draws.
 *
 * Three sources, same validity rule: an annotation is valid iff there exists
 * a histories row on that (date, jurisdiction, session) whose comboset
 * matches the combo. If no such row exists, the annotation is stale.
 *
 *   adaptive_tracking → NULL out matched_state, matched_session, actual_result,
 *                       hit_box, hit_straight on stale rows.
 *   daily_intelligence → SET hit_box=false, hit_straight=false, NULL state/session/result.
 *   slate_snapshots → PATCH top_k_straights_json with hitType/hitState/hitSession/
 *                     hitDate/hitResult stripped from picks whose annotation is stale.
 *
 * Idempotent. Safe to re-run.
 *
 * Usage:
 *   npm run verify:hits -- --date 2026-05-11          # report only
 *   npm run verify:hits -- --date 2026-05-11 --apply  # apply cleanup
 *   npm run verify:hits -- --since 7 --apply          # last 7 days
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.backtest' });

const URL = process.env.SUPABASE_URL!;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!URL || !SVC) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.backtest'); process.exit(1); }

function parseArgs(argv: string[]): Record<string, string> {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
      if (a[argv[i].slice(2)] !== 'true') i++;
    }
  }
  return a;
}

const HEADERS = {
  'apikey': SVC,
  'Authorization': `Bearer ${SVC}`,
  'Content-Type': 'application/json',
};

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${URL}${path}`, { ...init, headers: { ...HEADERS, ...(init?.headers ?? {}) } });
  if (!res.ok && res.status !== 204) throw new Error(`${res.status} ${path} :: ${await res.text()}`);
  return res.status === 204 ? null : await res.json().catch(() => null);
}

function toComboSet(combo: string): string {
  return '{' + combo.split('').sort().join(',') + '}';
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    out.push(d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  }
  return out;
}

// Pick fields hit detection writes (lib/hitDetection.ts). Stripping these
// keys reverts a pick to "no hit annotation" without disturbing signals,
// rank, energy, etc. Defensive cast — we only know shape by convention.
const HIT_FIELDS = ['hitType', 'hitState', 'hitSession', 'hitDate', 'hitResult'] as const;
function stripHitFields(pick: any): any {
  const cleaned: any = { ...pick };
  for (const k of HIT_FIELDS) delete cleaned[k];
  return cleaned;
}

async function verifyDate(date: string, apply: boolean): Promise<{ atStale: number; diStale: number; snapStaleSnapshots: number; snapStalePicks: number; atKept: number; diKept: number; snapKept: number }> {
  console.log(`\n=== ${date} ===`);

  // 1. Pull adaptive_tracking annotated rows
  const atRows = await api(`/rest/v1/adaptive_tracking?slate_date=eq.${date}&matched_state=not.is.null&select=id,scope,combo,matched_state,matched_session,actual_result,hit_box,hit_straight`) as any[];
  // 2. Pull daily_intelligence annotated rows
  const diRows = await api(`/rest/v1/daily_intelligence?slate_date=eq.${date}&or=(hit_box.eq.true,hit_straight.eq.true)&select=id,scope,combo,hit_state,hit_session,hit_result,hit_box,hit_straight`) as any[];
  // 3. Pull slate_snapshots (active + soft-deleted) — hitType annotations can
  //    live on old soft-deleted versions after a regen.
  const snapRows = await api(`/rest/v1/slate_snapshots?slate_date=eq.${date}&top_k_straights_json=not.is.null&select=id,scope,hash,top_k_straights_json,updated_at_et,deleted_at`) as any[];
  // 4. Pull histories ground truth
  const histRows = await api(`/rest/v1/histories?date_et=eq.${date}&select=jurisdiction,session,result_digits,comboset_sorted`) as any[];

  // Build lookup: (jurisdiction, session) → set of comboset_sorted that drew
  const histIndex = new Map<string, Set<string>>();
  for (const h of histRows) {
    const key = `${h.jurisdiction}|${(h.session ?? '').toLowerCase()}`;
    if (!histIndex.has(key)) histIndex.set(key, new Set());
    histIndex.get(key)!.add(h.comboset_sorted ?? toComboSet(h.result_digits ?? ''));
  }

  const isValid = (state: string | null, session: string | null, combo: string | null): boolean => {
    if (!state || !session || !combo) return false;
    const key = `${state}|${session.toLowerCase()}`;
    const sets = histIndex.get(key);
    return !!sets && sets.has(toComboSet(combo));
  };

  // adaptive_tracking
  const atStale: any[] = [];
  let atKept = 0;
  for (const r of atRows) {
    if (isValid(r.matched_state, r.matched_session, r.combo)) atKept++;
    else atStale.push(r);
  }

  // daily_intelligence
  const diStale: any[] = [];
  let diKept = 0;
  for (const r of diRows) {
    if (isValid(r.hit_state, r.hit_session, r.combo)) diKept++;
    else diStale.push(r);
  }

  // slate_snapshots: scan each snapshot's top_k_straights_json picks. A
  // snapshot is "stale" if at least one pick has a hitType annotation
  // pointing at a (state, session, combo) tuple no histories row supports.
  // We collect the stale picks per snapshot so we can build a cleaned
  // top_k_straights_json and PATCH the row.
  const snapStaleList: { row: any; cleaned: any[]; stalePicks: any[] }[] = [];
  let snapKept = 0;
  let snapStalePickCount = 0;
  for (const snap of snapRows) {
    const picks = Array.isArray(snap.top_k_straights_json) ? snap.top_k_straights_json
      : typeof snap.top_k_straights_json === 'string' ? (() => { try { return JSON.parse(snap.top_k_straights_json || '[]'); } catch { return []; } })()
      : [];
    if (picks.length === 0) { snapKept++; continue; }
    const stalePicks: any[] = [];
    let anyAnnotated = false;
    const cleaned = picks.map((p: any) => {
      if (!p?.hitType) return p;
      anyAnnotated = true;
      if (isValid(p.hitState, p.hitSession, p.combo)) return p;
      stalePicks.push(p);
      return stripHitFields(p);
    });
    if (!anyAnnotated || stalePicks.length === 0) {
      snapKept++;
    } else {
      snapStaleList.push({ row: snap, cleaned, stalePicks });
      snapStalePickCount += stalePicks.length;
    }
  }

  console.log(`  adaptive_tracking:  ${atRows.length} annotated · ${atKept} valid · ${atStale.length} stale`);
  for (const r of atStale) console.log(`    ✗ ${r.scope}/${r.combo} claimed hit in ${r.matched_state}/${r.matched_session} — no matching draw`);
  console.log(`  daily_intelligence: ${diRows.length} annotated · ${diKept} valid · ${diStale.length} stale`);
  for (const r of diStale) console.log(`    ✗ ${r.scope}/${r.combo} claimed hit in ${r.hit_state}/${r.hit_session} — no matching draw`);
  console.log(`  slate_snapshots:    ${snapRows.length} scanned · ${snapKept} clean · ${snapStaleList.length} have stale picks (${snapStalePickCount} picks total)`);
  for (const s of snapStaleList) {
    const hashHint = s.row.hash ? ` hash=${s.row.hash}` : '';
    const delHint = s.row.deleted_at ? ' [deleted]' : '';
    console.log(`    ✗ ${s.row.scope}${hashHint}${delHint} · ${s.stalePicks.length} stale pick(s):`);
    for (const p of s.stalePicks) console.log(`        ${p.combo} → ${p.hitState}/${p.hitSession}`);
  }

  if (!apply || (atStale.length === 0 && diStale.length === 0 && snapStaleList.length === 0)) {
    return { atStale: atStale.length, diStale: diStale.length, snapStaleSnapshots: snapStaleList.length, snapStalePicks: snapStalePickCount, atKept, diKept, snapKept };
  }

  // Apply: clear hit fields on stale rows.
  for (const r of atStale) {
    await api(`/rest/v1/adaptive_tracking?id=eq.${r.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        matched_state: null,
        matched_session: null,
        actual_result: null,
        hit_box: null,
        hit_straight: null,
      }),
    });
  }
  for (const r of diStale) {
    await api(`/rest/v1/daily_intelligence?id=eq.${r.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        hit_box: false,
        hit_straight: false,
        hit_state: null,
        hit_session: null,
        hit_result: null,
      }),
    });
  }
  for (const s of snapStaleList) {
    await api(`/rest/v1/slate_snapshots?id=eq.${s.row.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ top_k_straights_json: s.cleaned }),
    });
  }
  console.log(`  ✓ Cleared ${atStale.length} adaptive_tracking + ${diStale.length} daily_intelligence + ${snapStalePickCount} snapshot pick(s) across ${snapStaleList.length} snapshot(s)`);
  return { atStale: atStale.length, diStale: diStale.length, snapStaleSnapshots: snapStaleList.length, snapStalePicks: snapStalePickCount, atKept, diKept, snapKept };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === 'true';
  const dates: string[] = args.date ? [args.date]
    : args.since ? lastNDates(parseInt(args.since, 10) || 7)
    : [new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })];

  console.log(`verify-hits — ${apply ? 'APPLY' : 'DRY RUN'} · dates: ${dates.join(', ')}`);
  let totalStaleAT = 0, totalStaleDI = 0, totalStaleSnaps = 0, totalStaleSnapPicks = 0;
  let totalKeptAT = 0, totalKeptDI = 0, totalKeptSnaps = 0;
  for (const d of dates) {
    const r = await verifyDate(d, apply);
    totalStaleAT += r.atStale; totalStaleDI += r.diStale;
    totalStaleSnaps += r.snapStaleSnapshots; totalStaleSnapPicks += r.snapStalePicks;
    totalKeptAT += r.atKept; totalKeptDI += r.diKept; totalKeptSnaps += r.snapKept;
  }
  console.log(`\n── Summary ──`);
  console.log(`  adaptive_tracking:  ${totalKeptAT} valid · ${totalStaleAT} stale`);
  console.log(`  daily_intelligence: ${totalKeptDI} valid · ${totalStaleDI} stale`);
  console.log(`  slate_snapshots:    ${totalKeptSnaps} clean · ${totalStaleSnaps} have stale picks (${totalStaleSnapPicks} picks total)`);
  if (!apply && (totalStaleAT + totalStaleDI + totalStaleSnaps) > 0) {
    console.log(`\nRe-run with --apply to clear stale annotations.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
