import createContextHook from '@nkzw/create-context-hook';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useCallback } from 'react';
import { HORIZONS, PAIR_CLASSES } from '@/constants/pairClasses';
import { HorizonLabel } from '@/types/core';
import { fetchFromSupabase } from '@/lib/supabase';
import { useScope } from '@/hooks/useScope';

interface CoverageCell {
  classId: number;
  horizon: HorizonLabel;
  present: boolean;
  count: number;
  lastImportAt: string | null;
  /** ds_raw rebuild recency — max(updated_at) for the cell (Daily Workflow Step 1). */
  lastRebuiltAt: string | null;
}

interface CoverageState {
  matrix: Record<number, Record<HorizonLabel, CoverageCell>>;
  coveragePctH01Y: number;
  missingH01Y: { classId: number; label: string }[];
  refetch: () => Promise<void>;
}

interface CoverageSummaryRow {
  data_type: 'box' | 'pair';
  class_id: number;
  scope: string;
  horizon_label: string;
  row_count: number;
  latest_seen: string | null;
  last_updated: string | null;
  latest_imported: string | null;
}

// IMPORT-REHAB-01 (2026-07-09): coverage now reads the aggregate view
// v_coverage_zk6 (~300 rows, jurisdiction IS NULL — the exact slice the engine
// scores from) instead of pulling raw datasets_* rows. The old implementation
// requested limit=50000/100000 but PostgREST silently caps every response at
// 1000 rows, so pair coverage (10,000 rows/scope) was structurally undercounted
// and the matrix could show gaps that didn't exist.
export const [CoverageProvider, useCoverage] = createContextHook<CoverageState>(() => {
  const { scope } = useScope();

  const coverageQuery = useQuery<CoverageSummaryRow[]>({
    queryKey: ['coverage', scope],
    queryFn: async () => {
      const rows = await fetchFromSupabase<CoverageSummaryRow[]>({
        path: `/rest/v1/v_coverage_zk6?scope=eq.${encodeURIComponent(scope)}&select=*`,
        timeoutMs: 10000,
      });
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 60 * 1000,
    retry: 2,
    networkMode: 'offlineFirst',
  });

  const matrix = useMemo(() => {
    const init: Record<number, Record<HorizonLabel, CoverageCell>> = {};
    const classIds = Object.keys(PAIR_CLASSES).map((k) => Number(k));
    classIds.forEach((cid) => {
      init[cid] = {} as Record<HorizonLabel, CoverageCell>;
      HORIZONS.forEach((h) => {
        init[cid][h] = {
          classId: cid,
          horizon: h,
          present: false,
          count: 0,
          lastImportAt: null,
          lastRebuiltAt: null,
        };
      });
    });

    const toCanonicalH = (h: string): HorizonLabel | null => {
      const upper = String(h ?? '').trim().toUpperCase();
      const m = upper.match(/^H0*([0-9]{1,2})Y$/);
      if (!m) return null;
      const n = parseInt(m[1], 10);
      if (!Number.isFinite(n) || n < 1 || n > 10) return null;
      return (`H${String(n).padStart(2, '0')}Y`) as HorizonLabel;
    };

    (coverageQuery.data ?? []).forEach((r) => {
      const cid = Number(r?.class_id ?? 0);
      const h = toCanonicalH(r?.horizon_label ?? '');
      if (!cid || cid < 1 || cid > 11 || !h) return;
      const cell = init[cid]?.[h];
      if (!cell) return;
      cell.present = (r.row_count ?? 0) > 0;
      cell.count = r.row_count ?? 0;
      cell.lastImportAt = r.latest_imported ?? null;
      cell.lastRebuiltAt = r.last_updated ?? null;
    });

    return init;
  }, [coverageQuery.data]);

  const coveragePctH01Y = useMemo(() => {
    const total = 11;
    let have = 0;
    for (let cid = 1; cid <= 11; cid++) {
      if (matrix[cid]?.['H01Y']?.present) have++;
    }
    return Math.round((have / total) * 100);
  }, [matrix]);

  const missingH01Y = useMemo(() => {
    const list: { classId: number; label: string }[] = [];
    for (let cid = 1; cid <= 11; cid++) {
      if (!matrix[cid]?.['H01Y']?.present) {
        list.push({ classId: cid, label: (PAIR_CLASSES as any)[cid]?.label ?? `Class ${cid}` });
      }
    }
    return list;
  }, [matrix]);

  const { refetch } = coverageQuery;

  const refetchCoverage = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return useMemo(() => ({
    matrix,
    coveragePctH01Y,
    missingH01Y,
    refetch: refetchCoverage,
  }), [matrix, coveragePctH01Y, missingH01Y, refetchCoverage]);
});
