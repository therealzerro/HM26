/**
 * Client-side wrapper around the `run-hit-detection` edge function.
 *
 * Background: the prior implementation ran hit detection from the app using
 * the anon key. When anon write privileges on `adaptive_tracking` regressed
 * on 2026-05-14 (BUG-145), every AT write silently 401'd inside a
 * `console.warn` try/catch and all hit-tracker surfaces (Home `todayHits`,
 * TODAY'S HITS cards, Slate Performance) went blank for the duration of the
 * verification window. The edge function uses `SUPABASE_SERVICE_ROLE_KEY`
 * which bypasses RLS/GRANT, eliminating that failure mode structurally.
 *
 * Exported function signatures match the previous client API so call sites
 * in `useDataIngestion`, `DashboardView`, and the ledger import flow don't
 * need to change.
 */

export interface HitDetectionResult {
  hitsFound: number;
  scopesChecked: number;
  supplementsGenerated: number;
}

type Scope = 'midday' | 'evening' | 'allday';

interface EdgeResponse {
  success: boolean;
  hitsFound: number;
  scopesChecked: number;
  supplementsGenerated: number;
  perDate: Record<string, { hitsFound: number; scopesChecked: number; supplementsGenerated: number; errors?: string[] }>;
  errors?: string[];
  errorCount?: number;
}

async function invokeEdge(body: Record<string, unknown>): Promise<EdgeResponse> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase config missing');
  const res = await fetch(`${url}/functions/v1/run-hit-detection`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: EdgeResponse;
  try { parsed = JSON.parse(text); }
  catch { throw new Error(`run-hit-detection bad JSON (${res.status}): ${text.slice(0, 200)}`); }
  if (!res.ok) {
    throw new Error(`run-hit-detection ${res.status}: ${(parsed as any)?.error ?? text.slice(0, 200)}`);
  }
  if (parsed.errors && parsed.errors.length > 0) {
    console.warn('[hitDetection] edge reported errors:', parsed.errors.slice(0, 5));
  }
  return parsed;
}

export async function runHitDetectionAndRefresh(
  scope: Scope | null,
  date: string,
): Promise<HitDetectionResult> {
  const res = await invokeEdge({ date, scope });
  return {
    hitsFound: res.hitsFound,
    scopesChecked: res.scopesChecked,
    supplementsGenerated: res.supplementsGenerated,
  };
}

export async function runHitDetectionAllScopes(date: string): Promise<HitDetectionResult> {
  return runHitDetectionAndRefresh(null, date);
}

/**
 * Multi-date wrapper used by the ledger import flow. Returns the legacy
 * { totalHits, scopeResults, ran } shape that `useDataIngestion` expects.
 */
export async function runHitDetectionForDates(
  dates: string[],
): Promise<{ totalHits: number; scopeResults: Record<string, number>; ran: boolean }> {
  if (!Array.isArray(dates) || dates.length === 0) {
    return { totalHits: 0, scopeResults: {}, ran: false };
  }
  try {
    const res = await invokeEdge({ dates });
    const scopeResults: Record<string, number> = {};
    for (const [d, r] of Object.entries(res.perDate ?? {})) {
      scopeResults[d] = r.hitsFound;
    }
    return { totalHits: res.hitsFound, scopeResults, ran: true };
  } catch (e) {
    console.warn('[hitDetection] runHitDetectionForDates failed:', e);
    return { totalHits: 0, scopeResults: {}, ran: false };
  }
}
