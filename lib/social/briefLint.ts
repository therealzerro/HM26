/**
 * briefLint — the brief does not render if it fails (MKT-82 1.5, 2026-10-10).
 *
 * Runs the universal caption linter (lib/social/brandLint.ts — R-A / R-B /
 * no-streak, plus the strict tier-1 vocabulary for the public variant) over
 * every string of a BriefModel, then the BRIEF-SPECIFIC blocking classes the
 * 10/10 Phase 0 measurement showed the caption rules cannot see lexically:
 * the bare "N · 30d" stat tile, "probability" / "underperform" / "pattern
 * confirmed" (the 8/7 analyst notes), "concentrat" / "N-day window" / "N-day
 * activity" / "carries them" (the stake-unit panel), and on tier 4 the
 * commercial shapes (first access, inner circle, upgrade, pricing).
 *
 * Both capture paths (Admin → Reels exporter, Publish console) call this
 * BEFORE capture and refuse on a block. Pure; unit-tested in __tests__.
 */

import { lintCaption, type SocialTier } from './brandLint';
import { briefModelStrings, type BriefModel } from './briefCopy';

export interface BriefLintViolation {
  where: string;
  text: string;
  term: string;
  rule: string;
}

export interface BriefLintResult {
  ok: boolean;
  tier: SocialTier;
  checked: number;
  violations: BriefLintViolation[];
}

interface BriefRule { re: RegExp; rule: string; tiers?: SocialTier[] }

/** Blocking on every tier unless `tiers` narrows it. */
export const BRIEF_RULES: BriefRule[] = [
  // R-A — a rolling total as a stat tile ("125 · 30d", "125 30d", "verified · 30d").
  { re: /\b\d+\s*[·•]?\s*\d+d\b/i, rule: 'no-aggregate-count' },
  { re: /\b(verified|matches|matched|signals)\s*[·•]\s*\d+d\b/i, rule: 'no-aggregate-count' },
  { re: /\b(last|past|rolling)\s+\d+\s+days\b/i, rule: 'no-aggregate-count' },
  // R-B — likelihood language and recency-as-signal.
  { re: /probabilit/i, rule: 'no-edge-claim' },
  { re: /\blikel(y|ier|ihood)\b(?!\s*\.)/i, rule: 'no-edge-claim' },   // "likelier." as the footer's closing denial is allowed below
  { re: /underperform/i, rule: 'no-edge-claim' },
  { re: /pattern\s+confirmed/i, rule: 'no-edge-claim' },
  { re: /\bexclusion\b/i, rule: 'no-edge-claim' },
  { re: /concentrat/i, rule: 'no-edge-claim' },
  { re: /\b\d+-day\s+(window|activity)\b/i, rule: 'no-edge-claim' },
  { re: /\bcarries them\b/i, rule: 'no-edge-claim' },
  { re: /\bmaximi[sz]e\b/i, rule: 'no-edge-claim' },
  // F4 — Pro is never commercial: no pricing, no sales lines, no first-access framing.
  { re: /first[- ]access/i, rule: 'pro-no-commercial', tiers: [4] },
  { re: /inner[- ]circle/i, rule: 'pro-no-commercial', tiers: [4] },
  { re: /\bupgrade\b|\bsubscribe\b|\bjoin pro\b|see it first|release[sd]? in pro/i, rule: 'pro-no-commercial', tiers: [4] },
  { re: /\$\s?\d|\/mo\b/i, rule: 'pro-no-commercial', tiers: [4] },
];

/** The one sentence where "likelier" is a denial, not a claim (R1, verbatim). */
const LIKELIER_DENIAL = /no ranking makes any combination likelier\./i;

export function lintBrief(model: BriefModel): BriefLintResult {
  const tier = model.tier;
  const strings = briefModelStrings(model);
  const violations: BriefLintViolation[] = [];
  for (const { where, text } of strings) {
    const r = lintCaption(text, tier);
    for (const v of r.violations) {
      if (!v.blocking) continue;
      violations.push({ where, text, term: v.term, rule: v.rule });
    }
    for (const b of BRIEF_RULES) {
      if (b.tiers && !b.tiers.includes(tier)) continue;
      b.re.lastIndex = 0;
      const m = b.re.exec(text);
      if (!m) continue;
      if (b.rule === 'no-edge-claim' && /likel/i.test(m[0]) && LIKELIER_DENIAL.test(text)) continue;
      violations.push({ where, text, term: m[0], rule: b.rule });
    }
  }
  return { ok: violations.length === 0, tier, checked: strings.length, violations };
}

export function formatBriefLint(r: BriefLintResult): string {
  if (r.ok) return `lint PASS · tier ${r.tier} · ${r.checked} strings`;
  return `lint BLOCK · tier ${r.tier} · ` + r.violations.map(v => `${v.rule}:"${v.term}" @ ${v.where}`).join(' · ');
}
