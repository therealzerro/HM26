/**
 * briefResolve — pure, dependency-free grading of a board against a day's
 * draws (MKT-82 F1, 2026-10-10). Used by the social brief for BOTH yesterday
 * and today so the two rows obey one law:
 *
 *   BOX MATCH      a pick's sorted set equals a draw's sorted set
 *   STRAIGHT MATCH a draw's result digits equal the pick's best-order digits
 *
 * Before F1 the yesterday row said STRAIGHT MATCH whenever rank-1 matched in
 * ANY order (a comboset test wearing a straight label). Never again: the
 * straight flag here is result_digits === bestOrder, the verify reel's law.
 * No stored hit flags (BUG-162) — the inputs are the slate and the draws.
 */

export type ResolveScope = 'midday' | 'evening' | 'allday';

export interface BoardPick {
  comboSet: string;   // "{4,5,8}" or "458" — normalised internally
  bestOrder: string;  // "485" or "4-8-5" — normalised internally
}

export interface DrawRow {
  session: string;          // 'midday' | 'evening'
  comboset_sorted: string;  // "{4,5,8}" as stored in histories
  result_digits: string;    // "485"
}

export interface PickMatch {
  set: string;              // sorted-set digits, "169"
  bestOrder: string;        // the pick's exact order, "691"
  straight: boolean;        // some draw equalled bestOrder exactly
}

export interface Resolution {
  resolved: boolean;        // at least one draw for the scope has landed
  live: boolean;            // allday only: one session drawn, the other not yet
  slateHit: boolean;        // any pick matched (box)
  straight: boolean;        // any matched pick matched in exact order
  hittingCombos: string[];  // sorted-set digit strings of the matched picks, slate order
  matches: PickMatch[];     // per matched pick, slate order — the chip law (10/10: a
                            // row-level label over four chips read as "four straights")
}

export function digitsOnly(s: string | null | undefined): string {
  return String(s ?? '').replace(/\D/g, '');
}

/** "{4,5,8}" → "458"; "458" → "458". Sorted-set digits as a 3-char string. */
export function setDigits(comboSet: string | null | undefined): string {
  return digitsOnly(comboSet);
}

/** "485" → "4-8-5" for display. Anything that is not 3 digits comes back as given. */
export function fmtDigits(s: string | null | undefined): string {
  const d = digitsOnly(s);
  return d.length === 3 ? d.split('').join('-') : String(s ?? '');
}

export function parseBoard(json: unknown): BoardPick[] {
  let arr: unknown = json;
  if (typeof json === 'string') {
    try { arr = JSON.parse(json); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .map((p: any) => ({
      comboSet: String(p?.comboSet ?? p?.combo_set ?? ''),
      bestOrder: String(p?.bestOrder ?? p?.best_order ?? p?.combo ?? ''),
    }))
    .filter(p => setDigits(p.comboSet).length === 3);
}

/**
 * Grade one scope's board against the day's draws. midday/evening look at
 * their own session only; allday looks at every draw and is "live" until both
 * sessions have drawn.
 */
export function resolveDraws(picks: BoardPick[], draws: DrawRow[], scope: ResolveScope): Resolution {
  const scoped = draws.filter(d => scope === 'allday' || d.session === scope);
  const sessions = new Set(draws.map(d => d.session));
  const resolved = scoped.length > 0;
  const live = scope === 'allday' && resolved && !(sessions.has('midday') && sessions.has('evening'));
  const hitting: string[] = [];
  const matches: PickMatch[] = [];
  let slateHit = false;
  let straight = false;
  if (resolved) {
    for (const p of picks) {
      const set = setDigits(p.comboSet);
      const best = digitsOnly(p.bestOrder);
      const matched = scoped.filter(d => setDigits(d.comboset_sorted) === set);
      if (!matched.length) continue;
      slateHit = true;
      const exact = best.length === 3 && matched.some(d => digitsOnly(d.result_digits) === best);
      if (exact) straight = true;
      if (!hitting.includes(set)) { hitting.push(set); matches.push({ set, bestOrder: best, straight: exact }); }
    }
  }
  return { resolved, live, slateHit, straight, hittingCombos: hitting, matches };
}

/** The label law for a graded row — shared by yesterday and today. */
export function matchTag(r: Pick<Resolution, 'resolved' | 'slateHit' | 'straight'>): 'STRAIGHT MATCH' | 'BOX MATCH' | 'no match' | 'no draws' {
  if (!r.resolved) return 'no draws';
  if (!r.slateHit) return 'no match';
  return r.straight ? 'STRAIGHT MATCH' : 'BOX MATCH';
}
