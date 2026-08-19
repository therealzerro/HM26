// MKT-62 — same-day midday provenance, SHARED between the two consumers of
// the gap: render-verification-reel (burns the timestamp pair into the summary
// band) and publish-reels (writes the same elapsed figure into the caption
// family's {elapsed} slot). One implementation of the join so the caption and
// the pixels cannot drift apart — the MKT-50 middayPosRule divergence is the
// standing lesson on what two copies of one rule do.
//
//   PUBLISHED = marketing_reels.posted_at of the day's midday_free row — the
//               literal moment the covered board went to the free room;
//   GRADED    = max(result_at) over the day's DEDUPED midday-session matched
//               rows in adaptive_tracking (combo|state key — the hit-detection
//               clock, never the render clock).
//
// This module is the provenance READ only. The renderer's precondition chain
// (ledger imported / complete / window open / graded — v4.4) stays in the
// renderer: those links decide build-or-abort and are checked before this
// read; publish runs only after a successful render, so it consumes the same
// result and degrades its caption instead of aborting.

export interface SamedayProvenance {
  publishedAt: Date;
  gradedAt: Date;
  matches: number;   // deduped midday-session matched rows
  straights: number; // of those, hit_straight
}

export type SamedayResult =
  | ({ ok: true } & SamedayProvenance)
  // midday_free was never posted — no gap to prove. status null = no row.
  | { ok: false; why: 'not-posted'; status: string | null }
  // graded, but zero midday-session matches — an honest zero.
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
  const posted = await get<Array<{ posted_at: string | null; status: string }>>(
    `/rest/v1/marketing_reels?reel_date=eq.${dateISO}&kind=eq.midday_free&select=posted_at,status&limit=1`,
  );
  if (!posted[0]?.posted_at) return { ok: false, why: 'not-posted', status: posted[0]?.status ?? null };
  const rows = await get<Array<{ combo: string; matched_state: string; matched_session: string | null; hit_straight: boolean; result_at: string | null }>>(
    `/rest/v1/adaptive_tracking?slate_date=eq.${dateISO}&scope=eq.midday&mode=eq.balanced&matched_state=not.is.null&or=(hit_box.eq.true,hit_straight.eq.true)&select=combo,matched_state,matched_session,hit_straight,result_at`,
  );
  const mid = rows.filter(r => (r.matched_session ?? '').toLowerCase() === 'midday');
  const seen = new Set<string>();
  const uniq = mid.filter(r => { const k = `${r.combo}|${r.matched_state}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const times = uniq.map(r => (r.result_at ? Date.parse(r.result_at) : NaN)).filter(Number.isFinite);
  if (!uniq.length || !times.length) return { ok: false, why: 'zero-matches' };
  const publishedAt = new Date(posted[0].posted_at);
  const gradedAt = new Date(Math.max(...times));
  if (!(gradedAt.getTime() > publishedAt.getTime())) return { ok: false, why: 'inverted', publishedAt, gradedAt };
  return { ok: true, publishedAt, gradedAt, matches: uniq.length, straights: uniq.filter(r => r.hit_straight).length };
}
