import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useCoverage } from '@/hooks/useCoverage';
import { getTodayET } from '@/lib/dateUtils';
import { SectionTitle, HORIZONS, PAIR_CLASSES, useSt, Card } from './AdminShared';

// ─── Coverage Matrix View ─────────────────────────────────────────────────────
export default function CoverageMatrixView({ setView }: { setView: (v: string) => void }) {
  const { colors } = useTheme();
  const st = useSt();
  const [matrixTab, setMatrixTab] = useState<'history' | 'daily_input' | 'results'>('history');

  // ── Box/Pair History tab ──
  const [scopeTab, setScopeTab] = useState<'midday' | 'evening' | 'allday'>('midday');
  const [coverageRows, setCoverageRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [clearingScope, setClearingScope] = useState<string | null>(null);
  // CLEAR confirmation modal
  const [clearModal, setClearModal] = useState<{ scope: string; label: string } | null>(null);
  const [clearConfirmText, setClearConfirmText] = useState('');

  // ── Daily Input tab ──
  const [dailyImports, setDailyImports] = useState<{ scope: string; date: string }[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);

  // ── Results Ledger tab ──
  const [historyRows, setHistoryRows] = useState<{ date_et: string; session: string; jurisdiction: string }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const today = useMemo(() => getTodayET(), []);
  const yesterday = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  }, []);
  const last30Days = useMemo(() => {
    const todayET = getTodayET();
    const days: string[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(todayET + 'T12:00:00');
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
    }
    return days;
  }, []);

  const loadBoxPairData = useCallback(async () => {
    setLoading(true); setFetchError(null);
    try {
      const rows = await fetchFromSupabase<any[]>({ path: '/rest/v1/v_coverage_summary?select=*' });
      setCoverageRows(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setFetchError(String(e instanceof Error ? e.message : e));
    } finally { setLoading(false); }
  }, []);

  // Clear handlers declared AFTER loadBoxPairData to avoid TDZ crash in Hermes
  const handleClearScope = useCallback((scope: string) => {
    setClearConfirmText('');
    setClearModal({ scope, label: scope === 'all' ? 'ALL scopes' : scope });
  }, []);

  const handleClearAllScopes = useCallback(() => {
    setClearConfirmText('');
    setClearModal({ scope: 'all', label: 'ALL scopes' });
  }, []);

  const executeClear = useCallback(async () => {
    if (!clearModal || clearConfirmText.trim().toUpperCase() !== 'CLEAR') return;
    const { scope } = clearModal;
    setClearModal(null);
    setClearConfirmText('');
    setClearingScope(scope);
    try {
      let queries: Promise<any>[];
      if (scope === 'all') {
        queries = [
          fetchFromSupabase({ path: `/rest/v1/datasets_box?id=not.is.null`, method: 'DELETE' }),
          fetchFromSupabase({ path: `/rest/v1/datasets_pair?id=not.is.null`, method: 'DELETE' }),
          fetchFromSupabase({ path: `/rest/v1/percentile_maps?id=not.is.null`, method: 'DELETE' }),
          fetchFromSupabase({ path: `/rest/v1/horizon_blends?id=not.is.null`, method: 'DELETE' }),
        ];
      } else {
        const enc = encodeURIComponent(scope);
        queries = [
          fetchFromSupabase({ path: `/rest/v1/datasets_box?scope=eq.${enc}`, method: 'DELETE' }),
          fetchFromSupabase({ path: `/rest/v1/datasets_pair?scope=eq.${enc}`, method: 'DELETE' }),
          fetchFromSupabase({ path: `/rest/v1/percentile_maps?scope=eq.${enc}`, method: 'DELETE' }),
          fetchFromSupabase({ path: `/rest/v1/horizon_blends?scope=eq.${enc}`, method: 'DELETE' }),
        ];
      }
      const results = await Promise.allSettled(queries);
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map(r => String(r.reason instanceof Error ? r.reason.message : r.reason));
      if (errors.length > 0) {
        Alert.alert('Clear Partially Failed', errors.slice(0, 3).join('\n'));
      } else {
        Alert.alert('Cleared', `Coverage data for ${clearModal.label} has been removed.`);
      }
      await loadBoxPairData();
    } catch (e) {
      Alert.alert('Clear Failed', String(e instanceof Error ? e.message : e));
    } finally {
      setClearingScope(null);
    }
  }, [clearModal, clearConfirmText, loadBoxPairData]);

  const loadDailyData = useCallback(async () => {
    setDailyLoading(true); setDailyError(null);
    try {
      const rows = await fetchFromSupabase<{ scope: string; created_at: string; file_meta: any }[]>({
        path: '/rest/v1/imports?type=eq.daily_input&status=eq.completed&deleted_at=is.null&select=scope,created_at,file_meta&order=created_at.desc&limit=200',
      });
      setDailyImports((Array.isArray(rows) ? rows : []).map(r => {
        // Use file_meta.import_date (the date the data is FOR), fall back to created_at date
        let date = r.created_at ? r.created_at.split('T')[0] : '';
        try {
          const meta = typeof r.file_meta === 'string' ? JSON.parse(r.file_meta) : r.file_meta;
          if (meta?.import_date) date = meta.import_date;
        } catch {}
        return { scope: r.scope, date };
      }));
    } catch (e) {
      setDailyError(String(e instanceof Error ? e.message : e));
    } finally { setDailyLoading(false); }
  }, []);

  const loadHistoryData = useCallback(async () => {
    setHistoryLoading(true); setHistoryError(null);
    try {
      // PostgREST caps responses at 1000 rows server-side regardless of client
      // limit / Range header, so we filter to the 30-day window the matrix
      // renders AND paginate. Without this, only the latest ~15 days came
      // back and earlier dates rendered as empty.
      const todayET = getTodayET();
      const cutoff = new Date(todayET + 'T12:00:00');
      cutoff.setDate(cutoff.getDate() - 31);
      const since = cutoff.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

      const all: { date_et: string; session: string; jurisdiction: string }[] = [];
      const pageSize = 1000;
      for (let offset = 0; offset < 10000; offset += pageSize) {
        const page = await fetchFromSupabase<{ date_et: string; session: string; jurisdiction: string }[]>({
          path: `/rest/v1/histories?select=date_et,session,jurisdiction&order=date_et.desc&limit=${pageSize}&offset=${offset}&date_et=gte.${since}&jurisdiction=not.in.(ME,NH,VT,MS,PR,MD,MS2)`,
        });
        const rows = Array.isArray(page) ? page : [];
        all.push(...rows);
        if (rows.length < pageSize) break;
      }
      setHistoryRows(all);
    } catch (e) {
      setHistoryError(String(e instanceof Error ? e.message : e));
    } finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { loadBoxPairData(); }, [loadBoxPairData]);
  useEffect(() => {
    if (matrixTab === 'daily_input') loadDailyData();
    if (matrixTab === 'results') loadHistoryData();
  }, [matrixTab, loadDailyData, loadHistoryData]);

  // ── Daily Input lookups ──
  const dailySet = useMemo(() => {
    const s = new Set<string>();
    dailyImports.forEach(r => { if (r.date && r.scope) s.add(`${r.date}-${r.scope}`); });
    return s;
  }, [dailyImports]);
  const last7DailyCount = useMemo(() => {
    let count = 0;
    last30Days.slice(0, 7).forEach(d => {
      ['midday', 'evening', 'allday'].forEach(sc => { if (dailySet.has(`${d}-${sc}`)) count++; });
    });
    return count;
  }, [dailySet, last30Days]);
  const todayHasDailyInput = ['midday', 'evening', 'allday'].some(sc => dailySet.has(`${today}-${sc}`));

  // ── Results lookups ──
  const resultsMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    historyRows.forEach(r => {
      const key = `${r.date_et}-${r.session}`;
      if (!m.has(key)) m.set(key, new Set());
      m.get(key)!.add(r.jurisdiction);
    });
    return m;
  }, [historyRows]);
  const yesterdayHasResults = ['midday', 'evening'].some(s => (resultsMap.get(`${yesterday}-${s}`)?.size ?? 0) > 0);

  // ── Box/Pair lookup ──
  const classes = [{ id: 1, label: 'Box', type: 'box' }, ...PAIR_CLASSES.map(p => ({ ...p, type: 'pair' }))];
  const lookup = useMemo(() => {
    const map: Record<string, number> = {};
    coverageRows.forEach(r => {
      const key = `${r.class_id}-${r.scope}-${r.horizon_label}`;
      map[key] = (map[key] ?? 0) + (r.row_count ?? 0);
    });
    return map;
  }, [coverageRows]);
  // Staleness lookup: days since the underlying CSV was last imported per
  // (class × scope × horizon). Uses v_coverage_summary.latest_imported.
  // COVERAGE-STALENESS-FIX (2026-06-24): latest_imported now derives from the
  // imports log (MAX(imports.created_at) per class/scope/horizon), NOT
  // MAX(datasets_*.created_at). The import wizard upserts (merge-duplicates)
  // without writing created_at, so datasets created_at stayed frozen at the
  // last delete+reinsert (2026-06-03 reset) and this badge false-flagged every
  // re-import as 21d+ stale. The imports log carries a real per-import timestamp.
  // (updated_at is still wrong here — it only moves on the nightly ds_raw rebuild.)
  // Thresholds (same for box + pair; both are operator-imported CSVs with
  // no auto-refresh path):
  //   warn ≥14d, critical ≥30d.
  const stalenessLookup = useMemo(() => {
    const map: Record<string, { latestImported: string; daysOld: number; type: 'box' | 'pair' }> = {};
    const todayMs = Date.now();
    coverageRows.forEach(r => {
      if (!r?.latest_imported) return;
      const key = `${r.class_id}-${r.scope}-${r.horizon_label}`;
      const ms = new Date(String(r.latest_imported)).getTime();
      const daysOld = Math.max(0, Math.floor((todayMs - ms) / 86400000));
      const existing = map[key];
      if (!existing || daysOld < existing.daysOld) {
        map[key] = { latestImported: String(r.latest_imported), daysOld, type: r.data_type === 'pair' ? 'pair' : 'box' };
      }
    });
    return map;
  }, [coverageRows]);
  const stalenessOf = useCallback((classId: number, scope: string, horizon: string) => {
    const meta = stalenessLookup[`${classId}-${scope}-${horizon}`];
    if (!meta) return null;
    const warnDays = 14;
    const critDays = 30;
    const level: 'fresh' | 'warn' | 'crit' = meta.daysOld >= critDays ? 'crit' : meta.daysOld >= warnDays ? 'warn' : 'fresh';
    return { ...meta, level, warnDays, critDays };
  }, [stalenessLookup]);
  const h01yPresent = classes.filter(c => (lookup[`${c.id}-${scopeTab}-H01Y`] ?? 0) > 0).length;
  const h01yPct = Math.round((h01yPresent / classes.length) * 100);
  const h01yMissing = classes.filter(c => !((lookup[`${c.id}-${scopeTab}-H01Y`] ?? 0) > 0)).map(c => c.label);
  // Stale-cell counter for the active scope across the full matrix
  const staleCellCount = useMemo(() => {
    let warn = 0, crit = 0;
    classes.forEach(c => {
      HORIZONS.forEach(h => {
        const s = stalenessOf(c.id, scopeTab, h);
        if (!s) return;
        if (s.level === 'crit') crit++;
        else if (s.level === 'warn') warn++;
      });
    });
    return { warn, crit };
  }, [classes, scopeTab, stalenessOf]);

  const formatDateShort = (d: string) => {
    try {
      const [y, m, day] = d.split('-').map(Number);
      return new Date(y, m - 1, day).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
    } catch { return d; }
  };

  return (
    <View style={{ flex: 1 }}>
      {/* ── Matrix tab bar ── */}
      <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 10, paddingVertical: 8, gap: 5 }}>
        {[
          { id: 'history', label: 'Box & Pair' },
          { id: 'daily_input', label: 'Daily Input' },
          { id: 'results', label: 'Results' },
        ].map(t => (
          <TouchableOpacity
            key={t.id}
            style={[st.optBtn, matrixTab === t.id && st.optBtnOn, { flex: 1, paddingHorizontal: 6 }]}
            onPress={() => setMatrixTab(t.id as any)}
          >
            <Text style={[st.optBtnText, matrixTab === t.id && st.optBtnTextOn, { textAlign: 'center', fontSize: 10 }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Tab: Box & Pair History ── */}
      {matrixTab === 'history' && (
        loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ fontSize: 13, color: colors.textSecondary }}>Loading coverage matrix…</Text>
          </View>
        ) : fetchError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ fontSize: 24, marginBottom: 8 }}>⚠️</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.error, marginBottom: 4, textAlign: 'center' }}>Failed to load coverage</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>{fetchError}</Text>
            <TouchableOpacity style={st.btnPrimary} onPress={loadBoxPairData}><Text style={st.btnPrimaryText}>↺ Retry</Text></TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
            {/* ── Clear Coverage Section ── */}
            <View style={{ backgroundColor: colors.surfaceLight, borderRadius: 12, borderWidth: 1, borderColor: colors.error + '30', padding: 14, marginBottom: 18 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: colors.error, letterSpacing: 1, marginBottom: 6 }}>CLEAR COVERAGE DATA</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 10, lineHeight: 16 }}>
                Permanently removes dataset rows for a scope. Use before re-importing to avoid duplicates.
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {(['midday', 'evening', 'allday'] as const).map(sc => (
                  <TouchableOpacity
                    key={sc}
                    onPress={() => handleClearScope(sc)}
                    disabled={clearingScope !== null}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.error + '44', backgroundColor: colors.error + '08', opacity: clearingScope !== null ? 0.5 : 1 }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.error }}>
                      {clearingScope === sc ? '⏳ Clearing…' : `Clear ${sc}`}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={handleClearAllScopes}
                  disabled={clearingScope !== null}
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: colors.error, backgroundColor: colors.error + '12', opacity: clearingScope !== null ? 0.5 : 1 }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: colors.error }}>
                    {clearingScope === 'all' ? '⏳ Clearing All…' : '💥 Clear All Scopes'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 4 }}>Horizon Coverage Matrix</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>✓ = data present · ⌛ = missing · cell border: green = fresh, amber = ≥14d since import, red = ≥30d. K6 requires H01Y for all 11 classes.</Text>
            {(staleCellCount.warn > 0 || staleCellCount.crit > 0) && (
              <Card style={{ padding: 10, marginBottom: 12, backgroundColor: (staleCellCount.crit > 0 ? colors.error : colors.gold) + '15', borderColor: (staleCellCount.crit > 0 ? colors.error : colors.gold) + '55' }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: staleCellCount.crit > 0 ? colors.error : colors.gold }}>
                  ⚠ Staleness alert ({scopeTab}):
                  {staleCellCount.crit > 0 ? ` ${staleCellCount.crit} cell(s) critically stale (≥30d)` : ''}
                  {staleCellCount.crit > 0 && staleCellCount.warn > 0 ? ',' : ''}
                  {staleCellCount.warn > 0 ? ` ${staleCellCount.warn} cell(s) warning (≥14d)` : ''}
                </Text>
                <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>
                  Counts days since the underlying CSV was last imported into datasets_box/datasets_pair (not the engine-side rebuild). Re-import via Import Wizard → Box / Pair History.
                </Text>
              </Card>
            )}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
              {(['midday', 'evening', 'allday'] as const).map(s => (
                <TouchableOpacity key={s} style={[st.optBtn, scopeTab === s && st.optBtnOn, { flex: 1 }]} onPress={() => setScopeTab(s)}>
                  <Text style={[st.optBtnText, scopeTab === s && st.optBtnTextOn]}>
                    {s === 'midday' ? '☀️ Midday' : s === 'evening' ? '🌙 Evening' : '◈ All Day'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Card style={{ padding: 12, marginBottom: 16, backgroundColor: h01yPct === 100 ? colors.successLight : colors.goldLight, borderColor: (h01yPct === 100 ? colors.success : colors.gold) + '44' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: h01yPct === 100 ? colors.success : colors.gold }}>
                H01Y Coverage ({scopeTab}): {h01yPct}% · {h01yPresent}/{classes.length} classes
              </Text>
              {h01yMissing.length > 0 && (
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>Missing: {h01yMissing.join(', ')}</Text>
              )}
            </Card>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceLight }}>
                  <View style={{ width: 120, padding: 8 }}><Text style={{ fontSize: 10, fontWeight: '700', color: colors.textTertiary }}>CLASS</Text></View>
                  {HORIZONS.map(h => (
                    <View key={h} style={{ width: 50, padding: 8, alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textTertiary }}>{h}</Text>
                    </View>
                  ))}
                </View>
                {classes.map((cls, ci) => (
                  <View key={cls.id} style={{ flexDirection: 'row', backgroundColor: ci % 2 === 0 ? colors.surface : colors.background, borderTopWidth: 1, borderTopColor: colors.border + '66' }}>
                    <View style={{ width: 120, padding: 8, justifyContent: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ backgroundColor: cls.type === 'box' ? colors.primaryLight : colors.cosmicLight, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}>
                          <Text style={{ fontSize: 8, fontWeight: '700', color: colors.primary }}>{cls.type === 'box' ? 'BOX' : 'PAIR'}</Text>
                        </View>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textSecondary }} numberOfLines={1}>{(cls as any).label ?? 'Class ' + cls.id}</Text>
                      </View>
                    </View>
                    {HORIZONS.map(h => {
                      const count = lookup[`${cls.id}-${scopeTab}-${h}`] ?? 0;
                      const ok = count > 0;
                      const stale = ok ? stalenessOf(cls.id, scopeTab, h) : null;
                      const borderColor = !ok ? colors.border
                        : stale?.level === 'crit' ? colors.error
                        : stale?.level === 'warn' ? colors.gold
                        : colors.success;
                      const bgColor = !ok ? colors.surfaceLight
                        : stale?.level === 'crit' ? colors.error + '12'
                        : stale?.level === 'warn' ? colors.gold + '12'
                        : colors.successLight;
                      const dayLabelColor = stale?.level === 'crit' ? colors.error
                        : stale?.level === 'warn' ? colors.gold
                        : colors.success + 'AA';
                      return (
                        <View key={h} style={{ width: 50, padding: 4, alignItems: 'center', justifyContent: 'center' }}>
                          <View
                            accessibilityLabel={ok && stale ? `${cls.label ?? 'Class ' + cls.id} ${h} ${scopeTab}, ${count} rows, updated ${stale.daysOld}d ago` : undefined}
                            style={{ width: 42, height: 30, borderRadius: 6, backgroundColor: bgColor, borderWidth: stale?.level === 'crit' ? 2 : 1, borderColor: borderColor + (stale?.level === 'crit' ? 'CC' : '55'), alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Text style={{ fontSize: 10, color: ok ? (stale?.level === 'crit' ? colors.error : stale?.level === 'warn' ? colors.gold : colors.success) : colors.textTertiary, lineHeight: 12 }}>
                              {ok ? (stale?.level === 'crit' ? '⚠' : '✓') : '⌛'}
                            </Text>
                            {ok && (
                              <Text style={{ fontSize: 7, color: dayLabelColor, lineHeight: 8 }}>
                                {count >= 1000 ? Math.round(count / 1000) + 'k' : count}
                                {stale ? ` · ${stale.daysOld}d` : ''}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </ScrollView>
            {coverageRows.length === 0 && (
              <View style={{ alignItems: 'center', marginTop: 24, padding: 16 }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>No coverage data found. Import Box History or Pair History data first.</Text>
              </View>
            )}
            {h01yPresent === 0 && coverageRows.length > 0 && (
              <Card style={{ padding: 10, marginTop: 8, backgroundColor: colors.goldLight, borderColor: colors.gold + '44' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.gold }}>
                  ⚠️ No {scopeTab} data — ZK6 will use allday fallback for this scope
                </Text>
              </Card>
            )}
          </ScrollView>
        )
      )}

      {/* ── Tab: Daily Input Coverage ── */}
      {matrixTab === 'daily_input' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 4 }}>Daily Input Coverage</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>Last 30 days · GREEN = imported for that scope/day</Text>

          <Card style={{ padding: 12, marginBottom: 8, backgroundColor: colors.primaryLight, borderColor: colors.primary + '33' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
              Last 7 days: {last7DailyCount}/21 sessions imported
            </Text>
          </Card>

          {!todayHasDailyInput && (
            <Card style={{ padding: 12, marginBottom: 12, backgroundColor: colors.error + '15', borderColor: colors.error + '40' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.error }}>
                ⚠️ No daily input for today — ZK6 picks may be stale
              </Text>
            </Card>
          )}

          {dailyLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
          ) : dailyError ? (
            <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
              <Text style={{ fontSize: 24 }}>⚠️</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.error, textAlign: 'center' }}>{dailyError}</Text>
              <TouchableOpacity style={st.btnPrimary} onPress={loadDailyData}><Text style={st.btnPrimaryText}>↺ Retry</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', marginBottom: 6, paddingHorizontal: 2 }}>
                <View style={{ width: 84 }}><Text style={{ fontSize: 9, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1 }}>DATE</Text></View>
                {['MIDDAY', 'EVENING', 'ALL DAY'].map(sc => (
                  <View key={sc} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 8, fontWeight: '800', color: colors.textTertiary, letterSpacing: 0.5 }}>{sc}</Text>
                  </View>
                ))}
              </View>
              {last30Days.map(d => {
                const isToday = d === today;
                const isYday = d === yesterday;
                return (
                  <View key={d} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3, paddingHorizontal: 2, backgroundColor: isToday ? colors.primaryLight + '55' : 'transparent', borderRadius: 6 }}>
                    <View style={{ width: 84 }}>
                      <Text style={{ fontSize: 10, color: isToday ? colors.primary : isYday ? colors.gold : colors.textSecondary, fontWeight: (isToday || isYday) ? '700' : '400', fontFamily: theme.typography.fontFamily.mono }}>
                        {isToday ? 'Today' : isYday ? 'Yesterday' : formatDateShort(d)}
                      </Text>
                    </View>
                    {(['midday', 'evening', 'allday'] as const).map(sc => {
                      const has = dailySet.has(`${d}-${sc}`);
                      return (
                        <TouchableOpacity
                          key={sc}
                          style={{ flex: 1, marginHorizontal: 2, height: 28, borderRadius: 6, backgroundColor: has ? colors.successLight : colors.surfaceLight, borderWidth: 1, borderColor: has ? colors.success + '55' : colors.border + '44', alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => { if (!has) setView('wizard'); }}
                          activeOpacity={has ? 1 : 0.65}
                        >
                          <Text style={{ fontSize: 11, color: has ? colors.success : colors.textTertiary }}>
                            {has ? '✓' : '+'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* ── Tab: Results Ledger Coverage ── */}
      {matrixTab === 'results' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 4 }}>Results Ledger Coverage</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>Last 30 days · GREEN = 30+ states · YELLOW = partial · + = missing</Text>

          <Card style={{ padding: 12, marginBottom: 8, backgroundColor: colors.tealLight, borderColor: colors.teal + '33' }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>Results Coverage: last 30 days</Text>
          </Card>

          {!yesterdayHasResults && (
            <Card style={{ padding: 12, marginBottom: 12, backgroundColor: colors.error + '15', borderColor: colors.error + '40' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.error }}>
                ⚠️ Yesterday's results not imported — hit tracking unavailable
              </Text>
            </Card>
          )}

          {historyLoading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
          ) : historyError ? (
            <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
              <Text style={{ fontSize: 24 }}>⚠️</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.error, textAlign: 'center' }}>{historyError}</Text>
              <TouchableOpacity style={st.btnPrimary} onPress={loadHistoryData}><Text style={st.btnPrimaryText}>↺ Retry</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', marginBottom: 6, paddingHorizontal: 2 }}>
                <View style={{ width: 84 }}><Text style={{ fontSize: 9, fontWeight: '800', color: colors.textTertiary, letterSpacing: 1 }}>DATE</Text></View>
                {['MIDDAY', 'EVENING'].map(s => (
                  <View key={s} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textTertiary, letterSpacing: 0.5 }}>{s}</Text>
                  </View>
                ))}
              </View>
              {last30Days.map(d => {
                const isToday = d === today;
                const isYday = d === yesterday;
                return (
                  <View key={d} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3, paddingHorizontal: 2, backgroundColor: isToday ? colors.primaryLight + '44' : 'transparent', borderRadius: 6 }}>
                    <View style={{ width: 84 }}>
                      <Text style={{ fontSize: 10, color: isToday ? colors.primary : isYday ? colors.gold : colors.textSecondary, fontWeight: (isToday || isYday) ? '700' : '400', fontFamily: theme.typography.fontFamily.mono }}>
                        {isToday ? 'Today' : isYday ? 'Yesterday' : formatDateShort(d)}
                      </Text>
                    </View>
                    {(['midday', 'evening'] as const).map(session => {
                      const count = resultsMap.get(`${d}-${session}`)?.size ?? 0;
                      const isFull = count >= 30;
                      const isPartial = count > 0 && count < 30;
                      const bgColor = isFull ? colors.successLight : isPartial ? colors.goldLight : colors.surfaceLight;
                      const bdColor = isFull ? colors.success + '55' : isPartial ? colors.gold + '55' : colors.border + '44';
                      const textColor = isFull ? colors.success : isPartial ? colors.gold : colors.textTertiary;
                      return (
                        <TouchableOpacity
                          key={session}
                          style={{ flex: 1, marginHorizontal: 2, height: 34, borderRadius: 6, backgroundColor: bgColor, borderWidth: 1, borderColor: bdColor, alignItems: 'center', justifyContent: 'center' }}
                          onPress={() => { if (count === 0) setView('wizard'); }}
                          activeOpacity={count === 0 ? 0.65 : 1}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '700', color: textColor, lineHeight: 12 }}>
                            {isFull ? '✓' : isPartial ? '~' : '+'}
                          </Text>
                          {count > 0 && (
                            <Text style={{ fontSize: 7, color: textColor + 'CC', lineHeight: 9 }}>{count}st</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* ── CLEAR confirmation modal ── */}
      <Modal
        transparent
        visible={clearModal !== null}
        animationType="fade"
        onRequestClose={() => { setClearModal(null); setClearConfirmText(''); }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 400, backgroundColor: colors.surface, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: colors.error + '55' }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.error, marginBottom: 6 }}>
              ⚠️ Clear {clearModal?.label ?? ''} coverage data?
            </Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 14, lineHeight: 18 }}>
              This permanently removes all box, pair, percentile, and blend rows for this scope. This cannot be undone.{'\n\n'}Type CLEAR to confirm.
            </Text>
            <TextInput
              value={clearConfirmText}
              onChangeText={setClearConfirmText}
              placeholder="Type CLEAR here"
              autoCapitalize="characters"
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, backgroundColor: colors.background, marginBottom: 14, fontSize: 13 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setClearModal(null); setClearConfirmText(''); }}
                style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
              >
                <Text style={{ color: colors.text, fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={executeClear}
                disabled={clearConfirmText.trim().toUpperCase() !== 'CLEAR'}
                style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8, backgroundColor: clearConfirmText.trim().toUpperCase() === 'CLEAR' ? colors.error : colors.error + '44' }}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Confirm Clear</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
