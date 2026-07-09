/**
 * captions — template-driven caption generation (SOCIAL-01).
 *
 * Implements Brand Rehab Skill Brief v2 §10 caption templates as a slot-fill
 * engine with per-slot synonym pools for variation. Variation matters for two
 * reasons: (a) the brief's Tier-3 rule — identical captions across groups the
 * same day trip the spam classifier; (b) Meta's 2026 unoriginal-content
 * crackdown rewards variety.
 *
 * Deterministic by (kind, date, variant) so "↻ Variation" in the UI cycles
 * predictably and the same post regenerated twice matches.
 */

import type { SocialTier } from './brandLint';

export type CaptionKind =
  | 'signal_announce'   // Tier 1 — public page daily announcement (no numbers)
  | 'report_card'       // Tier 1 — text-only yesterday verification
  | 'group_drop'        // Tier 2 — free group daily signal post
  | 'cross_post'        // Tier 3 — admin-respectful cross-post
  | 'pro_drop';         // Tier 4 — Pro group premium drop

export const KIND_TIER: Record<CaptionKind, SocialTier> = {
  signal_announce: 1,
  report_card: 1,
  group_drop: 2,
  cross_post: 3,
  pro_drop: 4,
};

export interface ReportCardMatch {
  jurisdiction: string;
  exact: boolean;      // exact (best-order) vs partial (set) match
}

export interface CaptionData {
  dateLabel: string;            // e.g. "7/9"
  totalSignals?: number;        // signals published yesterday (all scopes)
  verifiedCount?: number;       // signals that aligned with observed outcomes
  jurisdictionCount?: number;   // distinct jurisdictions matched (COUNT only — never listed on PUBLIC)
  matches?: ReportCardMatch[];  // per-jurisdiction detail — FREE/PRO surfaces only, never PUBLIC (§6: no state codes/attribution)
  verified30d?: number;         // rolling 30-day verified total
  freeGroupUrl?: string;
  proUrl?: string;
  proPrice?: string;            // Pro group price, config-driven (app_config.social_pro_price)
  allDay?: boolean;             // §6 FREE exception: the All-Day post is pure value — NO Pro pitch
}

/** Fallback Pro-group price. Live value comes from app_config.social_pro_price. */
export const DEFAULT_PRO_PRICE = '$2.49/mo';
const PRICE_TOKEN = '{PRO_PRICE}';

// seeded pick — cheap deterministic hash so variants cycle without RNG
function seededIndex(seed: string, poolSize: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % poolSize;
}

function pick<T>(pool: T[], seed: string, variant: number): T {
  return pool[(seededIndex(seed, pool.length) + variant) % pool.length];
}

// ── pools (approved positioning phrases, brief §6) ───────────────────────────
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

// ── generators ───────────────────────────────────────────────────────────────

function signalAnnounce(d: CaptionData, variant: number): string {
  const seed = `sa-${d.dateLabel}`;
  const e = pick(LIVE_EMOJI, seed, variant);
  const method = pick(METHOD_PHRASES, seed + 'm', variant);
  const ctaFree = pick(CTA_FREE, seed + 'c', variant);
  // PUBLIC surface (§6): no pricing, no Pro/upgrade language. Free-community
  // invite only — the Pro pitch lives in the FREE group, never on the page.
  return [
    `${e} ${d.dateLabel} daily intelligence — LIVE.`,
    '',
    `Today's pattern analysis is published in the community. ${method}`,
    '',
    ctaFree,
  ].join('\n');
}

function reportCard(d: CaptionData, variant: number): string {
  const seed = `rc-${d.dateLabel}`;
  const total = d.totalSignals ?? 0;
  const verified = d.verifiedCount ?? 0;
  const jx = d.jurisdictionCount ?? 0;
  // PUBLIC surface (§6): AGGREGATE ONLY. Jurisdiction COUNT is allowed; the
  // per-state breakdown ("BOX MATCH — TN") is slate→draw attribution + state
  // codes, both forbidden on public — that detail belongs to FREE/PRO. Vocab
  // law (§4a): "matches" (approved), never "hits"/"partial".
  const lines: string[] = [
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

function groupDrop(d: CaptionData, variant: number): string {
  const seed = `gd-${d.dateLabel}`;
  const e = pick(LIVE_EMOJI, seed, variant);
  const opener = pick(GROUP_OPENERS, seed + 'o', variant);
  // §6 FREE exception: the All-Day post is pure value — NO Pro pitch.
  const pro = (d.proUrl && !d.allDay)
    ? `\n\nNot in the Pro tier yet? ${d.proUrl} — ${PRICE_TOKEN} for inner-circle drops first.`
    : '';
  return [
    `${e} ${d.dateLabel} ${opener}`,
    '',
    'Full intelligence drop is live in the community.',
    '',
    '👇 Members: full report below.',
  ].join('\n') + pro;
}

function crossPost(d: CaptionData, variant: number): string {
  const seed = `xp-${d.dateLabel}`;
  const value = pick(CROSS_VALUE, seed, variant);
  const link = d.freeGroupUrl ? `\n\nIf it's a fit for your crew, the link is below 👇\n${d.freeGroupUrl}` : "\n\nIf it's a fit for your crew, the link is below 👇";
  return [
    '🙏 Posting with permission to share value with this community.',
    '',
    `Our free community delivers ${value}. No fees. No hype.`,
  ].join('\n') + link;
}

function proDrop(d: CaptionData, variant: number): string {
  const seed = `pd-${d.dateLabel}`;
  const e = pick(LIVE_EMOJI, seed, variant);
  return [
    `${e} ${d.dateLabel} inner-circle drop — live.`,
    '',
    'Full-fidelity report inside: complete signal breakdown, verification receipts, and the engineering notes behind today\'s run.',
    '',
    'Thanks for backing the build. 🛠️',
  ].join('\n');
}

export function generateCaption(kind: CaptionKind, data: CaptionData, variant = 0): string {
  let out: string;
  switch (kind) {
    case 'signal_announce': out = signalAnnounce(data, variant); break;
    case 'report_card': out = reportCard(data, variant); break;
    case 'group_drop': out = groupDrop(data, variant); break;
    case 'cross_post': out = crossPost(data, variant); break;
    case 'pro_drop': out = proDrop(data, variant); break;
  }
  return out.split(PRICE_TOKEN).join(data.proPrice ?? DEFAULT_PRO_PRICE);
}

export const KIND_LABELS: Record<CaptionKind, { label: string; desc: string; dest: string }> = {
  report_card: { label: "Yesterday's Report Card", desc: 'Verification post — aggregate counts, no numbers. Text or brand-safe brief image.', dest: 'Public page (API)' },
  signal_announce: { label: 'Daily Intelligence — LIVE', desc: 'Announcement that today\'s reports are published. Text or brief image.', dest: 'Public page (API)' },
  group_drop: { label: 'Free Group Signal Drop', desc: 'Full post kit: slate + 6 signal cards + group brief + caption', dest: 'Free group (assisted)' },
  cross_post: { label: 'Cross-Post', desc: 'Redacted slate (mosaic + JOIN FREE banner) + admin-respectful caption', dest: 'Other groups (assisted)' },
  pro_drop: { label: 'Pro Group Drop', desc: 'Full-fidelity kit: slate + 6 signal cards + brief, first-access framing', dest: 'Pro group (assisted)' },
};
