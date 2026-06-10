import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '@/lib/supabase';

export interface BandStat {
  band: string;
  total: number;
  hits: number;
  rate: number; // 0..1
}

export interface EnergyBandStatsResult {
  byBand: Map<string, BandStat>;
  isLoading: boolean;
}

const LOOKBACK_DAYS = 60;

/** Bucket boundaries — 10-point bands above 60, single bucket below 60. */
export function bandFor(energy_score: number): string {
  if (!Number.isFinite(energy_score)) return '';
  if (energy_score >= 90) return '90-100';
  if (energy_score >= 80) return '80-89';
  if (energy_score >= 70) return '70-79';
  if (energy_score >= 60) return '60-69';
  return '<60';
}

// BUG-162 / honest-positioning (2026-06-10): hit-rate stats must come from the
// clean measurement era only. Pre-2026-05-13 rows carry the April hit-stamping
// artifacts; 5/13+ rows were repaired when the next-day attribution bug was
// fixed (run-hit-detection v10). Floor the lookback so the 60-day window can
// never reach contaminated data.
const CLEAN_DATA_FLOOR = '2026-05-13';

function sinceDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - (LOOKBACK_DAYS - 1));
  const since = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return since > CLEAN_DATA_FLOOR ? since : CLEAN_DATA_FLOOR;
}

/**
 * Energy-band hit rates (enhancements §2.2). Groups every K6/top-30
 * daily_intelligence row from the last 60 days by energy_score band and
 * computes how often that band hit (box OR straight). Used by PickCard
 * to surface a "245 picks at 90–100 energy_score hit 76% historically" footer.
 *
 * SCRUB-01 (2026-05-27): production is balanced-only. Filter scoped to
 * balanced; historical conservative/aggressive rows from before scrub are
 * excluded.
 */
export function useEnergyBandHitRates(): EnergyBandStatsResult {
  const since = useMemo(() => sinceDate(), []);

  const { data: rows = [], isLoading } = useQuery<Array<{ energy_score: number; hit_box: boolean | null; hit_straight: boolean | null }>>({
    queryKey: ['energy_score_band_hit_rates', since],
    queryFn: async () => {
      const data = await fetchFromSupabase<any[]>({
        path: `/rest/v1/daily_intelligence?slate_date=gte.${since}&energy_score=not.is.null&mode=eq.balanced&select=energy_score,hit_box,hit_straight&limit=20000`,
      });
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60 * 60 * 1000, // 1h — band rates move slowly
  });

  return useMemo(() => {
    const byBand = new Map<string, BandStat>();
    for (const r of rows) {
      const e = Number(r.energy_score);
      if (!Number.isFinite(e)) continue;
      const b = bandFor(e);
      if (!b) continue;
      const cur = byBand.get(b) ?? { band: b, total: 0, hits: 0, rate: 0 };
      cur.total += 1;
      if (r.hit_box || r.hit_straight) cur.hits += 1;
      byBand.set(b, cur);
    }
    for (const v of byBand.values()) {
      v.rate = v.total > 0 ? v.hits / v.total : 0;
    }
    return { byBand, isLoading };
  }, [rows, isLoading]);
}
