import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { confirmAsync, alertAsync } from '@/lib/confirm';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET } from '@/lib/dateUtils';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { Pill, SectionTitle, Card, timeAgo, HORIZONS, useSt } from './AdminShared';

// ─── Import History View ──────────────────────────────────────────────────────
export default function ImportHistoryView() {
  const { colors } = useTheme();
  const st = useSt();
  const { softDeleteImport, undoSoftDeleteImport, hardDeleteImport } = useDataIngestion();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

  const IMPORT_TYPES = [
    { id:'box_history', icon:'📦' },
    { id:'pair_history', icon:'🔗' },
    { id:'daily_input', icon:'📅' },
    { id:'ledger', icon:'📋' },
  ];

  const loadData = useCallback(async () => {
    setLoading(true); setFetchError(null);
    try {
      const rows = await fetchFromSupabase<any[]>({ path: '/rest/v1/imports?order=created_at.desc&limit=100' });
      setData(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setFetchError(String(e instanceof Error ? e.message : e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds(prev => { const s = new Set(prev); busy ? s.add(id) : s.delete(id); return s; });

  const handleSoftDelete = useCallback(async (id: string) => {
    setBusy(id, true);
    try { await softDeleteImport(id); await loadData(); }
    catch (e) { alertAsync('Delete Failed', String(e instanceof Error ? e.message : e)); }
    finally { setBusy(id, false); }
  }, [softDeleteImport, loadData]);

  const handleUndo = useCallback(async (id: string) => {
    setBusy(id, true);
    try { await undoSoftDeleteImport(id); await loadData(); }
    catch (e) { alertAsync('Restore Failed', String(e instanceof Error ? e.message : e)); }
    finally { setBusy(id, false); }
  }, [undoSoftDeleteImport, loadData]);

  const handleHardDelete = useCallback((id: string, importType?: string) => {
    const isDaily = importType === 'daily_input';
    const msg = isDaily
      ? 'Daily Input imports were checklist/audit markers only (retired type, BUG-130) — no data rows exist. The import record will be removed.\n\nContinue?'
      : 'This permanently removes the import and all its associated data rows. This cannot be undone.';
    (async () => {
      if (!(await confirmAsync('Permanently Delete?', msg, { confirmLabel: 'Delete Forever', destructive: true }))) return;
      setBusy(id, true);
      try {
        const result = await hardDeleteImport(id, importType);
        await loadData();
        setExpanded(null);
        if (result && result !== 'Deleted import and all associated dataset rows.') alertAsync('Deleted', result);
      }
      catch (e) { alertAsync('Hard Delete Failed', String(e instanceof Error ? e.message : e)); }
      finally { setBusy(id, false); }
    })();
  }, [hardDeleteImport, loadData]);

  const filtered = data.filter(i => typeFilter === 'all' || i.type === typeFilter);

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const selectAll = () => setSelectedIds(new Set(filtered.map(i => i.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkSoftDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    (async () => {
      if (!(await confirmAsync(`Soft Delete ${ids.length} Import${ids.length > 1 ? 's' : ''}?`, 'Dataset rows will be hidden but not permanently removed. You can undo this.', { confirmLabel: 'Soft Delete', destructive: true }))) return;
      setBulkBusy(true);
      let failed = 0;
      for (const id of ids) { try { await softDeleteImport(id); } catch { failed++; } }
      setSelectedIds(new Set());
      await loadData();
      setBulkBusy(false);
      if (failed > 0) alertAsync('Partial failure', `${failed} of ${ids.length} soft-deletes failed — check the admin key and retry.`);
    })();
  }, [selectedIds, softDeleteImport, loadData]);

  const handleBulkHardDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    (async () => {
      if (!(await confirmAsync(`Permanently Delete ${ids.length} Import${ids.length > 1 ? 's' : ''}?`, 'All dataset rows for these imports will be permanently removed. This cannot be undone.', { confirmLabel: 'Delete Forever', destructive: true }))) return;
      setBulkBusy(true);
      setBulkProgress({ done: 0, total: ids.length });
      const failed: string[] = [];
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const rec = data.find((d: any) => d.id === id);
        try { await hardDeleteImport(id, rec?.type); } catch { failed.push(id); }
        setBulkProgress({ done: i + 1, total: ids.length });
      }
      setSelectedIds(new Set());
      setBulkProgress(null);
      await loadData();
      setBulkBusy(false);
      // Honest outcome — the old unconditional 'Done' reported success even
      // when every delete threw (e.g. missing admin key).
      if (failed.length === 0) alertAsync('Done', `Deleted ${ids.length} import${ids.length > 1 ? 's' : ''} and associated data rows.`);
      else alertAsync('Partial failure', `${failed.length} of ${ids.length} deletes failed — check the admin key and retry. The rest completed.`);
    })();
  }, [selectedIds, hardDeleteImport, loadData, data]);

  const statusColor = (s: string) =>
    s === 'completed' ? colors.success
    : s === 'failed' ? colors.error
    : s === 'deleted' ? colors.textTertiary
    : colors.gold;

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ fontSize: 13, color: colors.textSecondary }}>Loading imports…</Text>
      </View>
    );
  }
  if (fetchError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 24, marginBottom: 8 }}>⚠️</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.error, marginBottom: 4, textAlign: 'center' }}>Failed to load imports</Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>{fetchError}</Text>
        <TouchableOpacity style={st.btnPrimary} onPress={loadData}><Text style={st.btnPrimaryText}>↺ Retry</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* ── Filter bar ── */}
      <View style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, padding: 10, flexDirection: 'row', alignItems: 'center' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {([['all','All'], ['box_history','Box'], ['pair_history','Pairs'], ['ledger','Ledger']] as [string,string][]).map(([id, lbl]) => (
              <TouchableOpacity key={id} style={[st.filterBtn, typeFilter === id && st.filterBtnOn]} onPress={() => setTypeFilter(id)}>
                <Text style={[st.filterBtnText, typeFilter === id && { color: '#fff' }]}>{lbl}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <TouchableOpacity onPress={loadData} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ fontSize: 18, color: colors.primary }}>↻</Text>
        </TouchableOpacity>
      </View>

      {/* ── Bulk action toolbar ── */}
      {filtered.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: selectedIds.size > 0 ? colors.primaryLight : colors.surfaceLight, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          {selectedIds.size === 0 ? (
            <>
              <TouchableOpacity onPress={selectAll} style={[st.btnGhost, { paddingVertical: 4, paddingHorizontal: 10 }]}>
                <Text style={[st.btnGhostText, { fontSize: 11 }]}>Select All ({filtered.length})</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary, flex: 1 }}>{selectedIds.size} selected</Text>
              <TouchableOpacity onPress={clearSelection} style={[st.btnGhost, { paddingVertical: 4, paddingHorizontal: 8 }]}>
                <Text style={[st.btnGhostText, { fontSize: 11 }]}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleBulkSoftDelete}
                disabled={bulkBusy}
                style={[st.btnGhost, { paddingVertical: 4, paddingHorizontal: 8, opacity: bulkBusy ? 0.5 : 1 }]}
              >
                <Text style={[st.btnGhostText, { fontSize: 11, color: colors.orange }]}>
                  {bulkBusy ? '⏳' : '🗑 Soft Delete'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleBulkHardDelete}
                disabled={bulkBusy}
                style={[st.btnGhost, { paddingVertical: 4, paddingHorizontal: 8, opacity: bulkBusy ? 0.5 : 1 }]}
              >
                <Text style={[st.btnGhostText, { fontSize: 11, color: colors.error }]}>
                  {bulkProgress ? `💥 ${bulkProgress.done}/${bulkProgress.total}` : '💥 Hard Delete'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* ── List ── */}
      {filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 32, marginBottom: 12 }}>📭</Text>
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 6 }}>No imports yet</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
            Use the Import Wizard to add Box History, Pair History, Daily Input, or Results Ledger data.
          </Text>
        </View>
      ) : (
        <ScrollView>
          {filtered.map((imp) => {
            const isExpanded = expanded === imp.id;
            const isDeleted = !!imp.deleted_at;
            const isBusy = busyIds.has(imp.id);
            const isChecked = selectedIds.has(imp.id);
            const typeInfo = IMPORT_TYPES.find(t => t.id === imp.type);
            const badgeStatus = isDeleted ? 'deleted' : imp.status;
            return (
              <View key={imp.id} style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <TouchableOpacity
                  style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: isChecked ? colors.primaryLight : isDeleted ? colors.surfaceLight : colors.surface }}
                  onPress={() => setExpanded(isExpanded ? null : imp.id)}
                  activeOpacity={0.85}
                >
                  {/* Checkbox */}
                  <TouchableOpacity
                    onPress={() => toggleSelect(imp.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: isChecked ? colors.primary : colors.border, backgroundColor: isChecked ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {isChecked && <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text>}
                  </TouchableOpacity>

                  <Text style={{ fontSize: 18, opacity: isDeleted ? 0.4 : 1 }}>{typeInfo?.icon ?? '📦'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: isDeleted ? colors.textTertiary : colors.text }}>
                      {imp.type}{imp.horizon_label ? ' · ' + imp.horizon_label : ''}{imp.class_id != null ? ' · Class ' + imp.class_id : ''}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textTertiary }}>
                      {imp.scope ?? '—'} · {new Date(imp.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                      {imp.counts != null && <Text style={{ fontSize: 10, color: colors.success }}>✓ {imp.counts} rows</Text>}
                      {imp.error_text && <Text style={{ fontSize: 10, color: colors.error }} numberOfLines={1}>✗ {imp.error_text}</Text>}
                    </View>
                  </View>
                  <Pill label={badgeStatus} color={statusColor(badgeStatus)} />
                  <TouchableOpacity
                    onPress={() => handleHardDelete(imp.id, imp.type)}
                    disabled={isBusy}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ padding: 6, opacity: isBusy ? 0.4 : 1 }}
                  >
                    <Text style={{ fontSize: 16, color: colors.error }}>🗑</Text>
                  </TouchableOpacity>
                </TouchableOpacity>

                {/* Expanded detail */}
                {isExpanded && (
                  <View style={{ margin: 10, padding: 12, backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                    {([
                      ['ID', imp.id],
                      ['Type', imp.type],
                      imp.class_id != null ? ['Class', String(imp.class_id)] : null,
                      imp.horizon_label ? ['Horizon', imp.horizon_label] : null,
                      imp.scope ? ['Scope', imp.scope] : null,
                      ['Status', imp.status],
                      imp.counts != null ? ['Row Count', String(imp.counts)] : null,
                      imp.error_text ? ['Error', imp.error_text] : null,
                      ['Created', new Date(imp.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })],
                      imp.deleted_at ? ['Deleted At', new Date(imp.deleted_at).toLocaleString('en-US', { timeZone: 'America/New_York' })] : null,
                    ] as ([string, string] | null)[]).filter(Boolean).map((row) => (
                      <View key={row![0]} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border + '55' }}>
                        <Text style={{ fontSize: 11, color: colors.textTertiary, width: 80 }}>{row![0]}</Text>
                        <Text style={{ fontSize: 11, color: colors.text, fontFamily: theme.typography.fontFamily.mono, fontWeight: '600', flex: 1, textAlign: 'right' }} numberOfLines={2}>{row![1]}</Text>
                      </View>
                    ))}

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      {!isDeleted ? (
                        <TouchableOpacity
                          style={[st.btnGhost, { opacity: isBusy ? 0.5 : 1 }]}
                          onPress={() => handleSoftDelete(imp.id)}
                          disabled={isBusy}
                        >
                          <Text style={[st.btnGhostText, { color: colors.orange }]}>
                            {isBusy ? '⏳ Working…' : '🗑 Soft Delete'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[st.btnGhost, { opacity: isBusy ? 0.5 : 1 }]}
                          onPress={() => handleUndo(imp.id)}
                          disabled={isBusy}
                        >
                          <Text style={[st.btnGhostText, { color: colors.success }]}>
                            {isBusy ? '⏳ Restoring…' : '↩ Undo Delete'}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[st.btnGhost, { opacity: isBusy ? 0.5 : 1, borderColor: colors.error + '44' }]}
                        onPress={() => handleHardDelete(imp.id, imp.type)}
                        disabled={isBusy}
                      >
                        <Text style={[st.btnGhostText, { color: colors.error }]}>
                          {isBusy ? '⏳ Working…' : '💥 Hard Delete'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
