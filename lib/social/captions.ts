/**
 * captions — content × surface caption generation (SOCIAL-01/02/03).
 *
 * Two independent axes (2026-06-29 spec §6):
 *   CONTENT — what is being posted (report card, announcement, slate drop, brief, custom)
 *   SURFACE — where it lands (public page, free group, pro group, cross-post)
 *
 * The same content produces DIFFERENT captions per surface:
 *   PUBLIC — aggregate only; no digits, no state codes, no attribution,
 *            no pricing, no Pro/upgrade language.
 *   FREE   — attribution OK; pricing ($2.49/mo) + Pro CTA OK. Depth rule
 *            (SOCIAL-13): the All-Day drop is FULL (and pure value — no Pro
 *            pitch); Midday/Evening drops are DIGIT-REDACTED — the unredacted
 *            session drops are the Pro tier's conversion frame.
 *   PRO    — full unredacted, first-access framing, NO commercial/pricing.
 *   CROSS  — public-strict vocabulary + admin-respectful framing + variation.
 *
 * Vocab law (§4a, LOCKED): match labels are MATCH / BOX MATCH / STRAIGHT MATCH.
 * Never "hit"/"hits"/"partial match" — enforced by brandLint on every output.
 *
 * Deterministic by (content, surface, date, variant) so "↻ Variation" cycles
 * predictably and the same post regenerated twice matches.
 */

import type { SocialTier } from './brandLint';
import type { Surface } from './publishImages';

export type ContentKind =
  | 'report_card'      // yesterday's verification
  | 'signal_announce'  // today's intelligence is live
  | 'slate_drop'       // the daily slate (kit varies by surface)
  | 'brief'            // the publishable brief card
  | 'custom';          // operator-written

export const SURFACE_TIER: Record<Surface, SocialTier> = {
  public: 1,
  free: 2,
  cross: 3,
  pro: 4,
};

/** Which content kinds are valid on which surface. */
export const CONTENT_SURFACES: Record<ContentKind, Surface[]> = {
  report_card: ['public', 'free', 'pro'],
  signal_announce: ['public'],
  slate_drop: ['public', 'free', 'pro', 'cross'],
  brief: ['public', 'free', 'pro'],
  custom: ['public', 'free', 'pro', 'cross'],
};

export interface ReportCardMatch {
  jurisdiction: string;
  exact: boolean;      // exact (best-order) vs set match
}

export interface CaptionData {
  dateLabel: string;            // e.g. "7/9"
  totalSignals?: number;
  verifiedCount?: number;
  jurisdictionCount?: number;   // COUNT only — never listed on PUBLIC
  matches?: ReportCardMatch[];  // per-jurisdiction detail — FREE/PRO only (§6)
  verified30d?: number;
  freeGroupUrl?: string;
  proUrl?: string;
  proPrice?: string;            // config-driven (app_config.social_pro_price)
  allDay?: boolean;             // §6 FREE exception: All-Day = pure value, no Pro pitch
  session?: string;             // midday | evening | allday (slate drops)
}

/** Fallback Pro-group price. Live value comes from app_config.social_pro_price. */
export const DEFAULT_PRO_PRICE = '$2.49/mo';
const PRICE_TOKEN = '{PRO_PRICE}';

// seeded pick — deterministic, no RNG
function seededIndex(seed: string, poolSize: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % poolSize;
}
function pick<T>(pool: T[], seed: string, variant: number): T {
  return pool[(seededIndex(seed, pool.length) + variant) % pool.length];
}

// ── pools (approved positioning phrases) ─────────────────────────────────────
const METHOD_PHRASES = [
  'Cross-jurisdictional signals processed.',
  'Pattern recognition engine run complete.',
  'Real-time signal processing across 30+ jurisdictions.',
  'Statistical methodology applied to the full national dataset.',
];
const LIVE_EMOJI = ['⚡', '📡', '🛰️'];
const CTA_FREE = [
  '👇 Free community link in bio.',
  '👇 Full reports live in the free community — link in bio.',
  '👇 The free community gets the full breakdown.',
];
const GROUP_OPENERS = [
  'signals — published.',
  'intelligence drop — live.',
  'data drop is up.',
];
const CROSS_VALUE = [
  'data intelligence reports',
  'verified pattern analysis',
  'cross-jurisdictional insights',
];
const PRO_OPENERS = [
  'inner-circle drop — live.',
  'first-access report — live.',
  'the full-fidelity set is in.',
];

const SESSION_WORD: Record<string, string> = {
  midday: 'daytime', evening: 'nighttime', allday: 'continuous',
};

// Free-group Pro CTA — the ONLY surface where pricing is allowed (§6).
function proCta(d: CaptionData): string {
  if (!d.proUrl || d.allDay) return '';
  return `\n\nNot in the Pro tier yet? ${d.proUrl} — ${PRICE_TOKEN} for inner-circle drops first.`;
}

// ── generators: (content, surface) ───────────────────────────────────────────

function reportCard(d: CaptionData, surface: Surface, variant: number): string {
  const seed = `rc-${surface}-${d.dateLabel}`;
  const total = d.totalSignals ?? 0;
  const verified = d.verifiedCount ?? 0;
  const jx = d.jurisdictionCount ?? 0;

  if (surface === 'public') {
    // §6 PUBLIC: AGGREGATE ONLY — jurisdiction COUNT allowed, no state codes,
    // no slate→draw attribution, no pricing.
    const lines = [
      `📊 Yesterday's report card — ${d.dateLabel}`,
      '',
      `Of ${total} signals across our daily intelligence reports, ${verified} aligned with observed outcomes across ${jx} jurisdiction${jx === 1 ? '' : 's'}.`,
    ];
    if (d.verified30d != null) {
      lines.push('', `${d.verified30d} verified matches over the last 30 days. Methodology working as designed.`);
    }
    lines.push('', pick(CTA_FREE, seed, variant).replace('link in bio.', 'full daily intelligence drops inside.'));
    return lines.join('\n');
  }

  // FREE / PRO: full detail — per-jurisdiction lines with §4a-approved labels.
  const lines = [
    `📊 ${d.dateLabel} report card — verified.`,
    '',
    `${verified} of ${total} signals matched observed outcomes across ${jx} jurisdiction${jx === 1 ? '' : 's'}:`,
    '',
  ];
  for (const m of (d.matches ?? []).slice(0, 10)) {
    lines.push(`• ${m.exact ? 'STRAIGHT MATCH' : 'BOX MATCH'} — ${m.jurisdiction}`);
  }
  if ((d.matches?.length ?? 0) > 10) lines.push(`• …and ${d.matches!.length - 10} more`);
  if (d.verified30d != null) lines.push('', `${d.verified30d} verified matches in the last 30 days.`);
  if (surface === 'free') return lines.join('\n') + proCta(d);
  lines.push('', 'You saw it here first. 🛠️'); // PRO: first-access, no pricing (§6)
  return lines.join('\n');
}

function signalAnnounce(d: CaptionData, variant: number): string {
  const seed = `sa-${d.dateLabel}`;
  const e = pick(LIVE_EMOJI, seed, variant);
  const method = pick(METHOD_PHRASES, seed + 'm', variant);
  // PUBLIC only (§6): no pricing, no Pro language.
  return [
    `${e} ${d.dateLabel} daily intelligence — LIVE.`,
    '',
    `Today's pattern analysis is published in the community. ${method}`,
    '',
    pick(CTA_FREE, seed + 'c', variant),
  ].join('\n');
}

function slateDrop(d: CaptionData, surface: Surface, variant: number): string {
  const seed = `sd-${surface}-${d.dateLabel}`;
  const e = pick(LIVE_EMOJI, seed, variant);
  const sess = d.session ? SESSION_WORD[d.session] ?? '' : '';

  switch (surface) {
    case 'public': {
      // Teaser only — the mosaic image carries the intrigue; caption stays
      // aggregate. No session labels paired with numbers, no digits, no pricing.
      const method = pick(METHOD_PHRASES, seed + 'm', variant);
      return [
        `${e} ${d.dateLabel} intelligence set — published.`,
        '',
        `${method} The full breakdown is live in the community.`,
        '',
        pick(CTA_FREE, seed + 'c', variant),
      ].join('\n');
    }
    case 'free': {
      const opener = pick(GROUP_OPENERS, seed + 'o', variant);
      // SOCIAL-13 depth rule: All-Day is the FULL free drop (pure value, no
      // Pro pitch — proCta already suppresses on allDay). Midday/Evening free
      // drops ship redacted assets, so the caption sells the gap instead of
      // promising a full report.
      const redactedSession = d.session === 'midday' || d.session === 'evening';
      if (redactedSession) {
        return [
          `${e} ${d.dateLabel}${sess ? ' ' + sess : ''} ${opener}`,
          '',
          'Top-line signals below. The unredacted session drop goes live first in the Pro tier.',
          '',
          '👇 Members: redacted preview below.',
        ].join('\n') + proCta(d);
      }
      return [
        `${e} ${d.dateLabel}${sess ? ' ' + sess : ''} ${opener}`,
        '',
        'Full intelligence drop is live in the community.',
        '',
        '👇 Members: full report below.',
      ].join('\n') + proCta(d);
    }
    case 'pro': {
      const opener = pick(PRO_OPENERS, seed + 'p', variant);
      return [
        `${e} ${d.dateLabel}${sess ? ' ' + sess : ''} ${opener}`,
        '',
        'Complete signal breakdown, full order detail, and the engineering notes behind today\'s run.',
        '',
        'Thanks for backing the build. 🛠️',
      ].join('\n');
    }
    case 'cross': {
      const value = pick(CROSS_VALUE, seed + 'v', variant);
      const link = d.freeGroupUrl ? `\n${d.freeGroupUrl}` : '';
      return [
        '🙏 Posting with permission to share value with this community.',
        '',
        `Our free community delivers ${value}. No fees. No hype.`,
        '',
        'If it\'s a fit for your crew, the link is below 👇' + link,
      ].join('\n');
    }
  }
}

function briefCaption(d: CaptionData, surface: Surface, variant: number): string {
  const seed = `br-${surface}-${d.dateLabel}`;
  const e = pick(LIVE_EMOJI, seed, variant);
  if (surface === 'public') {
    return [
      `${e} ${d.dateLabel} daily brief — published.`,
      '',
      `Yesterday verified, today's analysis live. The methodology, working in the open.`,
      '',
      pick(CTA_FREE, seed, variant),
    ].join('\n');
  }
  if (surface === 'free') {
    return [
      `${e} ${d.dateLabel} member brief — inside. 👇`,
      '',
      'Yesterday\'s verification and today\'s full outlook in one card.',
    ].join('\n') + proCta(d);
  }
  // PRO
  return [
    `${e} ${d.dateLabel} inner-circle brief — first access.`,
    '',
    'Full verification detail and today\'s complete outlook. You see it before anyone.',
  ].join('\n');
}

export function generateCaption(content: ContentKind, surface: Surface, data: CaptionData, variant = 0): string {
  let out: string;
  switch (content) {
    case 'report_card': out = reportCard(data, surface, variant); break;
    case 'signal_announce': out = signalAnnounce(data, variant); break;
    case 'slate_drop': out = slateDrop(data, surface, variant); break;
    case 'brief': out = briefCaption(data, surface, variant); break;
    case 'custom': out = ''; break;
  }
  return out.split(PRICE_TOKEN).join(data.proPrice ?? DEFAULT_PRO_PRICE);
}

// ── UI metadata ──────────────────────────────────────────────────────────────

export const SURFACE_LABELS: Record<Surface, { label: string; icon: string; desc: string; lane: 'api' | 'assist' }> = {
  public: { label: 'Public Page', icon: '📣', desc: 'Classifier scrutiny — aggregate only, no digits/states/pricing. Direct API.', lane: 'api' },
  free: { label: 'Free Group', icon: '👥', desc: 'Opted-in — All-Day FULL (pure value); Midday/Evening redacted + Pro CTA (SOCIAL-13).', lane: 'assist' },
  pro: { label: 'Pro Group', icon: '💎', desc: 'Paying members — full fidelity, first-access framing, NO pricing.', lane: 'assist' },
  cross: { label: 'Cross-Post', icon: '🔁', desc: 'Other groups — redacted assets, admin-respectful, vary captions.', lane: 'assist' },
};

export const CONTENT_LABELS: Record<ContentKind, { label: string; desc: string }> = {
  report_card: { label: "Yesterday's Report Card", desc: 'Verification: aggregate on public, per-state MATCH detail in groups' },
  signal_announce: { label: 'Daily Intelligence — LIVE', desc: 'Announcement that today\'s reports are published' },
  slate_drop: { label: 'Daily Slate Drop', desc: 'The slate: full kit in groups, mosaic tease on public/cross' },
  brief: { label: 'Daily Brief', desc: 'The publishable brief card, surface-appropriate variant' },
  custom: { label: 'Custom', desc: 'Write your own — lint still enforces the surface rules' },
};
