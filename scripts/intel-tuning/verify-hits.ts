#!/usr/bin/env tsx
/**
 * verify-hits.ts — Reconcile adaptive_tracking + daily_intelligence hit
 * annotations against current `histories` ground truth for a given date
 * (or range). Clears stale annotations that survived from before a ledger
 * re-import corrected the underlying draws.
 *
 * Pattern: a hit row in adaptive_tracking carries (combo, matched_state,
 * matched_session). The row is "valid" iff there exists a histories row
 * on that (date, jurisdiction=matched_state, session=matched_session)
 * whose comboset_sorted matches the combo. If no such histories row
 * exists, the annotation is stale and gets cleared.
 *
 * Same check applied to daily_intelligence (hit_state/hit_session columns).
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

async function verifyDate(date: string, apply: boolean): Promise<{ atStale: number; diStale: number; atKept: number; diKept: number }> {
  console.log(`\n=== ${date} ===`);

  // 1. Pull adaptive_tracking annotated rows
  const atRows = await api(`/rest/v1/adaptive_tracking?slate_date=eq.${date}&matched_state=not.is.null&select=id,scope,combo,matched_state,matched_session,actual_result,hit_box,hit_straight`) as any[];
  // 2. Pull daily_intelligence annotated rows
  const diRows = await api(`/rest/v1/daily_intelligence?slate_date=eq.${date}&or=(hit_box.eq.true,hit_straight.eq.true)&select=id,scope,combo,hit_state,hit_session,hit_result,hit_box,hit_straight`) as any[];
  // 3. Pull histories ground truth
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

  console.log(`  adaptive_tracking: ${atRows.length} annotated · ${atKept} valid · ${atStale.length} stale`);
  if (atStale.length) {
    for (const r of atStale) {
      console.log(`    ✗ ${r.scope}/${r.combo} claimed hit in ${r.matched_state}/${r.matched_session} — no matching draw`);
    }
  }
  console.log(`  daily_intelligence: ${diRows.length} annotated · ${diKept} valid · ${diStale.length} stale`);
  if (diStale.length) {
    for (const r of diStale) {
      console.log(`    ✗ ${r.scope}/${r.combo} claimed hit in ${r.hit_state}/${r.hit_session} — no matching draw`);
    }
  }

  if (!apply || (atStale.length === 0 && diStale.length === 0)) {
    return { atStale: atStale.length, diStale: diStale.length, atKept, diKept };
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
  console.log(`  ✓ Cleared ${atStale.length} adaptive_tracking + ${diStale.length} daily_intelligence stale annotations`);
  return { atStale: atStale.length, diStale: diStale.length, atKept, diKept };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === 'true';
  const dates: string[] = args.date ? [args.date]
    : args.since ? lastNDates(parseInt(args.since, 10) || 7)
    : [new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })];

  console.log(`verify-hits — ${apply ? 'APPLY' : 'DRY RUN'} · dates: ${dates.join(', ')}`);
  let totalStaleAT = 0, totalStaleDI = 0, totalKeptAT = 0, totalKeptDI = 0;
  for (const d of dates) {
    const r = await verifyDate(d, apply);
    totalStaleAT += r.atStale; totalStaleDI += r.diStale;
    totalKeptAT += r.atKept; totalKeptDI += r.diKept;
  }
  console.log(`\n── Summary ──`);
  console.log(`  adaptive_tracking: ${totalKeptAT} valid · ${totalStaleAT} stale`);
  console.log(`  daily_intelligence: ${totalKeptDI} valid · ${totalStaleDI} stale`);
  if (!apply && (totalStaleAT + totalStaleDI) > 0) {
    console.log(`\nRe-run with --apply to clear stale annotations.`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
