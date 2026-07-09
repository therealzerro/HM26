/**
 * socialBrief — data for the publishable, brand-safe consumer brief (SOCIAL-01).
 *
 * DISTINCT from the admin BriefCard (which is operator-only and full of
 * "picks/hits/box/straight/P(hit)/tiers"). This assembles a consumer-facing
 * brief in two surface variants governed by the 2026-06-29 §6 discipline:
 *   PUBLIC  — aggregate only: counts + jurisdiction COUNT, no digits, no state
 *             codes, no attribution, no pricing.  (passes Two-Question)
 *   GROUP   — full: today's recommended plays (digits), yesterday's outcome
 *             per session with STRAIGHT MATCH / BOX MATCH vocab (§4a).
 *
 * Reuses faithful, read-only sources: reportCard (slate∩histories aggregate)
 * and computeBrief (per-scope plays + yesterday). Never stored hit flags.
 */

import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { computeBrief, Scope, SCOPES } from '@/lib/brief/computeBrief';
import { fetchFromSupabase } from '@/lib/supabase';
import { fetchReportCardData } from './reportCard';

export interface SocialBriefPlay {
  combo: string;       // sorted-set digits, e.g. "159"
  bestOrder: string;   // straight best-order, e.g. "1-5-9"
  multiplicity: string;
}

export interface SocialBriefScope {
  scope: Scope;
  label: string;                 // Daytime / Nighttime / Continuous
  todayPlays: SocialBriefPlay[]; // 1-2 strongest by evidence (shown when NOT yet resolved)
  ySlateHit: boolean;
  yHittingCombos: string[];      // sorted-set digit strings that matched yesterday
  yPick1Straight: boolean;       // was yesterday's #1 an exact (straight) match
  // Intraday live-results (SOCIAL-06): once today's session draws, show its
  // actual outcome instead of stale recommended plays.
  todayResolved: boolean;        // today's draw for this session is in
  todayLive: boolean;            // allday only: partially resolved (one session drawn, day not done)
  todaySlateHit: boolean;        // a today pick matched a today draw (faithful join)
  todayHittingCombos: string[];  // digit strings that matched today
  todayStraight: boolean;        // any today match was an exact (best-order) match
}

export interface SocialBriefData {
  todayLabel: string;            // "7/9"
  yesterdayLabel: string;        // "7/8"
  // PUBLIC aggregate
  totalSignals: number;
  verifiedCount: number;
  jurisdictionCount: number;
  verified30d: number;
  // GROUP detail
  scopes: SocialBriefScope[];
}

const SCOPE_LABEL: Record<Scope, string> = {
  midday: 'Daytime',
  evening: 'Nighttime',
  allday: 'Continuous',
};

function md(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function fmtBestOrder(s: string): string {
  const digits = (s ?? '').replace(/\D/g, '');
  return digits.length === 3 ? digits.split('').join('-') : (s ?? '');
}

function setToDigits(comboSet: string): string {
  return comboSet.replace(/[{}\s]/g, '').split(',').join('');
}

function parsePicks(json: any): { comboSet: string; bestOrder: string }[] {
  const arr = typeof json === 'string' ? (() => { try { return JSON.parse(json); } catch { return []; } })() : json;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((p: any) => ({ comboSet: String(p?.comboSet ?? p?.combo_set ?? ''), bestOrder: String(p?.bestOrder ?? p?.best_order ?? '') }))
    .filter(p => p.comboSet);
}

interface TodayRes { resolved: boolean; live: boolean; slateHit: boolean; hittingCombos: string[]; straight: boolean }

/**
 * Faithful intraday resolution: for each scope, has today's session drawn yet,
 * and if so did today's slate match today's draws (slate ∩ histories — never
 * stored flags). midday/evening resolve when that session's draws are in;
 * allday resolves as soon as ANY draw lands and is "live" until both sessions
 * have drawn.
 */
async function fetchTodayResolution(today: string): Promise<Record<Scope, TodayRes>> {
  const [slateRows, histRows] = await Promise.all([
    fetchFromSupabase<any[]>({
      path: `/rest/v1/slate_snapshots?select=scope,updated_at_et,top_k_straights_json&slate_date=eq.${today}&deleted_at=is.null&or=(mode.is.null,mode.neq.zk30)&order=updated_at_et.desc&limit=60`,
    }).catch(() => []),
    fetchFromSupabase<any[]>({
      path: `/rest/v1/histories?select=session,comboset_sorted,result_digits&date_et=eq.${today}&limit=1000`,
    }).catch(() => []),
  ]);
  const latestSlate: Record<string, any> = {};
  for (const r of (slateRows ?? [])) if (!latestSlate[r.scope]) latestSlate[r.scope] = r;
  const hist = histRows ?? [];
  const sessionsDrawn = new Set(hist.map((h: any) => h.session));

  const out = {} as Record<Scope, TodayRes>;
  for (const sc of SCOPES) {
    const draws = hist.filter((h: any) => sc === 'allday' || h.session === sc);
    const resolved = draws.length > 0;
    const live = sc === 'allday' && resolved && !(sessionsDrawn.has('midday') && sessionsDrawn.has('evening'));
    const hitting = new Set<string>();
    let slateHit = false, straight = false;
    if (resolved) {
      for (const p of parsePicks(latestSlate[sc]?.top_k_straights_json)) {
        const matched = draws.filter((h: any) => h.comboset_sorted === p.comboSet);
        if (matched.length) {
          slateHit = true;
          hitting.add(setToDigits(p.comboSet));
          if (matched.some((m: any) => m.result_digits === p.bestOrder)) straight = true;
        }
      }
    }
    out[sc] = { resolved, live, slateHit, hittingCombos: [...hitting], straight };
  }
  return out;
}

export async function buildSocialBrief(today = getTodayET()): Promise<SocialBriefData> {
  const yesterday = getYesterdayET();
  const [rc, brief, todayRes] = await Promise.all([
    fetchReportCardData(yesterday),
    computeBrief(today),
    fetchTodayResolution(today),
  ]);

  const scopes: SocialBriefScope[] = SCOPES.map((sc) => {
    const sb = brief.scopes[sc];
    const tr = todayRes[sc];
    const plays = (sb?.play ?? []).slice(0, 2).map((p) => ({
      combo: p.combo,
      bestOrder: fmtBestOrder(p.bestOrder ?? p.combo),
      multiplicity: p.multiplicity,
    }));
    return {
      scope: sc,
      label: SCOPE_LABEL[sc],
      todayPlays: plays,
      ySlateHit: sb?.yesterday?.slateHit ?? false,
      yHittingCombos: sb?.yesterday?.hittingCombos ?? [],
      yPick1Straight: !!(sb?.yesterday?.pick1Hit && sb?.preflight),
      todayResolved: tr.resolved,
      todayLive: tr.live,
      todaySlateHit: tr.slateHit,
      todayHittingCombos: tr.hittingCombos,
      todayStraight: tr.straight,
    };
  });

  return {
    todayLabel: md(today),
    yesterdayLabel: md(yesterday),
    totalSignals: rc.totalSignals,
    verifiedCount: rc.verifiedCount,
    jurisdictionCount: rc.jurisdictionCount,
    verified30d: rc.verified30d,
    scopes,
  };
}
