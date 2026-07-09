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
import { fetchReportCardData } from './reportCard';

export interface SocialBriefPlay {
  combo: string;       // sorted-set digits, e.g. "159"
  bestOrder: string;   // straight best-order, e.g. "1-5-9"
  multiplicity: string;
}

export interface SocialBriefScope {
  scope: Scope;
  label: string;                 // Daytime / Nighttime / Continuous
  todayPlays: SocialBriefPlay[]; // 1-2 strongest by evidence
  ySlateHit: boolean;
  yHittingCombos: string[];      // sorted-set digit strings that matched yesterday
  yPick1Straight: boolean;       // was yesterday's #1 an exact (straight) match
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

export async function buildSocialBrief(today = getTodayET()): Promise<SocialBriefData> {
  const yesterday = getYesterdayET();
  const [rc, brief] = await Promise.all([
    fetchReportCardData(yesterday),
    computeBrief(today),
  ]);

  const scopes: SocialBriefScope[] = SCOPES.map((sc) => {
    const sb = brief.scopes[sc];
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
