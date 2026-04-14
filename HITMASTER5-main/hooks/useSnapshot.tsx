import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SlateSnapshot, Scope, TopKStraightRow } from '@/types/core';
import { useScope } from '@/hooks/useScope';
import { fetchFromSupabase } from '@/lib/supabase';
import { storage } from '@/lib/storage';

interface SnapshotState {
  snapshot: SlateSnapshot | null;
  isLoading: boolean;
  lastUpdate: string | null;
  coveragePercentage: number;
  refreshSnapshot: () => Promise<void>;
  hasLiveData: boolean;
}

export const [SnapshotProvider, useSnapshot] = createContextHook<SnapshotState>(() => {
  const { scope } = useScope();
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<SlateSnapshot | null>(null);
  const [hasLiveData, setHasLiveData] = useState<boolean>(false);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

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
    console.log('[useSnapshot] Querying for scope:', { activeScope, encodedScope });

    // Helper function to try query with graceful fallbacks
    const tryQuery = async (baseUrl: string): Promise<any[] | null> => {
      const queries = [
        // Primary query with all columns (after schema fix)
        baseUrl.includes('select=') 
          ? baseUrl
          : baseUrl + '&select=*',
        // Fallback with explicit column list
        baseUrl.replace('select=*', 'select=id,scope,horizons_present_json,weights_json,top_k_straights_json,top_k_boxes_json,components_json,updated_at_et,snapshot_hash,hash,deleted_at'),
        // Minimal fallback without hash columns
        baseUrl.replace('select=*', 'select=id,scope,horizons_present_json,weights_json,top_k_straights_json,top_k_boxes_json,components_json,updated_at_et,deleted_at')
      ];

      for (let i = 0; i < queries.length; i++) {
        try {
          const query = queries[i];
          console.log(`[useSnapshot] Trying query ${i + 1}:`, query);
          const result = await fetchFromSupabase<any[]>({ path: query, method: 'GET' });
          console.log(`[useSnapshot] Query ${i + 1} succeeded, rows:`, Array.isArray(result) ? result.length : 0);
          return result;
        } catch (e) {
          const errorMsg = String(e instanceof Error ? e.message : e);
          console.log(`[useSnapshot] Query ${i + 1} failed:`, errorMsg);
          if (i === queries.length - 1) {
            throw e; // Last query failed, throw error
          }
        }
      }
      return null;
    };

    try {
      const lastId = await storage.getItem(`lastSnapshotId-${activeScope}`);
      if (lastId) {
        const encodedId = encodeURIComponent(lastId);
        const byIdUrl = `/rest/v1/slate_snapshots?select=id,scope,horizons_present_json,weights_json,top_k_straights_json,top_k_boxes_json,components_json,updated_at_et&deleted_at=is.null&id=eq.${encodedId}&limit=1`;
        console.log('[useSnapshot] Attempting fetch-by-id first:', { lastId });
        try {
          const rowsById = await tryQuery(byIdUrl);
          if (Array.isArray(rowsById) && rowsById.length > 0) {
            const row = rowsById[0] as any;
            const normalizedId: SlateSnapshot = {
              ...row,
              scope: normalizeScope(row.scope),
              top_k_straights_json: parseTopK(row.top_k_straights_json) as TopKStraightRow[] | string[],
              top_k_boxes_json: Array.isArray(row.top_k_boxes_json) ? row.top_k_boxes_json : parseTopK(row.top_k_boxes_json as unknown) as unknown as any[],
              hash: ((row as any).snapshot_hash || (row as any).hash) as string | undefined,
            };
            console.log('[useSnapshot] By-id snapshot:', { id: normalizedId.id, scope: normalizedId.scope, hash: normalizedId.hash?.slice(0,8) });
            return normalizedId;
          }
        } catch (e) {
          console.log('[useSnapshot] fetch-by-id failed, falling back to latest', String(e instanceof Error ? e.message : e));
        }
      }
    } catch (e) {
      console.log('[useSnapshot] read lastSnapshotId error', e);
    }

    const viewsToTry = [
      // Primary query using the view (fastest)
      `/rest/v1/v_latest_slate_snapshots?select=*&scope=eq.${encodedScope}&limit=1`,
      // Direct table query with proper ordering
      `/rest/v1/slate_snapshots?select=*&scope=eq.${encodedScope}&deleted_at=is.null&order=updated_at_et.desc.nullslast,id.desc&limit=1`,
      // Fallback without deleted_at filter
      `/rest/v1/slate_snapshots?select=*&scope=eq.${encodedScope}&order=updated_at_et.desc.nullslast,id.desc&limit=1`,
      // Final fallback with minimal constraints
      `/rest/v1/slate_snapshots?select=*&scope=eq.${encodedScope}&limit=1`,
    ] as const;

    for (let i = 0; i < viewsToTry.length; i += 1) {
      const url = viewsToTry[i];
      console.log('[useSnapshot] Trying URL:', url);
      try {
        const rows = await tryQuery(url);
        console.log('[useSnapshot] Query result:', {
          viewIndex: i,
          rowCount: Array.isArray(rows) ? rows.length : 0,
          firstRowSample: Array.isArray(rows) && rows.length > 0 ? {
            id: rows[0]?.id,
            scope: rows[0]?.scope,
            hash: (rows[0] as any)?.snapshot_hash?.slice(0, 8),
            topKLength: Array.isArray(rows[0]?.top_k_straights_json) ? rows[0].top_k_straights_json.length : 0,
            updatedAt: rows[0]?.updated_at_et
          } : null
        });
        
        if (Array.isArray(rows) && rows.length > 0) {
          const row = rows[0] as any;
          const normalized: SlateSnapshot = {
            ...row,
            scope: normalizeScope(row.scope),
            top_k_straights_json: parseTopK(row.top_k_straights_json) as TopKStraightRow[] | string[],
            top_k_boxes_json: Array.isArray(row.top_k_boxes_json) ? row.top_k_boxes_json : parseTopK(row.top_k_boxes_json as unknown) as unknown as any[],
            hash: ((row as any).snapshot_hash || (row as any).hash) as string | undefined,
          };
          console.log('[useSnapshot] Returning normalized snapshot:', {
            id: normalized.id,
            scope: normalized.scope,
            hash: normalized.hash?.slice(0, 8),
            topKCount: Array.isArray(normalized.top_k_straights_json) ? normalized.top_k_straights_json.length : 0
          });
          return normalized;
        }
      } catch (e) {
        console.log('[useSnapshot] view read failed, trying fallback', { viewIndex: i, error: String(e instanceof Error ? e.message : e) });
      }
    }
    console.log('[useSnapshot] No snapshot found for scope:', activeScope);
    try {
      console.log('[useSnapshot] Trying audit_logs fallback for scope:', activeScope);
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
          console.log('[useSnapshot] Using audit_logs fallback snapshot:', { id: normalized.id, scope: normalized.scope, hash: normalized.hash?.slice(0,8) });
          return normalized;
        }
      }
      console.log('[useSnapshot] No audit_logs fallback snapshot available for scope:', activeScope);
    } catch (e) {
      console.log('[useSnapshot] Audit fallback read error:', e);
    }
    return null;
  };

  const snapshotQuery = useQuery<SlateSnapshot | null>({
    queryKey: ['snapshot', scope],
    queryFn: async () => {
      console.log('[useSnapshot] Fetching snapshot for scope:', scope);
      try {
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
    staleTime: 30 * 1000, // Cache for 30 seconds to reduce unnecessary requests
    gcTime: 5 * 60 * 1000,
    retry: 3, // Increased retries for better reliability
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: null,
    networkMode: 'online',
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
    const totalHorizons = Object.keys(snapshot.horizons_present_json).length;
    const presentHorizons = Object.values(snapshot.horizons_present_json).filter(Boolean).length;
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
    const result = {
      snapshot,
      isLoading: snapshotQuery.isLoading && !isInitialized,
      lastUpdate,
      coveragePercentage,
      refreshSnapshot,
      hasLiveData,
    };

    console.log('[useSnapshot] Returning state:', {
      hasSnapshot: !!snapshot,
      isLoading: result.isLoading,
      hasLiveData,
      scope,
      lastUpdate
    });

    return result;
  }, [snapshot, snapshotQuery.isLoading, isInitialized, lastUpdate, coveragePercentage, refreshSnapshot, hasLiveData, scope]);
});
