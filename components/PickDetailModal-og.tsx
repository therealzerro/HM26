import React, { useMemo, useState } from 'react';
import {
  Modal, ScrollView, View, Text, TouchableOpacity, Share, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { PickItem, formatLastSeen, optimalPlay } from './PickCard';
imprt { storage } from '@/lib/storage';


// ─── Helpers ──────────────────────────────────────────────────────────────────

function energyColor(e: number) {
  if (e >= 80) return theme.colors.error;
  if (e >= 65) return theme.colors.orange;
  if (e >= 45) return theme.colors.gold;
  return theme.colors.textTertiary;
}

function sp(a: string, b: string) { return a <= b ? a + b : b + a; }

function getPairs(order: string) {
  return {
    front: sp(order[0], order[1]),
    back:  sp(order[1], order[2]),
    split: sp(order[0], order[2]),
  };
}

function whySummary(pick: PickItem): string {
  const { BOX, PBURST, CO } = pick.signals;
  const parts: string[] = [];
  if (BOX >= 0.65)    parts.push('high frequency');
  if (PBURST >= 0.65) parts.push('pair momentum surging');
  if (CO >= 0.65)     parts.push('strong digit pattern');
  if (pick.drawsSince != null && pick.drawsSince > 200) parts.push(`overdue (${pick.drawsSince}d)`);
  return parts.length ? parts.join(' · ') : 'Multiple signals converging on this combo';
}

function pressureVerdict(ds: number, td: number) {
  if (td <= 0) return { label: 'UNKNOWN', color: theme.colors.textTertiary, emoji: '❓' };
  const exp = Math.round(365 / td);
  if (ds < 30)         return { label: 'RECENTLY HIT', color: theme.colors.success,      emoji: '✅' };
  if (ds > exp * 1.5)  return { label: 'OVERDUE',      color: theme.colors.error,         emoji: '🔥' };
  if (ds > exp * 0.8)  return { label: 'DUE',          color: theme.colors.orange,        emoji: '⚡' };
  return                      { label: 'ON TRACK',     color: theme.colors.gold,          emoji: '◈' };
}

function normalizePairKey(raw: string): string {
  const digits = (raw.match(/\d/g) ?? []).join('').slice(0, 2);
  if (digits.length !== 2) return '';
  return digits[0] <= digits[1] ? digits : digits[1] + digits[0];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface PickDetailModalProps {
  pick: PickItem;
  scope: string;
  isPro: boolean;
  onClose: () => void;
  onHeatCheck?: (combo: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PickDetailModal({ pick, scope, isPro, onClose, onHeatCheck }: PickDetailModalProps) {
  const [savedMsg, setSavedMsg] = useState('');

  const bestOrder = pick.bestOrder ?? pick.combo;
  const col = energyColor(pick.energy);
  const energyLabel = pick.energy >= 90 ? 'ON FIRE' : pick.energy >= 80 ? 'BLAZING' : pick.energy >= 65 ? 'HOT' : pick.energy >= 45 ? 'WARM' : 'COOL';
  const energyEmoji = pick.energy >= 80 ? '🔥' : pick.energy >= 65 ? '⚡' : pick.energy >= 45 ? '✦' : '❄';
  const medal = pick.rank === 1 ? '🥇' : pick.rank === 2 ? '🥈' : pick.rank === 3 ? '🥉' : `#${pick.rank}`;

  const pairs = useMemo(() => getPairs(bestOrder), [bestOrder]);

  // ── State confidence (live) ──
  const { data: stateConfidence = [] } = useQuery<Array<{ state: string; confidence: number }>>({
    queryKey: ['state_confidence', scope],
    queryFn: async () => {
      try {
        const sessionFilter = scope === 'allday' ? '' : `&session=eq.${encodeURIComponent(scope)}`;
        const rows = await fetchFromSupabase<{ jurisdiction: string }[]>({
          path: `/rest/v1/histories?select=jurisdiction${sessionFilter}&limit=5000&jurisdiction=not.in.(ME,NH,VT,MS,PR,MD,MS2)`,
        });
        if (!Array.isArray(rows) || rows.length === 0) return [];
        const counts: Record<string, number> = {};
        for (const r of rows) {
          if (r.jurisdiction) counts[r.jurisdiction] = (counts[r.jurisdiction] ?? 0) + 1;
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const max = sorted[0]?.[1] ?? 1;
        return sorted.map(([state, count]) => ({ state, confidence: Math.round((count / max) * 100) }));
      } catch { return []; }
    },
    staleTime: 10 * 60 * 1000,
  });

  // ── Pair intelligence ──
  const { data: pairRows = [] } = useQuery({
    queryKey: ['pair_intel', pick.combo, scope],
    queryFn: async () => {
      try {
        const rows = await fetchFromSupabase<any[]>({
          path: `/rest/v1/datasets_pair?scope=eq.${encodeURIComponent(scope)}&horizon_label=eq.H01Y&class_id=in.(2,3,4)&select=key,key_pair,class_id,ds_raw,times_drawn`,
        });
        if (!Array.isArray(rows)) return [];
        const wantedPairs = new Set([pairs.front, pairs.back, pairs.split]);
        return rows.filter(r => {
          const nk = normalizePairKey(String(r.key_pair ?? r.key ?? ''));
          return wantedPairs.has(nk);
        });
      } catch { return []; }
    },
    enabled: isPro,
    staleTime: 5 * 60 * 1000,
  });

  // ── Horizon depth ──
  const { data: horizonRows = [] } = useQuery({
    queryKey: ['horizon_depth', pick.combo, scope],
    queryFn: async () => {
      try {
        const sortedKey = '{' + pick.combo.split('').sort().join(',') + '}';
        const rows = await fetchFromSupabase<any[]>({
          path: `/rest/v1/datasets_box?key=eq.${encodeURIComponent(sortedKey)}&class_id=eq.1&scope=eq.${encodeURIComponent(scope)}&deleted_at=is.null&select=horizon_label,ds_raw,times_drawn&order=horizon_label.asc`,
        });
        return Array.isArray(rows) ? rows : [];
      } catch { return []; }
    },
    enabled: isPro,
    staleTime: 5 * 60 * 1000,
  });

  // ── Pair scores ──
  const pairScores = useMemo(() => {
    const getScore = (pairKey: string, classId: number) => {
      const row = pairRows.find(r => normalizePairKey(String(r.key_pair ?? r.key ?? '')) === pairKey && r.class_id === classId);
      return row ? (r => r.ds_raw ?? 0)(row) : 0;
    };
    const f = getScore(pairs.front, 2);
    const b = getScore(pairs.back, 3);
    const sp2 = getScore(pairs.split, 4);
    const mx = Math.max(f, b, sp2, 1);
    return { front: Math.round((f / mx) * 100), back: Math.round((b / mx) * 100), split: Math.round((sp2 / mx) * 100) };
  }, [pairRows, pairs]);

  const maxHDs = useMemo(() => Math.max(...horizonRows.map((r: any) => r.ds_raw ?? 0), 1), [horizonRows]);
  const horizonTrend = useMemo(() => {
    if (horizonRows.length < 2) return 'Stable';
    const scores = horizonRows.map((r: any) => r.ds_raw ?? 0);
    const delta = scores[scores.length - 1] - scores[0];
    if (delta > scores[0] * 0.15) return 'Strengthening';
    if (delta < -scores[0] * 0.15) return 'Declining';
    return 'Stable';
  }, [horizonRows]);

  // ── Pressure ──
  const hasPressure = (pick.timesDrawn ?? 0) > 0;
  const rawDs = pick.drawsSince;
  const dsDisplay: number | null = (rawDs != null && rawDs > 0 && rawDs < 500) ? rawDs : null;
  const dsLabel: string =
    rawDs == null     ? 'No data available' :
    rawDs === 0       ? 'Hit today or recently' :
    rawDs >= 500      ? 'No recent history' :
    String(rawDs);
  const expectedEvery = hasPressure ? Math.round(365 / (pick.timesDrawn ?? 1)) : null;
  const verdict = hasPressure && dsDisplay != null ? pressureVerdict(dsDisplay, pick.timesDrawn ?? 0) : null;
  const lastHit = formatLastSeen(pick.lastSeen);
  const play = optimalPlay(pick.energy);

  const handleSave = async () => {
    try {
      const entry = { id: 'pick_' + Date.now(), combo: pick.combo, note: `Energy ${pick.energy} · ${bestOrder}`, starred: false, energy: pick.energy, savedAt: new Date().toISOString() };
      const existing = await storage.getItem('saved_picks');
      const picks = existing ? JSON.parse(existing) : [];
      picks.unshift(entry);
      await storage.setItem('saved_picks', JSON.stringify(picks));
      setSavedMsg('Saved! ✓');
      setTimeout(() => setSavedMsg(''), 2200);
    } catch { /* ignore */ }
  };

  const handleShare = async () => {
    const freq = Math.round(pick.signals.BOX * 100);
    const mom = Math.round(pick.signals.PBURST * 100);
    const pat = Math.round(pick.signals.CO * 100);
    try {
      await Share.share({
        message:
          `🎯 ZK6 Pick: ${bestOrder} (Box: ${pick.comboSet})\n` +
          `Energy ${pick.energy}/100 | Freq ${freq}% | Mom ${mom}% | Pat ${pat}%\n` +
          `Best Straight: ${bestOrder}\n` +
          `Powered by HitMaster ZK6™ Intelligence\n` +
          `hitmaster.app #HitMaster #Pick3 #ZK6`,
      });
    } catch { /* ignore */ }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 52 }}>

            {/* ── HERO ── */}
            <LinearGradient colors={[col + '22', col + '06']} style={s.hero}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 24 }}>{medal}</Text>
                <Text style={s.rankLabel}>PICK #{pick.rank}</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                  <Text style={s.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              {(() => {
                const SCOPE_LABELS: Record<string, string> = { midday: 'Midday', evening: 'Evening', allday: 'All Day' };
                const sl = SCOPE_LABELS[pick.snapshotScope ?? scope] ?? (pick.snapshotScope ?? scope);
                const genTime = pick.generatedAt ? (() => {
                  try {
                    const d = new Date(pick.generatedAt!);
                    return isNaN(d.getTime()) ? null : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' ET';
                  } catch { return null; }
                })() : null;
                if (!sl && !genTime) return null;
                return (
                  <View style={{ backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8 }}>
                    <Text style={{ fontSize: 10, color: theme.colors.textSecondary, fontWeight: '600' }}>
                      {`ZK6 v2.1 · ${sl} scope${genTime ? ` · Generated ${genTime}` : ''}`}
                    </Text>
                  </View>
                );
              })()}

              <Text style={s.optLabel}>OPTIMAL STRAIGHT</Text>

              {/* Digit badges */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginVertical: 10 }}>
                {bestOrder.split('').map((digit, i) => (
                  <View key={i} style={{ alignItems: 'center', gap: 5 }}>
                    <View style={[s.digitBadge, { borderColor: col, backgroundColor: col + '18' }]}>
                      <Text style={[s.digitText, { color: col }]}>{digit}</Text>
                    </View>
                    <Text style={s.posLabel}>Pos {i + 1}</Text>
                  </View>
                ))}
                <View style={{ flex: 1, paddingBottom: 4 }}>
                  <Text style={[s.heroDigits, { color: col }]}>
                    {bestOrder[0]} — {bestOrder[1]} — {bestOrder[2]}
                  </Text>
                </View>
              </View>

              {/* Why this order */}
              <View style={[s.heroCard, { borderColor: col + '33' }]}>
                <Text style={[s.heroCardLabel, { color: col }]}>WHY THIS ORDER</Text>
                <Text style={s.heroCardLine}>Front pair {bestOrder[0]}{bestOrder[1]} scores highest momentum</Text>
                <Text style={s.heroCardLine}>Back pair {bestOrder[1]}{bestOrder[2]} scores highest pattern</Text>
                <Text style={s.heroCardLine}>Split pair {bestOrder[0]}{bestOrder[2]} confirms signal alignment</Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <Text style={s.boxPlayLabel}>Box Play:</Text>
                <Text style={s.boxPlayText}>any order of {pick.comboSet} wins</Text>
              </View>

              {/* Energy gauge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 }}>
                <View style={[s.energyCircle, { borderColor: col }]}>
                  <Text style={[s.energyNum, { color: col }]}>{pick.energy}</Text>
                  <Text style={{ fontSize: 11 }}>{energyEmoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 15, fontWeight: '800', color: col, marginBottom: 3 }]}>{energyLabel} {energyEmoji}</Text>
                  <Text style={{ fontSize: 11, color: theme.colors.textSecondary, lineHeight: 16 }}>{whySummary(pick)}</Text>
                </View>
              </View>
            </LinearGradient>

            {/* ── SIGNAL BREAKDOWN ── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>SIGNAL BREAKDOWN</Text>
              <View style={{ flexDirection: 'row', gap: 7 }}>
                {[
                  { lbl: 'FREQUENCY',   val: pick.signals.BOX,      color: theme.colors.primary, desc: `Drawn ${pick.timesDrawn ?? '?'}× in dataset` },
                  { lbl: 'MOMENTUM',    val: pick.signals.PBURST,   color: theme.colors.rose,    desc: 'Pair surge across 3 positions' },
                  { lbl: 'PATTERN',     val: pick.signals.CO,       color: theme.colors.teal,    desc: 'Co-occurrence relationships' },
                  { lbl: 'CONSISTENCY', val: pick.signals.DGC ?? 0, color: theme.colors.gold,    desc: 'Draw gap consistency' },
                ].map(sig => {
                  const pct = Math.round(Math.min(Math.max(sig.val, 0), 1) * 100);
                  return (
                    <View key={sig.lbl} style={[s.sigCard, { borderColor: sig.color + '33' }]}>
                      <Text style={[s.sigCardLbl, { color: sig.color }]}>{sig.lbl}</Text>
                      <Text style={[s.sigCardPct, { color: sig.color }]}>{pct}%</Text>
                      <View style={s.bar}>
                        <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: sig.color }]} />
                      </View>
                      <Text style={s.sigCardDesc}>{pct}% · {sig.desc}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* ── PRESSURE ANALYSIS ── */}
            {hasPressure && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>PRESSURE ANALYSIS</Text>
                <View style={[s.card, { borderColor: verdict?.color ? verdict.color + '33' : theme.colors.border }]}>
                  {dsDisplay != null && expectedEvery != null && (
                    <View style={{ marginBottom: 14 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={s.smallLbl}>Pressure Timeline</Text>
                        <Text style={s.smallLbl}>{dsDisplay} / ~{expectedEvery * 2} draws</Text>
                      </View>
                      <View style={s.pressureBar}>
                        <View style={[s.pressureBarFill, {
                          width: `${Math.min((dsDisplay / (expectedEvery * 2)) * 100, 100)}%` as any,
                          backgroundColor: verdict?.color ?? theme.colors.gold,
                        }]} />
                        <View style={[s.pressureMark, { left: `${Math.min(50, 100)}%` as any }]} />
                      </View>
                      <Text style={s.smallLbl}>Expected every ~{expectedEvery} draws</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                    {[
                      { n: pick.lastSeen ? lastHit.replace('Last hit: ', '') : 'Unknown', lbl: 'Last Hit' },
                      { n: dsLabel, lbl: 'Draws Since' },
                      { n: expectedEvery ? `~${expectedEvery}` : '—', lbl: 'Expected Every' },
                    ].map(x => (
                      <View key={x.lbl} style={s.pStat}>
                        <Text style={s.pStatNum} numberOfLines={1}>{x.n}</Text>
                        <Text style={s.pStatLbl}>{x.lbl}</Text>
                      </View>
                    ))}
                  </View>
                  {verdict && (
                    <View style={[s.verdictRow, { backgroundColor: verdict.color + '15', borderColor: verdict.color + '44' }]}>
                      <Text style={{ fontSize: 18 }}>{verdict.emoji}</Text>
                      <Text style={[s.verdictText, { color: verdict.color }]}>{verdict.label}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* ── PAIR INTELLIGENCE (PRO) ── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>PAIR INTELLIGENCE</Text>
              {isPro ? (
                <View style={s.card}>
                  {[
                    { lbl: `Front Pair ${bestOrder[0]}${bestOrder[1]}`, score: pairScores.front },
                    { lbl: `Back Pair ${bestOrder[1]}${bestOrder[2]}`,  score: pairScores.back },
                    { lbl: `Split Pair ${bestOrder[0]}${bestOrder[2]}`, score: pairScores.split },
                  ].map(p => (
                    <View key={p.lbl} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.text }}>{p.lbl}</Text>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: theme.colors.primary, fontFamily: 'Courier' }}>{p.score}%</Text>
                      </View>
                      <View style={s.bar}>
                        <View style={[s.barFill, { width: `${p.score}%` as any, backgroundColor: theme.colors.primary }]} />
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={[s.card, { overflow: 'hidden', minHeight: 110 }]}>
                  <View style={{ opacity: 0.12 }}>
                    {['Front Pair ••', 'Back Pair ••', 'Split Pair ••'].map((lbl, i) => (
                      <View key={i} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 11, color: theme.colors.text }}>{lbl}</Text>
                          <Text style={{ fontSize: 11, color: theme.colors.primary }}>••%</Text>
                        </View>
                        <View style={s.bar}>
                          <View style={[s.barFill, { width: `${55 + i * 12}%` as any, backgroundColor: theme.colors.primary }]} />
                        </View>
                      </View>
                    ))}
                  </View>
                  <View style={s.lockOverlay}>
                    <Text style={{ fontSize: 22, marginBottom: 5 }}>🏆</Text>
                    <Text style={s.lockTitle}>PRO Feature</Text>
                    <Text style={s.lockSub}>Upgrade to Oracle+ to unlock pair intelligence</Text>
                  </View>
                </View>
              )}
            </View>

            {/* ── HORIZON DEPTH (PRO) ── */}
            {isPro && horizonRows.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>HORIZON DEPTH</Text>
                <View style={s.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={s.smallLbl}>Score across time horizons</Text>
                    <Text style={[s.smallLbl, {
                      color: horizonTrend === 'Strengthening' ? theme.colors.success
                           : horizonTrend === 'Declining' ? theme.colors.error
                           : theme.colors.gold,
                    }]}>
                      {horizonTrend === 'Strengthening' ? '↑' : horizonTrend === 'Declining' ? '↓' : '→'} {horizonTrend}
                    </Text>
                  </View>
                  {horizonRows.map((row: any) => {
                    const pct = Math.round(((row.ds_raw ?? 0) / maxHDs) * 100);
                    return (
                      <View key={row.horizon_label} style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ fontSize: 10, color: theme.colors.textSecondary, fontFamily: 'Courier' }}>{row.horizon_label}</Text>
                          <Text style={{ fontSize: 10, color: theme.colors.teal, fontFamily: 'Courier' }}>{pct}%</Text>
                        </View>
                        <View style={s.bar}>
                          <View style={[s.barFill, { width: `${pct}%` as any, backgroundColor: theme.colors.teal }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* ── HOW TO PLAY ── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>HOW TO PLAY</Text>
              <View style={s.card}>
                <Text style={[s.howLabel, { color: theme.colors.gold }]}>⭐ Straight Play</Text>
                <Text style={s.howText}>Play <Text style={{ fontWeight: '900', color: theme.colors.gold }}>{bestOrder}</Text> exactly in that order</Text>
                <Text style={s.howText}>Payout: ~500:1 · Budget: ${pick.energy >= 80 ? '$2–5' : pick.energy >= 65 ? '$1–3' : '$0.50–1'}</Text>

                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                  <Text style={[s.howLabel, { color: theme.colors.primary }]}>◈ Box Play</Text>
                  <Text style={s.howText}>Any order of <Text style={{ fontWeight: '900', color: theme.colors.primary }}>{pick.comboSet}</Text> wins</Text>
                  <Text style={s.howText}>{pick.multiplicity === 'singles' ? 'Payout: ~80:1 · Budget: $1–3' : 'Payout: ~160:1 · Budget: $1–2'}</Text>
                </View>
              </View>
            </View>

            {/* ── STATE CONFIDENCE ── */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>STATE CONFIDENCE</Text>
              <View style={s.card}>
                <Text style={[s.smallLbl, { marginBottom: 10 }]}>
                  Top states for {scope === 'midday' ? '☀️ Midday' : scope === 'evening' ? '🌙 Evening' : '◈ All Day'} draws
                </Text>
                {stateConfidence.map(({ state, confidence }) => (
                  <View key={state} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text, fontFamily: 'Courier' }}>{state}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: theme.colors.teal, fontFamily: 'Courier' }}>{confidence}%</Text>
                    </View>
                    <View style={s.bar}>
                      <View style={[s.barFill, { width: `${confidence}%` as any, backgroundColor: theme.colors.teal }]} />
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* ── ACTIONS ── */}
            <View style={s.section}>
              <View style={{ gap: 8 }}>
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: theme.colors.goldLight, borderColor: theme.colors.gold + '44' }]} onPress={handleSave}>
                  <Text style={{ fontSize: 18 }}>📖</Text>
                  <Text style={[s.actionBtnText, { color: theme.colors.gold }]}>{savedMsg || 'Save to Number Book'}</Text>
                </TouchableOpacity>
                {onHeatCheck && (
                  <TouchableOpacity style={[s.actionBtn, { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary + '44' }]} onPress={() => { onClose(); onHeatCheck(pick.combo); }}>
                    <Text style={{ fontSize: 18 }}>⚡</Text>
                    <Text style={[s.actionBtnText, { color: theme.colors.primary }]}>Heat Check</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: theme.colors.surfaceLight, borderColor: theme.colors.border }]} onPress={handleShare}>
                  <Text style={{ fontSize: 18 }}>📤</Text>
                  <Text style={[s.actionBtnText, { color: theme.colors.text }]}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: theme.colors.surfaceLight, borderColor: theme.colors.border }]} onPress={onClose}>
                  <Text style={[s.actionBtnText, { color: theme.colors.textSecondary, textAlign: 'center' }]}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#1E1B4B55', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderWidth: 1, borderColor: theme.colors.border, height: '92%',
    overflow: 'hidden',
  },
  scroll: { flex: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceMuted, alignSelf: 'center', marginTop: 12 },
  hero: { padding: 20, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  rankLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 1 },
  optLabel: { fontSize: 9, fontWeight: '900', color: theme.colors.gold, letterSpacing: 2, marginBottom: 2 },
  digitBadge: { width: 46, height: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  digitText: { fontSize: 22, fontWeight: '900', fontFamily: 'Courier' },
  posLabel: { fontSize: 8, color: theme.colors.textTertiary, fontWeight: '600' },
  heroDigits: { fontSize: 52, fontWeight: '900', fontFamily: 'Courier', letterSpacing: 2, lineHeight: 58 },
  heroCard: {
    backgroundColor: theme.colors.surface + 'BB',
    borderRadius: 10, borderWidth: 1, padding: 10, marginVertical: 8,
  },
  heroCardLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: 5 },
  heroCardLine: { fontSize: 10, color: theme.colors.textSecondary, marginBottom: 3, lineHeight: 15 },
  boxPlayLabel: { fontSize: 10, fontWeight: '700', color: theme.colors.textTertiary },
  boxPlayText: { fontSize: 11, color: theme.colors.textSecondary, fontFamily: 'Courier' },
  energyCircle: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  energyNum: { fontSize: 20, fontWeight: '900', fontFamily: 'Courier' },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.colors.surfaceLight, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border },
  closeBtnText: { fontSize: 16, color: theme.colors.textSecondary },
  section: { paddingHorizontal: 16, marginTop: 14 },
  sectionTitle: { fontSize: 9, fontWeight: '900', color: theme.colors.textTertiary, letterSpacing: 1.5, marginBottom: 8 },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 14 },
  smallLbl: { fontSize: 9, fontWeight: '600', color: theme.colors.textTertiary },
  sigCard: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 1, padding: 10 },
  sigCardLbl: { fontSize: 7, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  sigCardPct: { fontSize: 22, fontWeight: '900', fontFamily: 'Courier', marginBottom: 6 },
  sigCardDesc: { fontSize: 8, color: theme.colors.textTertiary, lineHeight: 11, marginTop: 4 },
  bar: { height: 4, backgroundColor: theme.colors.surfaceLight, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  pressureBar: { height: 8, backgroundColor: theme.colors.surfaceLight, borderRadius: 4, overflow: 'hidden', position: 'relative' },
  pressureBarFill: { height: '100%', borderRadius: 4 },
  pressureMark: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: theme.colors.textTertiary + '88' },
  pStat: { flex: 1, alignItems: 'center', gap: 3 },
  pStatNum: { fontSize: 11, fontWeight: '900', color: theme.colors.text, fontFamily: 'Courier' },
  pStatLbl: { fontSize: 8, color: theme.colors.textTertiary, fontWeight: '600' },
  verdictRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 8, marginTop: 8 },
  verdictText: { fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  lockOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 10, backgroundColor: theme.colors.surface + 'EE', borderRadius: theme.borderRadius.lg },
  lockTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  lockSub: { fontSize: 11, color: theme.colors.textSecondary, textAlign: 'center' },
  howLabel: { fontSize: 11, fontWeight: '800', marginBottom: 5 },
  howText: { fontSize: 11, color: theme.colors.textSecondary, lineHeight: 17, marginBottom: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontWeight: '700', flex: 1 },
});
