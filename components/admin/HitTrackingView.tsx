import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Share } from 'react-native';
import { useRouter } from 'expo-router';
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
  const router = useRouter();
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
      let picks: any[] = [];
      let resolvedSnapshotId: string | null = row.snapshotId ?? null;

      if (resolvedSnapshotId) {
        const snapData = await fetchFromSupabase<any[]>({
          path: `/rest/v1/slate_snapshots?id=eq.${resolvedSnapshotId}&select=id,scope,mode,top_k_straights_json,updated_at_et`,
        });
        try {
          const raw = Array.isArray(snapData) ? snapData[0]?.top_k_straights_json : undefined;
          if (typeof raw === 'string') picks = JSON.parse(raw);
          else if (Array.isArray(raw)) picks = raw;
        } catch {}
      } else {
        // Fallback: search by scope + slate_date (canonical date column).
        // B5 fix: was matching on updated_at_et.split('T')[0] which fails
        // when a slate is regenerated past midnight ET but tagged with
        // the prior date's slate_date.
        const snaps = await fetchFromSupabase<any[]>({
          path: `/rest/v1/slate_snapshots?scope=eq.${row.scope}&slate_date=eq.${row.slate_date}&deleted_at=is.null&order=updated_at_et.desc&limit=10&select=id,scope,top_k_straights_json,updated_at_et`,
        });
        const scopeSnap = Array.isArray(snaps) ? snaps[0] : null;
        if (scopeSnap) {
          resolvedSnapshotId = scopeSnap.id ?? null;
          try {
            const raw = scopeSnap.top_k_straights_json;
            if (typeof raw === 'string') picks = JSON.parse(raw);
            else if (Array.isArray(raw)) picks = raw;
          } catch {}
        }
      }


      // B6/B10 fix: explicit columns instead of select=*, raise limit so
      // multi-state secondary rows don't get truncated (6 K6 primary + up
      // to ~6 secondaries per pick = 50 is comfortable).
      const [histRes, trackRes] = await Promise.all([
        fetchFromSupabase<any[]>({
          path: `/rest/v1/histories?date_et=eq.${row.slate_date}&select=result_digits,comboset_sorted,jurisdiction,session`,
          method: 'GET',
        }),
        fetchFromSupabase<any[]>({
          path: `/rest/v1/adaptive_tracking?slate_date=eq.${row.slate_date}&scope=eq.${row.scope}&select=rank,combo,combo_set,signal_box,signal_pburst,signal_co,signal_burst,energy_score,mode,hit_box,hit_straight,actual_result,matched_state,matched_session,dominant_signal,box_top_quartile,pburst_top_quartile,co_top_quartile,burst_top_quartile&limit=100`,
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
    const softDeleteById = async (id: string) => {
      setDeleting(true);
      try {
        await fetchFromSupabase({
          path: `/rest/v1/slate_snapshots?id=eq.${id}`,
          method: 'PATCH',
          body: { deleted_at: new Date().toISOString() },
        });
        Alert.alert('Deleted', 'Slate removed.');
        onDeleted?.();
      } catch (e) {
        Alert.alert('Failed', String(e));
      } finally {
        setDeleting(false);
      }
    };

    const doDelete = async () => {
      let snapshotId = expandedData?.snapshotId ?? row.snapshotId ?? null;

      // If no pre-matched ID, look it up now by scope + date
      if (!snapshotId && row.slate_date && row.scope) {
        try {
          const snaps = await fetchFromSupabase<any[]>({
            path: `/rest/v1/slate_snapshots?scope=eq.${encodeURIComponent(row.scope)}&deleted_at=is.null&select=id,updated_at_et&order=updated_at_et.desc&limit=10`,
          });
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
        'Soft-delete slate?',
        'Hides this slate from views. Recoverable from "Recently deleted" panel for 30 days.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Soft-delete', style: 'destructive', onPress: () => softDeleteById(snapshotId!) },
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

              {/* Phase 3 — PROVENANCE + QUARTILE STRATIFICATION
                  Two summary blocks above Section B:
                  (1) "Where the hits came from" — distinct jurisdictions /
                      sessions per pick, surfaces multi-state matches
                      visibly (e.g. pick 916 hit BOTH WI AND ME,NH,VT).
                  (2) "Top-quartile lift" — for each signal, hit rate of
                      top-quartile picks vs others within today's data. Uses
                      the *_top_quartile flags from ENH-02. */}
              {expandedData.trackingRows.filter((t: any) => t.hit_box || t.hit_straight).length > 0 && (() => {
                const hits = expandedData.trackingRows.filter((t: any) => t.hit_box || t.hit_straight);
                // Provenance: group by combo, list every state that hit it
                const byCombo = new Map<string, any[]>();
                for (const h of hits) {
                  if (!byCombo.has(h.combo)) byCombo.set(h.combo, []);
                  byCombo.get(h.combo)!.push(h);
                }
                return (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Where the hits came from</Text>
                    {[...byCombo.entries()].map(([combo, matches], ci) => (
                      <View key={ci} style={{ marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, color: theme.colors.text }}>
                          <Text style={{ fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '900', letterSpacing: 2 }}>{combo}</Text>
                          {' hit '}
                          {matches.length === 1
                            ? <Text>in <Text style={{ fontWeight: '700' }}>{matches[0].matched_state}</Text> · {matches[0].matched_session}</Text>
                            : <>
                                in <Text style={{ fontWeight: '700' }}>{matches.length} jurisdictions</Text>:
                                {' '}{matches.map((m: any, i: number) =>
                                  <Text key={i} style={{ color: theme.colors.gold, fontWeight: '700' }}>
                                    {m.matched_state}{i < matches.length - 1 ? ' · ' : ''}
                                  </Text>
                                )}
                              </>
                          }
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })()}

              {/* Quartile stratification — across this slate's K6 picks,
                  show hit rate by signal-quartile flag. Reads the
                  pre-computed *_top_quartile booleans (ENH-02). */}
              {expandedData.trackingRows.length >= 3 && (() => {
                const all = expandedData.trackingRows;
                const isHit = (t: any) => !!(t.hit_box || t.hit_straight);
                const flags: Array<[string, string, string]> = [
                  ['Frequency',   'box_top_quartile',    'box'],
                  ['Momentum',    'pburst_top_quartile', 'pburst'],
                  ['Pattern',     'co_top_quartile',     'co'],
                  ['Consistency', 'burst_top_quartile',  'burst'],
                ];
                return (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>Top-quartile lift</Text>
                    {flags.map(([label, flag]) => {
                      const top = all.filter((t: any) => t[flag] === true);
                      const bot = all.filter((t: any) => t[flag] === false);
                      const tHits = top.filter(isHit).length;
                      const bHits = bot.filter(isHit).length;
                      const tRate = top.length ? Math.round((tHits / top.length) * 100) : 0;
                      const bRate = bot.length ? Math.round((bHits / bot.length) * 100) : 0;
                      const lift = tRate - bRate;
                      const tone = lift >= 10 ? theme.colors.success : lift >= 3 ? theme.colors.gold : lift >= -3 ? theme.colors.textTertiary : theme.colors.error;
                      return (
                        <View key={label} style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 2 }}>
                          <Text style={{ fontSize: 10, color: theme.colors.text, width: 88 }}>{label}</Text>
                          <Text style={{ fontSize: 10, color: theme.colors.textSecondary, flex: 1, fontFamily: theme.typography.fontFamily.mono }}>
                            top: {tRate}%  ·  other: {bRate}%
                          </Text>
                          <Text style={{ fontSize: 10, fontWeight: '900', color: tone, fontFamily: theme.typography.fontFamily.monoBold }}>
                            {lift >= 0 ? '+' : ''}{lift}pp
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}

              {/* SECTION B — WHY THESE PICKS WORKED
                  Reads from adaptive_tracking (ENH-01). Subscriber-voice copy:
                  no "AUC", "energy", "PBURST" — plain Frequency/Momentum/
                  Pattern/Consistency, conversational framing. Lives in admin
                  but reads like something you'd be comfortable showing a
                  subscriber. */}
              {expandedData.trackingRows.length > 0 && (() => {
                const hits = expandedData.trackingRows.filter((t: any) => t.hit_box || t.hit_straight);
                const misses = expandedData.trackingRows.filter((t: any) => !t.hit_box && !t.hit_straight);
                // Friendly names for each signal channel
                const FRIENDLY: Record<string, string> = {
                  BOX: 'Frequency',
                  PBURST: 'Momentum',
                  CO: 'Pattern',
                  DGC: 'Consistency',
                };
                // adaptive_tracking stores DGC in signal_burst (legacy name)
                const dgcOf = (t: any) => t.signal_burst ?? t.signal_dgc ?? 0;
                // Use dominant_signal column if present, otherwise compute
                const dominantOf = (t: any) => {
                  if (t.dominant_signal && FRIENDLY[t.dominant_signal]) return FRIENDLY[t.dominant_signal];
                  const bs = t.signal_box ?? 0, ps = t.signal_pburst ?? 0;
                  const cs = t.signal_co ?? 0,  ds = dgcOf(t);
                  if (bs >= ps && bs >= cs && bs >= ds) return 'Frequency';
                  if (ps >= cs && ps >= ds) return 'Momentum';
                  if (cs >= ds) return 'Pattern';
                  return 'Consistency';
                };
                return (
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: theme.colors.text, marginBottom: 6 }}>
                      Why these picks worked
                    </Text>
                    {hits.length === 0 ? (
                      <Text style={{ fontSize: 10, color: theme.colors.textTertiary, fontStyle: 'italic' }}>
                        No hits today to break down.
                      </Text>
                    ) : (
                      hits.map((t: any, ti: number) => {
                        const dominant = dominantOf(t);
                        return (
                          <View key={ti} style={{ marginBottom: 8, padding: 8, borderRadius: 8, backgroundColor: theme.colors.gold + '11', borderWidth: 1, borderColor: theme.colors.gold + '33' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ fontSize: 14, fontWeight: '900', color: theme.colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 2 }}>{t.combo}</Text>
                              <Text style={{ fontSize: 10, color: theme.colors.gold, fontWeight: '700' }}>
                                {dominant} led this pick
                              </Text>
                            </View>
                            {/* Friendly signal bars */}
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {([
                                ['Frequency',   t.signal_box ?? 0,    theme.colors.cyan,   t.box_top_quartile],
                                ['Momentum',    t.signal_pburst ?? 0, theme.colors.rose,   t.pburst_top_quartile],
                                ['Pattern',     t.signal_co ?? 0,     theme.colors.purple, t.co_top_quartile],
                                ['Consistency', dgcOf(t),             theme.colors.gold,   t.burst_top_quartile],
                              ] as const).map(([lbl, val, color, topQ]) => (
                                <View key={lbl} style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 8, color: theme.colors.textTertiary, marginBottom: 2 }}>
                                    {lbl}{topQ ? ' ★' : ''}
                                  </Text>
                                  <View style={{ height: 4, backgroundColor: theme.colors.border, borderRadius: 2 }}>
                                    <View style={{ width: `${Math.min(val * 100, 100)}%`, height: 4, backgroundColor: color, borderRadius: 2 }} />
                                  </View>
                                  <Text style={{ fontSize: 9, color, marginTop: 2, fontFamily: theme.typography.fontFamily.monoBold }}>
                                    {Math.round(val * 100)}
                                  </Text>
                                </View>
                              ))}
                            </View>
                            <Text style={{ fontSize: 8, color: theme.colors.textTertiary, marginTop: 5, fontStyle: 'italic' }}>
                              ★ = top quartile of the day
                            </Text>
                          </View>
                        );
                      })
                    )}
                    {hits.length > 0 && misses.length > 0 && (() => {
                      // Subscriber-friendly framing — no "avg energy", just
                      // "your strongest picks vs the rest."
                      const hitStrong = hits.reduce((s: number, t: any) => s + (t.energy_score ?? 0), 0) / hits.length;
                      const missStrong = misses.reduce((s: number, t: any) => s + (t.energy_score ?? 0), 0) / misses.length;
                      const diff = Math.round(hitStrong - missStrong);
                      return (
                        <Text style={{ fontSize: 10, color: theme.colors.textSecondary, marginTop: 6 }}>
                          {diff > 5 ? (
                            <>✓ Your winning picks were stronger going in (by {diff} points) — the engine ranked them higher and they delivered.</>
                          ) : diff > -5 ? (
                            <>The winners and the rest scored about the same going in. Luck of the draw today.</>
                          ) : (
                            <>⚠ The winners actually scored {Math.abs(diff)} points lower than the rest going in — worth investigating.</>
                          )}
                        </Text>
                      );
                    })()}
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
                  onPress={() => router.push('/(tabs)/results')}
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

  // Phase 1 (B1 fix): replace `calculate_hit_rates` RPC with client-side
  // aggregation over `adaptive_tracking`. The RPC reads hit annotations off
  // the CURRENT active snapshot — which after a mid-day regen has none,
  // because the engine excluded already-drawn box-sets from the new picks.
  // adaptive_tracking holds the hit log keyed by slate_hash so regens don't
  // erase history. Also de-dupes multi-state secondary matches so a single
  // pick that hit in 2 states still counts as 1 hit.
  //
  // Phase 1 (B5 fix): match by `slate_date`, not `updated_at_et.split('T')[0]`
  // — slate_date is canonical; updated_at_et can be the next ET day for
  // late-night regens.
  const load = useCallback(async () => {
    setLoading(true); setFetchError(null);
    try {
      // Pull last 60 days of K6 picks across all snapshots (paginate)
      const since = (() => {
        const d = new Date(); d.setUTCDate(d.getUTCDate() - 60);
        return d.toISOString().slice(0, 10);
      })();
      let at: any[] = [];
      for (let off = 0; off < 5000; off += 1000) {
        const page = await fetchFromSupabase<any[]>({
          path: `/rest/v1/adaptive_tracking?slate_date=gte.${since}&select=slate_date,scope,mode,combo,hit_box,hit_straight,slate_hash,matched_state&limit=1000&offset=${off}`,
        });
        if (!Array.isArray(page) || page.length === 0) break;
        at.push(...page);
        if (page.length < 1000) break;
      }

      // Get all snapshots (active + soft-deleted) in window — we need them
      // to pick the right snapshotId per (date, scope, mode) row, preferring
      // the snapshot with the most hit annotations so the row's "delete"
      // button targets the meaningful version.
      const snaps = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?slate_date=gte.${since}&select=id,scope,slate_date,hash,updated_at_et,deleted_at,top_k_straights_json&order=slate_date.desc,updated_at_et.desc&limit=500`,
      });
      const snapList = Array.isArray(snaps) ? snaps : [];

      // Aggregate hits per (slate_date, scope, mode). Multi-state secondary
      // rows (same combo, different matched_state) are de-duped — one combo
      // hitting in 2 states = 1 hit.
      type Agg = { box: Set<string>; straight: Set<string>; total: number };
      const aggMap = new Map<string, Agg>();
      const totalByKey = new Map<string, Set<string>>();
      for (const r of at) {
        if (!r.slate_date || !r.scope) continue;
        const mode = r.mode || 'balanced';
        const key = `${r.slate_date}|${r.scope}|${mode}`;
        if (!aggMap.has(key)) aggMap.set(key, { box: new Set(), straight: new Set(), total: 0 });
        if (!totalByKey.has(key)) totalByKey.set(key, new Set());
        const a = aggMap.get(key)!;
        const tk = totalByKey.get(key)!;
        if (r.combo) tk.add(r.combo);
        if (r.hit_box && r.combo) a.box.add(r.combo);
        if (r.hit_straight && r.combo) a.straight.add(r.combo);
      }

      // For each (date, scope, mode), pick the snapshot with the most hit
      // annotations on top_k_straights_json — the row that the screen
      // operations should target. Mirrors the Replay logic.
      const snapHitCount = (s: any) =>
        Array.isArray(s.top_k_straights_json)
          ? s.top_k_straights_json.filter((p: any) => p?.hitType).length
          : 0;
      const snapByKey = new Map<string, any[]>();
      for (const s of snapList) {
        const mode = s.mode || 'balanced';
        const key = `${s.slate_date}|${s.scope}|${mode}`;
        if (!snapByKey.has(key)) snapByKey.set(key, []);
        snapByKey.get(key)!.push(s);
      }

      const rows: any[] = [];
      for (const [key, agg] of aggMap.entries()) {
        const [slate_date, scope, mode] = key.split('|');
        const total = Math.max(totalByKey.get(key)?.size ?? 0, 6);
        const candidates = (snapByKey.get(key) ?? []).slice().sort((a, b) => {
          const ha = snapHitCount(a), hb = snapHitCount(b);
          if (hb !== ha) return hb - ha;
          // Tie-break: prefer active (not soft-deleted), then most-recent updated_at
          if (!!a.deleted_at !== !!b.deleted_at) return a.deleted_at ? 1 : -1;
          return (b.updated_at_et ?? '').localeCompare(a.updated_at_et ?? '');
        });
        const chosen = candidates[0];
        rows.push({
          slate_date, scope, mode,
          total_picks: total,
          box_hits: agg.box.size,
          straight_hits: agg.straight.size,
          box_hit_rate: total > 0 ? Math.round((agg.box.size / total) * 1000) / 10 : 0,
          straight_hit_rate: total > 0 ? Math.round((agg.straight.size / total) * 1000) / 10 : 0,
          snapshotId: chosen?.id ?? null,
          snapshotHash: chosen?.hash ?? null,
          snapshotDeleted: !!chosen?.deleted_at,
        });
      }
      rows.sort((a, b) => b.slate_date.localeCompare(a.slate_date));
      setData(rows);
    } catch (e) {
      setFetchError(String(e instanceof Error ? e.message : e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteDuplicates = useCallback(async () => {
    try {
      const snaps = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?deleted_at=is.null&select=id,scope,mode,slate_date,updated_at_et,top_k_straights_json&order=updated_at_et.desc&limit=500`,
      });
      if (!Array.isArray(snaps) || snaps.length === 0) {
        Alert.alert('No Duplicates', 'No snapshots found.'); return;
      }
      // Phase 2 (B4 fix): keep 1 most recent per (slate_date, scope, mode).
      // Duplicates are bugs left over from race conditions in older regen
      // paths — there's no valid reason to have 2+ active snapshots for
      // the same logical slate. The previous "keep 3" was supplemental-slate
      // legacy that no longer applies post-BUG-127.
      // Phase 2 (B5 fix): group by slate_date, not updated_at_et.split('T')[0].
      const groups = new Map<string, any[]>();
      for (const snap of snaps) {
        const date = snap.slate_date ?? (snap.updated_at_et ?? '').split('T')[0];
        const mode = snap.mode ?? 'balanced';
        const key = `${date}-${snap.scope}-${mode}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(snap);
      }
      // Within each group: prefer the snapshot with the most hit annotations
      // (the slate that actually recorded hits beats a post-regen empty one).
      // Ties broken by most-recent updated_at_et.
      const snapHitCount = (s: any) =>
        Array.isArray(s.top_k_straights_json)
          ? s.top_k_straights_json.filter((p: any) => p?.hitType).length
          : 0;
      const toDelete: string[] = [];
      for (const group of groups.values()) {
        if (group.length <= 1) continue;
        const ranked = group.slice().sort((a, b) => {
          const ha = snapHitCount(a), hb = snapHitCount(b);
          if (hb !== ha) return hb - ha;
          return (b.updated_at_et ?? '').localeCompare(a.updated_at_et ?? '');
        });
        toDelete.push(...ranked.slice(1).map((s: any) => s.id));
      }
      if (toDelete.length === 0) {
        Alert.alert('No Duplicates', 'No duplicate active snapshots found.'); return;
      }
      Alert.alert(
        'Soft-delete duplicates?',
        `Found ${toDelete.length} duplicate snapshot(s). Keep 1 most recent per scope/mode/date (the one with hits, if any).`,
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
      {/* Phase 6: action row — duplicate cleanup + CSV export */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <TouchableOpacity
          onPress={handleDeleteDuplicates}
          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.error + '55', backgroundColor: theme.colors.errorLight }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.error }}>🗑 Clean Duplicates</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={async () => {
            // Phase 6: export current performance table to CSV for offline review.
            // Uses the in-memory `data` array (already filtered + aggregated).
            const header = 'slate_date,scope,mode,total_picks,box_hits,straight_hits,box_hit_rate,straight_hit_rate,snapshot_hash';
            const lines = data.map(r => [
              r.slate_date, r.scope, r.mode ?? 'balanced',
              r.total_picks ?? 6, r.box_hits ?? 0, r.straight_hits ?? 0,
              r.box_hit_rate ?? 0, r.straight_hit_rate ?? 0,
              r.snapshotHash ?? '',
            ].join(','));
            const csv = [header, ...lines].join('\n');
            try {
              await Share.share({ message: csv, title: `zk6-performance-${getTodayET()}.csv` });
            } catch (e) { Alert.alert('Share failed', String(e)); }
          }}
          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.primary + '55', backgroundColor: theme.colors.primaryLight }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.primary }}>📋 Export CSV</Text>
        </TouchableOpacity>
      </View>

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

          {/* Phase 4 — Recently deleted (last 30d) panel.
              Soft-deletes set deleted_at; this surface lists them and
              offers a one-tap PATCH back to deleted_at=null. Cap displayed
              rows at 50 for perf. Audit-log every restore. */}
          <RecentlyDeletedPanel onRestored={load} />

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

// ─── Phase 4 — Recently deleted panel ───────────────────────────────────────
function RecentlyDeletedPanel({ onRestored }: { onRestored?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const since = (() => {
        const d = new Date(); d.setUTCDate(d.getUTCDate() - 30);
        return d.toISOString().slice(0, 10);
      })();
      const data = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?deleted_at=not.is.null&slate_date=gte.${since}&select=id,scope,slate_date,hash,deleted_at,top_k_straights_json&order=deleted_at.desc&limit=50`,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (expanded && rows.length === 0) load(); }, [expanded, rows.length, load]);

  const restore = useCallback((id: string, scope: string, slate_date: string, hash: string) => {
    Alert.alert(
      'Restore snapshot?',
      `Brings ${scope} ${slate_date} (${hash?.slice(0,8)}) back as active. Other active snapshots for the same scope/date stay active — you may end up with duplicates.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setRestoringId(id);
            try {
              await fetchFromSupabase({
                path: `/rest/v1/slate_snapshots?id=eq.${id}`,
                method: 'PATCH',
                body: { deleted_at: null },
              });
              await fetchFromSupabase({
                path: '/rest/v1/audit_logs',
                method: 'POST',
                headers: { 'Prefer': 'return=minimal' },
                body: {
                  action: 'restore_snapshot',
                  target: id,
                  payload_meta: { scope, slate_date, hash, note: 'Phase 4 manual restore' },
                },
              });
              Alert.alert('Restored', `${scope} ${slate_date} is active again.`);
              setRows(prev => prev.filter(r => r.id !== id));
              onRestored?.();
            } catch (e) {
              Alert.alert('Failed', String(e));
            } finally {
              setRestoringId(null);
            }
          },
        },
      ],
    );
  }, [onRestored]);

  const hitsOf = (s: any) =>
    Array.isArray(s.top_k_straights_json)
      ? s.top_k_straights_json.filter((p: any) => p?.hitType).length
      : 0;

  return (
    <Card style={{ padding: 12, marginTop: 8 }}>
      <TouchableOpacity onPress={() => setExpanded(e => !e)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 14 }}>{expanded ? '▾' : '▸'}</Text>
        <Text style={{ fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary, letterSpacing: 0.4 }}>
          Recently deleted (last 30d)
        </Text>
        <View style={{ flex: 1 }} />
        {!expanded && (
          <Text style={{ fontSize: 10, color: theme.colors.textTertiary }}>tap to expand</Text>
        )}
      </TouchableOpacity>
      {expanded && (
        <View style={{ marginTop: 10, gap: 6 }}>
          {loading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : rows.length === 0 ? (
            <Text style={{ fontSize: 10, color: theme.colors.textTertiary }}>Nothing soft-deleted in the last 30 days.</Text>
          ) : (
            rows.map(r => {
              const hits = hitsOf(r);
              const isRestoring = restoringId === r.id;
              return (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: theme.colors.bgElevated, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border }}>
                  <Text style={{ fontSize: 10, fontFamily: theme.typography.fontFamily.monoBold, color: theme.colors.text, width: 76 }}>
                    {r.slate_date}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: theme.colors.textSecondary, width: 56 }}>
                    {r.scope}
                  </Text>
                  <Text style={{ fontSize: 9, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, flex: 1 }}>
                    {r.hash?.slice(0,8)} · {hits} hit{hits === 1 ? '' : 's'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => restore(r.id, r.scope, r.slate_date, r.hash)}
                    disabled={isRestoring}
                    style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: theme.colors.primaryLight, borderWidth: 1, borderColor: theme.colors.primary + '66' }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: theme.colors.primary }}>
                      {isRestoring ? '…' : '↶ Restore'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      )}
    </Card>
  );
}
