/**
 * backfillIntelHits — admin tool to re-run hit detection across every
 * slate_date present in daily_intelligence.
 *
 * Historically this function patched daily_intelligence AND adaptive_tracking
 * directly with the anon key. That was a near-miss for BUG-145: if the anon
 * GRANT on adaptive_tracking regressed (as it did for the verification
 * window), this code path would have silently no-op'd the AT writes —
 * "Backfill ran successfully" toast, hit tracker still empty. The annotation
 * mirror was added in BUG-143 specifically to keep the tracker in sync, so a
 * silent half-write would have re-broken the surfaces BUG-143 fixed.
 *
 * New design: delegate the actual hit/snapshot/AT/DI write work to the
 * `run-hit-detection` edge function (service role, bypasses RLS/GRANT). This
 * file is now a thin coordinator: pull the list of unique slate_dates from
 * daily_intelligence, ask the edge function to process them all in one
 * request, surface progress callbacks around the round trip.
 */

import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || {};
const SB_URL: string | undefined = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SB_KEY: string | undefined = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const HEADERS = {
  'apikey': SB_KEY ?? '',
  'Authorization': 'Bearer ' + (SB_KEY ?? ''),
  'Content-Type': 'application/json',
};

export interface BackfillProgress {
  phase: string;
  datesTotal: number;
  datesDone: number;
  hitsFound: number;
}

interface DiPickRow { slate_date: string }

interface EdgeResponse {
  success: boolean;
  hitsFound: number;
  scopesChecked: number;
  supplementsGenerated: number;
  perDate: Record<string, { hitsFound: number; scopesChecked: number; supplementsGenerated: number; errors?: string[] }>;
  errors?: string[];
}

export async function backfillIntelHits(
  onProgress?: (p: BackfillProgress) => void,
): Promise<{ hitsFound: number; datesProcessed: number }> {
  if (!SB_URL || !SB_KEY) return { hitsFound: 0, datesProcessed: 0 };

  onProgress?.({ phase: 'Fetching dates…', datesTotal: 0, datesDone: 0, hitsFound: 0 });

  // Distinct slate_dates present in daily_intelligence. Read-only — anon key
  // is sufficient and a GRANT regression here would surface as an empty list,
  // not a silent half-write.
  let rows: DiPickRow[] = [];
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/daily_intelligence?select=slate_date&order=slate_date.desc&limit=5000`,
      { headers: HEADERS },
    );
    const text = await res.text();
    try { rows = JSON.parse(text) as DiPickRow[]; } catch { rows = []; }
    if (!res.ok) {
      console.warn('[backfill] date fetch', res.status, text.slice(0, 200));
      return { hitsFound: 0, datesProcessed: 0 };
    }
  } catch (e) {
    console.warn('[backfill] date fetch error:', e);
    return { hitsFound: 0, datesProcessed: 0 };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { hitsFound: 0, datesProcessed: 0 };
  }

  const dates = [...new Set(rows.map(r => r.slate_date).filter(Boolean))];
  if (dates.length === 0) return { hitsFound: 0, datesProcessed: 0 };

  onProgress?.({
    phase: `Running hit detection on ${dates.length} date${dates.length === 1 ? '' : 's'}…`,
    datesTotal: dates.length,
    datesDone: 0,
    hitsFound: 0,
  });

  // Single edge call. Service-role inside the function does the AT/DI/snapshot
  // writes. Supplemental slates are intentionally skipped — backfill is a
  // historical-reconciliation tool, not a live-import path; generating dozens
  // of supplemental slates retroactively would clutter slate_snapshots.
  let parsed: EdgeResponse | null = null;
  try {
    const res = await fetch(`${SB_URL}/functions/v1/run-hit-detection`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ dates, skipSupplements: true }),
    });
    const text = await res.text();
    try { parsed = JSON.parse(text); } catch {}
    if (!res.ok || !parsed) {
      console.warn('[backfill] edge call', res.status, text.slice(0, 200));
      return { hitsFound: 0, datesProcessed: dates.length };
    }
  } catch (e) {
    console.warn('[backfill] edge error:', e);
    return { hitsFound: 0, datesProcessed: dates.length };
  }

  if (parsed.errors && parsed.errors.length > 0) {
    console.warn('[backfill] edge reported errors:', parsed.errors.slice(0, 5));
  }

  onProgress?.({
    phase: 'Done',
    datesTotal: dates.length,
    datesDone: dates.length,
    hitsFound: parsed.hitsFound,
  });
  console.log('[backfill] complete — hits:', parsed.hitsFound, 'dates:', dates.length);
  return { hitsFound: parsed.hitsFound, datesProcessed: dates.length };
}
