// lib/theme/heat.ts — DESIGN-02 T1.1 (2026-07-25)
//
// THE single energy→heat scale. Before this, six ramps coexisted with
// different thresholds AND stops (index 80/65/45, PickCard/EnergyMeter
// 90/80/65/45, SlatePosterCard/HitReplay 80/60/40, HeatCheck 85/70/50,
// intelligence 80/65/45) — the same pick could read HOT on the grid and
// WARM in the list. Canonical thresholds are PickCard's (the most granular,
// and the one users saw most). ZK30 keeps its own palette by design
// (ARCH-06 deferral) — do not wire it here until ZK30 work resumes.
//
// Labels/emoji are offered for convenience; surfaces with their own locked
// vocabulary (e.g. HeatCheck verdicts) may keep their labels and consume
// only `color` — the invariant is thresholds + colors, not copy.

import type { ColorTokens } from './palettes';

export type HeatTierKey = 'onfire' | 'blazing' | 'hot' | 'warm' | 'cool';

export interface HeatTier {
  key: HeatTierKey;
  label: string;
  emoji: string;
  color: string;
}

export function heatTier(energy: number, colors: ColorTokens): HeatTier {
  if (energy >= 90) return { key: 'onfire',  label: 'ON FIRE', emoji: '🔥', color: colors.hot };
  if (energy >= 80) return { key: 'blazing', label: 'BLAZING', emoji: '⚡', color: colors.amber };
  if (energy >= 65) return { key: 'hot',     label: 'HOT',     emoji: '✦',  color: colors.orange };
  if (energy >= 45) return { key: 'warm',    label: 'WARM',    emoji: '◈',  color: colors.gold };
  return                   { key: 'cool',    label: 'COOL',    emoji: '❄',  color: colors.textTertiary };
}

export function heatColor(energy: number, colors: ColorTokens): string {
  return heatTier(energy, colors).color;
}

/**
 * The DETAIL-SURFACE label: identical to `tier.label` except the hot rung reads
 * 'HOT SIGNAL'.
 *
 * ⚠ THIS EXISTS TO HOLD ONE DIVERGENCE IN ONE PLACE, not to bless it. MKT-28a
 * found FIVE heat vocabularies in the app: this module, PickDetailModal's inline
 * ladder, PickPosterCard's override, HeatCheckModal's verdict ladder (which also
 * runs different thresholds — 85/70/50) and PickCard's streak banner. Two of
 * them independently overrode the hot rung to 'HOT SIGNAL' with the same
 * inline ternary, which is a copy decision duplicated as code.
 *
 * Centralising it changes nothing on screen and makes the eventual reconciliation
 * a single edit. **Whether 'HOT SIGNAL' or 'HOT' wins is a copy decision and is
 * NOT settled here** — it is owed back as part of the public-relabel neutral
 * vocabulary, which has to cover all five ladders or the public cut reads
 * inconsistently between grid and modal.
 */
export function heatLabelDetailed(tier: HeatTier): string {
  return tier.key === 'hot' ? 'HOT SIGNAL' : tier.label;
}

/** Label without needing a palette (for text-only call sites). */
export function heatLabel(energy: number): string {
  if (energy >= 90) return 'ON FIRE';
  if (energy >= 80) return 'BLAZING';
  if (energy >= 65) return 'HOT';
  if (energy >= 45) return 'WARM';
  return 'COOL';
}
