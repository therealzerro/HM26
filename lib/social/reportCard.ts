/**
 * reportCard — data assembly for public-page publish content (SOCIAL-01).
 *
 * Produces the numbers behind the Tier-1 "yesterday's report card" caption:
 * verified matches per jurisdiction (faithful slate ∩ histories join, NEVER
 * stored hit flags — BUG-162 lesson) plus a rolling 30-day verified total.
 *
 * Outputs contain jurisdiction names and counts ONLY — no 3-digit numbers,
 * by construction, so the caption inherits Tier-1 safety from the data.
 */

import { fetchFromSupabase } from '@/lib/supabase';
import type { ReportCardMatch } from './captions';

type Scope = 'midday' | 'evening' | 'allday';
const SCOPES: Scope[] = ['midday', 'evening', 'allday'];

interface SlateRow {
  scope: string;
  slate_date: string;
  top_k_straights_json: any;
}

interface HistRow {
  date_et: string;
  session: string;
  jurisdiction: string;
  comboset_sorted: string;
  result_digits: string;
}

export interface ReportCardData {
  date: string;                 // the report-card date (yesterday)
  totalSignals: number;         // unique picks across scopes
  verifiedCount: number;        // unique (scope,pick) with ≥1 match
  jurisdictionCount: number;
  matches: ReportCardMatch[];   // deduped by jurisdiction, exact beats partial
  verified30d: number;
}

function parsePicks(json: any): { comboSet: string; bestOrder: string }[] {
  const arr = typeof json === 'string' ? JSON.parse(json) : json;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((p: any) => ({
      comboSet: String(p?.comboSet ?? p?.combo_set ?? ''),
      bestOrder: String(p?.bestOrder ?? p?.best_order ?? ''),
    }))
    .filter(p => p.comboSet);
}

async function fetchSlates(fromDate: string, toDate: string): Promise<SlateRow[]> {
  return fetchFromSupabase<SlateRow[]>({
    path: `/rest/v1/slate_snapshots?select=scope,slate_date,top_k_straights_json&slate_date=gte.${fromDate}&slate_date=lte.${toDate}&deleted_at=is.null&or=(mode.is.null,mode.neq.zk30)&order=slate_date.asc&limit=400`,
  });
}

/** Paginated histories fetch — PostgREST caps every GET at 1000 rows. */
async function fetchHistories(fromDate: string, toDate: string): Promise<HistRow[]> {
  const out: HistRow[] = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const page = await fetchFromSupabase<HistRow[]>({
      path: `/rest/v1/histories?select=date_et,session,jurisdiction,comboset_sorted,result_digits&date_et=gte.${fromDate}&date_et=lte.${toDate}&order=date_et.asc&limit=1000&offset=${offset}`,
    });
    if (!Array.isArray(page) || page.length === 0) break;
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

function sessionMatches(scope: string, session: string): boolean {
  // allday = ANY draw counts; midday/evening are strict (two-bucket sessions)
  return scope === 'allday' || session === scope;
}

/** Count unique (date, scope, pick) box matches over a window — faithful join. */
function countVerified(slates: SlateRow[], hist: HistRow[]): number {
  const histByDate = new Map<string, HistRow[]>();
  for (const h of hist) {
    const arr = histByDate.get(h.date_et) ?? [];
    arr.push(h);
    histByDate.set(h.date_et, arr);
  }
  let verified = 0;
  for (const s of slates) {
    const draws = histByDate.get(s.slate_date) ?? [];
    for (const p of parsePicks(s.top_k_straights_json)) {
      if (draws.some(h => h.comboset_sorted === p.comboSet && sessionMatches(s.scope, h.session))) verified++;
    }
  }
  return verified;
}

export async function fetchReportCardData(yesterday: string): Promise<ReportCardData> {
  const from30 = new Date(yesterday + 'T12:00:00Z');
  from30.setUTCDate(from30.getUTCDate() - 29);
  const from30Str = from30.toISOString().slice(0, 10);

  const [slates30, hist30] = await Promise.all([
    fetchSlates(from30Str, yesterday),
    fetchHistories(from30Str, yesterday),
  ]);

  const ySlates = slates30.filter(s => s.slate_date === yesterday);
  const yHist = hist30.filter(h => h.date_et === yesterday);

  // yesterday detail: per-jurisdiction matches, exact vs partial
  const jxBest = new Map<string, boolean>(); // jurisdiction → sawExact
  let totalSignals = 0;
  let verifiedCount = 0;
  for (const s of ySlates) {
    for (const p of parsePicks(s.top_k_straights_json)) {
      totalSignals++;
      const matched = yHist.filter(h => h.comboset_sorted === p.comboSet && sessionMatches(s.scope, h.session));
      if (matched.length > 0) {
        verifiedCount++;
        for (const m of matched) {
          const exact = m.result_digits === p.bestOrder;
          jxBest.set(m.jurisdiction, (jxBest.get(m.jurisdiction) ?? false) || exact);
        }
      }
    }
  }

  const matches: ReportCardMatch[] = [...jxBest.entries()]
    .map(([jurisdiction, exact]) => ({ jurisdiction, exact }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.jurisdiction.localeCompare(b.jurisdiction));

  return {
    date: yesterday,
    totalSignals,
    verifiedCount,
    jurisdictionCount: matches.length,
    matches,
    verified30d: countVerified(slates30, hist30),
  };
}
