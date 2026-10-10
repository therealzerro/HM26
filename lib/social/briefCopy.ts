/**
 * briefCopy — every word the social brief can render, in one place, and the
 * MODEL the card renders from (MKT-82 Phase 1, 2026-10-10).
 *
 * Why a model: the brief is tap-produced (Admin → Reels / Publish), so there is
 * no script step to lint its pixels. `buildBriefModel()` is the single source
 * of the rendered text — the card draws the model, `lintBrief()` lints the
 * model — so a string cannot reach the PNG without passing the lint, and the
 * lint cannot miss a string the card draws. Add copy HERE, never inline in the
 * card.
 *
 * Copy law in force (STAT-01 Phase 6, permanent, all tiers): no aggregate
 * count as a headline (R-A), nothing that implies the six are likelier (R-B);
 * what stands is R-C — posted before the draw, graded the same day, 42 states
 * & provinces, every match and every miss on the record. Pro is never
 * commercial (F4): no pricing, no sales lines, no first-access framing.
 */

import type { SocialTier } from './brandLint';
import type { SocialBriefData, SocialBriefScope, SocialBriefSignal } from './socialBrief';
import { matchTag, type Resolution } from './briefResolve';
import { sessionLabel } from './sessionLabels';

export type BriefVariant = 'public' | 'group';
export type GroupTier = 'free' | 'pro';

/** The content agent's line, verbatim (MKT-82 R1, 2026-10-10). All tiers. */
export const BRIEF_FOOTER_LINE =
  'Ranked by the engine, posted before the draw, graded the same day across 42 states & provinces. No ranking makes any combination likelier.';

export const BRIEF_COPY = {
  brand: 'HITMASTER',
  brandAccent: 'ZK6',
  kickerPublic: 'DAILY INTELLIGENCE',
  kickerFree: 'MEMBER BRIEF',
  kickerPro: 'PRO BRIEF',           // was INNER-CIRCLE BRIEF — F4: no inner-circle framing on Pro
  badgePublic: '⚡ LIVE',
  badgeFree: '⚡ MEMBERS',
  badgePro: '💎 PRO',
  yesterday: 'YESTERDAY',
  today: 'TODAY',
  statAligned: 'signals aligned',
  statJuris: 'jurisdictions',
  stateLive: '● LIVE',
  stateResolved: '✓ RESOLVED',
  missLive: 'no match yet — session live',
  missDone: 'no match this session',
  noBoard: '— no signals published —',
  lockText: 'releases in Pro first',
  freeCta: 'Pro members see it first ⚡',   // tier 2 only (R2)
  releaseTitle: "Today's combinations release in Pro first",
  releaseSub: 'Exact order + set for every session, before the draw.',
  publicHeroCaption: 'SIGNALS ALIGNED WITH OBSERVED OUTCOMES',
  publicJuris: 'JURISDICTIONS',
  publicTracked: 'SIGNALS TRACKED',
  publicBody: "Today's cross-jurisdictional analysis is published. Real-time signal processing across the full national dataset.",
  publicCta: 'Full intelligence drops in the free community 👇',
} as const;

export function briefTier(variant: BriefVariant, groupTier?: GroupTier): SocialTier {
  if (variant === 'public') return 1;
  return groupTier === 'pro' ? 4 : 2;
}

export interface BriefRow {      // one yesterday row
  scopeLabel: string;
  tag: ReturnType<typeof matchTag>;
  chips: string[];               // "{4,5,8}" display sets
}

export interface BriefSession {  // one today block
  scopeLabel: string;
  state: string | null;          // ● LIVE / ✓ RESOLVED / null
  resolved?: { tag: 'STRAIGHT MATCH' | 'BOX MATCH'; chips: string[] };
  miss?: string;
  signals?: SocialBriefSignal[]; // pro, unresolved: the board
  locked?: string;               // free, unresolved
  none?: string;                 // no board published
}

export interface BriefModel {
  tier: SocialTier;
  variant: BriefVariant;
  groupTier?: GroupTier;
  kicker: string;                // "PRO BRIEF · 10/10"
  badge: string;
  yesterdayLabel: string;        // "YESTERDAY · 10/9"
  todayLabel: string;            // "TODAY"
  publicHero?: { num: string; den: string; caption: string; juris: string; jurisLabel: string; tracked: string; trackedLabel: string; body: string; cta: string };
  stats?: { value: string; label: string }[];
  yesterdayRows?: BriefRow[];
  sessions?: BriefSession[];
  release?: { title: string; sub: string };
  footer: string;
  footerCta?: string;
}

export function setBraces(set: string): string {
  return `{${set.split('').join(',')}}`;
}

function rowFor(s: SocialBriefScope, tier: SocialTier): BriefRow {
  return {
    scopeLabel: sessionLabel(s.scope, tier),
    tag: matchTag(s.yesterday),
    chips: s.yesterday.slateHit ? s.yesterday.hittingCombos.map(setBraces) : [],
  };
}

function sessionFor(s: SocialBriefScope, tier: SocialTier, locked: boolean): BriefSession {
  const t: Resolution = s.today;
  const base: BriefSession = {
    scopeLabel: sessionLabel(s.scope, tier),
    state: t.resolved ? (t.live ? BRIEF_COPY.stateLive : BRIEF_COPY.stateResolved) : null,
  };
  if (t.resolved) {
    if (t.slateHit) return { ...base, resolved: { tag: t.straight ? 'STRAIGHT MATCH' : 'BOX MATCH', chips: t.hittingCombos.map(setBraces) } };
    return { ...base, miss: t.live ? BRIEF_COPY.missLive : BRIEF_COPY.missDone };
  }
  if (locked) return { ...base, locked: BRIEF_COPY.lockText };
  if (!s.todaySignals.length) return { ...base, none: BRIEF_COPY.noBoard };
  return { ...base, signals: s.todaySignals };
}

export function buildBriefModel(data: SocialBriefData, variant: BriefVariant, groupTier?: GroupTier): BriefModel {
  const tier = briefTier(variant, groupTier);
  const isPublic = variant === 'public';
  const isPro = tier === 4;
  const kickerWord = isPublic ? BRIEF_COPY.kickerPublic : isPro ? BRIEF_COPY.kickerPro : BRIEF_COPY.kickerFree;
  const model: BriefModel = {
    tier, variant, groupTier,
    kicker: `${kickerWord} · ${data.todayLabel}`,
    badge: isPublic ? BRIEF_COPY.badgePublic : isPro ? BRIEF_COPY.badgePro : BRIEF_COPY.badgeFree,
    yesterdayLabel: `${BRIEF_COPY.yesterday} · ${data.yesterdayLabel}`,
    todayLabel: BRIEF_COPY.today,
    footer: BRIEF_FOOTER_LINE,
  };
  if (isPublic) {
    // §6 PUBLIC: yesterday's own day only (a record entry, R-A permits it) —
    // counts + jurisdiction COUNT, no digits, no state codes, no rolling total.
    model.publicHero = {
      num: String(data.verifiedCount), den: String(data.totalSignals), caption: BRIEF_COPY.publicHeroCaption,
      juris: String(data.jurisdictionCount), jurisLabel: BRIEF_COPY.publicJuris,
      tracked: String(data.totalSignals), trackedLabel: BRIEF_COPY.publicTracked,
      body: BRIEF_COPY.publicBody, cta: BRIEF_COPY.publicCta,
    };
    return model;
  }
  model.stats = [
    { value: `${data.verifiedCount}/${data.totalSignals}`, label: BRIEF_COPY.statAligned },
    { value: `${data.jurisdictionCount}`, label: BRIEF_COPY.statJuris },
  ];
  model.yesterdayRows = data.scopes.map(s => rowFor(s, tier));
  model.sessions = data.scopes.map(s => sessionFor(s, tier, !isPro));
  if (!isPro) {
    model.release = { title: BRIEF_COPY.releaseTitle, sub: BRIEF_COPY.releaseSub };
    model.footerCta = BRIEF_COPY.freeCta;
  }
  return model;
}

/** Every string the card will draw for this model, in reading order. */
export function briefModelStrings(m: BriefModel): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const add = (where: string, text: string | undefined | null) => { if (text) out.push({ where, text }); };
  add('brand', `${BRIEF_COPY.brand} ${BRIEF_COPY.brandAccent}`);
  add('kicker', m.kicker);
  add('badge', m.badge);
  if (m.publicHero) {
    const h = m.publicHero;
    add('hero', `${m.yesterdayLabel}`);
    add('hero.figure', `${h.num} / ${h.den}`);
    add('hero.caption', h.caption);
    add('hero.meta', `${h.juris} ${h.jurisLabel}`);
    add('hero.meta', `${h.tracked} ${h.trackedLabel}`);
    add('today', m.todayLabel);
    add('public.body', h.body);
    add('public.cta', h.cta);
  }
  if (m.stats) {
    add('yesterday', m.yesterdayLabel);
    for (const s of m.stats) add('stat', `${s.value} ${s.label}`);
  }
  for (const r of m.yesterdayRows ?? []) add('yesterday.row', [r.scopeLabel, ...r.chips, r.tag].join(' '));
  if (m.sessions) add('today', m.todayLabel);
  for (const s of m.sessions ?? []) {
    add('session.head', [s.scopeLabel.toUpperCase(), s.state].filter(Boolean).join(' '));
    if (s.resolved) add('session.resolved', [s.resolved.tag, ...s.resolved.chips].join(' '));
    add('session.miss', s.miss);
    add('session.locked', s.locked);
    add('session.none', s.none);
    for (const g of s.signals ?? []) add('session.signal', `${g.digits} ${setBraces(g.set)}`);
  }
  if (m.release) { add('release.title', m.release.title); add('release.sub', m.release.sub); }
  add('footer', m.footer);
  add('footer.cta', m.footerCta);
  return out;
}
