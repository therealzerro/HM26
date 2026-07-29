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
  // ⚠ COPY IS STALE — awaiting regenerated artwork (content agent, 2026-07-28).
  // Reads "THE APP IS COMING / APP STORE · GOOGLE PLAY", written for a reel
  // viewer who does not have the app. Since the capture gate was removed on
  // 2026-07-28 (MKT-11) panels are APP-WIDE, so a paying subscriber now reads
  // this INSIDE the app and is told the app does not exist yet. Clearance still
  // holds — no forbidden vocabulary — so this is not a lint failure and does not
  // block a run; it is a context failure the lint cannot see.
  // Approved replacement, pending a new source image:
  //   SIX SIGNALS. EVERY MORNING.
  //   RANKED · EXPLAINED · VERIFIED
  // Copy is BAKED PIXELS here (unlike endcards/stingers, where MKT-10 made copy
  // a config string), so this cannot be fixed by editing a line — it needs the
  // regenerated PNG, a fresh clearance date and a new hash.
  // Re-cleared 2026-07-29 after the MKT-17 replacement artwork landed. Copy is
  // now "SIX SIGNALS. EVERY MORNING." / "RANKED · EXPLAINED · VERIFIED",
  // replacing "THE APP IS COMING / APP STORE · GOOGLE PLAY". That old copy had
  // two independent problems and this closes both: it told a paying subscriber,
  // inside the product, that the product did not exist yet (the dual-context
  // rule, broken by the 7/28 app-wide gate removal); and it rendered the token
  // PLAY inside "GOOGLE PLAY", which would have forced a linter exception on
  // any public surface. Reviewed by eye at tier 1 — no numerals at all (Q1),
  // and SIGNALS / RANKED / EXPLAINED / VERIFIED are all sanctioned (Q2).
  'panel_app.png':      { cleared: '2026-07-29', sha256: '1af55fbb045c07400d1a29ff437aa469419c9d1ba434538652654c55677b8e22' },
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
/** Local build output. Uploaded to the public `app-panels` bucket, which is
 *  what the app actually loads — nothing is bundled into the app. */
export const BUILT_DIR = 'panels/built';
