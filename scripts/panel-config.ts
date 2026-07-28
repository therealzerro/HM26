// MKT-11 — panel clearance registry (build/preflight side only).
//
// The ORDER and labels live in constants/reelPanels.ts, which the app component,
// the body renderer and this file all import — so the rotation can never drift
// between what the app renders and what preflight reports. This file adds only
// what the app has no business knowing: manual copy clearance, pinned to each
// source file's hash.
//
// VOCABULARY CLEARANCE. Panels are artwork, so they bypass the renderer's
// in-frame vocabulary guard. No OCR is available in-env, and OCR reliably
// misses stylized/kerned/outlined type — which is all of this artwork — so
// clearance is manual and PINNED TO THE FILE'S HASH: `reel:check` recomputes
// sha256 and fails when it no longer matches, so changed artwork voids its
// clearance instead of silently shipping.
// Refresh a hash with:  npm run panel:build -- --print-hashes
import { REEL_PANELS } from '../constants/reelPanels';

export interface PanelClearance {
  /** ISO date the artwork's copy was read and cleared against the brand list. */
  cleared: string;
  /** sha256 of the source PNG at clearance time. */
  sha256: string;
}

export const CLEARANCE: Record<string, PanelClearance> = {
  'panel_brand.png':    { cleared: '2026-07-27', sha256: '5a19e745edff220ef32b71b841fedcf945445f124416f1efddad765ec05e0689' },
  'panel_signals.png':  { cleared: '2026-07-27', sha256: 'e1a13a10f3ddf7eaac363ea9b39fb77befd66d3c2faf94a79c2b9cb6a82461f9' },
  'panel_coverage.png': { cleared: '2026-07-27', sha256: 'd2131c7f441ddd31ac0372df56d2d5683eb0eb12066d238d6d31bb9376eb77dd' },
  'panel_anchor.png':   { cleared: '2026-07-27', sha256: 'c60f1d524bfc2f58dfdadfbb14348476d6153c27f906b646e6a3a14abe8f4565' },
  'panel_app.png':      { cleared: '2026-07-27', sha256: '3e968aa61b67961014019f7a063ce2f2aca6faa2d5baffe00dd2f2402ffa5ea9' },
  'panel_zk30.png':     { cleared: '2026-07-27', sha256: '6bdea3fa148fcf6ce5c3a2a25e57a4297d7f0045ca1afa8450be376473ed9723' },
};

export { REEL_PANELS as PANELS };

// ── Build geometry ──────────────────────────────────────────────────────────
/** Panels are laid out by the app, but are prepped at the frame width. */
export const PANEL_W = 1080;
/** Feather on all four edges. Delivered backings range #000202-#010204 and two
 *  are full-bleed purple, so a soft ramp is what lets any panel sit natively
 *  on the modal's background without per-panel tuning. */
export const FEATHER = 10;
/** Source artwork directory, under assets/marketing/. */
export const SRC_DIR = 'panels';
/** The single build output: what the app loads by URI. Never require()d, so the
 *  ~3.3MB of capture-only artwork is not bundled into the native app. */
export const PUBLIC_DIR = 'public/reel-panels';
