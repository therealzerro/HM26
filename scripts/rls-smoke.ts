/**
 * rls-smoke.ts — anon-key RLS regression canary.
 *
 * Verifies that every client-facing table the app reads with the anon key still
 * returns 200 OK. The original BUG-145 incident silently zeroed hit displays
 * because the anon GRANT on `adaptive_tracking` had been revoked — the client's
 * try/catch swallowed the 401. ENH-12's `hit_detection_runs` telemetry catches
 * future regressions reactively (post-fact, after a run); this script catches
 * them PROACTIVELY in seconds.
 *
 * Usage:
 *   npm run rls:smoke
 *
 * Exit codes:
 *   0 — all probes returned 200
 *   1 — one or more probes failed (regression detected)
 *
 * The anon key is the EXPO_PUBLIC_SUPABASE_ANON_KEY (already public in the
 * mobile app). No secrets are embedded.
 */

const URL = process.env.SUPABASE_URL
  ?? process.env.EXPO_PUBLIC_SUPABASE_URL
  ?? 'https://tgagarhwqbdcwoqhpapi.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY
  ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  ?? '';

if (!ANON) {
  console.error('[rls-smoke] No anon key. Set EXPO_PUBLIC_SUPABASE_ANON_KEY in env.');
  process.exit(1);
}

const headers = { apikey: ANON, Authorization: `Bearer ${ANON}` };

/** Table probes — every table the client reads via anon. Add a row here when
 *  introducing a new client-readable table. */
const READ_PROBES: { table: string; reason: string }[] = [
  { table: 'slate_snapshots',     reason: 'Home/Slates: live K6 picks display' },
  { table: 'daily_intelligence',  reason: 'Intelligence screen: top-30 rows + hit annotations' },
  { table: 'adaptive_tracking',   reason: 'Hit-display surfaces (BUG-145 origin)' },
  { table: 'histories',           reason: 'Results screen: ledger entries' },
  { table: 'app_config',          reason: 'Engine Config admin view' },
  { table: 'datasets_box',        reason: 'Pick detail modal: timesDrawn lookups' },
  { table: 'datasets_pair',       reason: 'Pick detail modal: pair signals' },
  { table: 'engine_runs',         reason: 'ENH-08 telemetry (future analytics dashboards)' },
  { table: 'hit_detection_runs',  reason: 'ENH-12 telemetry (post-fact regression canary)' },
];

interface ProbeResult { table: string; status: number; ok: boolean; bodyHead?: string }

async function probeRead(table: string): Promise<ProbeResult> {
  try {
    const r = await fetch(`${URL}/rest/v1/${table}?select=*&limit=1`, { headers });
    let bodyHead: string | undefined;
    if (!r.ok) bodyHead = (await r.text()).slice(0, 200);
    return { table, status: r.status, ok: r.ok, bodyHead };
  } catch (e) {
    return { table, status: 0, ok: false, bodyHead: String(e).slice(0, 200) };
  }
}

async function main() {
  console.log(`[rls-smoke] Probing ${URL} with anon key…\n`);
  const results = await Promise.all(READ_PROBES.map(p => probeRead(p.table)));

  let failed = 0;
  const PAD = Math.max(...READ_PROBES.map(p => p.table.length));
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const reason = READ_PROBES[i].reason;
    const mark = r.ok ? 'OK ' : 'FAIL';
    const line = `  ${mark}  ${r.table.padEnd(PAD)}  ${r.status}  — ${reason}`;
    console.log(line);
    if (!r.ok) {
      failed++;
      if (r.bodyHead) console.log(`        ↳ ${r.bodyHead}`);
    }
  }
  console.log('');

  if (failed > 0) {
    console.error(`[rls-smoke] ${failed} probe(s) failed — anon read regression. Check GRANT + RLS policies.`);
    process.exit(1);
  }
  console.log(`[rls-smoke] All ${results.length} probes OK.`);
}

main();
