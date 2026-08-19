// Reel kind registry — the app-side and node-side shared half.
//
// WHY THIS FILE EXISTS RATHER THAN LIVING IN lib/marketingReels.ts (where
// ReelKind started): that module imports expo-constants and lib/supabase, so
// anything reading from it drags React Native in. `constants/socialPlatforms.ts`
// is imported by BOTH the admin screen and a node script
// (scripts/social-handoff-dryrun.ts) — the moment the platform layer needed to
// know which room a caption was written for, an RN-coupled home for that map
// broke the script with an esbuild failure inside react-native/index.js.
//
// Same reasoning the socialPlatforms header gives for being in constants/ at
// all: a registry both runtimes read must have no runtime-specific imports. This
// file therefore imports NOTHING. Keep it that way.
//
// scripts/reel-scopes.ts stays the source of truth for which reels EXIST (scope
// × variant, build-side). This is the consumer-side view of the same names, plus
// the audience property only the publishing surfaces care about.

/** Mirrors the marketing_reels_kind_check constraint — adding one here without
 *  widening that CHECK makes the publisher fail at upsert. */
export type ReelKind =
  | 'allday_pro' | 'allday_free' | 'verify'
  | 'midday_pro' | 'evening_pro'
  | 'midday_free' | 'evening_free'
  | 'allday_public' | 'verify_public'
  // MKT-62 — the same-day midday verify (manual, rare, free group only).
  | 'verify_midday';

/**
 * WHICH ROOM EACH KIND'S STORED CAPTION WAS WRITTEN FOR — MKT-24.
 *
 * Not a duplicate of KIND_UI.defaultTarget: that is where the operator is most
 * likely to send the VIDEO, and it is a mutable default they can override. This
 * is a fixed property of the stored `caption` TEXT — which registry entry in
 * scripts/reel-captions.ts produced it — and it is what the tier-4 audience gate
 * reads. They agree today; conflating them would let a target toggle silently
 * re-classify the copy.
 *
 * `verify` is FREE here on purpose. Its `caption` column is the qualitative free
 * draft (MKT-05b) and the pro draft lives in `caption_pro`, which is why the
 * call site resolves the audience from the LOADED draft rather than from the
 * kind alone.
 */
export const REEL_KIND_AUDIENCE: Record<ReelKind, 'free' | 'pro' | 'public'> = {
  allday_pro: 'pro',
  allday_free: 'free',
  verify: 'free',
  midday_pro: 'pro',
  evening_pro: 'pro',
  midday_free: 'free',
  evening_free: 'free',
  // MKT-16: written for tier 1 — strict-lint copy, funnel-to-Free only. Not
  // 'free': the free-group audience means "written for a room that opted in";
  // this caption was written for strangers, and the tier-4 gate must refuse it
  // for its own reason (a join-the-free-community CTA undersells paying members).
  allday_public: 'public',
  // MKT-40: same tier-1 discipline and funnel as allday_public — the grading
  // half of the public pair.
  verify_public: 'public',
  // MKT-62: written for the FREE room and only that room — the body carries
  // real posted/drawn digits with state attribution (fails Q1 honestly; no
  // public variant exists by ruling). Pro may also receive it at the
  // operator's discretion; the caption is free-room copy.
  verify_midday: 'free',
};
