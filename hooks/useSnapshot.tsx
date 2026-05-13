import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SlateSnapshot, Scope, TopKStraightRow } from '@/types/core';
import { useScope } from '@/hooks/useScope';
import { fetchFromSupabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';
import { getTodayET } from '@/lib/dateUtils';

interface SnapshotState {
  snapshot: SlateSnapshot | null;
  isLoading: boolean;
  lastUpdate: string | null;
  coveragePercentage: number;
  refreshSnapshot: () => Promise<void>;
  hasLiveData: boolean;
  activePicks: TopKStraightRow[];
  supplementalPicks: TopKStraightRow[];
}

export const [SnapshotProvider, useSnapshot] = createContextHook<SnapshotState>(() => {
  const { scope } = useScope();
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<SlateSnapshot | null>(null);
  const [hasLiveData, setHasLiveData] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [supplementalPicks, setSupplementalPicks] = useState<TopKStraightRow[]>([]);

  const normalizeScope = (s: string): Scope => {
    const v = String(s ?? '').toLowerCase();
    if (v === 'all-day' || v === 'allday' || v === 'all_day') return 'allday';
    if (v === 'midday') return 'midday';
    if (v === 'evening') return 'evening';
    return 'allday';
  };

  const parseTopK = (raw: unknown): TopKStraightRow[] | string[] | undefined => {
    if (Array.isArray(raw)) {
      // Check if it's an array of objects (TopKStraightRow[]) or strings
      if (raw.length > 0 && typeof raw[0] === 'object' && raw[0] !== null) {
        return raw as TopKStraightRow[];
      }
      return raw as string[];
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          if (parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
            return parsed as TopKStraightRow[];
          }
          return parsed as string[];
        }
        return [];
      } catch {
        return [];
      }
    }
    return [];
  };

  const queryLatest = async (activeScope: Scope): Promise<SlateSnapshot | null> => {
    const encodedScope = encodeURIComponent(activeScope);

    const isSupplement = (r: any): boolean => {
      try {
        const meta = typeof r.file_meta === 'string' ? JSON.parse(r.file_meta) : r.file_meta;
        if (meta?.is_supplement) return true;
      } catch {}
      try {
        const hp = typeof r.horizons_present_json === 'string' ? JSON.parse(r.horizons_present_json) : r.horizons_present_json;
        if (hp?._is_supplement === true) return true;
      } catch {}
      return false;
    };

    const buildNormalized = (rows: any[]): SlateSnapshot | null => {
      if (!rows.length) return null;
      const suppRow = rows.find(isSupplement) ?? null;
      const origRow = (rows.find(r => !isSupplement(r)) ?? rows[0]) as any;

      let topKMerged: any = origRow.top_k_straights_json;
      let suppPicksForState: TopKStraightRow[] = [];
      if (suppRow) {
        const origPicks = (parseTopK(origRow.top_k_straights_json) as any[]) ?? [];
        const suppPicks = (parseTopK(suppRow.top_k_straights_json) as any[]) ?? [];
        const hitPicks = origPicks.filter((p: any) => !!p?.hitType);
        topKMerged = [...hitPicks, ...suppPicks];
        suppPicksForState = suppPicks as TopKStraightRow[];
        console.log('[useSnapshot] Merged supplement:', { scope: activeScope, hitPicks: hitPicks.length, suppPicks: suppPicks.length });
      }
      setSupplementalPicks(suppPicksForState);

      const row = { ...origRow, top_k_straights_json: topKMerged };
      return {
        ...row,
        scope: normalizeScope(row.scope),
        top_k_straights_json: parseTopK(topKMerged) as TopKStraightRow[] | string[],
        top_k_boxes_json: Array.isArray(row.top_k_boxes_json) ? row.top_k_boxes_json : parseTopK(row.top_k_boxes_json as unknown) as unknown as any[],
        hash: (row.snapshot_hash || row.hash) as string | undefined,
      };
    };

    // Primary: fetch last 5 rows (captures both original and supplement)
    const tableQueries = [
      `/rest/v1/slate_snapshots?select=*&scope=eq.${encodedScope}&deleted_at=is.null&mode=neq.zk30&order=updated_at_et.desc.nullslast,id.desc&limit=5`,
      `/rest/v1/v_latest_slate_snapshots?select=*&scope=eq.${encodedScope}&mode=neq.zk30&limit=1`,
      `/rest/v1/slate_snapshots?select=*&scope=eq.${encodedScope}&order=updated_at_et.desc.nullslast,id.desc&limit=5`,
      `/rest/v1/slate_snapshots?select=*&scope=eq.${encodedScope}&limit=1`,
    ];

    for (let i = 0; i < tableQueries.length; i++) {
      try {
        const rows = await fetchFromSupabase<any[]>({ path: tableQueries[i], method: 'GET' });
        if (Array.isArray(rows) && rows.length > 0) {
          const normalized = buildNormalized(rows);
          if (normalized) {
            console.log('[useSnapshot] Got snapshot:', { scope: activeScope, id: normalized.id, hash: normalized.hash?.slice(0, 8), topK: Array.isArray(normalized.top_k_straights_json) ? normalized.top_k_straights_json.length : 0 });
            setHasLiveData(true);
            try { await storage.setItem(`snapshot-${activeScope}`, JSON.stringify(normalized)); } catch {}
            try { if (normalized.id) await storage.setItem(`lastSnapshotId-${activeScope}`, normalized.id); } catch {}
            return normalized;
          }
        }
      } catch (e) {
        console.log(`[useSnapshot] Query ${i + 1} failed:`, String(e instanceof Error ? e.message : e));
      }
    }

    // Last resort: audit_logs fallback
    try {
      const auditRows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/audit_logs?select=id,created_at,action,target,payload_meta&action=eq.slate_snapshot_fallback&target=eq.${encodedScope}&order=created_at.desc&limit=1`,
        method: 'GET',
      });
      if (Array.isArray(auditRows) && auditRows.length > 0) {
        const row = auditRows[0] as any;
        const snap = row?.payload_meta?.snapshot as any;
        if (snap && typeof snap === 'object') {
          const normalized: SlateSnapshot = {
            id: `audit-${row.id}`,
            scope: normalizeScope(snap.scope ?? activeScope),
            horizons_present_json: (snap.horizons_present_json ?? {}) as Record<string, boolean>,
            weights_json: snap.weights_json ?? undefined,
            top_k_straights_json: parseTopK(snap.top_k_straights_json) as TopKStraightRow[] | string[] | undefined,
            top_k_boxes_json: Array.isArray(snap.top_k_boxes_json) ? snap.top_k_boxes_json : parseTopK(snap.top_k_boxes_json as unknown) as unknown as any[],
            components_json: Array.isArray(snap.components_json) ? snap.components_json : undefined,
            updated_at_et: String(snap.updated_at_et ?? row.created_at),
            hash: (snap.snapshot_hash ?? snap.hash) as string | undefined,
          };
          return normalized;
        }
      }
    } catch (e) {
      console.log('[useSnapshot] Audit fallback error:', e);
    }
    return null;
  };

  const snapshotQuery = useQuery<SlateSnapshot | null>({
    queryKey: ['snapshot', scope],
    queryFn: async () => {
      console.log('[useSnapshot] Fetching snapshot for scope:', scope);
      try {
        // Evict cache when the stored snapshot is from a previous ET date
        try {
          const storedSnap = await storage.getItem(`snapshot-${scope}`);
          if (storedSnap) {
            const parsed = JSON.parse(storedSnap);
            const cachedDate = parsed.slate_date ?? parsed.updated_at_et?.split('T')[0];
            if (cachedDate && cachedDate !== getTodayET()) {
              await storage.removeItem(`snapshot-${scope}`);
              await storage.removeItem(`lastSnapshotId-${scope}`);
              console.log('[useSnapshot] Cleared stale storage cache for scope:', scope);
            }
          }
        } catch {}

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Snapshot fetch timeout')), 10000);
        });
        const live = await Promise.race([
          queryLatest(scope),
          timeoutPromise,
        ]);

        if (live) {
          console.log('[useSnapshot] Got live snapshot', {
            id: live.id,
            scope: live.scope,
            hash: live.hash?.slice(0, 8),
            topK: Array.isArray(live.top_k_straights_json) ? live.top_k_straights_json.length : 0,
            topKSample: Array.isArray(live.top_k_straights_json) ? live.top_k_straights_json.slice(0, 3) : [],
          });
          setHasLiveData(true);
          try { await storage.setItem(`snapshot-${scope}`, JSON.stringify(live)); } catch (err) { console.log('[useSnapshot] Cache write error:', err); }
          try { if (live.id) await storage.setItem(`lastSnapshotId-${scope}`, live.id); } catch {}
          return live;
        }

        console.log('[useSnapshot] No snapshot found for scope:', scope);
        setHasLiveData(false);
        return null;
      } catch (error) {
        console.log('[useSnapshot] Fetch error:', error);
        setHasLiveData(false);
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 1000,
    retry: 3,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: null,
    networkMode: 'offlineFirst',
  });

  useEffect(() => {
    console.log('[useSnapshot] Effect triggered:', {
      hasData: snapshotQuery.data !== undefined,
      isLoading: snapshotQuery.isLoading,
      isInitialized,
      scope,
      dataType: typeof snapshotQuery.data
    });

    if (snapshotQuery.data !== undefined) {
      setSnapshot(snapshotQuery.data);
      setIsInitialized(true);
      console.log('[useSnapshot] Snapshot updated:', {
        hasSnapshot: !!snapshotQuery.data,
        scope,
        hash: snapshotQuery.data?.hash?.slice(0, 8)
      });
    } else if (!isInitialized && !snapshotQuery.isLoading) {
      setIsInitialized(true);
      console.log('[useSnapshot] Initialized without data for scope:', scope);
    }
  }, [snapshotQuery.data, snapshotQuery.isLoading, isInitialized, scope]);

  const { refetch } = snapshotQuery;

  const refreshSnapshot = useCallback(async () => {
    console.log('[useSnapshot] Refreshing snapshot for scope:', scope);
    try {
      // Clear cache first
      await storage.removeItem(`snapshot-${scope}`);
      setHasLiveData(false);
      setSnapshot(null);
      
      // Force a fresh fetch by invalidating the query first
      queryClient.removeQueries({ queryKey: ['snapshot', scope] });
      queryClient.removeQueries({ queryKey: ['snapshot'] });
      
      // Direct refetch without polling - let the query handle retries
      const result = await refetch();
      
      console.log('[useSnapshot] Refresh result:', {
        hasData: !!result.data,
        scope,
        hash: result.data?.hash?.slice(0, 8),
        topKCount: Array.isArray(result.data?.top_k_straights_json) ? result.data.top_k_straights_json.length : 0,
        timestamp: new Date().toISOString()
      });
      
      // Force update the state immediately if we got data
      if (result?.data) {
        console.log('[useSnapshot] Force updating snapshot state with new data');
        setSnapshot(result.data);
        setHasLiveData(true);
      } else {
        console.log('[useSnapshot] No data received from refresh');
        setSnapshot(null);
        setHasLiveData(false);
      }
    } catch (e) {
      console.log('[useSnapshot] Refresh error:', e);
      setSnapshot(null);
      setHasLiveData(false);
    }
  }, [scope, refetch, queryClient]);

  const coveragePercentage = useMemo(() => {
    if (!snapshot?.horizons_present_json) return 0;
    const horizonKeys = Object.keys(snapshot.horizons_present_json).filter(k => /^H\d{2}Y$/.test(k));
    const totalHorizons = horizonKeys.length;
    const presentHorizons = horizonKeys.filter(k => (snapshot.horizons_present_json as Record<string, boolean>)[k]).length;
    return totalHorizons > 0 ? Math.round((presentHorizons / totalHorizons) * 100) : 0;
  }, [snapshot]);

  const lastUpdate = useMemo(() => {
    if (!snapshot?.updated_at_et) return null;
    try {
      return new Date(snapshot.updated_at_et).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch (e) {
      console.log('[useSnapshot] Date parsing error:', e);
      return null;
    }
  }, [snapshot?.updated_at_et]);

  return useMemo(() => {
    // BUG-138 — `hitPicks` (snapshot picks where p.hitType truthy) used to be
    // surfaced here. Removed because the post-regen anti-pattern made it
    // unreliable: a fresh K6 generated after a hit excludes the already-drawn
    // box-set, so hitType never gets stamped onto its picks. Consumers (Home's
    // "Today's Hits" + Performance Section A) now source from adaptive_tracking
    // which is keyed by slate_hash and survives regens.
    const allPicks = Array.isArray(snapshot?.top_k_straights_json)
      ? (snapshot!.top_k_straights_json as any[])
      : [];
    const activePicks = allPicks.filter((p: any) => !p?.hitType) as TopKStraightRow[];

    return {
      snapshot,
      isLoading: snapshotQuery.isLoading && !isInitialized,
      lastUpdate,
      coveragePercentage,
      refreshSnapshot,
      hasLiveData,
      activePicks,
      supplementalPicks,
    };
  }, [snapshot, snapshotQuery.isLoading, isInitialized, lastUpdate, coveragePercentage, refreshSnapshot, hasLiveData, supplementalPicks]);
});
