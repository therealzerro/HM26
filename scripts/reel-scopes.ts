// MKT-13 — session-wave scope registry.
//
// ONE source of truth for "which reels exist", shared by the body renderer, the
// assembler, the preflight and the publisher. Before this, "All-Day" was spelled
// out in five places (a scope filter, a Playwright tab name, a stamp label, a
// variant loop, a file prefix); adding Midday/Evening by hand would have meant
// keeping those five in sync forever.
//
// Everything defaults to `allday`, so the existing `npm run reel:allday` path is
// byte-identical to before this lane — same scope filter, same tab, same output
// names, same directory. Sessions are additive.
//
// ⚠ THE PRO-ONLY SESSION RULING (MKT-13, 2026-07-28) IS SUPERSEDED — MKT-26,
// 2026-07-29. Recorded rather than deleted, because what replaced it is narrower
// than "sessions are free now" and the distinction is load-bearing.
//
// The original reasoning still holds where it applied:
//   • the free group gets the ALL-DAY drop in full — that's the value gift
//   • the free group gets Midday/Evening REDACTED — that's the Pro conversion
//     frame, and `surfaceRedacts(surface, session)` enforces it for the image
//     kits
// MKT-13 concluded from this that a free session reel must not be built, because
// a FULL-FIDELITY one would hand away exactly what the redaction withholds. It
// also named the precondition that would change the answer: such a reel "needs a
// redacted CAPTURE (digits masked in the UI), not just another variant entry."
//
// MKT-15 P2 built that capture, and MKT-26 verified it against the stronger
// claim — not "no digits visible" but "the combination is NOT RECOVERABLE by any
// route", checked across all seven digit-bearing surfaces (hero row, bare
// leaves, brace set chip on grid AND modal, position boxes, pair labels, pair
// prose, resolution trail) at ten settling frames. Detection is STRUCTURAL, so
// it cannot be defeated by a surface nobody enumerated.
//
// So the free session reels ship REDACTED, and deliberately keep everything that
// is not a digit: energy values, ZK6 confidence, all four signal percentages,
// heat badges, jurisdiction counts and the full prose structure. The methodology
// is the gift; the digits are the gap Pro closes. A full-fidelity free session
// reel remains barred — that part of the ruling never lifted.

export type Scope = 'allday' | 'midday' | 'evening';
export type Variant = 'pro' | 'free';

export interface ReelScopeSpec {
  scope: Scope;
  /**
   * Scope tab the body renderer clicks. Matches ScopeSegment's labels
   * (components/ScopeSegment.tsx, accessibilityRole="tab") — the emoji prefix is
   * deliberately not matched so a label tweak doesn't break capture.
   */
  tab: RegExp;
  /** MKT-07 slate-stamp scope tag, burned into every frame of the body. */
  stampLabel: string;
  /** Variants assembled, in build order. Drives the assembler + publisher. */
  variants: Variant[];
  /** assets/marketing subdirectory for the body render and the finals. */
  dir: string;
}

export const REEL_SCOPES: Record<Scope, ReelScopeSpec> = {
  allday: {
    scope: 'allday',
    tab: /All Day/,
    stampLabel: 'ALL-DAY',
    variants: ['pro', 'free'],
    dir: 'allday_reels',
  },
  midday: {
    scope: 'midday',
    tab: /Midday/,
    stampLabel: 'MIDDAY',
    // MKT-26 — `free` ENABLED 2026-07-29, last of the four switches.
    //
    // ⚠ THE ORDER THIS WAS DONE IN IS THE POINT, and it is recorded because the
    // reverse order broke the daily run earlier the same day. `free` was added
    // here while the carriers were still undelivered; MKT-20 makes a missing
    // carrier fail LOUDLY by design, so the result was not a dormant lane but a
    // HARD ABORT partway through `reel:midday` — after the pro variant had
    // already built and published. Nothing was lost; the command exited
    // non-zero.
    //
    // So the sequence is: carriers on disk → registered in CARRIERS → caption
    // registry entry (and the publish-reels Kind union with it) → THEN this
    // flag. This flag is the last one turned, never the first.
    variants: ['pro', 'free'],
    dir: 'midday_reels',
  },
  evening: {
    scope: 'evening',
    tab: /Evening/,
    stampLabel: 'EVENING',
    // See the midday note above — same state, same switch, enabled together.
    variants: ['pro', 'free'],
    dir: 'evening_reels',
  },
};

export const SCOPES = Object.keys(REEL_SCOPES) as Scope[];

export function isScope(s: string): s is Scope {
  return s in REEL_SCOPES;
}

/**
 * Reel kind = `${scope}_${variant}` — the marketing_reels.kind value, the
 * endcard/stinger/carrier asset prefix and the caption registry key, all at
 * once. They were already spelled this way for All-Day; sessions inherit it so
 * no lookup table is needed anywhere.
 */
export function reelKind(scope: Scope, variant: Variant): string {
  return `${scope}_${variant}`;
}

/**
 * `--scope=midday` anywhere in argv. Absent → allday, which is what keeps every
 * pre-MKT-13 invocation behaving exactly as before. An unknown scope is a hard
 * exit rather than a silent fallback: falling back would quietly render the
 * All-Day board under a Midday filename.
 */
export function parseScopeFlag(argv: string[]): Scope {
  const flag = argv.find(a => a.startsWith('--scope='));
  if (!flag) return 'allday';
  const val = flag.slice('--scope='.length).trim().toLowerCase();
  if (!isScope(val)) {
    console.error(`ABORT: unknown --scope=${val} — expected one of ${SCOPES.join(' | ')}.`);
    process.exit(1);
  }
  return val;
}

/** Positional args with every --flag stripped, so flags can go anywhere. */
export function positionals(argv: string[]): string[] {
  return argv.filter(a => !a.startsWith('--'));
}
