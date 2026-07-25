// lib/analytics/drawWindow.ts — ENH-ANALYTICS-01
//
// Shared draw-window loader for the analytics surfaces (admin Analytics view
// + Pattern Explorer). Read-only over `histories`. One fetch per window key
// serves both panels via React Query; session/jurisdiction filtering happens
// client-side so filter toggles never refetch.

import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET } from '@/lib/dateUtils';

export type SessionFilter = 'all' | 'midday' | 'evening';
export type WindowKey = '30d' | '90d' | 'clean';

// Draw-level analyses are only trustworthy from 2026-04-01 — earlier eras
// have sparse/backfill-contaminated imports (see information-ceiling notes
// in MASTER_AUDIT). "clean" = everything since that date.
export const CLEAN_START = '2026-04-01';

export const WINDOW_LABELS: Record<WindowKey, string> = {
  '30d': '30 days',
  '90d': '90 days',
  clean: `Since ${CLEAN_START}`,
};

export interface DrawRow {
  id: string;
  date_et: string;
  session: 'midday' | 'evening';
  jurisdiction: string | null;
  result_digits: string;
  comboset_sorted: string;
}

export function windowStart(win: WindowKey, today: string = getTodayET()): string {
  if (win === 'clean') return CLEAN_START;
  const days = win === '30d' ? 30 : 90;
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// PostgREST caps every GET at 1000 rows regardless of `limit`, so page with
// a unique `,id` tiebreaker on the order (BUG-163 lesson — date_et alone is
// not a stable offset key).
export async function fetchDrawWindow(win: WindowKey): Promise<DrawRow[]> {
  const start = windowStart(win);
  const size = 1000;
  const out: DrawRow[] = [];
  for (let off = 0; off < 60000; off += size) {
    const page = await fetchFromSupabase<DrawRow[]>({
      path:
        `/rest/v1/histories?select=id,date_et,session,jurisdiction,result_digits,comboset_sorted` +
        `&date_et=gte.${start}&result_digits=not.is.null` +
        `&order=date_et.desc,id.desc&limit=${size}&offset=${off}`,
    });
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < size) break;
  }
  return out;
}
