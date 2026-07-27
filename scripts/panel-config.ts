// MKT-11 — rotating promo panel registry.
//
// Panels are static artwork composited into the empty band below the
// "RESOLVED IN · LAST 30 DAYS" card during the six pick-detail modal segments
// (measured dead zone: y 1492-1919 of the 1080x1920 frame).
//
// TIER-NEUTRAL BY CONTRACT. The All-Day body render is shared by the Pro and
// Free reels, so no panel may carry pricing, an upgrade CTA, or a Pro pitch —
// Pro is never-commercial and Free All-Day carries no Pro pitch (SOCIAL-13).
// (Compositing happens at assembly inside the per-variant loop, so a future
// tier-specific set costs a second array here, NOT a second body render.)
//
// VOCABULARY CLEARANCE. These bypass the renderer's in-frame vocabulary guard
// because they are composited, not rendered from the app. No OCR is available
// in-env, and OCR reliably misses stylized/kerned/outlined type — which is all
// of this artwork — so clearance is manual and PINNED TO THE FILE'S HASH:
// `reel:check` recomputes sha256 and fails when it no longer matches, so
// changed artwork voids its clearance instead of silently shipping.
// Refresh a hash with:  npm run panel:build -- --print-hashes

export interface Panel {
  /** Filename in assets/marketing/panels/. */
  file: string;
  /** Logging + contact-sheet only; never rendered into the frame. */
  label: string;
  /** ISO date the artwork's copy was read and cleared against the brand list. */
  cleared: string;
  /** sha256 of the source PNG at clearance time. */
  sha256: string;
}

// Order is a SOFT PRIORITY, not a schedule: the date rotates which entry leads,
// so each panel takes the high-attention first slot one day in six. Deliberately
// no per-position affinity — the six modals are structurally identical
// (layout agreement 96.8-99.9%), so no panel has a positional context to match.
export const PANELS: Panel[] = [
  { file: 'panel_brand.png',    label: 'Brand wordmark',   cleared: '2026-07-27', sha256: '5a19e745edff220ef32b71b841fedcf945445f124416f1efddad765ec05e0689' },
  { file: 'panel_signals.png',  label: 'Four signals',     cleared: '2026-07-27', sha256: 'e1a13a10f3ddf7eaac363ea9b39fb77befd66d3c2faf94a79c2b9cb6a82461f9' },
  { file: 'panel_coverage.png', label: 'Coverage map',     cleared: '2026-07-27', sha256: 'd2131c7f441ddd31ac0372df56d2d5683eb0eb12066d238d6d31bb9376eb77dd' },
  { file: 'panel_anchor.png',   label: 'The Data Desk',    cleared: '2026-07-27', sha256: 'c60f1d524bfc2f58dfdadfbb14348476d6153c27f906b646e6a3a14abe8f4565' },
  { file: 'panel_app.png',      label: 'App coming',       cleared: '2026-07-27', sha256: '3e968aa61b67961014019f7a063ce2f2aca6faa2d5baffe00dd2f2402ffa5ea9' },
  { file: 'panel_zk30.png',     label: 'ZK30 teaser',      cleared: '2026-07-27', sha256: '6bdea3fa148fcf6ce5c3a2a25e57a4297d7f0045ca1afa8450be376473ed9723' },
];

/** Modal segments in the All-Day body — one panel each. */
export const MODAL_COUNT = 6;

// ── Geometry (measured, MKT-11 Phase 0) ─────────────────────────────────────
/** Empty band shared by all six modals. */
export const ZONE_TOP = 1492, ZONE_BOTTOM = 1919;
/** Panels span the full frame width. */
export const PANEL_W = 1080;
/** Feather on all four edges. Delivered backings are #000202-#010204 and two
 *  are full-bleed purple — none match the app's #090512 — so a soft ramp is
 *  what makes any panel sit natively, regardless of its own backing. */
export const FEATHER = 10;
/** Panels must start at or below this so the 1:1 centre crop (keeps y 420-1500)
 *  excludes them automatically — no enable-guard, no second render. */
export const CROP_SAFE_TOP = 1500;
/** App background in the dead zone: flat #090512, sd 0.00. */
export const APP_BG = [9, 5, 18] as const;
