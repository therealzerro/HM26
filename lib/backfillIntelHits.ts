import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra || {};
const SB_URL = extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SB_KEY = extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const HEADERS = {
  'apikey': SB_KEY,
  'Authorization': 'Bearer ' + SB_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

async function sbGet<T>(path: string): Promise<T> {
  if (!SB_URL || !SB_KEY) return [] as unknown as T;
  const res = await fetch(SB_URL + path, { headers: HEADERS });
  const text = await res.text();
  try { return JSON.parse(text) as T; } catch { return [] as unknown as T; }
}

async function patchIntelRow(id: string, body: Record<string, unknown>) {
  if (!SB_URL || !SB_KEY) return;
  await fetch(`${SB_URL}/rest/v1/daily_intelligence?id=eq.${id}`, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
}

export interface BackfillProgress {
  phase: string;
  datesTotal: number;
  datesDone: number;
  hitsFound: number;
}

export async function backfillIntelHits(
  onProgress?: (p: BackfillProgress) => void,
): Promise<{ hitsFound: number; datesProcessed: number }> {
  onProgress?.({ phase: 'Fetching dates…', datesTotal: 0, datesDone: 0, hitsFound: 0 });

  // Fetch every row (id + slate_date + scope + combo + combo_set) — no filter, get all.
  // Scope is required so the backfill can session-filter matches the same way
  // hitDetection.ts does (BUG-XXX fix 2026-05-13 — without this, night/morning
  // session draws were stamped onto allday daily_intelligence rows, producing
  // ~11% phantom hit rate over the 30d audit window).
  const allPicks = await sbGet<{ id: string; slate_date: string; scope: string; combo: string; combo_set: string | null }[]>(
    '/rest/v1/daily_intelligence?select=id,slate_date,scope,combo,combo_set&order=slate_date.desc&limit=5000',
  );

  if (!Array.isArray(allPicks) || allPicks.length === 0) {
    return { hitsFound: 0, datesProcessed: 0 };
  }

  const dates = [...new Set(allPicks.map(r => r.slate_date))];
  let hitsFound = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    onProgress?.({ phase: `Checking ${date}`, datesTotal: dates.length, datesDone: i, hitsFound });

    const histories = await sbGet<{ result_digits: string; comboset_sorted: string; jurisdiction: string; session: string }[]>(
      `/rest/v1/histories?date_et=eq.${date}&select=result_digits,comboset_sorted,jurisdiction,session`,
    );

    if (!Array.isArray(histories) || histories.length === 0) continue;

    const picksForDate = allPicks.filter(p => p.slate_date === date);

    for (const pick of picksForDate) {
      // Filter histories to sessions compatible with this pick's slate scope
      // (mirrors hitDetection.ts:204-213). Night/morning sessions are
      // intentionally excluded — engine universe is midday/evening only.
      const validSessions =
        pick.scope === 'allday'  ? new Set(['midday','evening']) :
        pick.scope === 'midday'  ? new Set(['midday']) :
        pick.scope === 'evening' ? new Set(['evening']) :
                                   new Set<string>();
      const scopedHistories = histories.filter(r => validSessions.has(r.session));
      // Box hit: sorted combo set matches
      const boxMatch = scopedHistories.find(r => r.comboset_sorted === pick.combo_set);
      // Straight hit: exact 3-digit match
      const straightMatch = scopedHistories.find(r => r.result_digits === pick.combo);

      if (boxMatch || straightMatch) {
        const winning = straightMatch ?? boxMatch!;
        await patchIntelRow(pick.id, {
          hit_box: true,
          hit_straight: !!straightMatch,
          hit_state: winning.jurisdiction,
          hit_session: winning.session,
          hit_result: winning.result_digits,
        });
        hitsFound++;
        console.log('[backfill] hit:', pick.combo, date, winning.jurisdiction);
      }
    }
  }

  onProgress?.({ phase: 'Done', datesTotal: dates.length, datesDone: dates.length, hitsFound });
  console.log('[backfill] complete — hits:', hitsFound, 'dates:', dates.length);
  return { hitsFound, datesProcessed: dates.length };
}
