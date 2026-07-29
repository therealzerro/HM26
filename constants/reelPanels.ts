// MKT-11 — rotating promo panels shown in the pick-detail modal DURING REEL
// CAPTURE ONLY. Shared by the app component, the body renderer and the
// build/preflight scripts so the ordering can never drift between them.
//
// WHY IN-APP RATHER THAN COMPOSITED ONTO THE VIDEO: the panel is real layout,
// so it moves with the modal. A video overlay is pinned to a measured y-offset
// and would silently overlap content the next time the modal's height changes.
//
// APP-WIDE as of 2026-07-28 (operator decision). Panels render for every user,
// free and subscribed. They were briefly capture-gated so only the reel renderer
// saw them; that gate is removed. The slot is destined to become a monetised
// placement — free users served ads, subscribers served in-house panels — so it
// is a product surface now, not a marketing overlay.
//
// WHY A REMOTE URL AND NOT require(): a static require() would bundle ~3.3MB
// into the app and make every artwork change an app release. Panels are served
// from the public `app-panels` Supabase bucket instead — works on web AND
// native, costs no app size, and lets the slot be re-pointed server-side when
// the ad/in-house split lands. (public/ was the previous home; it is web-only
// in Expo Router, so those URIs were dead in a native build.)

/** Public bucket the app loads panel artwork from. */
export const PANEL_BUCKET = 'app-panels';

/** Absolute URL for a panel file, or null if the Supabase URL is unavailable. */
export function panelUrl(file: string): string | null {
  const base = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  return base ? `${base}/storage/v1/object/public/${PANEL_BUCKET}/${file}` : null;
}

export interface ReelPanel {
  /** Filename in public/reel-panels/ (and assets/marketing/panels/ as source). */
  file: string;
  /** Logging + contact-sheet only; never rendered as text. */
  label: string;
}

// Order is a SOFT PRIORITY, not a schedule: the date rotates which entry leads,
// so each panel takes the high-attention first slot one day in six. Deliberately
// no per-position affinity — the six modals are structurally identical (layout
// agreement 96.8-99.9%), so no panel has a positional context to match.
//
// TIER-NEUTRAL BY CONTRACT: one body render feeds both the Pro and Free reels,
// so no panel may carry pricing, an upgrade CTA, or a Pro pitch (SOCIAL-13).
export const REEL_PANELS: ReelPanel[] = [
  { file: 'panel_brand.png',    label: 'Brand wordmark' },
  { file: 'panel_signals.png',  label: 'Four signals' },
  { file: 'panel_coverage.png', label: 'Coverage map' },
  { file: 'panel_anchor.png',   label: 'The Data Desk' },
  // Filename kept: it is the clearance key, the bucket object name and the
  // built-artifact name, so renaming it would void clearance and orphan the
  // uploaded object for a cosmetic gain. The LABEL tracks the copy, which
  // changed 2026-07-29 from "THE APP IS COMING" to "SIX SIGNALS. EVERY MORNING."
  { file: 'panel_app.png',      label: 'Six signals' },
  { file: 'panel_zk30.png',     label: 'ZK30 teaser' },
];

/** Modal segments in the All-Day body — one panel each. */
export const MODAL_COUNT = 6;
/** render-allday-body.ts segment plan, in seconds. */
export const GRID_DUR = 4.0, MODAL_HOLD = 2.5;

/** Day index matching reel-captions' dayOfYear — clock-free UTC math. */
export function dayIndex(iso: string): number {
  const d = new Date(iso + 'T12:00:00Z');
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((d.getTime() - jan1) / 86_400_000);
}

/**
 * Panel for a given pick rank (1-based) on a given date (YYYY-MM-DD).
 *
 * Deterministic: the date derives a starting offset, then panels cycle in order
 * across the modals, so re-running a date reproduces the sequence exactly. The
 * offset advances by MODAL_COUNT per day, so a set larger than the modal count
 * shows a different SUBSET each day rather than a sliding window; a smaller set
 * repeats rather than leaving a modal bare. Growing the set needs no code change.
 */
export function panelForRank(iso: string, rank: number, panels: ReelPanel[] = REEL_PANELS): ReelPanel | null {
  const n = panels.length;
  if (n === 0 || rank < 1) return null;
  const offset = (dayIndex(iso) * MODAL_COUNT) % n;
  return panels[(offset + (rank - 1)) % n];
}

/** The whole day's sequence in modal order — for logging and preflight. */
export function panelSequence(iso: string, panels: ReelPanel[] = REEL_PANELS): ReelPanel[] {
  return Array.from({ length: MODAL_COUNT }, (_, i) => panelForRank(iso, i + 1, panels)).filter(Boolean) as ReelPanel[];
}

/**
 * True when striding by MODAL_COUNT can only ever reach a couple of distinct
 * offsets — e.g. 12 panels alternate between two fixed subsets forever.
 * Surfaced rather than silently accepted.
 */
export function rotationDegenerate(n: number): boolean {
  if (n <= MODAL_COUNT) return false;
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  return n / gcd(n, MODAL_COUNT) < 3;
}

/** Modal i (0-based) occupies this window on the REEL timeline. */
export function modalWindow(openDur: number, gridDur: number, holdDur: number, i: number): [number, number] {
  const t0 = +(openDur + gridDur + i * holdDur).toFixed(3);
  return [t0, +(t0 + holdDur).toFixed(3)];
}
