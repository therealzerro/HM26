/**
 * Utility functions for handling pair-based logic in ZK6 analysis.
 */
import { fetchFromSupabase } from './supabase';

/**
 * Returns the front, back, and split pairs for a 3-digit combo.
 * Given "123", returns { front: "12", back: "23", split: "13" }.
 */
export function getPairs(combo: string): { front: string; back: string; split: string } {
  if (combo.length !== 3) {
    return { front: "", back: "", split: "" };
  }
  return {
    front: combo[0] + combo[1],
    back: combo[1] + combo[2],
    split: combo[0] + combo[2],
  };
}

/**
 * Normalizes a pair key to a consistent format (e.g., handles "12" or "21").
 * Currently returns the input sorted digits.
 */
export function normalizePairKey(key: string): string {
  if (!key) return "";
  return key.split('').sort().join('');
}

/**
 * Fetches the three position-pair scores (front / back / split) for a 3-digit
 * pick, max-normalized to 0–100. Pulls H01Y rows from `datasets_pair` for the
 * given scope (class_id 2/3/4 = front/back/split pair sets, nationally
 * aggregated → jurisdiction IS NULL per the ZK6 data model).
 *
 * Returns zeros on network failure or missing rows so callers can render a
 * stable poster without try/catch boilerplate.
 *
 * Shared by PickDetailModal (live UI) and admin-image-export (PNG export) —
 * keep this the single source of truth for pair-score derivation so both
 * surfaces never drift.
 */
export async function fetchPairScores(
  bestOrder: string,
  scope: string,
): Promise<{ front: number; back: number; split: number }> {
  const pairs = getPairs(bestOrder);
  const wanted = {
    front: normalizePairKey(pairs.front),
    back:  normalizePairKey(pairs.back),
    split: normalizePairKey(pairs.split),
  };
  const wantedSet = new Set([wanted.front, wanted.back, wanted.split]);

  let rows: any[] = [];
  try {
    const r = await fetchFromSupabase<any[]>({
      path: `/rest/v1/datasets_pair?scope=eq.${encodeURIComponent(scope)}&horizon_label=eq.H01Y&class_id=in.(2,3,4)&jurisdiction=is.null&select=key,key_pair,class_id,ds_raw,times_drawn`,
    });
    if (Array.isArray(r)) {
      rows = r.filter(row => wantedSet.has(normalizePairKey(String(row.key_pair ?? row.key ?? ''))));
    }
  } catch { /* fall through to zeros */ }

  const getScore = (pairKey: string, classId: number) => {
    const row = rows.find(r => normalizePairKey(String(r.key_pair ?? r.key ?? '')) === pairKey && r.class_id === classId);
    return row ? (row.times_drawn ?? 0) : 0;
  };
  const f  = getScore(wanted.front, 2);
  const b  = getScore(wanted.back,  3);
  const sp = getScore(wanted.split, 4);
  const mx = Math.max(f, b, sp, 1);
  return {
    front: Math.round((f / mx) * 100),
    back:  Math.round((b / mx) * 100),
    split: Math.round((sp / mx) * 100),
  };
}
