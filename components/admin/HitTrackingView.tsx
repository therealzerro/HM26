import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { theme } from '@/constants/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET } from '@/lib/dateUtils';
import { SectionTitle, Card, st } from './AdminShared';

// ─── Hit Tracking View ────────────────────────────────────────────────────────

interface ExpandedRowData {
  picks: any[];
  historyResults: any[];
  trackingRows: any[];
  snapshotId: string | null;
  loaded: boolean;
}

function PerformanceRow({
  row,
  allData,
  avgBox,
  onDeleted,
}: { row: any; allData: any[]; avgBox: number; onDeleted?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedData, setExpandedData] = useState<ExpandedRowData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const rate = row.box_hit_rate ?? 0;
  const straightRate = row.straight_hit_rate ?? 0;
  const totalPicks = row.total_picks ?? 0;
  const boxHits = row.box_hits ?? 0;
  const straightHits = row.straight_hits ?? 0;

  const rowBg = rate > 33 ? theme.colors.successLight : rate >= 16 ? theme.colors.goldLight : theme.colors.errorLight;
  const rowBorderC = rate > 33 ? theme.colors.success + '44' : rate >= 16 ? theme.colors.gold + '44' : theme.colors.error + '44';
  const rateColor = rate > 33 ? theme.colors.success : rate >= 16 ? theme.colors.gold : theme.colors.error;

  const scopeLabel = row.scope === 'midday' ? '☀️ Mid' : row.scope === 'evening' ? '🌙 Eve' : '◈ All';
  const scopeColor = row.scope === 'midday' ? theme.colors.gold : row.scope === 'evening' ? theme.colors.primary : theme.colors.teal;

  const formatDate = (d: string) => {
    try {
      const [y, m, day] = d.split('-').map(Number);
      return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
    } catch { return d; }
  };

  const loadDetail = useCallback(async () => {
    if (expandedData?.loaded) return;
    setLoadingDetail(true);
    try {
      const diUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const diKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const diHdrs = { 'apikey': diKey, 'Authorization': 'Bearer ' + diKey };

      let picks: any[] = [];
      let resolvedSnapshotId: string | null = row.snapshotId ?? null;


      if (resolvedSnapshotId) {
        const res = await fetch(
          diUrl + '/rest/v1/slate_snapshots?id=eq.' + resolvedSnapshotId +
          '&select=id,scope,mode,top_k_straights_json,updated_at_et',
          { headers: diHdrs }
        );
        const snapData = await res.json();
        try {
          const raw = snapData[0]?.top_k_straights_json;
          if (typeof raw === 'string') picks = JSON.parse(raw);
          else if (Array.isArray(raw)) picks = raw;
        } catch (e) {
        }
      } else {
        // Fallback: search by scope + date
        const res = await fetch(
          diUrl + '/rest/v1/slate_snapshots?scope=eq.' + row.scope +
          '&deleted_at=is.null&order=updated_at_et.desc&limit=30' +
          '&select=id,scope,top_k_straights_json,updated_at_et',
          { headers: diHdrs }
        );
        const snaps = await res.json();
        const scopeSnap = Array.isArray(snaps)
          ? (snaps.find((s: any) => (s.updated_at_et?.split('T')[0] ?? '') === row.slate_date) ?? snaps[0])
          : null;
        if (scopeSnap) {
          resolvedSnapshotId = scopeSnap.id ?? null;
          try {
            const raw = scopeSnap.top_k_straights_json;
            if (typeof raw === 'string') picks = JSON.parse(raw);
            else if (Array.isArray(raw)) picks = raw;
          } catch (_e) { /* ignore parse error */ }
        }
      }


      const [histRes, trackRes] = await Promise.all([
        fetchFromSupabase<any[]>({
          path: `/rest/v1/histories?date_et=eq.${row.slate_date}&select=result_digits,comboset_sorted,jurisdiction,session`,
          method: 'GET',
        }),
        fetchFromSupabase<any[]>({
          path: `/rest/v1/adaptive_tracking?slate_date=eq.${row.slate_date}&scope=eq.${row.scope}&select=*&limit=20`,
          method: 'GET',
        }),
      ]);

      setExpandedData({
        picks: Array.isArray(picks) ? picks : [],
        historyResults: Array.isArray(histRes) ? histRes : [],
        trackingRows: Array.isArray(trackRes) ? trackRes : [],
        snapshotId: resolvedSnapshotId,
        loaded: true,
      });
    } catch (e) {
      console.warn('[PerformanceRow] detail load failed:', e);
      setExpandedData({ picks: [], historyResults: [], trackingRows: [], snapshotId: null, loaded: true });
    } finally {
      setLoadingDetail(false);
    }
  }, [row.snapshotId, row.slate_date, row.scope, expandedData]);

  const handleToggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (next) loadDetail();
  }, [expanded, loadDetail]);

  const handleDelete = useCallback(() => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

    const softDeleteById = (id: string) => {
      setDeleting(true);
      const xhr = new XMLHttpRequest();
      xhr.open('PATCH', url + '/rest/v1/slate_snapshots?id=eq.' + id, true);
      xhr.setRequestHeader('apikey', key);
      xhr.setRequestHeader('Authorization', 'Bearer ' + key);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Prefer', 'return=minimal');
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          setDeleting(false);
          if (xhr.status >= 200 && xhr.status < 300) {
            Alert.alert('Deleted', 'Slate removed.');
            onDeleted?.();
          } else {
            Alert.alert('Failed', xhr.status + ': ' + xhr.responseText);
          }
        }
      };
      xhr.send(JSON.stringify({ deleted_at: new Date().toISOString() }));
    };

    const doDelete = async () => {
      let snapshotId = expandedData?.snapshotId ?? row.snapshotId ?? null;

      // If no pre-matched ID, look it up now by scope + date
      if (!snapshotId && row.slate_date && row.scope) {
        try {
          const res = await fetch(
            url + '/rest/v1/slate_snapshots' +
            '?scope=eq.' + encodeURIComponent(row.scope) +
            '&deleted_at=is.null' +
            '&select=id,updated_at_et' +
            '&order=updated_at_et.desc&limit=10',
            { headers: { apikey: key, Authorization: 'Bearer ' + key } }
          );
          const snaps = await res.json();
          if (Array.isArray(snaps)) {
            const match = snaps.find((s: any) =>
              (s.updated_at_et?.split('T')[0] ?? '') === row.slate_date
            );
            snapshotId = match?.id ?? null;
          }
        } catch {}
      }

      if (!snapshotId) {
        Alert.alert('Not Found', 'No snapshot found for this date and scope. It may have already been deleted.');
        return;
      }

      Alert.alert(
        'Delete Slate?',
        'Remove this slate record permanently?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => softDeleteById(snapshotId!) },
        ]
      );
    };

    doDelete();
  }, [expandedData, row.snapshotId, row.slate_date, row.scope, onDeleted]);

  // Bar width proportional to rate (max 100%)
  const barWidth = Math.min(rate, 100);

  return (
    <View style={{ marginBottom: 4 }}>
      {/* Collapsed row */}
      <TouchableOpacity
        onPress={handleToggle}
        activeOpacity={0.8}
        style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 10, paddingVertical: 10,
          backgroundColor: rowBg, borderRadius: expanded ? 12 : 10,
          borderWidth: 1, borderColor: rowBorderC,
          borderBottomLeftRadius: expanded ? 0 : 10,
          borderBottomRightRadius: expanded ? 0 : 10,
        }}
      >
        <View style={{ width: 62 }}>
          <Text style={{ fontSize: 10, fontFamily: theme.typography.fontFamily.monoBold, color: theme.colors.text, fontWeight: '700' }}>{formatDate(row.slate_date)}</Text>
        </View>
        <View style={{ width: 52 }}>
          <Text style={{ fontSize: 9, fontWeight: '700', color: scopeColor }}>{scopeLabel}</Text>
          {row.mode && <Text style={{ fontSize: 8, color: theme.colors.textTertiary }}>{row.mode}</Text>}
        </View>
        <View style={{ width: 36 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.monoBold }}>{boxHits}/{totalPicks || 6}</Text>
        </View>
        <View style={{ flex: 1, marginHorizontal: 8 }}>
          <View style={{ height: 6, backgroundColor: theme.colors.border, borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ width: `${barWidth}%`, height: 6, backgroundColor: rateColor, borderRadius: 3 }} />
          </View>
          <Text style={{ fontSize: 8, color: rateColor, fontWeight: '800', marginTop: 2 }}>{rate > 0 ? rate + '% box' : '—'}</Text>
        </View>
        <View style={{ width: 28, alignItems: 'flex-end' }}>
          {straightHits > 0 && (
            <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.teal }}>🎯{straightHits}</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={handleDelete}
          disabled={deleting}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginLeft: 6, padding: 2 }}
        >
          <Text style={{ fontSize: 13, color: deleting ? theme.colors.textTertiary : theme.colors.error }}>🗑</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 12, color: theme.colors.textTertiary, marginLeft: 4 }}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Expanded detail */}
      {expanded && (
        <View style={{
          backgroundColor: theme.colors.surface, borderWidth: 1, borderTopWidth: 0,
          borderColor: rowBorderC, borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
          padding: 12,
        }}>
          {loadingDetail ? (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : expandedData ? (
            <>
              {/* SECTION A — HIT SUMMARY */}
              <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
                Hit Summary — {formatDate(row.slate_date)} {row.scope}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text, marginBottom: 8 }}>
                Went {boxHits} for {totalPicks || expandedData.picks.length || 6}
                {straightHits > 0 ? ` (${straightHits} straight)` : ''}
              </Text>

              {expandedData.picks.length > 0 ? (() => {
                const histSet = new Map<string, any>();
                expandedData.historyResults.forEach((r: any) => {
                  const cs = r.comboset_sorted ?? ('{' + (r.result_digits ?? '').split('').sort().join(',') + '}');
                  histSet.set(cs, r);
                });
                const picksToShow = expandedData.picks.slice(0, 6);
                let boxHitCount = 0, straightHitCount = 0;
                const enriched = picksToShow.map((pick: any) => {
                  const cs = pick.comboSet ?? ('{' + (pick.combo ?? '').split('').sort().join(',') + '}');
                  const histMatch = histSet.get(cs);
                  const isStraightHit = pick.hitType === 'straight' || (histMatch && (histMatch.result_digits === pick.bestOrder || histMatch.result_digits === pick.combo));
                  const isBoxHit = !!pick.hitType || !!histMatch;
                  if (isBoxHit) boxHitCount++;
                  if (isStraightHit) straightHitCount++;
                  return { ...pick, isBoxHit, isStraightHit, histMatch };
                });
                const rankMedal = (r: number) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `#${r}`;
                return (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.text, marginBottom: 8 }}>
                      Went {boxHitCount} for {picksToShow.length} · {boxHitCount} box hit{boxHitCount !== 1 ? 's' : ''} · {straightHitCount} straight hit{straightHitCount !== 1 ? 's' : ''}
                    </Text>
                    <View style={{ gap: 6 }}>
                      {enriched.map((pick: any, pi: number) => {
                        const rank = pick.rank ?? pi + 1;
                        const combo = pick.combo ?? '???';
                        const digits = combo.split('').join(' — ');
                        const cs = pick.comboSet ?? ('{' + combo.split('').sort().join(',') + '}');
                        const bestOrder = pick.bestOrder;
                        const hasDiffOrder = bestOrder && bestOrder !== combo;
                        const energy = pick.energy ?? pick.temperature ?? 0;
                        const energyColor = energy >= 80 ? theme.colors.success : energy >= 50 ? theme.colors.gold : theme.colors.textSecondary;
                        const bBox = Math.round((pick.box ?? 0) * 100);
                        const bPburst = Math.round((pick.pburst ?? 0) * 100);
                        const bCo = Math.round((pick.co ?? 0) * 100);
                        const hitState = pick.hitState ?? pick.histMatch?.jurisdiction;
                        const hitSession = pick.hitSession ?? pick.histMatch?.session;
                        const hitResult = pick.hitResult ?? pick.histMatch?.result_digits;
                        return (
                          <View key={pi} style={{
                            padding: 10, borderRadius: 10, borderWidth: 1,
                            backgroundColor: pick.isStraightHit ? theme.colors.successLight : pick.isBoxHit ? theme.colors.gold + '14' : theme.colors.surfaceLight,
                            borderColor: pick.isStraightHit ? theme.colors.success + '66' : pick.isBoxHit ? theme.colors.gold + '55' : theme.colors.border,
                          }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                              <Text style={{ fontSize: 13, marginRight: 6 }}>{rankMedal(rank)}</Text>
                              <Text style={{ fontSize: 18, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, color: theme.colors.text, flex: 1 }}>{digits}</Text>
                              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: energyColor + '22' }}>
                                <Text style={{ fontSize: 9, fontWeight: '800', color: energyColor }}>E{energy}</Text>
                              </View>
                            </View>
                            {hasDiffOrder && (
                              <Text style={{ fontSize: 10, color: theme.colors.gold, fontWeight: '700', marginBottom: 3 }}>
                                Best order: {bestOrder?.split('').join(' — ')}
                              </Text>
                            )}
                            <Text style={{ fontSize: 9, color: theme.colors.textTertiary, marginBottom: 6 }}>{cs}</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                              {([['Freq', bBox, theme.colors.primary], ['Mom', bPburst, theme.colors.teal], ['Pat', bCo, theme.colors.rose]] as const).map(([lbl, val, color]) => (
                                <View key={lbl} style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 8, color: theme.colors.textTertiary, marginBottom: 2 }}>{lbl}</Text>
                                  <View style={{ height: 4, backgroundColor: theme.colors.border, borderRadius: 2 }}>
                                    <View style={{ width: `${Math.min(val, 100)}%`, height: 4, backgroundColor: color, borderRadius: 2 }} />
                                  </View>
                                  <Text style={{ fontSize: 8, color, marginTop: 1 }}>{val}%</Text>
                                </View>
                              ))}
                            </View>
                            {pick.isStraightHit ? (
                              <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.success }}>
                                ⭐ Straight · {hitState}{hitResult ? ` (${hitResult})` : ''}
                              </Text>
                            ) : pick.isBoxHit ? (
                              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.gold }}>
                                🎯 Box · {hitState} {hitSession ?? ''}
                              </Text>
                            ) : (
                              <Text style={{ fontSize: 9, color: theme.colors.textTertiary }}>✗ Miss</Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })() : (
                <Text style={{ fontSize: 11, color: theme.colors.textTertiary, marginBottom: 12 }}>
                  No picks stored for this slate.{'\n'}Regenerate slates to populate pick data.
                </Text>
              )}

              {/* SECTION B — SIGNAL ANALYSIS */}
              {expandedData.trackingRows.length > 0 && (() => {
                const hits = expandedData.trackingRows.filter((t: any) => t.hit_box || t.hit_straight);
                const misses = expandedData.trackingRows.filter((t: any) => !t.hit_box && !t.hit_straight);
                const avgHitEnergy = hits.length ? Math.round(hits.reduce((s: number, t: any) => s + (t.energy_score ?? 0), 0) / hits.length) : 0;
                const avgMissEnergy = misses.length ? Math.round(misses.reduce((s: number, t: any) => s + (t.energy_score ?? 0), 0) / misses.length) : 0;
                return (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Signal Analysis</Text>
                    {hits.map((t: any, ti: number) => {
                      const maxSig = Math.max(t.signal_box ?? 0, t.signal_pburst ?? 0, t.signal_co ?? 0, t.signal_dgc ?? 0);
                      const dominant = maxSig === (t.signal_box ?? 0) ? 'FREQUENCY' : maxSig === (t.signal_pburst ?? 0) ? 'MOMENTUM' : maxSig === (t.signal_co ?? 0) ? 'PATTERN' : 'CONSISTENCY';
                      return (
                        <Text key={ti} style={{ fontSize: 10, color: theme.colors.text, marginBottom: 2 }}>
                          {t.combo} hit · Freq {Math.round((t.signal_box ?? 0) * 100)}% · Mom {Math.round((t.signal_pburst ?? 0) * 100)}% · Pat {Math.round((t.signal_co ?? 0) * 100)}% · Cons {Math.round((t.signal_dgc ?? 0) * 100)}%
                          {' '}· Dominant: <Text style={{ fontWeight: '700', color: theme.colors.primary }}>{dominant}</Text>
                        </Text>
                      );
                    })}
                    {hits.length > 0 && misses.length > 0 && (
                      <Text style={{ fontSize: 10, color: theme.colors.textSecondary, marginTop: 4 }}>
                        Avg hit energy: {avgHitEnergy} · Avg miss energy: {avgMissEnergy}
                        {avgHitEnergy > avgMissEnergy ? ' · Hits scored higher' : ' · Misses scored higher'}
                      </Text>
                    )}
                  </View>
                );
              })()}

              {/* SECTION C — STATE BREAKDOWN */}
              {expandedData.historyResults.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>State Breakdown</Text>
                  <View style={{ gap: 2 }}>
                    {expandedData.historyResults.slice(0, 10).map((res: any, ri: number) => {
                      const matchedPick = expandedData.picks.find((p: any) =>
                        p.comboSet === res.comboset_sorted || (p.hitType && p.hitResult === res.result_digits)
                      );
                      const matched = !!matchedPick;
                      return (
                        <View key={ri} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, width: 80, color: theme.colors.textSecondary }}>{res.jurisdiction?.slice(0, 10) ?? '?'}</Text>
                          <Text style={{ fontSize: 10, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '700', color: theme.colors.text, width: 30 }}>{res.result_digits}</Text>
                          <Text style={{ fontSize: 10, color: matched ? theme.colors.success : theme.colors.textTertiary, flex: 1 }}>
                            {matched ? `✓ ${matchedPick.hitType} hit · Pick #${matchedPick.rank ?? '?'}` : '✗ Miss'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* SECTION D — CUMULATIVE CONTEXT */}
              {(() => {
                const allBox = allData.map(r => r.box_hit_rate ?? 0);
                const bestRow = allData.reduce((best, r) => (r.box_hit_rate ?? 0) > (best.box_hit_rate ?? 0) ? r : best, allData[0] ?? {});
                const worstRow = allData.reduce((worst, r) => (r.box_hit_rate ?? 0) < (worst.box_hit_rate ?? 0) ? r : worst, allData[0] ?? {});
                const avg30 = allBox.length ? Math.round(allBox.reduce((a, b) => a + b, 0) / allBox.length * 10) / 10 : 0;
                const vsAvg = rate - avg30;
                return (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Cumulative Context</Text>
                    <Text style={{ fontSize: 10, color: theme.colors.text, marginBottom: 2 }}>Best day: {bestRow.slate_date ? formatDate(bestRow.slate_date) : '—'} — {bestRow.box_hits ?? 0}/{bestRow.total_picks ?? 6} hits</Text>
                    <Text style={{ fontSize: 10, color: theme.colors.text, marginBottom: 2 }}>Worst day: {worstRow.slate_date ? formatDate(worstRow.slate_date) : '—'} — {worstRow.box_hits ?? 0}/{worstRow.total_picks ?? 6} hits</Text>
                    <Text style={{ fontSize: 10, color: theme.colors.text, marginBottom: 2 }}>30-day avg box rate: {avgBox}%</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: vsAvg >= 0 ? theme.colors.success : theme.colors.error }}>
                      This slate: {vsAvg >= 0 ? '+' : ''}{vsAvg.toFixed(1)}% vs average
                    </Text>
                  </View>
                );
              })()}

              {/* SECTION E — MODE ANALYSIS */}
              {(() => {
                const modes = ['balanced', 'conservative', 'aggressive'];
                const modeStats = modes.map(m => {
                  const modeRows = allData.filter(r => r.mode === m);
                  const avg = modeRows.length ? Math.round(modeRows.reduce((s: number, r: any) => s + (r.box_hit_rate ?? 0), 0) / modeRows.length * 10) / 10 : null;
                  return { mode: m, avg, count: modeRows.length };
                }).filter(m => m.count > 0);
                if (!modeStats.length) return null;
                const bestMode = modeStats.reduce((best, m) => (m.avg ?? 0) > (best.avg ?? 0) ? m : best, modeStats[0]);
                return (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Mode Analysis</Text>
                    {modeStats.map(m => (
                      <Text key={m.mode} style={{ fontSize: 10, color: m.mode === bestMode.mode ? theme.colors.primary : theme.colors.text, marginBottom: 2 }}>
                        {m.mode}: {m.avg ?? 0}% avg box rate ({m.count} slates){m.mode === bestMode.mode ? ' ← best' : ''}
                      </Text>
                    ))}
                  </View>
                );
              })()}

              {/* SECTION F — QUICK ACTIONS */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity
                  style={{ flex: 1, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.primary + '44', backgroundColor: theme.colors.primaryLight, alignItems: 'center' }}
                  onPress={() => {}}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.primary }}>View Results</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

export default function HitTrackingView() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [modeFilter, setModeFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true); setFetchError(null);
    try {
      const [rows, snaps] = await Promise.all([
        fetchFromSupabase<any[]>({
          path: '/rest/v1/rpc/calculate_hit_rates',
          method: 'POST',
          body: {},
        }),
        fetchFromSupabase<any[]>({
          path: '/rest/v1/slate_snapshots?deleted_at=is.null&select=id,scope,updated_at_et&order=updated_at_et.desc&limit=200',
          method: 'GET',
        }),
      ]);
      const snapList = Array.isArray(snaps) ? snaps : [];
      const hitRows = Array.isArray(rows) ? rows : [];
      // Merge snapshot ID into each performance row so delete + picks fetch have a real ID
      const merged = hitRows.map((row: any) => {
        const match = snapList.find((s: any) =>
          s.scope === row.scope &&
          (s.updated_at_et?.split('T')[0] ?? '') === row.slate_date
        );
        return { ...row, snapshotId: match?.id ?? null };
      });
      setData(merged);
    } catch (e) {
      setFetchError(String(e instanceof Error ? e.message : e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteDuplicates = useCallback(async () => {
    try {
      const snaps = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?deleted_at=is.null&select=id,scope,mode,updated_at_et&order=updated_at_et.desc&limit=500`,
      });
      if (!Array.isArray(snaps) || snaps.length === 0) {
        Alert.alert('No Duplicates', 'No snapshots found.'); return;
      }
      const groups = new Map<string, any[]>();
      for (const snap of snaps) {
        const date = (snap.updated_at_et ?? '').split('T')[0];
        const mode = snap.mode ?? 'balanced';
        const key = `${date}-${snap.scope}-${mode}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(snap);
      }
      const toDelete: string[] = [];
      for (const group of groups.values()) {
        if (group.length > 3) toDelete.push(...group.slice(3).map((s: any) => s.id));
      }
      if (toDelete.length === 0) {
        Alert.alert('No Duplicates', 'No duplicate snapshots found (max 3 per scope/mode/date).'); return;
      }
      Alert.alert(
        'Delete Duplicates',
        `Found ${toDelete.length} duplicate snapshot(s). Keep 3 most recent per scope/mode/date.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: async () => {
            let deleted = 0;
            let failed = 0;
            for (const id of toDelete) {
              try {
                await fetchFromSupabase({
                  path: `/rest/v1/slate_snapshots?id=eq.${id}`,
                  method: 'PATCH',
                  body: { deleted_at: new Date().toISOString() },
                });
                deleted++;
              } catch {
                failed++;
              }
            }
            Alert.alert(
              'Done',
              failed > 0
                ? `Removed ${deleted} snapshot(s). ${failed} failed — check RLS permissions.`
                : `Removed ${deleted} duplicate snapshot(s).`
            );
            load();
          }},
        ]
      );
    } catch (e) {
      Alert.alert('Error', String(e instanceof Error ? e.message : e));
    }
  }, [load]);

  const stats = useMemo(() => {
    if (!data.length) return null;
    const allBox = data.map(r => r.box_hit_rate ?? 0);
    const allStr = data.map(r => r.straight_hit_rate ?? 0);
    const avgBox = allBox.length ? Math.round(allBox.reduce((a, b) => a + b, 0) / allBox.length * 10) / 10 : 0;
    const avgStr = allStr.length ? Math.round(allStr.reduce((a, b) => a + b, 0) / allStr.length * 10) / 10 : 0;
    const best = Math.max(...allBox, 0);
    const bestRow = data.find(r => (r.box_hit_rate ?? 0) === best);
    const totalHits = data.reduce((s, r) => s + (r.box_hits ?? 0), 0);
    return { avgBox, avgStr, best, bestDate: bestRow?.slate_date ?? '', total: data.length, totalHits };
  }, [data]);

  const filtered = useMemo(() => {
    let d = data;
    if (scopeFilter !== 'all') d = d.filter(r => r.scope === scopeFilter);
    if (modeFilter !== 'all') d = d.filter(r => r.mode === modeFilter);
    return d.slice(0, 30);
  }, [data, scopeFilter, modeFilter]);

  const avgBox = stats?.avgBox ?? 0;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text }}>🎯 Slate Performance</Text>
        <TouchableOpacity onPress={load} style={{ padding: 6 }}>
          <Text style={{ fontSize: 16, color: theme.colors.primary }}>↻</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 10 }}>Slate picks vs actual draw results · tap row to expand</Text>
      <TouchableOpacity
        onPress={handleDeleteDuplicates}
        style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.error + '55', backgroundColor: theme.colors.errorLight, marginBottom: 14 }}
      >
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.error }}>🗑 Delete Duplicates</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Calculating hit rates…</Text>
        </View>
      ) : fetchError ? (
        <Card style={{ padding: 16, backgroundColor: theme.colors.errorLight, borderColor: theme.colors.error + '44' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.error, marginBottom: 4 }}>⚠️ Failed to load</Text>
          <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>{fetchError}</Text>
          <TouchableOpacity style={[st.btnPrimary, { marginTop: 12 }]} onPress={load}>
            <Text style={st.btnPrimaryText}>↺ Retry</Text>
          </TouchableOpacity>
        </Card>
      ) : !data.length ? (
        <Card style={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>📊</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>No performance data yet</Text>
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 18 }}>
            Import Results Ledger data and generate slates to begin tracking ZK6 accuracy.
          </Text>
        </Card>
      ) : (
        <>
          {/* 4 Stat Cards */}
          {stats && (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {[
                { l: 'All-Time Box %', v: stats.avgBox + '%', c: theme.colors.success, i: '✓' },
                { l: 'All-Time Straight %', v: stats.avgStr + '%', c: theme.colors.teal, i: '🎯' },
                { l: 'Best Day', v: `${stats.best}%${stats.bestDate ? '\n' + stats.bestDate.slice(5) : ''}`, c: theme.colors.gold, i: '🏆' },
                { l: 'Total Hits', v: String(stats.totalHits), c: theme.colors.primary, i: '🔢' },
              ].map(s => (
                <Card key={s.l} style={{ flex: 1, minWidth: 72, padding: 10, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, marginBottom: 2 }}>{s.i}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: s.c, fontFamily: theme.typography.fontFamily.monoBold, textAlign: 'center' }}>{s.v}</Text>
                  <Text style={{ fontSize: 8, color: theme.colors.textTertiary, fontWeight: '700', textAlign: 'center', marginTop: 2 }}>{s.l}</Text>
                </Card>
              ))}
            </View>
          )}

          {/* Scope Filter */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
            {[['all', 'All Scopes'], ['midday', '☀️ Midday'], ['evening', '🌙 Evening'], ['allday', '◈ All-Day']].map(([val, label]) => (
              <TouchableOpacity
                key={val}
                onPress={() => setScopeFilter(val)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                  backgroundColor: scopeFilter === val ? theme.colors.primary : theme.colors.surfaceLight,
                  borderWidth: 1, borderColor: scopeFilter === val ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text style={{ fontSize: 9, fontWeight: '700', color: scopeFilter === val ? '#fff' : theme.colors.textSecondary }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Mode Filter */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
            {[['all', 'All Modes'], ['balanced', 'Balanced'], ['conservative', 'Conservative'], ['aggressive', 'Aggressive']].map(([val, label]) => (
              <TouchableOpacity
                key={val}
                onPress={() => setModeFilter(val)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
                  backgroundColor: modeFilter === val ? theme.colors.teal : theme.colors.surfaceLight,
                  borderWidth: 1, borderColor: modeFilter === val ? theme.colors.teal : theme.colors.border,
                }}
              >
                <Text style={{ fontSize: 9, fontWeight: '700', color: modeFilter === val ? '#fff' : theme.colors.textSecondary }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <SectionTitle>RECENT PERFORMANCE (LAST 30 DAYS)</SectionTitle>

          {/* Column labels */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 4, marginBottom: 4 }}>
            <Text style={{ width: 62, fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8 }}>DATE</Text>
            <Text style={{ width: 52, fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8 }}>SCOPE</Text>
            <Text style={{ width: 36, fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8 }}>HITS</Text>
            <Text style={{ flex: 1, fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8 }}>BOX RATE</Text>
            <Text style={{ width: 28, fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8 }}>STR</Text>
            <Text style={{ width: 36, fontSize: 8, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8 }}>DEL</Text>
          </View>

          {filtered.map((row, i) => (
            <PerformanceRow key={`${row.slate_date}-${row.scope}-${i}`} row={row} allData={data} avgBox={avgBox} onDeleted={load} />
          ))}

          {filtered.length === 0 && (
            <Card style={{ padding: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>No data matches current filters</Text>
            </Card>
          )}

          <Card style={{ padding: 10, marginTop: 8 }}>
            <Text style={{ fontSize: 9, color: theme.colors.textTertiary, lineHeight: 15 }}>
              🟢 Green = box rate {'>'} 33% · 🟡 Yellow = 16–33% · 🔴 Red = {'<'} 16%{'\n'}
              Tap any row to expand hit details, signal analysis, and state breakdown
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}
