import createContextHook from '@nkzw/create-context-hook';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { fetchFromSupabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { Scope, HorizonLabel, Import, AuditLog, ImportSummary, RegenerateResult } from '@/types/core';
import { useScope } from '@/hooks/useScope';
import { computeSlate } from '@/engines/zk6';
import { HORIZON_WEIGHTS } from '@/constants/zk6';
import { storage } from '@/lib/storage';

interface DataIngestionState {
  importHistory: (data: HistoryImportData) => Promise<ImportSummary>;
  importDailyInput: (data: DailyInputData) => Promise<ImportSummary>;
  importLedger: (data: LedgerImportData) => Promise<ImportSummary>;
  softDeleteImport: (id: string) => Promise<void>;
  undoSoftDeleteImport: (id: string) => Promise<void>;
  hardDeleteImport: (id: string) => Promise<void>;
  imports: Import[];
  auditLogs: AuditLog[];
  isLoading: boolean;
  healthMetrics: HealthMetrics | null;
  refreshHealth: () => Promise<void>;
  regenerateSlate: (scope: Scope) => Promise<RegenerateResult>;
  lastImportSummary: ImportSummary | null;
}

interface HistoryImportData {
  type: 'box_history' | 'pair_history';
  classId: number;
  horizonLabel: HorizonLabel;
  scope: Scope;
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
}

interface LedgerImportData {
  scope: Scope;
  entries: {
    jurisdiction: string;
    game: string;
    date_et: string;
    session: 'midday' | 'evening';
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
    
    console.log(`[safeDateOrNull] Processing: "${s}"`);
    
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      console.log(`[safeDateOrNull] Already in YYYY-MM-DD format: ${s}`);
      return s;
    }
    
    // Handle common date formats from ledger data
    try {
      // Handle "Fri, Sep 26, 2025" format (with day of week) - make comma optional
      const dayMatch = s.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})/i);
      if (dayMatch) {
        const month = dayMatch[2];
        const day = dayMatch[3];
        const year = dayMatch[4];
        const dateStr = `${month} ${day}, ${year}`;
        console.log(`[safeDateOrNull] Day match - constructing: "${dateStr}"`);
        const d = new Date(dateStr);
        console.log(`[safeDateOrNull] Date object:`, d, `Valid: ${!isNaN(d.getTime())}`);
        if (!isNaN(d.getTime())) {
          const result = d.toISOString().split('T')[0];
          console.log(`[safeDateOrNull] Day match success: ${result}`);
          return result;
        }
      }
      
      // Handle "Sep 26, 2025" format (without day of week) - make comma optional
      const monthMatch = s.match(/([A-Za-z]{3,})\s+(\d{1,2}),?\s*(\d{4})/i);
      if (monthMatch) {
        const month = monthMatch[1];
        const day = monthMatch[2];
        const year = monthMatch[3];
        const dateStr = `${month} ${day}, ${year}`;
        console.log(`[safeDateOrNull] Month match - constructing: "${dateStr}"`);
        const d = new Date(dateStr);
        console.log(`[safeDateOrNull] Date object:`, d, `Valid: ${!isNaN(d.getTime())}`);
        if (!isNaN(d.getTime())) {
          const result = d.toISOString().split('T')[0];
          console.log(`[safeDateOrNull] Month match success: ${result}`);
          return result;
        }
      }
      
      // Handle "YYYY-MM-DD" or "YYYY/MM/DD" format
      const isoMatch = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (isoMatch) {
        const dateStr = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
        console.log(`[safeDateOrNull] ISO match - constructing: "${dateStr}"`);
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const result = d.toISOString().split('T')[0];
          console.log(`[safeDateOrNull] ISO match success: ${result}`);
          return result;
        }
      }
      
      // Handle "MM/DD/YYYY" format
      const usMatch = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (usMatch) {
        const dateStr = `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`;
        console.log(`[safeDateOrNull] US format match - constructing: "${dateStr}"`);
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const result = d.toISOString().split('T')[0];
          console.log(`[safeDateOrNull] US format success: ${result}`);
          return result;
        }
      }
      
      // Try to parse any other format as a last resort
      console.log(`[safeDateOrNull] Trying direct parsing of: "${s}"`);
      const d = new Date(s);
      console.log(`[safeDateOrNull] Direct Date object:`, d, `Valid: ${!isNaN(d.getTime())}`);
      if (!isNaN(d.getTime())) {
        const result = d.toISOString().split('T')[0];
        console.log(`[safeDateOrNull] Direct parsing success: ${result}`);
        return result;
      }
    } catch (e) {
      console.log('[safeDateOrNull] Exception during parsing:', s, 'Error:', e);
    }
    
    console.log('[safeDateOrNull] All parsing methods failed for:', s);
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
              await fetchFromSupabase({ path: `/rest/v1/datasets_box?class_id=eq.1&scope=eq.${encodeURIComponent(data.scope)}&horizon_label=eq.${encodeURIComponent(canonH)}`, method: 'DELETE' });
            } else {
              await fetchFromSupabase({ path: `/rest/v1/datasets_pair?class_id=eq.${targetClassId}&scope=eq.${encodeURIComponent(data.scope)}&horizon_label=eq.${encodeURIComponent(canonH)}`, method: 'DELETE' });
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
        }
      });
      const importId = Array.isArray(importRec) ? importRec[0]?.id : (importRec as Import | undefined)?.id;
      if (!importId) throw new Error('Import creation did not return an ID');

      try {
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
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] });
      queryClient.invalidateQueries({ queryKey: ['snapshot'] });
      queryClient.invalidateQueries({ queryKey: ['coverage'] });
    }
  });

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
        for (const entry of data.entries) {
          console.log('[importLedger] Processing entry:', {
            jurisdiction: entry.jurisdiction,
            game: entry.game,
            date_et: entry.date_et,
            session: entry.session,
            result_digits: entry.result_digits
          });
          
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
            console.error('[importLedger] Date parsing failed for entry:', entry);
            console.error('[importLedger] Raw date_et value:', entry.date_et);
            console.error('[importLedger] Type of date_et:', typeof entry.date_et);
            
            rejected++;
            errors.push(`Invalid date format: "${entry.date_et}". Expected formats: "Fri, Sep 26, 2025" or "Sep 26, 2025" or "2025-09-26"`);
            continue;
          }
          
          console.log('[importLedger] Date parsing successful:', {
            original: entry.date_et,
            parsed: dateEt
          });
          
          try {
            await fetchFromSupabase({
              path: '/rest/v1/histories?on_conflict=jurisdiction,game,date_et,session',
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: {
                jurisdiction: entry.jurisdiction,
                game: entry.game,
                date_et: dateEt,
                session: entry.session,
                result_digits: entry.result_digits,
                comboset_sorted: `{${entry.result_digits.split('').sort().join(',')}}`
              }
            });
            accepted++;
            console.log('[importLedger] Successfully inserted entry:', entry.jurisdiction, entry.game, dateEt, entry.session, entry.result_digits);
          } catch (insertError) {
            console.error('[importLedger] Failed to insert entry:', entry, insertError);
            rejected++;
            errors.push(`Failed to insert entry: ${String(insertError)}`);
          }
        }
        await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${importRecId}`, method: 'PATCH', body: { status: 'completed' } });
        const summary: ImportSummary = { 
          id: importRecId, 
          type: 'ledger', 
          accepted, 
          rejected, 
          fixed: 0, 
          warnings: errors.slice(0, 10) // Limit warnings to first 10 errors
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
    onSuccess: (summary) => {
      console.log('[importLedger] Success, invalidating caches and triggering slate regeneration');
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] });
      queryClient.invalidateQueries({ queryKey: ['snapshot'] });
      queryClient.invalidateQueries({ queryKey: ['coverage'] });
      queryClient.invalidateQueries({ queryKey: ['v_recent_ledger'] });
      
      // Force refresh the results ledger to show new imports immediately
      queryClient.refetchQueries({ queryKey: ['v_recent_ledger'] });
      
      console.log('[importLedger] Cache invalidation completed, new results should be visible');
    }
  });

  const regenerateMutation = useMutation<RegenerateResult, Error, Scope>({
    mutationFn: async (scope: Scope): Promise<RegenerateResult> => {
      if (!isAdmin) throw new Error('Admin access required');
      console.log('[useDataIngestion] Regenerating slate for scope:', scope);

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
          const url = `/rest/v1/${basePath}?select=id&${classFilter}&scope=${scopeFilter}&horizon_label=eq.H01Y&deleted_at=is.null&limit=1`;
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
      const sinceUpdated = lastSnapshotAt ? `&updated_at_et=gt.${encodeURIComponent(lastSnapshotAt)}` : '';
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
      if (!changed) return { status: 'noop', message: 'Inputs unchanged—no new slate produced. (Hash unchanged)', scope };

      const excluded = new Set<string>();
      try {
        // Exclude results from SAME DAY and PREVIOUS DAY only
        // This prevents recently drawn numbers from appearing in new slates
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const todayStr = today.toISOString().split('T')[0];
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        console.log('[regenerate] Fetching same day and previous day results for exclusion:', {
          scope,
          today: todayStr,
          yesterday: yesterdayStr
        });
        
        const winners = await fetchFromSupabase<any[]>({ 
          path: `/rest/v1/v_recent_ledger?select=result_digits,date_et,jurisdiction,session&date_et=gte.${yesterdayStr}&date_et=lte.${todayStr}&limit=500` 
        });
        
        if (Array.isArray(winners)) {
          let excludedCount = 0;
          let todayCount = 0;
          let yesterdayCount = 0;
          
          winners.forEach(w => { 
            if (typeof w?.result_digits === 'string' && w.result_digits.length === 3) {
              excluded.add(w.result_digits);
              excludedCount++;
              
              // Count by day for logging
              if (w.date_et === todayStr) {
                todayCount++;
              } else if (w.date_et === yesterdayStr) {
                yesterdayCount++;
              }
            }
          });
          
          console.log('[regenerate] Excluded same day and previous day results:', {
            totalResults: winners.length,
            excludedCombos: excludedCount,
            todayResults: todayCount,
            yesterdayResults: yesterdayCount,
            sampleExcluded: Array.from(excluded).slice(0, 10)
          });
        }
      } catch (e) {
        console.log('[regenerate] winners exclusion warn', e);
      }

      try {
        const snapshot = await computeSlate({ scope, excludedCombos: excluded });

        try {
          await fetchFromSupabase({ path: '/rest/v1/audit_logs', method: 'POST', body: { actor_id: getActorId(), action: 'regenerate_slate', target: scope, payload_meta: { hash: snapshot.hash, top: snapshot.top_k_straights_json?.slice(0, 6), snapshotId: snapshot.id } } });
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

        // Invalidate caches after we confirmed visibility (or timeout)
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
    }
  });

  const refreshHealth = async () => { await healthQuery.refetch(); };
  const importHistory = (data: HistoryImportData) => importHistoryMutation.mutateAsync(data);
  const importDailyInput = (data: DailyInputData) => importDailyMutation.mutateAsync(data);
  const importLedger = (data: LedgerImportData) => importLedgerMutation.mutateAsync(data);
  const regenerateSlate = (scope: Scope) => regenerateMutation.mutateAsync(scope);

  const isLoading = useMemo(() => {
    return importHistoryMutation.isPending || importDailyMutation.isPending || importLedgerMutation.isPending || regenerateMutation.isPending;
  }, [importHistoryMutation.isPending, importDailyMutation.isPending, importLedgerMutation.isPending, regenerateMutation.isPending]);

  const softDeleteImport = useCallback(async (id: string) => {
    const nowIso = new Date().toISOString();
    try { await fetchFromSupabase({ path: `/rest/v1/datasets_box?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: nowIso } }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/datasets_pair?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: nowIso } }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/percentile_maps?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: nowIso } }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/horizon_blends?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: nowIso } }); } catch {}
    await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${id}`, method: 'PATCH', body: { status: 'deleted', deleted_at: nowIso } });
    await fetchFromSupabase({ path: `/rest/v1/audit_logs`, method: 'POST', body: { actor_id: getActorId(), action: 'SoftDelete', target: id } });
    queryClient.invalidateQueries({ queryKey: ['imports'] });
    queryClient.invalidateQueries({ queryKey: ['health_metrics'] });
    queryClient.invalidateQueries({ queryKey: ['coverage'] });
  }, [queryClient]);

  const undoSoftDeleteImport = useCallback(async (id: string) => {
    try { await fetchFromSupabase({ path: `/rest/v1/datasets_box?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: null } }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/datasets_pair?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: null } }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/percentile_maps?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: null } }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/horizon_blends?import_id=eq.${id}`, method: 'PATCH', body: { deleted_at: null } }); } catch {}
    await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${id}`, method: 'PATCH', body: { status: 'completed', deleted_at: null } });
    await fetchFromSupabase({ path: `/rest/v1/audit_logs`, method: 'POST', body: { actor_id: getActorId(), action: 'UndoSoftDelete', target: id } });
    queryClient.invalidateQueries({ queryKey: ['imports'] });
    queryClient.invalidateQueries({ queryKey: ['health_metrics'] });
    queryClient.invalidateQueries({ queryKey: ['coverage'] });
  }, [queryClient]);

  const hardDeleteImport = useCallback(async (id: string) => {
    try { await fetchFromSupabase({ path: `/rest/v1/datasets_box?import_id=eq.${id}`, method: 'DELETE' }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/datasets_pair?import_id=eq.${id}`, method: 'DELETE' }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/percentile_maps?import_id=eq.${id}`, method: 'DELETE' }); } catch {}
    try { await fetchFromSupabase({ path: `/rest/v1/horizon_blends?import_id=eq.${id}`, method: 'DELETE' }); } catch {}
    await fetchFromSupabase({ path: `/rest/v1/imports?id=eq.${id}`, method: 'DELETE' });
    await fetchFromSupabase({ path: `/rest/v1/audit_logs`, method: 'POST', body: { actor_id: getActorId(), action: 'HardDelete', target: id } });
    queryClient.invalidateQueries({ queryKey: ['imports'] });
    queryClient.invalidateQueries({ queryKey: ['health_metrics'] });
    queryClient.invalidateQueries({ queryKey: ['coverage'] });
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
    regenerateSlate,
    softDeleteImport,
    undoSoftDeleteImport,
    hardDeleteImport,
    lastImportSummary: importHistoryMutation.data ?? importLedgerMutation.data ?? importDailyMutation.data ?? null,
  }), [
    importHistory,
    importDailyInput,
    importLedger,
    importsQuery.data,
    auditQuery.data,
    isLoading,
    healthQuery.data,
    refreshHealth,
    regenerateSlate,
    softDeleteImport,
    undoSoftDeleteImport,
    hardDeleteImport,
    importHistoryMutation.data,
    importLedgerMutation.data,
  ]);
});