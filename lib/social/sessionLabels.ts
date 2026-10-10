/**
 * sessionLabels — the ONE tier-keyed map for session words on social surfaces
 * (MKT-82 R4, 2026-10-10).
 *
 * Tiers 2 (free group) and 4 (Pro group) use the MEMBER vocabulary — the same
 * words as the reels, the app and the track record: Midday · Evening · All-Day.
 *
 * Tier 1 (public page) and tier 3 (cross-posts to strangers) keep the Brand
 * Rehab Brief v2 §6 translation (Daytime / Nighttime / Continuous — or omit the
 * session label entirely), because a session label beside a 3-digit number is
 * the Meta tell. SOCIAL-01 had applied that public translation to every tier;
 * R4 undid that. Keep this the only place the words live — two constants drift.
 */

import type { SocialTier } from './brandLint';

export type SessionScope = 'midday' | 'evening' | 'allday';

export const MEMBER_SESSION_LABELS: Record<SessionScope, string> = {
  midday: 'Midday',
  evening: 'Evening',
  allday: 'All-Day',
};

export const PUBLIC_SESSION_LABELS: Record<SessionScope, string> = {
  midday: 'Daytime',
  evening: 'Nighttime',
  allday: 'Continuous',
};

/** Public-facing tiers (1 and 3) get the translation; member tiers get the real words. */
export function sessionLabel(scope: SessionScope, tier: SocialTier): string {
  return tier === 1 || tier === 3 ? PUBLIC_SESSION_LABELS[scope] : MEMBER_SESSION_LABELS[scope];
}
