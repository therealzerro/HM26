// MKT-20 — carrier registry: an EXPLICIT (part 1, continuation) pair per kind.
//
// WHY THIS FILE EXISTS AT ALL — the ruling, and the reasoning behind it.
//
// MKT-09 paired a carrier with its continuation by DERIVING the name: read
// `<base>.mp4`, then hunt for `<base>_pt2.mp4`. That works exactly as long as
// every kind has exactly one part 1, which stopped being true here: rotating the
// opening means `allday_pro_carrier_stamp.mp4` would send the joiner looking for
// `allday_pro_carrier_stamp_pt2.mp4`, which will never exist.
//
// The failure is NOT a shorter carrier. Traced end to end (MKT-20 Phase 0):
// unpaired carrier resolves at 10.005s -> below the 19.35s overlap threshold ->
// hum-bed mode engages -> and because MKT-19 made the endcard resolver
// bed-aware, a motion with no bed quietly drops instead of aborting. So the run
// does not fail. It publishes a reel that is HALF NARRATION — ~9.8s of voice
// followed by ~9.6s of hum under the modals — every single morning, and
// preflight passes because it validates the incumbent base rather than the
// variant the date actually picked.
//
// So: derive-by-name is not merely inconvenient here, it is the defect class.
// It is what lets an unpaired variant look like a legitimate single-file
// carrier rather than an error, and it is the same root as MKT-16's `_pt_`
// incident where a filename typo silently dropped part 2 and the orphan scan —
// which matched the same derived pattern — could not see it either.
//
// Every kind is migrated, including the ones that do not rotate. Two mechanisms
// would mean the next reader has to know which kinds rotate before knowing which
// pairing rule applies, and the preflight's expected-set builder would have to
// encode that fork too. One rule, stated per kind, costs a line each.

export interface CarrierVariant {
  file: string;
  /** Printed in the run summary so the operator can see which open played. */
  label: string;
}

export interface CarrierSpec {
  /**
   * Ordered rotation set of PART 1 files. Single-entry for kinds that do not
   * rotate — that is not a special case, just a set of one.
   *
   * Entry 0 is the incumbent and doubles as the last-resort fallback, so it must
   * always be the file that has been shipping.
   */
  set: CarrierVariant[];
  /**
   * SHARED continuation parts, in play order. Every part-1 variant in `set` is
   * joined to these same files.
   *
   * Empty means a genuine single-part carrier (verify). Non-empty means these
   * files are REQUIRED: a declared continuation that is missing is a hard
   * preflight FAIL, never a silently shorter carrier — see the trace above.
   */
  rest: string[];
}

/**
 * SCOPE PAIRING IS ENFORCED BY THIS SHAPE, not by convention.
 *
 * Stricter than MKT-19's motion rule, and for a concrete reason: an endcard
 * motion carries no scope, but every one of these carriers SAYS its scope out
 * loud. An All-Day carrier in the Midday reel would narrate the wrong board.
 * Because the set is keyed by kind and there is no cross-kind lookup anywhere,
 * `allday_pro_carrier_room.mp4` cannot reach `midday_pro` — not "should not",
 * cannot: no code path exists that would find it.
 *
 * Tier crossing is barred by the same structure. A pro carrier in the Free reel
 * would imply first-access positioning the Free All-Day drop is not allowed to
 * carry (SOCIAL-13 depth rule).
 *
 * PUBLIC KINDS ARE DELIBERATELY ABSENT. `public_carrier.mp4` + `_pt2` are on
 * disk but MKT-16 is held at its gate, and registering them here would quietly
 * advance that lane — it would also silence the UNREFERENCED_OK entries that
 * currently explain, in the preflight output, why those two files sit unread.
 */
export const CARRIERS: Record<string, CarrierSpec> = {
  allday_pro: {
    set: [
      { file: 'allday_pro_carrier.mp4', label: 'incumbent' },
      { file: 'allday_pro_carrier_stamp.mp4', label: "board's up and it's stamped" },
      { file: 'allday_pro_carrier_room.mp4', label: 'the room where it lands first' },
      { file: 'allday_pro_carrier_overnight.mp4', label: 'engine ran all night' },
    ],
    rest: ['allday_pro_carrier_pt2.mp4'],
  },
  allday_free: {
    set: [
      { file: 'allday_free_carrier.mp4', label: 'incumbent' },
      { file: 'allday_free_carrier_open.mp4', label: "nothin' held back" },
      { file: 'allday_free_carrier_method.mp4', label: "every one shows its reasonin'" },
      { file: 'allday_free_carrier_check.mp4', label: 'come back and check the work' },
    ],
    rest: ['allday_free_carrier_pt2.mp4'],
  },
  // Session kinds do not rotate: one carrier each, still stated explicitly.
  midday_pro: {
    set: [{ file: 'midday_pro_carrier.mp4', label: 'incumbent' }],
    rest: ['midday_pro_carrier_pt2.mp4'],
  },
  evening_pro: {
    set: [{ file: 'evening_pro_carrier.mp4', label: 'incumbent' }],
    rest: ['evening_pro_carrier_pt2.mp4'],
  },
  // MKT-26 — free-group session carriers. Delivered 2026-07-29, measured before
  // registration: part 1 at 10.005s each (so the MKT-20 invariant holds), joined
  // 20.360s, last word at 18.768s (midday) and 17.540s (evening) — margins of
  // +1.242s and +2.470s against midday_pro's +0.184s, the thinnest in the fleet.
  //
  // ⚠ THESE ARE SCRIPTED SEPARATELY FROM THE PRO PAIR AND MUST STAY THAT WAY.
  // A pro carrier here would narrate first access, which SOCIAL-13 bars for the
  // free tier — the free room is being sold the gap, not given the head start.
  // The registry's per-kind keying is what makes that structural: no code path
  // can reach midday_pro_carrier.mp4 from midday_free.
  midday_free: {
    set: [{ file: 'midday_free_carrier.mp4', label: 'incumbent' }],
    rest: ['midday_free_carrier_pt2.mp4'],
  },
  evening_free: {
    set: [{ file: 'evening_free_carrier.mp4', label: 'incumbent' }],
    rest: ['evening_free_carrier_pt2.mp4'],
  },
  // Genuinely single-part: verify's 10s bed is the whole soundtrack.
  verify: {
    set: [{ file: 'verif_carrier.mp4', label: 'incumbent' }],
    rest: [],
  },
};

/**
 * PART 1 FILES IN A SET MUST ALL BE THE SAME LENGTH, and preflight asserts it.
 *
 * The continuation's offset in the join is part 1's FILE duration, not its
 * voice-end. Every All-Day part 1 measuring 10.005s is what keeps the joined
 * length at 20.360s and the margin to the carrier fade at +0.449s (pro) /
 * +0.331s (free) no matter which variant the date draws. A variant delivered at
 * a different length would shift that ceiling for that day ONLY — a defect that
 * appears on one morning in four and looks like nothing on the others.
 *
 * Asserted against entry 0 rather than a hardcoded 10.005 so a future set
 * delivered at another length still holds together internally.
 */
export const PART1_DUR_TOLERANCE = 0.05;

/** Every carrier file any kind can reference — what reel:check enumerates. */
export function allCarrierFiles(): string[] {
  return [...new Set(
    Object.values(CARRIERS).flatMap(c => [...c.set.map(v => v.file), ...c.rest]),
  )];
}
