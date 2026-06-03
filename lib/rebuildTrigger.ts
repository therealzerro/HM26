/**
 * Triggers the rebuild-datasets-zk6 edge function from the client.
 * Wraps deduplication, error handling, and stat persistence so the
 * caller (useDataIngestion::importDailyMutation) only needs to await
 * a single function.
 *
 * Storage keys used:
 *   - rebuild_last_date  : YYYY-MM-DD of the last successful rebuild (ET)
 *   - rebuild_last_stats : JSON-stringified RebuildStats from the last run
 */

import { storage } from '@/lib/storage';
import { getTodayET } from '@/lib/dateUtils';

export interface RebuildStats {
  success: boolean;
  dryRun: boolean;
  todayUtc: string;
  scopesProcessed: number;
  horizonsProcessed: number;
  totalChecked: number;
  totalUpdated: number;
  totalFailed: number;
  durationMs: number;
  perPair: Array<{ scope: string; horizon: string; checked: number; updated: number; failed: number; error?: string }>;
  errors: string[];
}

const LAST_DATE_KEY = 'rebuild_last_date';
const LAST_STATS_KEY = 'rebuild_last_stats';
const REPORT_LAST_DATE_KEY = 'daily_report_last_date';

/**
 * Fire the rebuild edge function. Returns the parsed stats. Caller is
 * responsible for surfacing toast / error UI.
 *
 * @param force pass true to bypass the per-day dedupe guard
 */
export async function runDailyRebuild(force = false): Promise<RebuildStats | { skipped: true; reason: string }> {
  const today = getTodayET();
  if (!force) {
    const last = await storage.getItem(LAST_DATE_KEY);
    if (last === today) {
      return { skipped: true, reason: `Already rebuilt today (${today})` };
    }
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration missing');
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/rebuild-datasets-zk6`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': 'Bearer ' + supabaseKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ dryRun: false }),
  });

  const text = await res.text();
  let stats: RebuildStats;
  try { stats = JSON.parse(text); }
  catch { throw new Error(`Invalid response (${res.status}): ${text.slice(0, 200)}`); }

  if (!stats.success) {
    throw new Error(`Rebuild failed (${stats.errors.length} errors): ${stats.errors[0] ?? 'unknown'}`);
  }

  await storage.setItem(LAST_DATE_KEY, today);
  await storage.setItem(LAST_STATS_KEY, JSON.stringify(stats));
  return stats;
}

/**
 * Fire the compute-daily-report edge function for today (ET) once per
 * day. Intended as the final step of the Daily Workflow button (after
 * rebuild + AUC + hit-detection + slate regen) so the report captures
 * the freshly-updated ds_raw/hit state. The 8am ET pg_cron job
 * (compute-daily-report-nightly) is a safety net for days the operator
 * doesn't click Daily Workflow.
 *
 * Dedupe via REPORT_LAST_DATE_KEY so multiple workflow clicks on the
 * same day don't re-fire it. Pass force=true to bypass. Errors are
 * swallowed (logged + returned) so they never block the workflow.
 */
export async function runDailyReport(force = false): Promise<{ ok: boolean; skipped?: boolean; reason?: string; results?: unknown }> {
  const today = getTodayET();
  if (!force) {
    const last = await storage.getItem(REPORT_LAST_DATE_KEY);
    if (last === today) {
      return { ok: true, skipped: true, reason: `Already reported today (${today})` };
    }
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { ok: false, reason: 'Supabase configuration missing' };
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/compute-daily-report`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* keep null */ }
    if (!res.ok || !parsed?.success) {
      console.log('[daily-report] failed:', res.status, text.slice(0, 200));
      return { ok: false, reason: `compute-daily-report ${res.status}` };
    }
    await storage.setItem(REPORT_LAST_DATE_KEY, today);
    return { ok: true, results: parsed.results };
  } catch (e) {
    console.log('[daily-report] error:', e);
    return { ok: false, reason: String(e instanceof Error ? e.message : e) };
  }
}

/**
 * Read the persisted last-rebuild stats from storage. Used by admin
 * status panels to display "last rebuild ran at X with Y rows updated".
 */
export async function getLastRebuildStats(): Promise<{ date: string | null; stats: RebuildStats | null }> {
  const date = await storage.getItem(LAST_DATE_KEY);
  const raw = await storage.getItem(LAST_STATS_KEY);
  let stats: RebuildStats | null = null;
  if (raw) { try { stats = JSON.parse(raw); } catch {} }
  return { date, stats };
}
