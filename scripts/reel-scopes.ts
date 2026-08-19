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
export type Variant = 'pro' | 'free' | 'public';

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
  /**
   * MKT-26 — variants whose body must be captured with digits MASKED.
   *
   * Stated per scope rather than derived from a rule like "free sessions are
   * redacted", for the same reason carrier-config states its pairing per kind:
   * a derived rule means the next reader has to know the rule before knowing
   * what a kind does, and the one place it is wrong is invisible. Empty for
   * All-Day — the free group gets that board IN FULL, which is the value gift.
   *
   * A variant listed here changes the BODY FILE the assembler reads, so pro and
   * free stop sharing one capture. That sharing is why the free session lane
   * could not simply be switched on: `reel:midday` rendered one full-fidelity
   * body and every variant read it.
   */
  redactedVariants?: Variant[];
  /**
   * MKT-16 — variants whose body must be the PUBLIC capture: redacted AND
   * relabelled (`--redact --relabel`, MKT-15 P2 / MKT-30). Stated per scope for
   * exactly the reason redactedVariants is: a derived rule ("the public variant
   * is public") hides the one place it would be wrong. A variant listed here
   * reads the mode-keyed body file and the assembler asserts the PUBLIC_TAG
   * inside it — a redacted-but-not-relabelled body posing as public would carry
   * tier-1 vocabulary onto a public feed.
   */
  publicVariants?: Variant[];
  /** assets/marketing subdirectory for the body render and the finals. */
  dir: string;
}

export const REEL_SCOPES: Record<Scope, ReelScopeSpec> = {
  allday: {
    scope: 'allday',
    tab: /All Day/,
    stampLabel: 'ALL-DAY',
    // MKT-16 (2026-07-30) — `public` registered, the 1 of 3 public kinds that
    // ships. midday_public / evening_public stay UNREGISTERED: no session
    // carriers exist and three daily public reels is the cadence risk already
    // ruled against. Same ordering discipline as MKT-26: carriers on disk →
    // CARRIERS → caption registry + publish Kind union + DB kind CHECK
    // (landed FIRST this time, operator ruling — it is the late-failure
    // point) → THEN this entry, which is what turns the lane on.
    variants: ['pro', 'free', 'public'],
    publicVariants: ['public'],
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
    redactedVariants: ['free'],
    dir: 'midday_reels',
  },
  evening: {
    scope: 'evening',
    tab: /Evening/,
    stampLabel: 'EVENING',
    // See the midday note above — same state, same switch, enabled together.
    variants: ['pro', 'free'],
    redactedVariants: ['free'],
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

/** Does this kind's body need a digits-masked capture? */
export function bodyRedacted(scope: Scope, variant: Variant): boolean {
  return (REEL_SCOPES[scope].redactedVariants ?? []).includes(variant);
}

/**
 * MKT-16 — the capture mode a kind's body must be in. `public` wins over
 * `redacted` (the public cut IS redacted, plus the relabel); listing a variant
 * in both would be a config error, not a tie to break.
 */
export function captureModeFor(scope: Scope, variant: Variant): CaptureMode {
  if ((REEL_SCOPES[scope].publicVariants ?? []).includes(variant)) return 'public';
  return bodyRedacted(scope, variant) ? 'redacted' : 'full';
}

/**
 * The body capture filename for a kind — MKT-26.
 *
 * ⚠ THE FULL-FIDELITY NAME IS UNCHANGED (`ui_<scope>_<stamp>.mp4`) AND THAT IS
 * DELIBERATE. Every non-redacted kind — all of All-Day, both session pro
 * variants — keeps reading and writing exactly the file it always has, so the
 * daily run and any re-assembly of an earlier day are byte-identical to before
 * this lane. Only a redacted kind takes the suffixed name, and only redacted
 * kinds are new. A blanket rename would have made every historical body
 * unreachable to buy nothing.
 *
 * The distinct filename is what lets both captures coexist for the same scope
 * and date; the REDACT_TAG inside the file is what makes the assembler's
 * assertion true about the pixels rather than the path. Both, not either.
 */
export function bodyFileFor(scope: Scope, redacted: boolean, stamp: string): string {
  return bodyFileForMode(scope, redacted ? 'redacted' : 'full', stamp);
}

/** Capture mode of a body file. `public` = redacted + relabelled (MKT-15 P2). */
export type CaptureMode = 'full' | 'redacted' | 'public';

/**
 * Mode-keyed body filename — the single primitive when MKT-16 registers the
 * public kinds, so the renderer and the eventual public assembler cannot
 * disagree on the name. `full` and `redacted` are byte-identical to the
 * two-state function above, which delegates here.
 */
export function bodyFileForMode(scope: Scope, mode: CaptureMode, stamp: string): string {
  return mode === 'full' ? `ui_${scope}_${stamp}.mp4` : `ui_${scope}_${mode}_${stamp}.mp4`;
}

/** The body a KIND consumes. The renderer names its output with the primitive
 *  above, keyed on the actual capture mode, so the two cannot disagree. */
export function bodyFile(scope: Scope, variant: Variant, stamp: string): string {
  return bodyFileForMode(scope, captureModeFor(scope, variant), stamp);
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

/**
 * `--variant=free|pro` restricts a run to ONE variant of the scope. Absent →
 * every variant, which is what every pre-MKT-26 invocation does.
 *
 * ⚠ THIS EXISTS TO DEFUSE THE PUBLISH UPSERT TRAP, and the trap is worth stating
 * because the flag looks like a mere convenience. `publish-reels` upserts on
 * (reel_date, kind) and DELIBERATELY resets status/posted_at/target_name — a
 * re-render is a new reel, so a stale posted flag must not survive it. Correct
 * per kind, destructive across siblings: publishing the free session reel after
 * the pro one has already gone out re-upserts BOTH rows and wipes the pro row's
 * posted stamp, losing the record that it shipped.
 *
 * A filter is preferable to flipping `redactedVariants` back and forth (the
 * other way to publish one sibling), because a re-flip is a manual step someone
 * has to remember and a filter is a property of the invocation.
 */
export function parseVariantFlag(argv: string[]): Variant | null {
  const flag = argv.find(a => a.startsWith('--variant='));
  if (!flag) return null;
  const val = flag.slice('--variant='.length).trim().toLowerCase();
  if (val !== 'pro' && val !== 'free' && val !== 'public') {
    console.error(`ABORT: unknown --variant=${val} — expected pro | free | public.`);
    process.exit(1);
  }
  return val;
}

/** Positional args with every --flag stripped, so flags can go anywhere. */
export function positionals(argv: string[]): string[] {
  return argv.filter(a => !a.startsWith('--'));
}

/**
 * MKT-62 — kinds that publish RARELY and on a MANUAL trigger. Two retention
 * mechanisms in publish-reels must not touch them: `prune()` is kind-agnostic
 * (reel_date < today−30) and would delete a same-day midday verify the first
 * time any later daily publish ran after 30 days; `supersedeOlder()` is
 * per-kind and already safe, but the exemption is stated in both (the MKT-46
 * pattern — one test at the top of each function, not a convention). Lives
 * here, not in publish-reels, so reel:check can import it without running a
 * publish. reel:check asserts the list is honoured.
 */
export const RETENTION_EXEMPT_KINDS: readonly string[] = ['verify_midday'];
