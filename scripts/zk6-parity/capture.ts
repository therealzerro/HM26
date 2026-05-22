/**
 * capture.ts — read all four ZK6-relevant tables for a (slate_date, scope)
 * partition. Uses service-role key (svc helper) so RLS doesn't hide rows.
 */

import { svcGet, svcDelete } from './svc.js';

export interface Capture {
  slate_snapshots: any[];
  daily_intelligence: any[];
  adaptive_tracking: any[];
  engine_runs: any[];
}

export async function captureAll(slateDate: string, scope: string): Promise<Capture> {
  const scopeEnc = encodeURIComponent(scope);
  const [snap, di, at, er] = await Promise.all([
    svcGet<any[]>(`/rest/v1/slate_snapshots?slate_date=eq.${slateDate}&scope=eq.${scopeEnc}&select=*&order=updated_at_et.asc`),
    svcGet<any[]>(`/rest/v1/daily_intelligence?slate_date=eq.${slateDate}&scope=eq.${scopeEnc}&select=*&order=rank.asc`),
    svcGet<any[]>(`/rest/v1/adaptive_tracking?slate_date=eq.${slateDate}&scope=eq.${scopeEnc}&select=*&order=rank.asc`),
    svcGet<any[]>(`/rest/v1/engine_runs?slate_date=eq.${slateDate}&scope=eq.${scopeEnc}&select=*&order=generated_at_et.asc`),
  ]);
  return {
    slate_snapshots: Array.isArray(snap) ? snap : [],
    daily_intelligence: Array.isArray(di) ? di : [],
    adaptive_tracking: Array.isArray(at) ? at : [],
    engine_runs: Array.isArray(er) ? er : [],
  };
}

/** Delete all rows for (slate_date, scope) across the 4 tables. Service-role only. */
export async function deletePartition(slateDate: string, scope: string): Promise<void> {
  const scopeEnc = encodeURIComponent(scope);
  // Order matters if any FK relationships exist; deleting children first is safest.
  await svcDelete(`/rest/v1/adaptive_tracking?slate_date=eq.${slateDate}&scope=eq.${scopeEnc}`);
  await svcDelete(`/rest/v1/daily_intelligence?slate_date=eq.${slateDate}&scope=eq.${scopeEnc}`);
  await svcDelete(`/rest/v1/engine_runs?slate_date=eq.${slateDate}&scope=eq.${scopeEnc}`);
  await svcDelete(`/rest/v1/slate_snapshots?slate_date=eq.${slateDate}&scope=eq.${scopeEnc}`);
}

/** Count rows for the 3 sandbox dates across all scopes (pre-start sanity check). */
export async function countSandboxRows(dates: string[]): Promise<Record<string, Record<string, number>>> {
  const result: Record<string, Record<string, number>> = {};
  for (const d of dates) {
    const counts: Record<string, number> = {};
    for (const table of ['slate_snapshots', 'daily_intelligence', 'adaptive_tracking', 'engine_runs']) {
      const rows = await svcGet<any[]>(`/rest/v1/${table}?slate_date=eq.${d}&select=id`);
      counts[table] = Array.isArray(rows) ? rows.length : 0;
    }
    result[d] = counts;
  }
  return result;
}
