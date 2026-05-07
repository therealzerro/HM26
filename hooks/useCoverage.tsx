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
  lastImportId: string | null;
}

interface CoverageState {
  matrix: Record<number, Record<HorizonLabel, CoverageCell>>;
  coveragePctH01Y: number;
  missingH01Y: { classId: number; label: string }[];
  refetch: () => Promise<void>;
}

export const [CoverageProvider, useCoverage] = createContextHook<CoverageState>(() => {
  const { scope } = useScope();

  const coverageQuery = useQuery<{ box: any[]; pairs: any[] }>({
    queryKey: ['coverage', scope],
    queryFn: async () => {
      const scopeFilter = `eq.${encodeURIComponent(scope)}`;
      console.log('[useCoverage] Fetching coverage data for scope:', scope, 'filter:', scopeFilter);
      
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Coverage fetch timeout')), 10000);
        });
        
        const boxUrl = `/rest/v1/datasets_box?select=class_id,horizon_label,import_id,deleted_at,created_at&scope=${scopeFilter}&deleted_at=is.null&limit=50000`;
        const pairUrl = `/rest/v1/datasets_pair?select=class_id,horizon_label,import_id,deleted_at,created_at&scope=${scopeFilter}&deleted_at=is.null&limit=100000`;
        
        console.log('[useCoverage] Fetching URLs:', { boxUrl, pairUrl });
        
        const [boxRows, pairRows] = await Promise.race([
          Promise.all([
            fetchFromSupabase<any[]>({ path: boxUrl }),
            fetchFromSupabase<any[]>({ path: pairUrl }),
          ]),
          timeoutPromise,
        ]);
        
        console.log('[useCoverage] Raw fetch results:', {
          scope,
          boxRowsCount: Array.isArray(boxRows) ? boxRows.length : 0,
          pairRowsCount: Array.isArray(pairRows) ? pairRows.length : 0,
          boxSample: Array.isArray(boxRows) ? boxRows.slice(0, 3) : [],
          pairSample: Array.isArray(pairRows) ? pairRows.slice(0, 3) : [],
          boxRowsType: typeof boxRows,
          pairRowsType: typeof pairRows
        });
        
        // Additional debugging for empty results
        if ((!Array.isArray(boxRows) || boxRows.length === 0) && (!Array.isArray(pairRows) || pairRows.length === 0)) {
          console.log('[useCoverage] CRITICAL: No data found for scope:', scope);
          console.log('[useCoverage] Attempting direct query without scope filter...');
          
          try {
            const allBoxRows = await fetchFromSupabase<any[]>({ path: '/rest/v1/datasets_box?select=class_id,horizon_label,import_id,deleted_at,created_at,scope&deleted_at=is.null&limit=100' });
            const allPairRows = await fetchFromSupabase<any[]>({ path: '/rest/v1/datasets_pair?select=class_id,horizon_label,import_id,deleted_at,created_at,scope&deleted_at=is.null&limit=100' });
            
            console.log('[useCoverage] All data sample (first 10 rows):', {
              allBoxSample: Array.isArray(allBoxRows) ? allBoxRows.slice(0, 10) : [],
              allPairSample: Array.isArray(allPairRows) ? allPairRows.slice(0, 10) : [],
              uniqueScopes: {
                box: Array.isArray(allBoxRows) ? [...new Set(allBoxRows.map(r => r.scope))] : [],
                pair: Array.isArray(allPairRows) ? [...new Set(allPairRows.map(r => r.scope))] : []
              }
            });
          } catch (debugError) {
            console.log('[useCoverage] Debug query failed:', debugError);
          }
        }
        
        return { box: Array.isArray(boxRows) ? boxRows : [], pairs: Array.isArray(pairRows) ? pairRows : [] };
      } catch (error) {
        console.log('[useCoverage] Fetch error:', error);
        return { box: [], pairs: [] };
      }
    },
    staleTime: 0, // Force fresh data
    gcTime: 0, // Don't cache
    retry: 2,
    networkMode: 'offlineFirst',
    refetchOnWindowFocus: true,
    refetchOnMount: true,
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
          lastImportId: null,
        };
      });
    });

    console.log('[useCoverage] Processing coverage data:', {
      boxRows: coverageQuery.data?.box?.length ?? 0,
      pairRows: coverageQuery.data?.pairs?.length ?? 0,
      scope
    });
    
    const toCanonicalH = (h: string): HorizonLabel | null => {
      const upper = String(h ?? '').trim().toUpperCase();
      const m = upper.match(/^H0*([0-9]{1,2})Y$/);
      if (!m) return null;
      const n = parseInt(m[1], 10);
      if (!Number.isFinite(n) || n < 1 || n > 10) return null;
      return (`H${String(n).padStart(2, '0')}Y`) as HorizonLabel;
    };

    const accumulate = (rows: any[]) => {
      console.log('[useCoverage] Accumulating rows:', rows.length);
      
      const horizonCounts: Record<string, number> = {};
      rows.forEach(r => {
        const canon = toCanonicalH(r?.horizon_label ?? '');
        const key = canon ?? String(r?.horizon_label ?? '').trim().toUpperCase();
        horizonCounts[key] = (horizonCounts[key] || 0) + 1;
      });
      console.log('[useCoverage] Horizon distribution (canonical):', horizonCounts);
      
      rows.forEach((r, index) => {
        const cid = Number(r?.class_id ?? 0);
        const canon = toCanonicalH(r?.horizon_label ?? '');
        const h = canon;
        const rawH = String(r?.horizon_label ?? '').trim();
        
        if ((canon === 'H06Y') || rawH.includes('06') || index < 10) {
          console.log(`[useCoverage] Processing row ${index} (${rawH} -> ${canon}):`, { 
            cid, 
            rawH, 
            h: canon, 
            originalHorizon: r?.horizon_label,
            originalClassId: r?.class_id,
            isValidClassId: cid >= 1 && cid <= 11,
            isValidHorizon: !!canon,
            scope: r?.scope,
            importId: r?.import_id
          });
        }
        
        if (!cid || cid < 1 || cid > 11) {
          if (rawH.includes('06') || index < 10) {
            console.log(`[useCoverage] Row ${index} rejected - invalid class_id:`, { cid, validRange: '1-11', originalClassId: r?.class_id, rawH });
          }
          return;
        }
        
        if (!h) {
          if (rawH.includes('06') || index < 10) {
            console.log(`[useCoverage] Row ${index} rejected - invalid horizon:`, { rawH, validHorizons: HORIZONS, originalHorizon: r?.horizon_label });
          }
          return;
        }
        
        const cell = init[cid]?.[h];
        if (!cell) {
          if (rawH.includes('06') || index < 10) {
            console.log(`[useCoverage] Row ${index} rejected - no cell found:`, { cid, h, cellExists: !!init[cid], horizonExists: !!init[cid]?.[h], rawH });
          }
          return;
        }
        
        cell.present = true;
        cell.count += 1;
        cell.lastImportId = r?.import_id ?? cell.lastImportId;
        cell.lastImportAt = r?.created_at ?? cell.lastImportAt;
        
        if (rawH.includes('06') || index < 10) {
          console.log(`[useCoverage] Row ${index} successfully processed:`, { cid, h, count: cell.count, importId: cell.lastImportId, rawH });
        }
      });
    };

    console.log('[useCoverage] About to accumulate box data:', coverageQuery.data?.box?.length ?? 0);
    accumulate(coverageQuery.data?.box ?? []);
    console.log('[useCoverage] About to accumulate pair data:', coverageQuery.data?.pairs?.length ?? 0);
    accumulate(coverageQuery.data?.pairs ?? []);
    
    // Log final matrix state for H06Y
    console.log('[useCoverage] Final matrix H06Y state:', {
      class1_H06Y: init[1]?.['H06Y']?.present,
      class2_H06Y: init[2]?.['H06Y']?.present,
      class3_H06Y: init[3]?.['H06Y']?.present,
      allH06Y: Object.keys(init).map(cid => ({ cid, present: init[Number(cid)]?.['H06Y']?.present })).filter(x => x.present)
    });

    return init;
  }, [coverageQuery.data, scope]);

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