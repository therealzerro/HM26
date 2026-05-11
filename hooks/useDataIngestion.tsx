import createContextHook from '@nkzw/create-context-hook';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { fetchFromSupabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Scope, HorizonLabel, Import, AuditLog, ImportSummary, RegenerateResult } from '@/types/core';
import { runHitDetectionForDates } from '@/lib/hitDetection';
// HitDetectionResult from lib: { totalHits, scopeResults, ran }
type HitDetectionResult = { totalHits: number; scopeResults: Record<string, number>; ran: boolean };
import { useScope } from '@/hooks/useScope';
import { computeSlate } from '@/engines/zk6';
import { HORIZON_WEIGHTS } from '@/constants/zk6';
import { storage } from '@/lib/storage';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';

interface DataIngestionState {
  importHistory: (data: HistoryImportData) => Promise<ImportSummary>;
  importDailyInput: (data: DailyInputData) => Promise<ImportSummary>;
  importLedger: (data: LedgerImportData) => Promise<ImportSummary>;
  softDeleteImport: (id: string) => Promise<void>;
  undoSoftDeleteImport: (id: string) => Promise<void>;
  hardDeleteImport: (id: string, importType?: string) => Promise<string>;
  clearAllImports: () => Promise<string>;
  imports: Import[];
  auditLogs: AuditLog[];
  isLoading: boolean;
  healthMetrics: HealthMetrics | null;
  refreshHealth: () => Promise<void>;
  checkSlateLock: (scope: Scope, date?: string) => Promise<boolean>;
  regenerateSlate: (scope: Scope, weightsKey?: 'balanced' | 'conservative' | 'aggressive', force?: boolean, date?: string) => Promise<RegenerateResult>;
  lastImportSummary: ImportSummary | null;
  runHitDetectionAndRefresh: (dates?: string[]) => Promise<HitDetectionResult>;
}

interface HistoryImportData {
  type: 'box_history' | 'pair_history';
  classId: number;
  horizonLabel: HorizonLabel;
  scope: Scope;
  jurisdiction?: string;
  rows: {
    key: string;
    timesDrawn: number;
    lastSeen: string;
    drawsSince: number;
  }[];
}

interface DailyInputData {
  scope: Scope;
  combos: string[];
  import_date?: string;
  file_meta?: Record<string, any>;
}

interface LedgerImportData {
  scope: Scope;
  entries: {
    jurisdiction: string;
    game: string;
    date_et: string;
    session: 'midday' | 'evening' | 'morning' | 'night';
    result_digits: string;
  }[];
}

interface HealthMetrics {
  lastPercentileRefresh: string | null;
  winsorizedCounts: Record<string, number>;
  missingHorizons: { classId: number; scope: Scope; missing: HorizonLabel[] }[];
  recentErrors: string[];
  datasetCounts: {
    boxEntries: number;
    pairEntries: number;
    percentileMaps: number;
    horizonBlends: number;
    dailyImports: number;
    ledgerImports: number;
  };
}

export const [DataIngestionProvider, useDataIngestion] = createContextHook<DataIngestionState>(() => {
  const { user } = useAuth();
  const { scope: selectedScope } = useScope();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-fA-F-]{36}$/.test(v);
  const getActorId = (): string | null => {
    const id = user?.id;
    if (!id) return null;
    if (id === 'default') return null;
    return isUuid(id) ? id : null;
  };

  const safeDateOrNull = (value: string | null | undefined): string | null => {
    const s = String(value ?? '').trim();
    if (!s) return null;
    
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const MONTH_MAP: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    
    try {
      // 1. Handle "Fri, Sep 26, 2025" or "Sep 26, 2025"
      const alphaMatch = s.match(/(?:[A-Za-z]{3,},?\s+)?([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})/i);
      if (alphaMatch) {
        const month = MONTH_MAP[alphaMatch[1].toLowerCase().slice(0, 3)];
        if (month) {
          return `${alphaMatch[3]}-${month}-${alphaMatch[2].padStart(2, '0')}`;
        }
      }
      
      // 2. Handle "YYYY-MM-DD" or "YYYY/MM/DD"
      const isoMatch = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
      }
      
      // 3. Handle "MM/DD/YYYY" or "MM-DD-YYYY"
      const usMatch = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (usMatch) {
        return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
      }
      
      // 4. Fallback to native Date but use local components to avoid UTC shifts
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    } catch (e) {
      console.log('[safeDateOrNull] Exception:', s, e);
    }
    
    return null;
  };

  const importsQuery = useQuery<Import[]>({
    queryKey: ['imports', isAdmin, selectedScope],
    queryFn: async () => {
      if (!isAdmin) return [];
      try {
        const scopeFilter = `eq.${encodeURIComponent(selectedScope)}`;
        const url = `/rest/v1/imports?select=*` +
          `&scope=${scopeFilter}` +
          `&order=created_at.desc&limit=100`;
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Imports fetch timeout')), 2000);
        });
        return await Promise.race([
          fetchFromSupabase<Import[]>({ path: url }),
          timeoutPromise,
        ]);
      } catch (error) {
        console.log('[useDataIngestion] Imports fetch error:', error);
        return [];
      }
    },
    enabled: isAdmin,
    staleTime: 30 * 1000,
    retry: 0,
    networkMode: 'offlineFirst',
  });

  const auditQuery = useQuery<AuditLog[]>({
    queryKey: ['audit_logs', isAdmin],
    queryFn: async () => {
      if (!isAdmin) return [];
      try {
        const url = '/rest/v1/audit_logs?select=*&order=created_at.desc&limit=100';
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Audit logs fetch timeout')), 2000);
        });
        return await Promise.race([
          fetchFromSupabase<AuditLog[]>({ path: url }),
          timeoutPromise,
        ]);
      } catch (error) {
        console.log('[useDataIngestion] Audit logs fetch error:', error);
        return [];
      }
    },
    enabled: isAdmin,
    staleTime: 30 * 1000,
    retry: 0,
    networkMode: 'offlineFirst',
  });

  const healthQuery = useQuery<HealthMetrics | null>({
    queryKey: ['health_metrics', isAdmin, selectedScope],
    queryFn: async (): Promise<HealthMetrics | null> => {
      if (!isAdmin) return null;
      try {
        const scopeFilter = `&scope=eq.${encodeURIComponent(selectedScope)}`;
        const deletedFilter = `&deleted_at=is.null`;
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Health metrics fetch timeout')), 3000);
        });
        const [boxCount, pairCount, percentileCount, blendCount, dailyCount, ledgerCount] = await Promise.race([
          Promise.allSettled([
            fetchFromSupabase<any[]>({ path: `/rest/v1/datasets_box?select=id${scopeFilter}${deletedFilter}&limit=2000` }),
            fetchFromSupabase<any[]>({ path: `/rest/v1/datasets_pair?select=id${scopeFilter}${deletedFilter}&limit=5000` }),
            fetchFromSupabase<any[]>({ path: `/rest/v1/percentile_maps?select=id${scopeFilter}${deletedFilter}&limit=200` }),
            fetchFromSupabase<any[]>({ path: `/rest/v1/horizon_blends?select=id${scopeFilter}${deletedFilter}&limit=200` }),
            fetchFromSupabase<any[]>({ path: `/rest/v1/imports?select=id${scopeFilter}&type=eq.daily_input&status=eq.completed&limit=2000` }),
            fetchFromSupabase<any[]>({ path: `/rest/v1/imports?select=id${scopeFilter}&type=eq.ledger&status=eq.completed&limit=2000` }),
          ]),
          timeoutPromise,
        ]);
        let errorLogs: AuditLog[] = [];
        try {
          const auditTimeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Audit logs timeout')), 1000);
          });
          errorLogs = await Promise.race([
            fetchFromSupabase<AuditLog[]>({ path: `/rest/v1/audit_logs?select=*&order=created_at.desc&limit=50` }),
            auditTimeoutPromise,
          ]);
        } catch (auditError) {
          console.log('[useDataIngestion] Audit logs fetch error:', auditError);
        }
        return {
          lastPercentileRefresh: null,
          winsorizedCounts: {},
          missingHorizons: [],
          recentErrors: errorLogs.map(log => log.payload_meta?.error || 'Unknown error'),
          datasetCounts: {
            boxEntries: boxCount.status === 'fulfilled' && Array.isArray(boxCount.value) ? boxCount.value.length : 0,
            pairEntries: pairCount.status === 'fulfilled' && Array.isArray(pairCount.value) ? pairCount.value.length : 0,
            percentileMaps: percentileCount.status === 'fulfilled' && Array.isArray(percentileCount.value) ? percentileCount.value.length : 0,
            horizonBlends: blendCount.status === 'fulfilled' && Array.isArray(blendCount.value) ? blendCount.value.length : 0,
            dailyImports: dailyCount.status === 'fulfilled' && Array.isArray(dailyCount.value) ? dailyCount.value.length : 0,
            ledgerImports: ledgerCount.status === 'fulfilled' && Array.isArray(ledgerCount.value) ? ledgerCount.value.length : 0,
          }
        };
      } catch (error) {
        console.log('[useDataIngestion] Health metrics error:', error);
        return null;
      }
    },
    enabled: isAdmin,
    staleTime: 60 * 1000,
    retry: 0,
    networkMode: 'offlineFirst',
  });

  const toCanonicalH = (h: string): HorizonLabel => {
    const upper = String(h ?? '').toUpperCase().trim();
    const m = upper.match(/^H0*([0-9]{1,2})Y$/);
    if (!m) throw new Error(`Invalid horizon_label: ${h}`);
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n) || n < 1 || n > 10) throw new Error(`Invalid horizon number: ${h}`);
    return (`H${String(n).padStart(2, '0')}Y`) as HorizonLabel;
  };

  const importHistoryMutation = useMutation<ImportSummary, Error, HistoryImportData>({
    mutationFn: async (data: HistoryImportData) => {
      if (!isAdmin) throw new Error('Admin access required');
      const canonH = toCanonicalH(data.horizonLabel);
      console.log('[useDataIngestion] Importing history:', data.type, data.classId, canonH, data.scope);

      const importRecord = {
        type: data.type,
        class_id: data.classId,
        horizon_label: canonH,
        scope: data.scope,
        file_meta: { rowCount: data.rows.length },
        counts: data.rows.length,
        status: 'processing',
        created_by: getActorId()
      };

      const importRes = await fetchFromSupabase<Import[] | Import>({
        path: '/rest/v1/imports',
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: importRecord
      });
      const importId = Array.isArray(importRes) ? importRes[0]?.id : (importRes as Import | undefined)?.id;
      if (!importId) throw new Error('Import creation did not return an ID');

      try {
        if (data.type === 'box_history' || data.type === 'pair_history') {
          const dsValues = data.rows.map(row => row.drawsSince);
          const sorted = [...dsValues].sort((a, b) => a - b);
          const p99Cap = Math.ceil(sorted[Math.floor(sorted.length * 0.99)] || 100);
          const maxDs = Math.max(...dsValues);

          const targetClassId = data.type === 'box_history' ? 1 : data.classId;
          console.log('[import] override-delete previous horizon datasets', { classId: targetClassId, scope: data.scope, horizon: canonH });
          try {
            if (data.type === 'box_history') {
              await fetchFromSupabase({ path: `/rest/v1/datasets_box?class_id=eq.1&scope=eq.${encodeURIComponent(data.scope)}&horizon_label=eq.${encodeURIComponent(canonH)}&jurisdiction=${data.jurisdiction ? `eq.${data.jurisdiction}` : 'is.null'}`, method: 'DELETE' });
            } else {
              await fetchFromSupabase({ path: `/rest/v1/datasets_pair?class_id=eq.${targetClassId}&scope=eq.${encodeURIComponent(data.scope)}&horizon_label=eq.${encodeURIComponent(canonH)}&jurisdiction=${data.jurisdiction ? `eq.${data.jurisdiction}` : 'is.null'}`, method: 'DELETE' });
            }
          } catch (preDelErr) {
            console.log('[import] pre-delete warning (continuing):', preDelErr);
          }
          try {
            await fetchFromSupabase({ path: `/rest/v1/percentile_maps?class_id=eq.${targetClassId}&scope=eq.${encodeURIComponent(data.scope)}&horizon_label=eq.${encodeURIComponent(canonH)}`, method: 'DELETE' });
          } catch (preDelPercErr) {
            console.log('[import] pre-delete percentile map warning (continuing):', preDelPercErr);
          }

          const makeRecords = () => data.rows.map(row => {
            const clampedDs = Math.min(row.drawsSince, p99Cap);
            const normalized = maxDs > 0 ? 1 - (clampedDs / maxDs) : 0;
            return data.type === 'box_history' ? {
              import_id: importId,
              class_id: 1,
              scope: data.scope,
              horizon_label: canonH,
              key: row.key,
              jurisdiction: data.jurisdiction ?? null,
              ds_raw: row.drawsSince,
              ds_normalized: normalized,
              times_drawn: row.timesDrawn,
              last_seen: safeDateOrNull(row.lastSeen),
            } : {
              import_id: importId,
              class_id: data.classId,
              scope: data.scope,
              horizon_label: canonH,
              key: row.key,
              jurisdiction: data.jurisdiction ?? null,
              ds_raw: row.drawsSince,
              ds_normalized: normalized,
              times_drawn: row.timesDrawn,
              last_seen: safeDateOrNull(row.lastSeen),
            };
          });

          const records = makeRecords();
          const chunkSize = data.type === 'pair_history' ? 500 : 1500;
          const chunks: typeof records[] = [];
          for (let i = 0; i < records.length; i += chunkSize) {
            chunks.push(records.slice(i, i + chunkSize));
          }

          const postPath = data.type === 'box_history'
            ? '/rest/v1/datasets_box?on_conflict=class_id,scope,horizon_label,key'
            : '/rest/v1/datasets_pair?on_conflict=class_id,scope,horizon_label,key';

          const tryBatch = async (batch: typeof records, attempt: number): Promise<void> => {
            const started = Date.now();
            try {
              const payloadBytes = new Blob([JSON.stringify(batch)]).size;
              console.log('[import] batch start', { rows: batch.length, payloadBytes });
              await fetchFromSupabase({
                path: postPath,
                method: 'POST',
                headers: { 'Prefer': 'resolution=merge-duplicates' },
                body: batch,
              });
              console.log('[import] batch ok', { rows: batch.length, ms: Date.now() - started });
            } catch (e) {
              const msg = String(e instanceof Error ? e.message : e);
              const isRetryable = /429|5\d\d/.test(msg);
              console.log('[import] batch failed', { attempt, msg });
              if (isRetryable && attempt < 3) {
                const backoff = Math.pow(2, attempt) * 500;
                await new Promise(r => setTimeout(r, backoff));
                return tryBatch(batch, attempt + 1);
              }
              await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${importId}`, method: 'PATCH', body: { status: 'failed', error_text: msg } });
              throw e;
            }
          };

          for (const batch of chunks) {
            await tryBatch(batch, 0);
          }

          const percentileMap: Record<string, number> = {};
          data.rows.forEach(row => {
            const clampedDs = Math.min(row.drawsSince, p99Cap);
            const normalized = maxDs > 0 ? 1 - (clampedDs / maxDs) : 0;
            percentileMap[row.key] = normalized;
          });

          await fetchFromSupabase({
            path: '/rest/v1/percentile_maps?on_conflict=class_id,scope,horizon_label',
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: {
              import_id: importId,
              class_id: targetClassId,
              scope: data.scope,
              horizon_label: canonH,
              p99_cap: p99Cap,
              percentile_map: percentileMap,
            }
          });

          // Build full available horizons for this class/scope from percentile_maps
          let availableHorizons: HorizonLabel[] = [canonH];
          try {
            const pmRows = await fetchFromSupabase<Array<{ horizon_label: string }>>({
              path: `/rest/v1/percentile_maps?select=horizon_label&class_id=eq.${targetClassId}&scope=eq.${encodeURIComponent(data.scope)}&deleted_at=is.null&limit=50`
            });
            const set = new Set<HorizonLabel>([canonH]);
            (pmRows || []).forEach(r => {
              const upper = String(r?.horizon_label ?? '').toUpperCase();
              const m = upper.match(/^H0*([0-9]{1,2})Y$/);
              if (m) {
                const n = parseInt(m[1], 10);
                if (n >= 1 && n <= 10) set.add((`H${String(n).padStart(2, '0')}Y`) as HorizonLabel);
              }
            });
            availableHorizons = Array.from(set).sort();
          } catch (mergeErr) {
            console.log('[import] percentile_maps scan warn:', mergeErr);
          }

          const weights: Record<HorizonLabel, number> = {} as Record<HorizonLabel, number>;
          availableHorizons.forEach(h => { weights[h] = HORIZON_WEIGHTS[h] ?? 0; });

          await fetchFromSupabase({
            path: '/rest/v1/horizon_blends?on_conflict=class_id,scope',
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: {
              import_id: importId,
              class_id: targetClassId,
              scope: data.scope,
              available_horizons: availableHorizons,
              weights,
            }
          });

          await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${importId}`, method: 'PATCH', body: { status: 'completed' } });

          const dates = data.rows.map(r => r.lastSeen).filter(Boolean);
          const sortedDates = [...dates].sort();
          const summary: ImportSummary = {
            id: importId,
            type: data.type,
            class_id: data.classId,
            horizon_label: canonH,
            scope: data.scope,
            accepted: data.rows.length,
            rejected: 0,
            fixed: 0,
            warnings: [],
            p99_cap: p99Cap,
            first_seen: sortedDates[0],
            last_seen: sortedDates[sortedDates.length - 1],
          };

          await fetchFromSupabase({
            path: '/rest/v1/audit_logs',
            method: 'POST',
            body: {
              actor_id: getActorId(),
              action: 'import_history',
              target: `${data.type}-${data.classId}-${canonH}-${data.scope}`,
              payload_meta: { counts: data.rows.length, overrideDelete: true },
            }
          });

          return summary;
        }
        throw new Error('Unsupported history import type');
      } catch (e) {
        const message = String(e instanceof Error ? e.message : e);
        try {
          await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${importId}`, method: 'PATCH', body: { status: 'failed', error_text: message } });
        } catch {}
        throw new Error(message);
      }
    },
    onSuccess: (data) => {
      console.log('[useDataIngestion] Import successful, invalidating caches for scope:', data.scope);
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      queryClient.invalidateQueries({ queryKey: ['imports', true, data.scope] });
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] });
      queryClient.invalidateQueries({ queryKey: ['health_metrics'] });
      queryClient.invalidateQueries({ queryKey: ['snapshot', data.scope] });
      queryClient.invalidateQueries({ queryKey: ['coverage', data.scope] });
      queryClient.invalidateQueries({ queryKey: ['v_recent_ledger'] });
      queryClient.invalidateQueries({ queryKey: ['daily_intelligence_hits'] });
      // Force refetch coverage specifically for the imported scope
      queryClient.refetchQueries({ queryKey: ['coverage', data.scope] });
    }
  });

  const importDailyMutation = useMutation<ImportSummary, Error, DailyInputData>({
    mutationFn: async (data: DailyInputData) => {
      if (!isAdmin) throw new Error('Admin access required');
      console.log('[useDataIngestion] Importing daily input:', data.scope, data.combos.length);

      const importRec = await fetchFromSupabase<Import[] | Import>({
        path: '/rest/v1/imports',
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: {
          type: 'daily_input',
          scope: data.scope,
          counts: data.combos.length,
          status: 'processing',
          created_by: getActorId(),
          ...(data.file_meta ? { file_meta: data.file_meta } : {}),
        }
      });
      const importId = Array.isArray(importRec) ? importRec[0]?.id : (importRec as Import | undefined)?.id;
      if (!importId) throw new Error('Import creation did not return an ID');

      try {
        // Build set of hit combosets from today's draws (sorted digits form)
        const hitSets = new Set<string>(
          data.combos.map(c => '{' + c.split('').sort().join(',') + '}')
        );
        // Also store plain 3-digit forms for flexible matching
        const hitCombos = new Set<string>(data.combos.map(c => c.replace(/\D/g, '').slice(0, 3)));

        // Fetch all box rows for this scope (H01Y only — the active horizon)
        const enc = encodeURIComponent(data.scope);
        const boxRows = await fetchFromSupabase<Array<{ key: string; draws_since?: number; ds_raw?: number }>>({
          path: `/rest/v1/datasets_box?class_id=eq.1&scope=eq.${enc}&horizon_label=eq.H01Y&deleted_at=is.null&select=key,draws_since,ds_raw&limit=10000`,
        });

        if (Array.isArray(boxRows) && boxRows.length > 0) {
          // Compute updated draws_since for each row
          const updated = boxRows.map(row => {
            const keyDigits = (row.key.match(/\d/g) ?? []).join('').slice(0, 3);
            const keySet = keyDigits.length === 3 ? '{' + keyDigits.split('').sort().join(',') + '}' : row.key;
            const isHit = hitSets.has(keySet) || hitCombos.has(keyDigits);
            const currentDs = row.draws_since ?? row.ds_raw ?? 0;
            return {
              key: row.key,
              draws_since: isHit ? 0 : currentDs + 1,
            };
          });

          // Batch upsert in chunks of 500
          const BATCH = 500;
          for (let i = 0; i < updated.length; i += BATCH) {
            const chunk = updated.slice(i, i + BATCH).map(r => ({
              class_id: 1,
              scope: data.scope,
              horizon_label: 'H01Y',
              key: r.key,
              draws_since: r.draws_since,
            }));
            try {
              await fetchFromSupabase({
                path: '/rest/v1/datasets_box?on_conflict=class_id,scope,horizon_label,key',
                method: 'POST',
                headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                body: chunk,
              });
            } catch (batchErr) {
              console.log('[importDaily] batch upsert warn:', batchErr);
            }
          }
          console.log('[importDaily] Updated draws_since for', updated.length, 'box rows');
        }

        await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${importId}`, method: 'PATCH', body: { status: 'completed' } });
        await fetchFromSupabase({
          path: '/rest/v1/audit_logs',
          method: 'POST',
          body: {
            actor_id: getActorId(),
            action: 'import_daily',
            target: data.scope,
            payload_meta: { comboCount: data.combos.length },
          }
        });

        const summary: ImportSummary = {
          id: importId,
          type: 'daily_input',
          accepted: data.combos.length,
          rejected: 0,
          fixed: 0,
          warnings: [],
        } as ImportSummary;
        return summary;
      } catch (e) {
        const message = String(e instanceof Error ? e.message : e);
        try {
          await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${importId}`, method: 'PATCH', body: { status: 'failed', error_text: message } });
        } catch {}
        throw new Error(message);
      }
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['snapshot'] });
      queryClient.invalidateQueries({ queryKey: ['snapshot'] });
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] });
      queryClient.invalidateQueries({ queryKey: ['coverage'] });
      queryClient.invalidateQueries({ queryKey: ['v_recent_ledger'] });
      queryClient.invalidateQueries({ queryKey: ['daily_intelligence_hits'] });
    }
  });

  // ── runHitDetectionAndRefresh ─────────────────────────────────────────────────
  // Delegates to lib/hitDetection.ts for the core hit/snapshot/intelligence logic.
  // The ledger-specific pair draws_since RPC is kept here since it is only relevant
  // to the ledger import flow and not to admin-triggered hit detection.
  const runHitDetectionAndRefresh = useCallback(async (dates?: string[]): Promise<HitDetectionResult> => {
    const today = getTodayET();
    const checkDates = (dates && dates.length > 0) ? dates : [today];
    try {
      const result = await runHitDetectionForDates(checkDates);

      if (result.totalHits > 0) {
        queryClient.invalidateQueries({ queryKey: ['snapshot'] });
        queryClient.invalidateQueries({ queryKey: ['daily_intelligence_hits'] });
      }

      // Update pair draws_since from results — ledger-import only side effect.
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      const pairHeaders: Record<string, string> = {
        'apikey': supabaseKey ?? '',
        'Authorization': 'Bearer ' + (supabaseKey ?? ''),
        'Content-Type': 'application/json',
      };
      for (const importedDate of checkDates) {
        for (const sc of ['midday', 'evening', 'allday']) {
          try {
            const res = await fetch(
              (supabaseUrl ?? '') + '/rest/v1/rpc/update_pair_draws_since_from_results',
              { method: 'POST', headers: pairHeaders, body: JSON.stringify({ p_scope: sc, p_date_et: importedDate }) },
            );
            const data = await res.json();
            console.log('Pair update ' + sc + ' ' + importedDate + ':', data);
          } catch (e) {
            console.log('Pair update failed for ' + sc + ' ' + importedDate + ':', e);
          }
        }
      }

      return result;
    } catch (e) {
      console.log('[hitDetect] error:', e);
      return { totalHits: 0, scopeResults: {}, ran: false };
    }
  }, [queryClient]);

  const importLedgerMutation = useMutation<ImportSummary, Error, LedgerImportData>({
    mutationFn: async (data: LedgerImportData) => {
      if (!isAdmin) throw new Error('Admin access required');
      console.log('[useDataIngestion] Importing ledger:', data.scope, data.entries.length);

      const importRec = await fetchFromSupabase<Import[] | Import>({
        path: '/rest/v1/imports',
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: {
          type: 'ledger',
          scope: data.scope,
          counts: data.entries.length,
          status: 'processing',
          created_by: getActorId(),
        }
      });
      const importRecId = Array.isArray(importRec) ? importRec[0]?.id : (importRec as Import | undefined)?.id;
      if (!importRecId) throw new Error('Import creation did not return an ID');

      let accepted = 0;
      let rejected = 0;
      const errors: string[] = [];
      
      try {
        const validEntries: any[] = [];
        const seenDates = new Set<string>();

        for (const entry of data.entries) {
          // Validate entry has required fields
          if (!entry.jurisdiction || !entry.game || !entry.date_et || !entry.session || !entry.result_digits) {
            console.warn('[importLedger] Skipping entry with missing fields:', entry);
            rejected++;
            errors.push(`Missing required fields: ${JSON.stringify(entry)}`);
            continue;
          }
          
          // Validate result_digits is exactly 3 digits
          if (!/^\d{3}$/.test(entry.result_digits)) {
            console.warn('[importLedger] Skipping entry with invalid result_digits:', entry.result_digits);
            rejected++;
            errors.push(`Invalid result_digits "${entry.result_digits}" - must be exactly 3 digits`);
            continue;
          }
          
          const dateEt = safeDateOrNull(entry.date_et);
          if (!dateEt) {
            rejected++;
            errors.push(`Invalid date format: "${entry.date_et}"`);
            continue;
          }
          
          seenDates.add(dateEt);
          validEntries.push({
            jurisdiction: entry.jurisdiction,
            game: entry.game,
            date_et: dateEt,
            session: entry.session === 'morning' ? 'midday' : entry.session === 'night' ? 'evening' : entry.session,
            result_digits: entry.result_digits,
            comboset_sorted: `{${entry.result_digits.split('').sort().join(',')}}`
          });
        }

        // Batch insert in chunks of 50
        const BATCH_SIZE = 50;
        for (let i = 0; i < validEntries.length; i += BATCH_SIZE) {
          const chunk = validEntries.slice(i, i + BATCH_SIZE);
          try {
            await fetchFromSupabase({
              path: '/rest/v1/histories?on_conflict=jurisdiction,game,date_et,session',
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
              body: chunk
            });
            accepted += chunk.length;
          } catch (insertError) {
            console.error('[importLedger] Batch insert failed:', insertError);
            rejected += chunk.length;
            errors.push(`Batch insert failed: ${String(insertError)}`);
          }
        }

        await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${importRecId}`, method: 'PATCH', body: { status: 'completed' } });
        
        const importedDates = Array.from(seenDates);
        const summary: ImportSummary = {
          id: importRecId,
          type: 'ledger',
          accepted,
          rejected,
          fixed: 0,
          warnings: errors.slice(0, 10),
          importedDates,
        } as ImportSummary;
        await fetchFromSupabase({ 
          path: '/rest/v1/audit_logs', 
          method: 'POST', 
          body: { 
            actor_id: getActorId(), 
            action: 'import_ledger', 
            target: data.scope, 
            payload_meta: { 
              entryCount: data.entries.length, 
              accepted, 
              rejected, 
              errors: errors.slice(0, 5)
            } 
          } 
        });

        // ── B. Hit detection — MUST be awaited to avoid race condition ──
        // This ensures detectHits only fires after successful 200 OK from DB.
        try {
          await runHitDetectionAndRefresh(importedDates.length > 0 ? importedDates : undefined);
        } catch (e) {
          console.log('[importLedger] hit detection error:', e);
        }

        console.log('[importLedger] Import completed:', { accepted, rejected, total: data.entries.length });
        return summary;
      } catch (e) {
        const message = String(e instanceof Error ? e.message : e);
        try {
          await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${importRecId}`, method: 'PATCH', body: { status: 'failed', error_text: message } });
        } catch {}
        throw new Error(message);
      }
    },
    onSuccess: () => {
      console.log('[importLedger] Success, invalidating caches');
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] });
      queryClient.invalidateQueries({ queryKey: ['snapshot'] });
      queryClient.invalidateQueries({ queryKey: ['coverage'] });
      queryClient.invalidateQueries({ queryKey: ['histories'] });
      queryClient.invalidateQueries({ queryKey: ['v_recent_ledger'] });
      queryClient.invalidateQueries({ queryKey: ['daily_intelligence_hits'] });
      queryClient.refetchQueries({ queryKey: ['histories'] });
    }
  });

  const checkSlateLock = useCallback(async (scope: Scope, date?: string): Promise<boolean> => {
    const checkDate = date || getTodayET();
    try {
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/daily_intelligence?select=id&slate_date=eq.${checkDate}&scope=eq.${scope}&or=(hit_box.eq.true,hit_straight.eq.true)&limit=1`
      });
      return Array.isArray(rows) && rows.length > 0;
    } catch (e) {
      console.log('[checkSlateLock] error:', e);
      return false;
    }
  }, []);

  const regenerateMutation = useMutation<RegenerateResult, Error, { scope: Scope; weightsKey?: string; force?: boolean; date?: string }>({
    mutationFn: async ({ scope: _rawScope, weightsKey = 'balanced', force = false, date }): Promise<RegenerateResult> => {
      // Normalize scope to DB canonical form (allday/midday/evening) before any query
      const scope: Scope = (_rawScope.toLowerCase().replace(/[-\s_]/g, '') || 'allday') as Scope;
      if (!isAdmin) return { status: 'error', message: 'Admin access required', scope };
      
      const today = date || getTodayET();
      if (!force) {
        const isLocked = await checkSlateLock(scope, today);
        if (isLocked) {
          return { status: 'error', message: `SLATE LOCKED: Hits already recorded for ${scope} on ${today}. Use force to overwrite.`, scope };
        }
      }

      console.log(`[useDataIngestion] ${force ? 'FORCED ' : ''}Regenerating slate for scope:`, scope, '(raw:', _rawScope, ')');

      const scopeFilter = `eq.${encodeURIComponent(scope)}`;

      try {
        const active = await fetchFromSupabase<Import[]>({ path: `/rest/v1/imports?select=id,status&status=eq.processing&scope=${scopeFilter}&limit=1` });
        if (Array.isArray(active) && active.length > 0) return { status: 'busy', message: 'Materializer busy with active imports', scope };
      } catch (e) {
        console.log('[regenerate] busy-check warn', e);
      }

      const classChecks = await Promise.all(
        Array.from({ length: 11 }, (_, i) => i + 1).map(async (cid) => {
          const basePath = cid === 1 ? 'datasets_box' : 'datasets_pair';
          const classFilter = cid === 1 ? 'class_id=eq.1' : `class_id=eq.${cid}`;
          const url = `/rest/v1/${basePath}?select=id&${classFilter}&scope=${scopeFilter}&horizon_label=eq.H01Y&deleted_at=is.null&jurisdiction=is.null&limit=1`;
          try {
            const rows = await fetchFromSupabase<any[]>({ path: url });
            return { cid, ok: Array.isArray(rows) && rows.length > 0 };
          } catch (e) {
            console.log('[regenerate] coverage check error', cid, e);
            return { cid, ok: false };
          }
        })
      );
      const missing = classChecks.filter(c => !c.ok).map(c => c.cid);
      if (missing.length > 0) {
        const labels: Record<number, string> = {
          1: 'Box Combination', 2: 'Front Pair Straight', 3: 'Back Pair Straight', 4: 'Split Pair Straight', 5: 'Front Pair Box', 6: 'Back Pair Box', 7: 'Split Pair Box', 8: 'Front from Box', 9: 'Back from Box', 10: 'Split from Box', 11: 'Any-Position Box'
        };
        const missLabels = missing.map(cid => labels[cid] ?? `Class ${cid}`);
        return { status: 'missing', message: `Missing H01Y: ${missLabels.join(', ')}`, scope, details: { missingH01Y: missLabels, missingClassIds: missing } };
      }

      let lastSnapshotAt: string | null = null;
      try {
        const snap = await fetchFromSupabase<any[]>({ path: `/rest/v1/v_latest_slate_snapshots?select=updated_at_et&scope=${scopeFilter}&order=updated_at_et.desc&limit=1` });
        if (Array.isArray(snap) && snap.length > 0) lastSnapshotAt = snap[0]?.updated_at_et ?? null;
      } catch (e) {
        console.log('[regenerate] snapshot lookup error', e);
      }

      const sinceCreated = lastSnapshotAt ? `&created_at=gt.${encodeURIComponent(lastSnapshotAt)}` : '';
      const sinceUpdated = lastSnapshotAt ? `&updated_at=gt.${encodeURIComponent(lastSnapshotAt)}` : '';
      let changed = true;
      try {
        const checks = await Promise.all([
          fetchFromSupabase<any[]>({ path: `/rest/v1/datasets_box?select=id&scope=${scopeFilter}${sinceCreated}&limit=1` }),
          fetchFromSupabase<any[]>({ path: `/rest/v1/datasets_pair?select=id&scope=${scopeFilter}${sinceCreated}&limit=1` }),
          fetchFromSupabase<any[]>({ path: `/rest/v1/percentile_maps?select=id&scope=${scopeFilter}${sinceUpdated}&limit=1` }),
          fetchFromSupabase<any[]>({ path: `/rest/v1/horizon_blends?select=id&scope=${scopeFilter}${sinceUpdated}&limit=1` }),
          fetchFromSupabase<any[]>({ path: `/rest/v1/imports?select=id&scope=${scopeFilter}&type=in.(daily_input,ledger)&status=eq.completed${lastSnapshotAt ? `&created_at=gt.${encodeURIComponent(lastSnapshotAt)}` : ''}&limit=1` }),
        ]);
        const anyNew = checks.some(arr => Array.isArray(arr) && arr.length > 0);
        changed = lastSnapshotAt ? anyNew : true;
      } catch (e) {
        console.log('[regenerate] delta-check warn', e);
        changed = true;
      }
      // Delta-check is advisory only — admin can always force-regenerate.

      const excluded = new Set<string>();
      const excludedComboSets = new Set<string>();
      try {
        // Exclude results from SAME DAY and PREVIOUS DAY only
        // This prevents recently drawn numbers from appearing in new slates
        const todayStr = getTodayET();
        const yesterdayStr = getYesterdayET();
        
        console.log('[regenerate] Fetching same day and previous day results for exclusion:', {
          scope,
          today: todayStr,
          yesterday: yesterdayStr
        });
        
        const winners = await fetchFromSupabase<any[]>({
          path: `/rest/v1/histories?select=result_digits,comboset_sorted,date_et,jurisdiction,session&date_et=gte.${yesterdayStr}&date_et=lte.${todayStr}&limit=500&jurisdiction=not.in.(ME,NH,VT,PR,MD,MS2)`
        });

        if (Array.isArray(winners)) {
          let excludedCount = 0;
          let todayCount = 0;
          let yesterdayCount = 0;

          winners.forEach(w => {
            if (typeof w?.result_digits === 'string' && w.result_digits.length === 3) {
              excluded.add(w.result_digits);
              excludedCount++;
              if (w.date_et === todayStr) todayCount++;
              else if (w.date_et === yesterdayStr) yesterdayCount++;
            }
            // Collect comboSets so BOX hits are also excluded (not just exact straights)
            if (typeof w?.comboset_sorted === 'string' && w.comboset_sorted) {
              excludedComboSets.add(w.comboset_sorted);
            }
          });

          console.log('[regenerate] Excluded same day and previous day results:', {
            totalResults: winners.length,
            excludedCombos: excludedCount,
            excludedComboSets: excludedComboSets.size,
            todayResults: todayCount,
            yesterdayResults: yesterdayCount,
          });
        }
      } catch (e) {
        console.log('[regenerate] winners exclusion warn', e);
      }

      try {
        const snapshot = await computeSlate({
          scope,
          weightsKey: weightsKey as any,
          targetDate: date,
          excludedCombos: excluded,
          excludeComboSets: [...excludedComboSets],
          skipHistoriesExclusion: true,  // caller already populated excluded sets
        });

        try {
          await fetchFromSupabase({ path: '/rest/v1/audit_logs', method: 'POST', body: { actor_id: getActorId(), action: force ? 'regenerate_forced' : 'regenerate_slate', target: scope, payload_meta: { hash: snapshot.hash, top: snapshot.top_k_straights_json?.slice(0, 6), snapshotId: snapshot.id, forced: force } } });
        } catch (e) {
          console.log('[regenerate] audit log error', e);
        }

        // Store the snapshot ID for fetch-by-id optimization immediately
        try { await storage.setItem(`lastSnapshotId-${scope}`, snapshot.id); } catch {}

        // Deterministic handshake: bounded polling until snapshot is visible
        const encodedId = encodeURIComponent(snapshot.id);
        let latest: any[] | null = null;
        let attempts = 0;
        const maxAttempts = 8;
        
        console.log('[regenerate] Starting bounded polling for snapshot visibility', { id: snapshot.id, hash: snapshot.hash?.slice(0, 8) });
        
        while (attempts < maxAttempts) {
          attempts++;
          const delay = attempts * 400; // 400ms, 800ms, 1200ms, etc.
          
          if (attempts > 1) {
            console.log(`[regenerate] Polling attempt ${attempts}/${maxAttempts}, waiting ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          try {
            // Try with snapshot_hash first
            latest = await fetchFromSupabase<any[]>({ path: `/rest/v1/slate_snapshots?select=id,scope,updated_at_et,top_k_straights_json,snapshot_hash&deleted_at=is.null&id=eq.${encodedId}&limit=1` });
          } catch (e) {
            const errorMsg = String(e instanceof Error ? e.message : e);
            if (errorMsg.includes('snapshot_hash') || errorMsg.includes('PGRST204')) {
              console.log('[regenerate] snapshot_hash column not found in PostgREST cache, trying without it');
              // Fallback without snapshot_hash
              try {
                latest = await fetchFromSupabase<any[]>({ path: `/rest/v1/slate_snapshots?select=id,scope,updated_at_et,top_k_straights_json&deleted_at=is.null&id=eq.${encodedId}&limit=1` });
              } catch (fallbackError) {
                console.log(`[regenerate] Attempt ${attempts} failed:`, fallbackError);
                continue;
              }
            } else {
              console.log(`[regenerate] Attempt ${attempts} failed:`, e);
              continue;
            }
          }
          
          const hasK = Array.isArray(latest) && latest[0] && ((Array.isArray(latest[0].top_k_straights_json) ? latest[0].top_k_straights_json.length : 0) > 0);
          
          console.log(`[regenerate] Attempt ${attempts} result:`, {
            found: !!latest?.[0],
            hasK,
            topKLength: Array.isArray(latest?.[0]?.top_k_straights_json) ? latest[0].top_k_straights_json.length : 0,
            hash: latest?.[0]?.snapshot_hash?.slice(0, 8)
          });
          
          if (hasK) {
            console.log(`[regenerate] Snapshot visible on attempt ${attempts}`);
            break;
          }
        }
        
        const hasK = Array.isArray(latest) && latest[0] && ((Array.isArray(latest[0].top_k_straights_json) ? latest[0].top_k_straights_json.length : 0) > 0);
        
        if (!hasK) {
          console.log('[regenerate] Warning: Snapshot not visible after polling, but continuing');
        }

        // Clear all scope storage caches so useSnapshot fetches fresh data
        for (const sc of ['allday', 'midday', 'evening']) {
          try { await storage.removeItem(`snapshot-${sc}`); } catch {}
          try { await storage.removeItem(`lastSnapshotId-${sc}`); } catch {}
        }

        // Invalidate React Query caches after storage is cleared
        queryClient.removeQueries({ queryKey: ['snapshot'] });
        queryClient.invalidateQueries({ queryKey: ['snapshot'] });
        queryClient.invalidateQueries({ queryKey: ['audit_logs'] });
        queryClient.invalidateQueries({ queryKey: ['coverage'] });

        console.log('[regenerate] regen ok', { id: snapshot.id, hash: snapshot.hash?.slice(0,8), visible: hasK, attempts });

        return { status: 'success', message: `Slate regenerated for ${scope} • hash: ${snapshot.hash?.slice(0, 8) ?? '—'}`, scope, hash: snapshot.hash, snapshotId: snapshot.id, details: { lastRun: snapshot.updated_at_et, changes: ['datasets updated'] } };
      } catch (e) {
        const raw = String(e instanceof Error ? e.message : e);
        const msg = /RLS|denied|policy/i.test(raw) ? raw : `Regeneration failed: ${raw}`;
        return { status: 'error', message: msg, scope };
      }
    },
  });

  const refreshHealth = async () => { await healthQuery.refetch(); };
  const importHistory = (data: HistoryImportData) => importHistoryMutation.mutateAsync(data);
  const importDailyInput = (data: DailyInputData) => importDailyMutation.mutateAsync(data);
  const importLedger = (data: LedgerImportData) => importLedgerMutation.mutateAsync(data);
  const regenerateSlate = async (scope: Scope, weightsKey?: 'balanced' | 'conservative' | 'aggressive', force?: boolean, date?: string): Promise<RegenerateResult> => {
    try {
      return await regenerateMutation.mutateAsync({ scope, weightsKey, force, date });
    } catch (e) {
      // mutateAsync re-throws when mutationFn rejects — convert to a result so
      // the UI always gets a RegenerateResult instead of an unhandled exception.
      const raw = String(e instanceof Error ? e.message : e);
      return { status: 'error', message: `Regeneration failed: ${raw}`, scope };
    }
  };

  const isLoading = useMemo(() => {
    return importHistoryMutation.isPending || importDailyMutation.isPending || importLedgerMutation.isPending || regenerateMutation.isPending;
  }, [importHistoryMutation.isPending, importDailyMutation.isPending, importLedgerMutation.isPending, regenerateMutation.isPending]);

  const softDeleteImport = useCallback(async (id: string) => {
    const nowIso = new Date().toISOString();
    const opts = { useServiceKey: true } as const;
    try { await fetchFromSupabase({ path: `/rest/v1/datasets_box?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: nowIso }, ...opts }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/datasets_pair?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: nowIso }, ...opts }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/percentile_maps?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: nowIso }, ...opts }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/horizon_blends?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: nowIso }, ...opts }); } catch {}
    await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${id}`, method: 'PATCH', body: { status: 'deleted', deleted_at: nowIso }, ...opts });
    try { await fetchFromSupabase({ path: `/rest/v1/audit_logs`, method: 'POST', body: { actor_id: getActorId(), action: 'SoftDelete', target: id } }); } catch {}
    queryClient.invalidateQueries({ queryKey: ['imports'] });
    queryClient.invalidateQueries({ queryKey: ['health_metrics'] });
    queryClient.invalidateQueries({ queryKey: ['coverage'] });
    queryClient.invalidateQueries({ queryKey: ['v_recent_ledger'] });
    queryClient.invalidateQueries({ queryKey: ['daily_intelligence_hits'] });
  }, [queryClient]);

  const undoSoftDeleteImport = useCallback(async (id: string) => {
    const opts = { useServiceKey: true } as const;
    try { await fetchFromSupabase({ path: `/rest/v1/datasets_box?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: null }, ...opts }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/datasets_pair?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: null }, ...opts }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/percentile_maps?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: null }, ...opts }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/horizon_blends?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: null }, ...opts }); } catch {}
    await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${id}`, method: 'PATCH', body: { status: 'completed', deleted_at: null }, ...opts });
    try { await fetchFromSupabase({ path: `/rest/v1/audit_logs`, method: 'POST', body: { actor_id: getActorId(), action: 'UndoSoftDelete', target: id } }); } catch {}
    queryClient.invalidateQueries({ queryKey: ['imports'] });
    queryClient.invalidateQueries({ queryKey: ['health_metrics'] });
    queryClient.invalidateQueries({ queryKey: ['coverage'] });
    queryClient.invalidateQueries({ queryKey: ['v_recent_ledger'] });
    queryClient.invalidateQueries({ queryKey: ['daily_intelligence_hits'] });
  }, [queryClient]);

  const hardDeleteImport = useCallback(async (id: string, importType?: string): Promise<string> => {
    const _url = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://tgagarhwqbdcwoqhpapi.supabase.co';
    const _key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnYWdhcmh3cWJkY3dvcWhwYXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NjM4NDYsImV4cCI6MjA3MzQzOTg0Nn0.n78k9_hxxk8EjYpvzPaHxeiEMueZy_ZSkE4zsq2gmXM';

    const xhrDelete = (path: string): Promise<void> => new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('DELETE', _url + path);
        xhr.setRequestHeader('apikey', _key);
        xhr.setRequestHeader('Authorization', 'Bearer ' + _key);
        xhr.onload = () => resolve();
        xhr.onerror = () => resolve();
        xhr.send();
      } catch { resolve(); }
    });

    let msg = '';
    if (importType === 'box_history') {
      await xhrDelete(`/rest/v1/datasets_box?import_id=eq.${id}`);
      await xhrDelete(`/rest/v1/percentile_maps?import_id=eq.${id}`);
      await xhrDelete(`/rest/v1/horizon_blends?import_id=eq.${id}`);
      msg = 'Deleted box dataset rows and associated aggregates.';
    } else if (importType === 'pair_history') {
      await xhrDelete(`/rest/v1/datasets_pair?import_id=eq.${id}`);
      await xhrDelete(`/rest/v1/percentile_maps?import_id=eq.${id}`);
      await xhrDelete(`/rest/v1/horizon_blends?import_id=eq.${id}`);
      msg = 'Deleted pair dataset rows and associated aggregates.';
    } else if (importType === 'ledger') {
      await xhrDelete(`/rest/v1/histories?import_id=eq.${id}`);
      msg = 'Deleted ledger result entries.';
    } else if (importType === 'daily_input') {
      msg = 'Daily input data is embedded in draws_since values and cannot be individually deleted. Re-import box history to reset. Import record removed.';
    } else {
      await xhrDelete(`/rest/v1/datasets_box?import_id=eq.${id}`);
      await xhrDelete(`/rest/v1/datasets_pair?import_id=eq.${id}`);
      await xhrDelete(`/rest/v1/percentile_maps?import_id=eq.${id}`);
      await xhrDelete(`/rest/v1/horizon_blends?import_id=eq.${id}`);
      msg = 'Deleted import and all associated dataset rows.';
    }

    await xhrDelete(`/rest/v1/imports?id=eq.${id}`);
    try { await fetchFromSupabase({ path: `/rest/v1/audit_logs`, method: 'POST', body: { actor_id: getActorId(), action: 'HardDelete', target: id } }); } catch {}
    queryClient.invalidateQueries({ queryKey: ['imports'] });
    queryClient.invalidateQueries({ queryKey: ['health_metrics'] });
    queryClient.invalidateQueries({ queryKey: ['coverage'] });
    queryClient.invalidateQueries({ queryKey: ['snapshot'] });
    queryClient.invalidateQueries({ queryKey: ['v_recent_ledger'] });
    queryClient.invalidateQueries({ queryKey: ['daily_intelligence_hits'] });
    return msg;
  }, [queryClient]);

  const clearAllImports = useCallback(async (): Promise<string> => {
    const tables = [
      '/rest/v1/datasets_box?id=not.is.null',
      '/rest/v1/datasets_pair?id=not.is.null',
      '/rest/v1/percentile_maps?id=not.is.null',
      '/rest/v1/horizon_blends?id=not.is.null',
      '/rest/v1/histories?id=not.is.null',
      '/rest/v1/slate_snapshots?id=not.is.null',
      '/rest/v1/imports?id=not.is.null',
    ];

    const results = await Promise.allSettled(
      tables.map(path => fetchFromSupabase({ path, method: 'DELETE' }))
    );

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => String(r.reason instanceof Error ? r.reason.message : r.reason));

    try {
      await fetchFromSupabase({
        path: '/rest/v1/audit_logs',
        method: 'POST',
        body: { actor_id: getActorId(), action: 'ClearAllImports', target: 'all' },
      });
    } catch {}

    queryClient.invalidateQueries({ queryKey: ['imports'] });
    queryClient.invalidateQueries({ queryKey: ['health_metrics'] });
    queryClient.invalidateQueries({ queryKey: ['coverage'] });
    queryClient.invalidateQueries({ queryKey: ['snapshot'] });
    queryClient.invalidateQueries({ queryKey: ['live_ticker'] });
    queryClient.invalidateQueries({ queryKey: ['v_recent_ledger'] });
    queryClient.invalidateQueries({ queryKey: ['daily_intelligence_hits'] });

    if (errors.length > 0) {
      throw new Error(`Partial clear — ${errors.length} table(s) failed:\n${errors.slice(0, 3).join('\n')}`);
    }
    return 'All imports and associated data cleared successfully.';
  }, [queryClient]);

  return useMemo(() => ({
    importHistory,
    importDailyInput,
    importLedger,
    imports: importsQuery.data || [],
    auditLogs: auditQuery.data || [],
    isLoading,
    healthMetrics: healthQuery.data ?? null,
    refreshHealth,
    checkSlateLock,
    regenerateSlate,
    softDeleteImport,
    undoSoftDeleteImport,
    hardDeleteImport,
    clearAllImports,
    lastImportSummary: importHistoryMutation.data ?? importLedgerMutation.data ?? importDailyMutation.data ?? null,
    runHitDetectionAndRefresh,
  }), [
    importHistory,
    importDailyInput,
    importLedger,
    importsQuery.data,
    auditQuery.data,
    isLoading,
    healthQuery.data,
    refreshHealth,
    checkSlateLock,
    regenerateSlate,
    softDeleteImport,
    undoSoftDeleteImport,
    hardDeleteImport,
    clearAllImports,
    importHistoryMutation.data,
    importLedgerMutation.data,
    runHitDetectionAndRefresh,
  ]);
});