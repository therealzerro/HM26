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
  // 'panel_signals.png' RETIRED 2026-08-19 (MKT-60) — replaced by panel_measures; last cleared sha e1a13a10….
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
  // MKT-60 (2026-08-19): panel_app ARTWORK REGENERATED (ring-bolt + light waves)
  // with IDENTICAL copy — "SIX SIGNALS. EVERY MORNING." / "RANKED · EXPLAINED ·
  // VERIFIED". ⚠ FILENAME KEPT BY OPERATOR RULING: the slot name is HISTORICAL
  // (it once read "THE APP IS COMING"); the label in reelPanels.ts tracks the
  // copy. Cleared by eye from rendered pixels at modal size: strings exact
  // incl. both periods and the middle dots, tier-neutral, true in both rooms,
  // no numerals, no glyphs in the light, no watermark inside the band (band
  // y294-732 of 1536x1024, 3.50:1). Previous source sha 1af55fb… (7/29 bars
  // artwork) is in git history.
  'panel_app.png':      { cleared: '2026-08-19', sha256: 'd0dfc723858440d295fe90a1a392194c7876d3906cc8a2dbb91e87c8b4ace143' },
  // MKT-60 new members, cleared by eye from rendered pixels at modal size:
  //   receipts — "PUBLISHED BEFORE THE DRAW." / "GRADED AFTER · IN THE OPEN";
  //              plain gold ring round the bolt (no marks/lettering, 2x);
  //              band y293-730, 3.51:1.
  //   measures — "ENERGY · MOMENTUM" / "PATTERN · CONSISTENCY" / "FOUR MEASURES
  //              BEHIND EVERY SIGNAL" (three lines; third line reads at the
  //              ~1000px in-modal width); four gold rules are equal-length
  //              PLAIN MARKS, not a chart (2x); band y285-735, 3.41:1.
  //   Both tier-neutral, true in both rooms, no numerals ("FOUR" is a word).
  'panel_receipts.png': { cleared: '2026-08-19', sha256: '745ce7613bf99eb2121a796ffdc60c5a79226bab35c82ec1e094d46fc9436021' },
  'panel_measures.png': { cleared: '2026-08-19', sha256: 'cc518b0d09eb2d9472f9069c7d1da850f66c6c45dd71e135929f11348e60d8e0' },
  'panel_zk30.png':     { cleared: '2026-07-27', sha256: '6bdea3fa148fcf6ce5c3a2a25e57a4297d7f0045ca1afa8450be376473ed9723' },
  // MKT-65 (2026-08-22) — eighth member, cleared by eye from rendered pixels
  // at the ~1005px in-modal width AND 2x crops of both light fields + the
  // bolt base: "NEW BOARDS. EVERY DAY." / "ALL-DAY · MIDDAY · EVENING" —
  // strings exact incl. both periods, the ALL-DAY hyphen and the middle
  // dots; tier-neutral; true in both rooms; no numerals; light fields are
  // wave/filament smudge-class (no letterforms, no invented glyphs); no
  // ornaments and no watermark inside the band (the video generator's
  // four-point star class checked and absent — image source is a different
  // generator, checked anyway); NO clock/dial/calendar/sundial/hourglass/
  // sun/skyline — dawn is implied by the gold impact flare at the bolt's
  // base only. Band y287-736 of 1536x1024, 3.41:1 (briefed ~3.5:1; serving
  // range 2.97-4.40). Delivered via GitHub web upload+rename (fe4129e) —
  // rename PRESERVED bytes this time (1,306,819 both sides), verified
  // before pull; landed at assets/marketing/, moved to panels/ by git mv.
  'panel_cadence.png':  { cleared: '2026-08-22', sha256: 'f1e6cf310ab792227901096231e2cad903909afa3d41ff06640cb128a92c276a' },
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
