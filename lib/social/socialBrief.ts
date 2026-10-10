/**
 * socialBrief — data for the publishable, brand-safe consumer brief (SOCIAL-01).
 *
 * MKT-82 Phase 1 (2026-10-10) rebuilt this layer on the engine's own outputs:
 *   · TODAY  = each scope's published board (slate_snapshots, the same six the
 *              app shows), in slate order, exact order + box set. No decision-
 *              layer selection — the former `computeBrief().play` (a footprint /
 *              P(hit) / convergence score) and `allocation` (the operator's
 *              stake units + three-day ride rule, shown as "where the model
 *              concentrates") are GONE from every member surface. The engine
 *              has neither.
 *   · YESTERDAY and TODAY are graded by ONE law (lib/social/briefResolve.ts):
 *              slate ∩ histories, straight = result_digits === bestOrder (F1 —
 *              the old yesterday row called a rank-1 BOX match a STRAIGHT MATCH).
 *   · Aggregates (yesterday's signals aligned / jurisdictions) come from
 *              reportCard as before. `verified30d` is no longer carried: no
 *              rolling count on any tier (STAT-01 R-A).
 * Variants (public / free / pro) are decided in the card; this data is
 * tier-independent and cached across tiers by the Reels exporter.
 * Session labels are NOT in the data — the card picks them by tier
 * (lib/social/sessionLabels.ts, R4).
 */

import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { fetchFromSupabase } from '@/lib/supabase';
import { fetchReportCardData } from './reportCard';
import {
  parseBoard, resolveDraws, fmtDigits, setDigits,
  type DrawRow, type Resolution, type ResolveScope,
} from './briefResolve';

export type Scope = ResolveScope;
export const SCOPES: Scope[] = ['midday', 'evening', 'allday'];

export interface SocialBriefSignal {
  digits: string;   // exact order for display, "4-8-5"
  set: string;      // sorted set digits, "458"
}

export interface SocialBriefScope {
  scope: Scope;
  todaySignals: SocialBriefSignal[];  // the published board, slate order (6)
  yesterday: Resolution;
  today: Resolution;
}

export interface SocialBriefData {
  todayLabel: string;        // "10/10"
  yesterdayLabel: string;    // "10/9"
  // yesterday's aggregate (reportCard, faithful)
  totalSignals: number;
  verifiedCount: number;
  jurisdictionCount: number;
  scopes: SocialBriefScope[];
}

function md(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

interface DayBoards { boards: Record<Scope, ReturnType<typeof parseBoard>>; draws: DrawRow[] }

/** Latest non-deleted ZK6 snapshot per scope for a date + that date's draws. */
async function fetchDay(date: string): Promise<DayBoards> {
  const [slateRows, histRows] = await Promise.all([
    fetchFromSupabase<any[]>({
      path: `/rest/v1/slate_snapshots?select=scope,updated_at_et,top_k_straights_json&slate_date=eq.${date}&deleted_at=is.null&or=(mode.is.null,mode.neq.zk30)&order=updated_at_et.desc&limit=60`,
    }).catch(() => []),
    fetchFromSupabase<any[]>({
      path: `/rest/v1/histories?select=session,comboset_sorted,result_digits&date_et=eq.${date}&limit=1000`,
    }).catch(() => []),
  ]);
  const latest: Partial<Record<Scope, any>> = {};
  for (const r of (slateRows ?? [])) {
    const sc = r.scope as Scope;
    if (SCOPES.includes(sc) && !latest[sc]) latest[sc] = r;
  }
  const boards = {} as DayBoards['boards'];
  for (const sc of SCOPES) boards[sc] = parseBoard(latest[sc]?.top_k_straights_json);
  const draws: DrawRow[] = (histRows ?? []).map((h: any) => ({
    session: String(h.session ?? ''),
    comboset_sorted: String(h.comboset_sorted ?? ''),
    result_digits: String(h.result_digits ?? ''),
  }));
  return { boards, draws };
}

export async function buildSocialBrief(today = getTodayET()): Promise<SocialBriefData> {
  const yesterday = getYesterdayET();
  const [rc, todayDay, yDay] = await Promise.all([
    fetchReportCardData(yesterday),
    fetchDay(today),
    fetchDay(yesterday),
  ]);

  const scopes: SocialBriefScope[] = SCOPES.map((sc) => ({
    scope: sc,
    todaySignals: todayDay.boards[sc].map(p => ({ digits: fmtDigits(p.bestOrder), set: setDigits(p.comboSet) })),
    today: resolveDraws(todayDay.boards[sc], todayDay.draws, sc),
    yesterday: resolveDraws(yDay.boards[sc], yDay.draws, sc),
  }));

  return {
    todayLabel: md(today),
    yesterdayLabel: md(yesterday),
    totalSignals: rc.totalSignals,
    verifiedCount: rc.verifiedCount,
    jurisdictionCount: rc.jurisdictionCount,
    scopes,
  };
}
