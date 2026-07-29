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
// WHY SESSIONS ARE PRO-ONLY (operator content strategy, see SOCIAL-13 + the
// publish-pipeline redaction rule in lib/social/publishImages.ts):
//   • the free group gets the ALL-DAY drop in full — that's the value gift
//   • the free group gets Midday/Evening REDACTED — that's the Pro conversion
//     frame, and `surfaceRedacts(surface, session)` already enforces it for the
//     image kits
// A full-fidelity free session reel would hand away exactly what the redaction
// rule withholds, so it is deliberately NOT built. That is a decision recorded
// here, not an asset that failed to arrive: the delivered carriers and endcards
// for this wave are pro-only too. If a free session reel is ever wanted it needs
// a redacted CAPTURE (digits masked in the UI), not just another variant entry.

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
    // ⚠ `free` DELIBERATELY ABSENT, and this is the switch that turns the
    // free-group session reel on.
    //
    // MKT-15 P2 built the redacted capture MKT-13 said this lane needed, and the
    // free kinds are otherwise fully registered — endcard copy, stinger copy,
    // built matrix, and the marketing_reels kind constraint all admit
    // midday_free / evening_free. What does NOT exist yet is their CARRIER, and
    // MKT-20 made a missing carrier fail LOUDLY rather than degrade.
    //
    // Adding `free` here before the carriers landed therefore did not produce a
    // dormant lane — it made `reel:midday` and `reel:evening` ABORT partway,
    // after their pro variant had already built and published. Nothing was lost,
    // but the command exited non-zero every morning.
    //
    // TO ENABLE: deliver midday_free_carrier + _pt2 (and the evening pair), add
    // them to CARRIERS in carrier-config.ts, then restore `'free'` here. They
    // must NOT inherit the pro carriers — first-access framing is barred for the
    // free tier under SOCIAL-13.
    variants: ['pro'],
    dir: 'midday_reels',
  },
  evening: {
    scope: 'evening',
    tab: /Evening/,
    stampLabel: 'EVENING',
    // See the midday note above — same state, same switch.
    variants: ['pro'],
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
