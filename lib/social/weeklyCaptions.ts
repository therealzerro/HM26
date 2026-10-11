/**
 * weeklyCaptions — the SUNDAY RECEIPTS caption family for the captions sheet
 * (MKT-83, content agent 2026-10-11, verbatim; the Pro caption arrived with
 * the MKT-85 close the same evening). Copy is never invented in code. `[PRO LINK]` is the same Pro URL
 * the Pro pinned comment uses (app_config.social_pro_url).
 */
import { lintCaption, type SocialTier } from './brandLint';

export const WEEKLY_CAPTION_QUESTION = 'How do you spend your Sunday morning — porch, coffee, or both? ☕';

export interface WeeklyCaptionCfg { freeGroupUrl?: string; proUrl?: string }

export function weeklyPublicCaption(cfg: WeeklyCaptionCfg): string {
  return [
    `Free group → ${cfg.freeGroupUrl ?? 'https://www.facebook.com/groups/3851453614997541'}`,
    'Sunday receipts. Every board from the week, graded the same day across 42 states & provinces. Every match and every miss stays on the record.',
    WEEKLY_CAPTION_QUESTION,
  ].join('\n\n');
}

export function weeklyFreeCaption(cfg: WeeklyCaptionCfg): string {
  return [
    'Sunday receipts 🧾 The whole week, graded the same day across 42 states & provinces. Every match and every miss stays on the record.',
    `Pro reads every board uncovered before the draw → ${cfg.proUrl ?? '[PRO LINK]'}`,
    WEEKLY_CAPTION_QUESTION,
  ].join('\n\n');
}

/** Tier 4 — content agent, 2026-10-11 (MKT-85 close), verbatim. Never commercial. */
export function weeklyProCaption(_cfg: WeeklyCaptionCfg): string {
  return [
    'Sunday receipts 💎 Your whole week on one card — every board, every match, every miss, graded the same day across 42 states & provinces.',
    'Which day did your state come up this week? 👇',
  ].join('\n\n');
}

export const WEEKLY_CAPTIONS: { surface: 'public' | 'free' | 'pro'; tier: SocialTier; label: string; img: string; build: (cfg: WeeklyCaptionCfg) => string }[] = [
  { surface: 'pro', tier: 4, label: 'PRO GROUP — with the 💎 Pro receipts image', img: 'hm-receipts-pro-…png', build: weeklyProCaption },
  { surface: 'free', tier: 2, label: 'FREE GROUP — with the 👥 Free receipts image', img: 'hm-receipts-free-…png', build: weeklyFreeCaption },
  { surface: 'public', tier: 1, label: 'PUBLIC PAGE — with the 📡 Public receipts image', img: 'hm-receipts-public-…png', build: weeklyPublicCaption },
];

/** Blocking violations per surface (empty = clean). Used at sheet build and in tests. */
export function lintWeeklyCaptions(cfg: WeeklyCaptionCfg): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of WEEKLY_CAPTIONS) {
    const r = lintCaption(c.build(cfg), c.tier);
    out[c.surface] = r.violations.filter(v => v.blocking).map(v => `${v.rule}:"${v.term}"`);
  }
  return out;
}
