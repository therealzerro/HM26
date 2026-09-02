// MKT-62 — same-day midday provenance, SHARED between the two consumers of
// the gap: render-verification-reel (burns the timestamp pair into the summary
// band) and publish-reels (writes the same elapsed figure into the caption
// family's {elapsed} slot). One implementation of the join so the caption and
// the pixels cannot drift apart — the MKT-50 middayPosRule divergence is the
// standing lesson on what two copies of one rule do.
//
// MKT-69 (2026-09-02, operator ruling): BOTH MORNING BOARDS. The midday draws
// grade the Midday board AND the All-Day board (allday = ANY draw all day, so
// a midday-session match on it is a same-day match too). The straight the
// free room needs to see sits on whichever board it landed — on 9/2 the
// straight (485 IL) was on All-Day while the first-cut reel showed only
// Midday's two boxes. "The straight is always what's important."
//
//   PUBLISHED = the LATER marketing_reels.posted_at over the day's midday_free
//               and allday_free rows — the moment BOTH boards were in the free
//               room. Both are REQUIRED (no post, no gap to prove);
//   GRADED    = max(result_at) over the day's DEDUPED midday-session matched
//               rows in adaptive_tracking across scope ∈ {midday, allday}
//               (scope|combo|state key — the hit-detection clock, never the
//               render clock).
//
// This module is the provenance READ only. The renderer's precondition chain
// (ledger imported / complete / window open / graded — v4.4) stays in the
// renderer: those links decide build-or-abort and are checked before this
// read; publish runs only after a successful render, so it consumes the same
// result and degrades its caption instead of aborting.

export type SamedayBoard = 'midday' | 'allday';
export const SAMEDAY_BOARDS: readonly SamedayBoard[] = ['midday', 'allday'];

export interface BoardTally {
  postedAt: Date;      // that board's free-room post (marketing_reels.posted_at)
  matches: number;     // deduped midday-session matched rows on this board
  straights: number;   // of those, hit_straight
}

export interface SamedayProvenance {
  publishedAt: Date;   // later of the two boards' posts
  gradedAt: Date;
  matches: number;     // deduped midday-session matched rows, BOTH boards
  straights: number;   // of those, hit_straight (both boards)
  boards: Record<SamedayBoard, BoardTally>;
  // which board carries the straight(s) — feeds the caption's structural
  // STRAIGHT lead; null when there is none.
  straightBoard: SamedayBoard | 'both' | null;
}

export type SamedayResult =
  | ({ ok: true } & SamedayProvenance)
  // a morning board was never posted — no gap to prove. status null = no row.
  | { ok: false; why: 'not-posted'; kind: 'midday_free' | 'allday_free'; status: string | null }
  // graded, but zero midday-session matches on either board — an honest zero.
  | { ok: false; why: 'zero-matches' }
  // GRADED ≤ PUBLISHED — provenance inconsistent.
  | { ok: false; why: 'inverted'; publishedAt: Date; gradedAt: Date };

type Get = <T>(path: string) => Promise<T>;

/** "8h 33m" — the elapsed gap, whole minutes. */
export function fmtGap(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export async function fetchSamedayProvenance(get: Get, dateISO: string): Promise<SamedayResult> {
  const posted = await get<Array<{ kind: string; posted_at: string | null; status: string }>>(
    `/rest/v1/marketing_reels?reel_date=eq.${dateISO}&kind=in.(midday_free,allday_free)&select=kind,posted_at,status`,
  );
  const postedAt: Partial<Record<SamedayBoard, Date>> = {};
  for (const b of SAMEDAY_BOARDS) {
    const kind = `${b}_free` as 'midday_free' | 'allday_free';
    const row = posted.find(p => p.kind === kind);
    if (!row?.posted_at) return { ok: false, why: 'not-posted', kind, status: row?.status ?? null };
    postedAt[b] = new Date(row.posted_at);
  }
  const rows = await get<Array<{ scope: string; combo: string; matched_state: string; matched_session: string | null; hit_straight: boolean; result_at: string | null }>>(
    `/rest/v1/adaptive_tracking?slate_date=eq.${dateISO}&scope=in.(midday,allday)&mode=eq.balanced&matched_state=not.is.null&or=(hit_box.eq.true,hit_straight.eq.true)&select=scope,combo,matched_state,matched_session,hit_straight,result_at`,
  );
  const mid = rows.filter(r => (r.matched_session ?? '').toLowerCase() === 'midday');
  const seen = new Set<string>();
  const uniq = mid.filter(r => { const k = `${r.scope}|${r.combo}|${r.matched_state}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const times = uniq.map(r => (r.result_at ? Date.parse(r.result_at) : NaN)).filter(Number.isFinite);
  if (!uniq.length || !times.length) return { ok: false, why: 'zero-matches' };
  const publishedAt = new Date(Math.max(postedAt.midday!.getTime(), postedAt.allday!.getTime()));
  const gradedAt = new Date(Math.max(...times));
  if (!(gradedAt.getTime() > publishedAt.getTime())) return { ok: false, why: 'inverted', publishedAt, gradedAt };
  const tally = (b: SamedayBoard): BoardTally => {
    const own = uniq.filter(r => r.scope === b);
    return { postedAt: postedAt[b]!, matches: own.length, straights: own.filter(r => r.hit_straight).length };
  };
  const boards = { midday: tally('midday'), allday: tally('allday') };
  const straightBoard: SamedayProvenance['straightBoard'] =
    boards.midday.straights && boards.allday.straights ? 'both'
    : boards.midday.straights ? 'midday'
    : boards.allday.straights ? 'allday'
    : null;
  return {
    ok: true, publishedAt, gradedAt,
    matches: uniq.length, straights: uniq.filter(r => r.hit_straight).length,
    boards, straightBoard,
  };
}
