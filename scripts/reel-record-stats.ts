// MKT-79 — the track-record stats the record reel renders, computed the way
// the Verified Track Record screen's SUMMARY BAND computes them.
//
// ⛔ REEL AND SCREEN MUST NEVER DISAGREE (work order Phase 0 item 1). This
// module mirrors app/track-record.tsx line for line:
//   · the query — adaptive_tracking, slate_date ≥ since, matched_state not
//     null, hit_box OR hit_straight, mode PINNED balanced (MKT-51), order
//     slate_date.desc, limit 1000 (the screen's FETCH_LIMIT);
//   · the scope gate — scopeMatchesSession(): allday accepts any session,
//     an empty session accepts, otherwise scope === session;
//   · the dedupe — first row wins per (slate_date|scope|combo|matched_state);
//   · the summary — totalHits, straightHits, boxHits, distinctDates,
//     distinctStates.
// The screen is NOT modified (subscriber surface, hands-off); this is a
// faithful node-side copy, and `npm run reel:record -- --parity` prints the
// same computation over the SCREEN's own window (today−29..today) so the
// operator can compare it against the app's band by eye.
//
// ⚠ The screen's window includes today (DAYS denominator = complete days
// through yesterday, +1 once today has a match). The reel needs a fixed
// "OF 30", so it takes the 30 COMPLETE days ending D−1. Same computation,
// shifted window — see record-config.ts RECORD_WINDOW_DAYS.
//
// Data note: these ARE stored hit flags (adaptive_tracking), which BUG-162
// warns against for RATE claims. This reel makes no rate claim — it renders
// the screen's own counts, by order, and the window (≥ 2026-08-12) is well
// past the 2026-06-11 era floor the screen clamps to.
import { shiftDate } from './reel-captions';

type SbGet = <T = any>(path: string) => Promise<T>;

const FETCH_LIMIT = 1000;

export interface TrackRecordRow {
  slate_date: string; scope: string; combo: string; matched_state: string;
  matched_session: string; hit_straight: boolean;
}

export interface TrackRecordSummary {
  since: string;            // window start (ISO)
  until: string;            // window end (ISO), inclusive
  windowDays: number;       // until − since + 1
  matches: number;          // MATCHES  (deduped rows)
  straights: number;        // STRAIGHT (exact-order)
  box: number;              // BOX
  days: number;             // DAYS numerator — distinct slate_dates with ≥1 match
  juris: number;            // "Across N jurisdictions"
  matchedDates: string[];   // the distinct dates, ascending
  truncated: boolean;       // rows hit the screen's fetch cap
}

/** app/track-record.tsx scopeMatchesSession — verbatim semantics. */
function scopeMatchesSession(scope: string, session: string): boolean {
  const s = (scope ?? '').toLowerCase();
  const d = (session ?? '').toLowerCase();
  if (s === 'allday') return true;
  if (!d) return true;
  return s === d;
}

/** The screen's query path, with the reel's window end added. The screen has
 *  no upper bound (its window ends today); `until` only trims rows newer than
 *  the reel's D−1 stamp, which the screen would show under "Today". */
export function trackRecordQueryPath(since: string, until?: string): string {
  return `/rest/v1/adaptive_tracking?slate_date=gte.${since}` +
    (until ? `&slate_date=lte.${until}` : '') +
    `&matched_state=not.is.null&or=(hit_box.eq.true,hit_straight.eq.true)&mode=eq.balanced` +
    `&select=slate_date,scope,combo,combo_set,rank,matched_state,matched_session,hit_box,hit_straight,actual_result,signal_box,signal_pburst,signal_co,signal_burst,energy_score` +
    `&order=slate_date.desc&limit=${FETCH_LIMIT}`;
}

/** The screen's dedupe + summary over already-fetched rows (pure). */
export function summarize(rows: TrackRecordRow[], since: string, until: string): TrackRecordSummary {
  const seen = new Set<string>();
  const merged: TrackRecordRow[] = [];
  for (const m of rows) {
    if (!m.matched_state) continue;
    if (!scopeMatchesSession(m.scope, m.matched_session ?? '')) continue;
    const k = `${m.slate_date}|${m.scope}|${m.combo}|${m.matched_state}`;
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(m);
  }
  const matches = merged.length;
  const straights = merged.filter(h => h.hit_straight).length;
  const dates = [...new Set(merged.map(h => h.slate_date))].sort();
  const juris = new Set(merged.map(h => h.matched_state).filter(Boolean)).size;
  const windowDays = Math.round((Date.parse(until + 'T12:00:00Z') - Date.parse(since + 'T12:00:00Z')) / 86_400_000) + 1;
  return {
    since, until, windowDays, matches, straights, box: matches - straights,
    days: dates.length, juris, matchedDates: dates, truncated: rows.length >= FETCH_LIMIT,
  };
}

/** Fetch + summarize for an explicit inclusive window. */
export async function fetchTrackRecordSummary(sbGet: SbGet, since: string, until: string): Promise<TrackRecordSummary> {
  const rows = await sbGet<TrackRecordRow[]>(trackRecordQueryPath(since, until));
  return summarize(Array.isArray(rows) ? rows : [], since, until);
}

/** The reel's window: `windowDays` complete days ending `until` (D−1). */
export function recordWindow(until: string, windowDays: number): { since: string; until: string } {
  return { since: shiftDate(until, -(windowDays - 1)), until };
}

/** The SCREEN's window on a given ET date: today−29..today (its 30d default),
 *  for the parity print. The screen's DAYS denominator = complete days through
 *  yesterday (+1 if today matched) — reported alongside so the two figures can
 *  be read against the app's band. */
export function screenWindow(todayISO: string, windowDays = 30): { since: string; until: string } {
  return { since: shiftDate(todayISO, -(windowDays - 1)), until: todayISO };
}

export function screenDaysDenominator(sum: TrackRecordSummary, todayISO: string): number {
  const yesterday = shiftDate(todayISO, -1);
  const complete = Math.max(0, Math.round((Date.parse(yesterday + 'T12:00:00Z') - Date.parse(sum.since + 'T12:00:00Z')) / 86_400_000) + 1);
  return complete + (sum.matchedDates.includes(todayISO) ? 1 : 0);
}

/** "AUG 12 – SEP 10" — year-less, the verify_public day-header form
 *  (rendered dates class of the gate record). From the window, never the
 *  render clock. */
export function rangeLabel(since: string, until: string): string {
  const f = (iso: string) => new Date(iso + 'T12:00:00Z')
    .toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).toUpperCase();
  return `${f(since)} – ${f(until)}`;
}
