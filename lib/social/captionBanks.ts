/**
 * captionBanks — the CAPTION SYSTEM v2 banks (MKT-85, content agent spec
 * 2026-10-11): hooks per kind, CTA lines per tier, fact-line forms, the shared
 * question bank, and the rotation rules — ONE versioned JSON
 * (constants/captionBanks.v2.json, the lexicon pattern: owned by the content
 * agent, stored and versioned here; ids are stable forever).
 *
 * `lintBanks()` lints every line at every tier it claims with the live rules
 * (lintCaption + the brief rule-set) and is run at build (check-reel-assets)
 * and in __tests__ — a line that fails is reported, never shipped.
 *
 * No React / Expo imports: scripts/publish-reels.ts consumes this.
 */
import { lintCaption, type SocialTier } from './brandLint';
import { lintStrings, type BriefLintViolation } from './briefLint';

export interface BankLine { id: string; text: string; note?: string; retired?: string; kinds?: string[]; verbatim?: string }
export interface HookBank { tiers: SocialTier[]; kinds?: string[]; lines: BankLine[] }
export interface QuestionLine extends BankLine { public?: { id: string; text: string } }
export interface FactForm { tiers: SocialTier[]; kinds?: string[]; text: string }
export interface CaptionBanks {
  banks_version: string;
  rules: {
    hook_max_chars: number;
    no_same_hook_consecutive_days: boolean;
    question_once_per_day: boolean;
    question_cooldown_days: number;
    cta_no_consecutive_days: boolean;
    fact_omit_when_incomplete: boolean;
  };
  live_kinds: string[];
  hooks: Record<string, HookBank>;
  ctas: Record<string, BankLine[]>;
  facts: Record<string, FactForm> & { max_states_named: number; more_suffix: string };
  questions: QuestionLine[];
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const CAPTION_BANKS: CaptionBanks = require('../../constants/captionBanks.v2.json');

/** The hook bank a reel/post kind draws from (a bank may serve several kinds). */
export function hookBankFor(kind: string, banks: CaptionBanks = CAPTION_BANKS): { key: string; bank: HookBank } | null {
  for (const [key, bank] of Object.entries(banks.hooks)) {
    if (key === kind || bank.kinds?.includes(kind)) return { key, bank };
  }
  return null;
}

/** Sample placeholder fill used by the lint (real values are substituted by the assembler). */
export const LINT_SAMPLE: Record<string, string> = {
  '{weekday}': 'Friday', '{md}': '10/10', '{state}': 'NY', '{states}': 'NY, PA', '{N_word}': 'Two',
  '{link_free}': 'https://www.facebook.com/groups/3851453614997541', '{link_pro}': 'https://www.facebook.com/groups/hitmasterzk',
};
export function fillSample(text: string): string {
  return Object.entries(LINT_SAMPLE).reduce((t, [k, v]) => t.split(k).join(v), text);
}

export interface BankLintFinding { where: string; tier: SocialTier; text: string; violations: string[] }

/**
 * Lint one SLOT at a tier. The FACT slot carries the operator's 2026-10-11
 * ruling — "captions are allowed to name states for matches" — so the tier-1
 * `public-no-state-code` rule is carved out there and ONLY there.
 */
export function lintSlot(slot: 'hook' | 'fact' | 'cta' | 'question' | 'link' | 'caption', tier: SocialTier, text: string): string[] {
  const carve = (rule: string) => slot === 'fact' && rule === 'public-no-state-code';
  const a = lintCaption(text, tier).violations.filter(v => v.blocking && !carve(v.rule)).map(v => `${v.rule}:"${v.term}"`);
  // lintStrings re-runs lintCaption inside, so the carve-out applies to both passes
  const b = lintStrings(tier, [{ where: slot, text }]).violations.filter((v: BriefLintViolation) => !carve(v.rule)).map((v: BriefLintViolation) => `${v.rule}:"${v.term}"`);
  return [...new Set([...a, ...b])];
}

/** Every bank line at every tier it claims. Empty = clean. */
export function lintBanks(banks: CaptionBanks = CAPTION_BANKS): BankLintFinding[] {
  const out: BankLintFinding[] = [];
  const check = (where: string, slot: Parameters<typeof lintSlot>[0], tier: SocialTier, raw: string) => {
    if (!raw) return;
    const text = fillSample(raw);
    const v = lintSlot(slot, tier, text);
    if (v.length) out.push({ where, tier, text: raw, violations: v });
    if (slot === 'hook' && [...raw].length > banks.rules.hook_max_chars) out.push({ where, tier, text: raw, violations: [`hook>${banks.rules.hook_max_chars}ch`] });
  };
  for (const [key, bank] of Object.entries(banks.hooks)) for (const l of bank.lines) if (!l.retired) for (const t of bank.tiers) check(`hooks.${key}.${l.id}`, 'hook', t, l.text);
  for (const [tier, lines] of Object.entries(banks.ctas)) for (const l of lines) if (!l.retired) check(`ctas.${tier}.${l.id}`, 'cta', Number(tier) as SocialTier, l.text);
  for (const [key, f] of Object.entries(banks.facts)) if (typeof f === 'object' && f && 'text' in f) for (const t of f.tiers) check(`facts.${key}`, 'fact', t, f.text);
  for (const q of banks.questions) {
    if (q.retired) continue;
    for (const t of [1, 2, 4] as SocialTier[]) {
      const line = t === 1 && q.public ? q.public : q;
      check(`questions.${line.id}`, 'question', t, line.text);
    }
  }
  return out;
}
