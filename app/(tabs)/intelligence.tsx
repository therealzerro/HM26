import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '@/constants/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { backfillIntelHits, BackfillProgress } from '@/lib/backfillIntelHits';
import { getTodayET } from '@/lib/dateUtils';
import { InfoTooltip } from '@/components/InfoTooltip';


interface IntelRow {
  id?: string;
  slate_date: string;
  rank: number;
  combo: string;
  combo_set?: string;
  scope: string;
  draws_since?: number;
  multiplicity?: string;
  top_pair?: string;
  signal_box?: number;
  signal_pburst?: number;
  signal_co?: number;
  signal_dgc?: number;
  energy_score?: number;
  hit_box: boolean;
  hit_straight: boolean;
  hit_state?: string;
  hit_session?: string;
  hit_result?: string;
  on_slate?: boolean;
  mode?: string;
}

interface SynergyCombo {
  name: string;
  rate: number;
  count: number;
}

interface AnalysisData {
  rows: IntelRow[];
  total: number;
  boxHitRate: number;
  straightHitRate: number;
  bestRank: number;
  // signals
  avgBoxHits: number; avgBoxMiss: number;
  avgPburstHits: number; avgPburstMiss: number;
  avgCoHits: number; avgCoMiss: number;
  avgDgcHits: number; avgDgcMiss: number;
  avgEnergyHits: number; avgEnergyMiss: number;
  // rank analysis
  rankRates: { rank: number; total: number; hits: number; rate: number }[];
  // draws since
  drawsRanges: { label: string; range: [number, number]; hits: number; total: number; rate: number }[];
  // multiplicity
  singlesRate: number; doublesRate: number;
  // top pairs
  topPairs: { pair: string; count: number }[];
  // scope
  scopeRates: { scope: string; boxRate: number; total: number }[];
  // energy ranges
  energyRanges: { label: string; min: number; max: number; hits: number; total: number; rate: number }[];
  // tuning
  bestDrawsRange: string;
  bestScope: string;
  bestEnergyMin: number;
  minEnergyWithHits: number;
  // Tier 4 additions
  synergyCombos: SynergyCombo[];
}

function weightedAvg(values: number[], weights: number[]) {
  if (values.length === 0) return 0;
  let sumVal = 0;
  let sumWeight = 0;
  for (let i = 0; i < values.length; i++) {
    sumVal += values[i] * weights[i];
    sumWeight += weights[i];
  }
  return sumWeight > 0 ? sumVal / sumWeight : 0;
}

function computeAnalysis(rows: IntelRow[]): AnalysisData {
  const today = new Date();
  const rowsWithWeights = rows.map(r => {
    const d = new Date(r.slate_date + 'T12:00:00');
    const diffDays = Math.max(0, (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    // Weight 1.0 for last 30 days, then linear decay to 0.2 over next 60 days, floor at 0.2
    const weight = diffDays <= 30 ? 1.0 : Math.max(0.2, 1.0 - (diffDays - 30) / 60);
    return { ...r, weight };
  });

  const total = rows.length;
  const hits = rowsWithWeights.filter(r => r.hit_box || r.hit_straight);
  const misses = rowsWithWeights.filter(r => !r.hit_box && !r.hit_straight);

  const boxHitsCount = rows.filter(r => r.hit_box).length;
  const straightHitsCount = rows.filter(r => r.hit_straight).length;

  const avgBoxHits    = weightedAvg(hits.map(r => r.signal_box    ?? 0), hits.map(r => r.weight));
  const avgBoxMiss    = weightedAvg(misses.map(r => r.signal_box   ?? 0), misses.map(r => r.weight));
  const avgPburstHits = weightedAvg(hits.map(r => r.signal_pburst  ?? 0), hits.map(r => r.weight));
  const avgPburstMiss = weightedAvg(misses.map(r => r.signal_pburst ?? 0), misses.map(r => r.weight));
  const avgCoHits     = weightedAvg(hits.map(r => r.signal_co      ?? 0), hits.map(r => r.weight));
  const avgCoMiss     = weightedAvg(misses.map(r => r.signal_co     ?? 0), misses.map(r => r.weight));
  const avgDgcHits    = weightedAvg(hits.map(r => r.signal_dgc     ?? 0), hits.map(r => r.weight));
  const avgDgcMiss    = weightedAvg(misses.map(r => r.signal_dgc    ?? 0), misses.map(r => r.weight));
  const avgEnergyHits = weightedAvg(hits.map(r => r.energy_score ?? 0), hits.map(r => r.weight));
  const avgEnergyMiss = weightedAvg(misses.map(r => r.energy_score ?? 0), misses.map(r => r.weight));

  // rank analysis (1-30)
  const rankRates: AnalysisData['rankRates'] = [];
  for (let r = 1; r <= 30; r++) {
    const rRows = rows.filter(x => x.rank === r);
    if (rRows.length === 0) continue;
    const rHits = rRows.filter(x => x.hit_box || x.hit_straight).length;
    rankRates.push({ rank: r, total: rRows.length, hits: rHits, rate: (rHits / rRows.length) * 100 });
  }
  const bestRank = rankRates.reduce((b, r) => r.rate > b.rate ? r : b, { rank: 1, rate: 0, total: 0, hits: 0 }).rank;

  // draws since
  const drawsDefs: { label: string; range: [number, number] }[] = [
    { label: '0-30', range: [0, 30] },
    { label: '31-100', range: [31, 100] },
    { label: '101-200', range: [101, 200] },
    { label: '201-365', range: [201, 365] },
    { label: '365+', range: [366, 9999] },
  ];
  const drawsRanges = drawsDefs.map(d => {
    const dr = rows.filter(r => (r.draws_since ?? 0) >= d.range[0] && (r.draws_since ?? 0) <= d.range[1]);
    const dh = dr.filter(r => r.hit_box || r.hit_straight).length;
    return { ...d, hits: dh, total: dr.length, rate: dr.length ? (dh / dr.length) * 100 : 0 };
  });
  const bestDrawsRange = drawsRanges.reduce((b, d) => d.rate > b.rate ? d : b, drawsRanges[0])?.label ?? '';

  // multiplicity
  const singlesRows = rows.filter(r => r.multiplicity === 'singles');
  const doublesRows = rows.filter(r => r.multiplicity === 'doubles');
  const singlesRate = singlesRows.length ? (singlesRows.filter(r => r.hit_box || r.hit_straight).length / singlesRows.length) * 100 : 0;
  const doublesRate = doublesRows.length ? (doublesRows.filter(r => r.hit_box || r.hit_straight).length / doublesRows.length) * 100 : 0;

  // top pairs
  const pairMap = new Map<string, number>();
  hits.forEach(r => { if (r.top_pair) pairMap.set(r.top_pair, (pairMap.get(r.top_pair) ?? 0) + 1); });
  const topPairs = [...pairMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([pair, count]) => ({ pair, count }));

  // scope rates
  const scopeNames = [...new Set(rows.map(r => r.scope))];
  const scopeRates = scopeNames.map(s => {
    const sr = rows.filter(r => r.scope === s);
    const sh = sr.filter(r => r.hit_box || r.hit_straight).length;
    return { scope: s, boxRate: sr.length ? (sh / sr.length) * 100 : 0, total: sr.length };
  });
  const bestScope = scopeRates.reduce((b, s) => s.boxRate > b.boxRate ? s : b, scopeRates[0] ?? { scope: 'midday', boxRate: 0, total: 0 })?.scope ?? 'midday';

  // energy ranges
  const eDefs = [
    { label: '0-50', min: 0, max: 50 },
    { label: '51-65', min: 51, max: 65 },
    { label: '66-75', min: 66, max: 75 },
    { label: '76-85', min: 76, max: 85 },
    { label: '86-95', min: 86, max: 95 },
    { label: '96-100', min: 96, max: 100 },
  ];
  const energyRanges = eDefs.map(e => {
    const er = rows.filter(r => (r.energy_score ?? 0) >= e.min && (r.energy_score ?? 0) <= e.max);
    const eh = er.filter(r => r.hit_box || r.hit_straight).length;
    return { ...e, hits: eh, total: er.length, rate: er.length ? (eh / er.length) * 100 : 0 };
  });
  const bestEnergyRange = energyRanges.reduce((b, e) => e.rate > b.rate ? e : b, energyRanges[0]);
  const bestEnergyMin = bestEnergyRange?.min ?? 0;

  // lowest energy with any hits
  const minEnergyWithHits = Math.min(...hits.map(r => r.energy_score ?? 100));

  // Synergy Matrix (Tier 4)
  const HIGH_THRESH = 0.7;
  const synergyCombos: SynergyCombo[] = [
    { name: 'BOX + PBURST', signals: ['signal_box', 'signal_pburst'] },
    { name: 'BOX + CO',     signals: ['signal_box', 'signal_co']     },
    { name: 'PBURST + CO',  signals: ['signal_pburst', 'signal_co']  },
    { name: 'BOX + DGC',    signals: ['signal_box', 'signal_dgc']    },
  ].map(c => {
    const filtered = rowsWithWeights.filter(r =>
      ((r as any)[c.signals[0]] ?? 0) >= HIGH_THRESH &&
      ((r as any)[c.signals[1]] ?? 0) >= HIGH_THRESH
    );
    const weightedTotal = filtered.reduce((sum, r) => sum + r.weight, 0);
    const weightedHits  = filtered.filter(r => r.hit_box || r.hit_straight).reduce((sum, r) => sum + r.weight, 0);
    return {
      name: c.name,
      count: filtered.length,
      rate: weightedTotal > 0 ? (weightedHits / weightedTotal) * 100 : 0
    };
  });

  return {
    rows, total,
    boxHitRate: total ? (boxHitsCount / total) * 100 : 0,
    straightHitRate: total ? (straightHitsCount / total) * 100 : 0,
    bestRank,
    avgBoxHits, avgBoxMiss,
    avgPburstHits, avgPburstMiss,
    avgCoHits, avgCoMiss,
    avgDgcHits, avgDgcMiss,
    avgEnergyHits, avgEnergyMiss,
    rankRates,
    drawsRanges, bestDrawsRange,
    singlesRate, doublesRate,
    topPairs,
    scopeRates, bestScope,
    energyRanges, bestEnergyMin,
    minEnergyWithHits: isFinite(minEnergyWithHits) ? Math.round(minEnergyWithHits) : 0,
    synergyCombos,
  };
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statValue, color ? { color } : {}]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionHeader}>{title}</Text>;
}

function CompareBar({ label, hitsVal, missVal }: { label: string; hitsVal: number; missVal: number }) {
  const green = hitsVal >= missVal;
  const maxW = 120;
  return (
    <View style={s.compareRow}>
      <Text style={s.compareLabel}>{label}</Text>
      <View style={s.compareBars}>
        <View style={s.compareBarRow}>
          <Text style={[s.compareBarLabel, { color: theme.colors.success }]}>Hits</Text>
          <View style={[s.compareBar, { width: Math.min((hitsVal / 100) * maxW, maxW), backgroundColor: green ? theme.colors.success : theme.colors.error }]} />
          <Text style={s.compareVal}>{hitsVal.toFixed(1)}</Text>
        </View>
        <View style={s.compareBarRow}>
          <Text style={[s.compareBarLabel, { color: theme.colors.textTertiary }]}>Miss</Text>
          <View style={[s.compareBar, { width: Math.min((missVal / 100) * maxW, maxW), backgroundColor: theme.colors.surfaceMuted }]} />
          <Text style={s.compareVal}>{missVal.toFixed(1)}</Text>
        </View>
      </View>
    </View>
  );
}

function RateBar({ label, rate, total, color }: { label: string; rate: number; total: number; color?: string }) {
  return (
    <View style={s.rateRow}>
      <Text style={s.rateLabel}>{label}</Text>
      <View style={s.rateTrack}>
        <View style={[s.rateFill, { width: `${Math.min(rate, 100)}%`, backgroundColor: color ?? theme.colors.primary }]} />
      </View>
      <Text style={s.ratePct}>{rate.toFixed(1)}%</Text>
      <Text style={s.rateTotal}>({total})</Text>
    </View>
  );
}

function SuggestionCard({
  icon, title, body, onApply, onDismiss, dismissed,
}: {
  icon: string; title: string; body: string;
  onApply: () => void; onDismiss: () => void; dismissed: boolean;
}) {
  if (dismissed) return null;
  return (
    <View style={s.suggCard}>
      <View style={s.suggHeader}>
        <Text style={s.suggIcon}>{icon}</Text>
        <Text style={s.suggTitle}>{title}</Text>
      </View>
      <Text style={s.suggBody}>{body}</Text>
      <View style={s.suggButtons}>
        <TouchableOpacity style={s.applyBtn} onPress={onApply}>
          <Text style={s.applyBtnText}>Apply · Regenerate slates to see effect</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.dismissBtn} onPress={onDismiss}>
          <Text style={s.dismissBtnText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SigDot({ label, value, color }: { label: string; value: number; color: string }) {
  const on = value >= 0.6;
  return (
    <View style={[ss.sigDot, { backgroundColor: on ? color + '25' : theme.colors.surfaceMuted, borderColor: on ? color + '55' : 'transparent' }]}>
      <Text style={[ss.sigLabel, { color: on ? color : theme.colors.textTertiary }]}>{label}</Text>
    </View>
  );
}

function SlateRow({ row }: { row: IntelRow }) {
  const isK6 = row.on_slate === true;
  const energy = Math.round(row.energy_score ?? 0);
  const eColor = energy >= 80 ? theme.colors.error
    : energy >= 65 ? theme.colors.orange
    : energy >= 45 ? theme.colors.gold
    : theme.colors.textTertiary;

  return (
    <View style={[ss.row, isK6 && ss.rowK6]}>
      {/* Rank badge */}
      <View style={[ss.rankBadge, isK6 && ss.rankBadgeK6]}>
        {isK6
          ? <Text style={ss.rankCrown}>♛</Text>
          : <Text style={ss.rankNum}>#{row.rank}</Text>
        }
      </View>

      {/* Combo + signals */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <Text style={[ss.combo, isK6 && { color: theme.colors.gold }]}>
            {row.combo.split('').join(' ')}
          </Text>
          {isK6 && (
            <View style={ss.k6Badge}><Text style={ss.k6BadgeText}>K6</Text></View>
          )}
          {row.multiplicity && (
            <View style={ss.multBadge}>
              <Text style={ss.multText}>{row.multiplicity}</Text>
            </View>
          )}
        </View>
        <View style={ss.sigRow}>
          <SigDot label="BOX"  value={row.signal_box    ?? 0} color={theme.colors.cyan}   />
          <SigDot label="MB"   value={row.signal_pburst ?? 0} color={theme.colors.rose}   />
          <SigDot label="CO"   value={row.signal_co     ?? 0} color={theme.colors.purple} />
          <SigDot label="DGC"  value={row.signal_dgc    ?? 0} color={theme.colors.gold}   />
          {row.draws_since != null && (
            <Text style={ss.drawsSince}>{row.draws_since}d ago</Text>
          )}
        </View>
      </View>

      {/* Energy */}
      <View style={[ss.energyBadge, { borderColor: eColor + '55' }]}>
        <Text style={[ss.energyNum, { color: eColor }]}>{energy}</Text>
        <Text style={[ss.energyLbl, { color: eColor }]}>nrg</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function IntelligenceScreen() {
  const [view, setView] = useState<'analysis' | 'slate'>('analysis');

  // Analysis view state
  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(0);
  const [data, setData] = useState<AnalysisData | null>(null);
  const [error, setError] = useState('');
  const [backfilling, setBackfilling] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState('');
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  // Slate view state
  const [slateScope, setSlateScope] = useState<'midday' | 'evening' | 'allday'>('midday');
  const [slateRows, setSlateRows] = useState<IntelRow[]>([]);
  const [slateLoading, setSlateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(''); setLoadingRows(0);
    try {
      const PAGE = 500;
      const allRows: IntelRow[] = [];
      let offset = 0;
      while (true) {
        const batch = await fetchFromSupabase<IntelRow[]>({
          path: `/rest/v1/daily_intelligence?select=*&order=slate_date.desc&limit=${PAGE}&offset=${offset}&mode=neq.zk30`,
        });
        const rows = Array.isArray(batch) ? batch : [];
        allRows.push(...rows);
        setLoadingRows(allRows.length);
        if (rows.length < PAGE) break;
        offset += PAGE;
      }
      setData(computeAnalysis(allRows));
    } catch (e: any) {
      setError(e.message ?? 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const loadSlate = useCallback(async (scope: string) => {
    setSlateLoading(true);
    try {
      const today = getTodayET();
      const rows = await fetchFromSupabase<IntelRow[]>({
        path: `/rest/v1/daily_intelligence?select=*&slate_date=eq.${today}&mode=neq.zk30&scope=eq.${scope}&order=rank.asc&limit=30`,
      });
      setSlateRows(Array.isArray(rows) ? rows : []);
    } catch {
      setSlateRows([]);
    } finally {
      setSlateLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'slate') loadSlate(slateScope);
  }, [view, slateScope]);

  const handleBackfill = useCallback(async () => {
    setBackfilling(true);
    setBackfillStatus('Starting backfill…');
    try {
      const { hitsFound, datesProcessed } = await backfillIntelHits((p: BackfillProgress) => {
        if (p.phase === 'Done') return;
        setBackfillStatus(`${p.phase} (${p.datesDone}/${p.datesTotal} dates, ${p.hitsFound} hits)`);
      });
      setBackfillStatus(`Done — ${hitsFound} hits found across ${datesProcessed} dates`);
      await load();
    } catch (e: any) {
      setBackfillStatus('Error: ' + (e.message ?? 'Unknown'));
    } finally {
      setBackfilling(false);
    }
  }, [load]);

  const applySuggestion = useCallback(async (key: string, value: string) => {
    try {
      await fetchFromSupabase({
        path: `/rest/v1/app_config?key=eq.${encodeURIComponent(key)}`,
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: { value: String(value) },
      });
      Alert.alert('Applied ✓', 'Engine config updated. Regenerate slates to apply.');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Save failed');
    }
  }, []);

  const dismiss = (key: string) => setDismissed(d => ({ ...d, [key]: true }));

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={s.loadingText}>
            {loadingRows > 0
              ? `Loading… ${loadingRows.toLocaleString()} of ~2,000 picks`
              : 'Loading Pattern Intelligence…'}
          </Text>
          {loadingRows > 0 && (
            <Text style={{ fontSize: 11, color: theme.colors.textTertiary, marginTop: 4 }}>
              Analyzing signal patterns across all draws…
            </Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <Text style={s.errorText}>{error}</Text>
          <TouchableOpacity style={s.reloadBtn} onPress={load}>
            <Text style={s.reloadBtnText}>↺ Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!data || data.total === 0) {
    return (
      <SafeAreaView style={s.container}>
        <ScrollView contentContainerStyle={s.emptyContainer}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>📊</Text>
          <Text style={s.emptyTitle}>No Intelligence Data Yet</Text>
          <Text style={s.emptyBody}>
            Intelligence learns from your slate hit history. Generate slates and import draw results, then backfill to populate analysis.
          </Text>
          <TouchableOpacity style={s.backfillBtn} onPress={handleBackfill} disabled={backfilling}>
            {backfilling ? <ActivityIndicator color="#fff" /> : <Text style={s.backfillBtnText}>Backfill Hit Data</Text>}
          </TouchableOpacity>
          {!!backfillStatus && <Text style={s.backfillStatus}>{backfillStatus}</Text>}
          <TouchableOpacity
            style={[s.backfillBtn, { backgroundColor: theme.colors.bgElevated, marginTop: 8, borderWidth: 1, borderColor: theme.colors.border }]}
            onPress={() => router.push('/(tabs)/explore')}
          >
            <Text style={[s.backfillBtnText, { color: theme.colors.cyan }]}>Go to Slates ⚡</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const d = data;

  // Rank insight — require enough sample data before flagging
  const top6Rows = d.rankRates.filter(r => r.rank <= 6);
  const mid15Rows = d.rankRates.filter(r => r.rank >= 7 && r.rank <= 15);
  const top6Total = top6Rows.reduce((s, r) => s + r.total, 0);
  const mid15Total = mid15Rows.reduce((s, r) => s + r.total, 0);
  const top6Rate = top6Rows.reduce((s, r) => s + r.rate, 0) / Math.max(top6Rows.length, 1);
  const mid15Rate = mid15Rows.reduce((s, r) => s + r.rate, 0) / Math.max(mid15Rows.length, 1);
  // Only surface the warning when both groups have enough picks and the gap is meaningful (≥5pp)
  const diversityWarning = top6Total >= 30 && mid15Total >= 30 && mid15Rate > top6Rate + 5;

  // Weight suggestion — compute proportional balanced weights from hit signal averages
  const boxVsPburst = d.avgBoxHits - d.avgPburstHits;
  const totalHitSignal = (d.avgBoxHits || 0) + (d.avgPburstHits || 0) + (d.avgCoHits || 0) + (d.avgDgcHits || 0) || 1;
  const sugBox    = Math.min(75, Math.max(35, Math.round((d.avgBoxHits    / totalHitSignal) * 100)));
  const sugPburst = Math.min(45, Math.max(10, Math.round((d.avgPburstHits / totalHitSignal) * 100)));
  const sugDgc    = Math.min(15, Math.max(5,  Math.round((d.avgDgcHits    / totalHitSignal) * 100)));
  const sugCo     = Math.max(5, 100 - sugBox - sugPburst - sugDgc);
  const sugWeightsJson = JSON.stringify({ BOX: sugBox, PBURST: sugPburst, CO: sugCo, DGC: sugDgc });

  // Draws since suggestion — parse best range upper bound
  const drawsRangeUpper = d.bestDrawsRange.includes('+')
    ? '365'
    : (d.bestDrawsRange.split('-')[1] ?? '200');

  return (
    <SafeAreaView style={s.container}>

      {/* ── Tab switcher ── */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tab, view === 'analysis' && s.tabOn]}
          onPress={() => setView('analysis')}
        >
          <Text style={[s.tabText, view === 'analysis' && s.tabTextOn]}>Analysis</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, view === 'slate' && s.tabOn]}
          onPress={() => setView('slate')}
        >
          <Text style={[s.tabText, view === 'slate' && s.tabTextOn]}>Top 30 Slate</Text>
        </TouchableOpacity>
      </View>

      {/* ── Slate view ── */}
      {view === 'slate' && (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={slateLoading} onRefresh={() => loadSlate(slateScope)} tintColor={theme.colors.primary} />}
        >
          {/* Scope selector */}
          <View style={ss.scopeRow}>
            {(['midday', 'evening', 'allday'] as const).map(sc => (
              <TouchableOpacity
                key={sc}
                style={[ss.scopeBtn, slateScope === sc && ss.scopeBtnOn]}
                onPress={() => setSlateScope(sc)}
              >
                <Text style={[ss.scopeText, slateScope === sc && ss.scopeTextOn]}>
                  {sc === 'midday' ? 'Midday' : sc === 'evening' ? 'Evening' : 'All Day'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Header row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <Text style={s.headerTitle}>Today's Hidden 30</Text>
            <View style={{ flex: 1 }} />
            {slateRows.length > 0 && (
              <Text style={{ fontSize: 11, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono }}>
                {getTodayET()} · {slateRows.length} picks
              </Text>
            )}
          </View>

          {/* K6 legend */}
          <View style={ss.legend}>
            <View style={ss.legendItem}>
              <View style={[ss.legendDot, { backgroundColor: theme.colors.gold }]} />
              <Text style={ss.legendText}>♛ K6 final pick (on_slate)</Text>
            </View>
            <View style={ss.legendItem}>
              <View style={[ss.legendDot, { backgroundColor: theme.colors.surfaceMuted }]} />
              <Text style={ss.legendText}>Ranked but not selected</Text>
            </View>
          </View>

          {slateLoading ? (
            <View style={s.center}>
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={s.loadingText}>Loading slate…</Text>
            </View>
          ) : slateRows.length === 0 ? (
            <View style={ss.emptySlate}>
              <Text style={ss.emptySlateIcon}>📭</Text>
              <Text style={ss.emptySlateTitle}>No slate for today yet</Text>
              <Text style={ss.emptySlateBody}>Generate a slate first to see today's hidden picks here.</Text>
              <TouchableOpacity
                style={{ marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, paddingVertical: 12, paddingHorizontal: 24 }}
                onPress={() => router.push('/(tabs)/explore')}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Generate Slate ⚡</Text>
              </TouchableOpacity>
            </View>
          ) : (
            slateRows.map((row, i) => <SlateRow key={row.id ?? i} row={row} />)
          )}
          <View style={{ height: 60 }} />
        </ScrollView>
      )}

      {/* ── Analysis view ── */}
      {view === 'analysis' && <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.colors.primary} />}
      >

        {/* Header */}
        <View style={s.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={s.headerTitle}>Pattern Intelligence</Text>
            <InfoTooltip
              term="Pattern Intelligence"
              definition={"Analyzes your entire slate history to show which signals, ranks, and energy levels actually hit.\n\nUse the suggestions below to tune the ZK6 engine based on what has been working for your data."}
              size={16}
            />
          </View>
          <Text style={s.headerSub}>{d.total.toLocaleString()} picks tracked</Text>
          <TouchableOpacity style={s.reloadBtn} onPress={load}>
            <Text style={s.reloadBtnText}>↺ Refresh</Text>
          </TouchableOpacity>
        </View>

        {/* Section A — Overall Summary */}
        <SectionHeader title="A — Overall Performance" />
        <View style={s.statRow}>
          <StatCard label="Total Picks" value={d.total.toLocaleString()} />
          <StatCard label="Box Hit Rate" value={`${d.boxHitRate.toFixed(1)}%`} color={theme.colors.success} />
          <StatCard label="Straight Rate" value={`${d.straightHitRate.toFixed(1)}%`} color={theme.colors.primary} />
          <StatCard label="Best Rank" value={`#${d.bestRank}`} color={theme.colors.gold} />
        </View>

        {/* Section B — Signal Analysis */}
        <SectionHeader title="B — Signal Analysis: Hits vs Misses" />
        <View style={s.card}>
          <CompareBar label="Frequency (BOX)"   hitsVal={d.avgBoxHits    * 100} missVal={d.avgBoxMiss    * 100} />
          <CompareBar label="Momentum (PBURST)" hitsVal={d.avgPburstHits * 100} missVal={d.avgPburstMiss * 100} />
          <CompareBar label="Pattern (CO)"      hitsVal={d.avgCoHits     * 100} missVal={d.avgCoMiss     * 100} />
          <CompareBar label="Consistency (DGC)" hitsVal={d.avgDgcHits    * 100} missVal={d.avgDgcMiss    * 100} />
          <CompareBar label="Energy Score"      hitsVal={d.avgEnergyHits}        missVal={d.avgEnergyMiss} />
        </View>

        {/* Section C — Rank Analysis */}
        <SectionHeader title="C — Rank Analysis (1-30)" />
        <View style={s.card}>
          <Text style={s.insightBadge}>
            {diversityWarning
              ? '⚠️ Diversity rails may be excluding better picks'
              : top6Total < 30
              ? '⏳ Building data — need 30+ picks per rank group to assess'
              : '✅ K6 selection is working well'}
          </Text>
          {d.rankRates.map(r => (
            <RateBar
              key={r.rank}
              label={`Rank ${r.rank}`}
              rate={r.rate}
              total={r.total}
              color={r.rank <= 6 ? theme.colors.primary : r.rank <= 15 ? theme.colors.gold : theme.colors.textTertiary}
            />
          ))}
          {d.rankRates.length === 0 && <Text style={s.noData}>No rank data yet</Text>}
        </View>

        {/* Section D — Draws Since */}
        <SectionHeader title="D — Draws Since Analysis" />
        <View style={s.card}>
          {d.drawsRanges.map(r => (
            <RateBar key={r.label} label={r.label} rate={r.rate} total={r.total} color={r.label === d.bestDrawsRange ? theme.colors.success : theme.colors.primary} />
          ))}
          <Text style={s.insightText}>
            Best pressure window: <Text style={s.bold}>{d.bestDrawsRange} draws</Text> — highest hit rate
          </Text>
        </View>

        {/* Section E — Multiplicity */}
        <SectionHeader title="E — Multiplicity Analysis" />
        <View style={s.card}>
          <RateBar label="Singles" rate={d.singlesRate} total={d.rows.filter(r => r.multiplicity === 'singles').length} color={theme.colors.primary} />
          <RateBar label="Doubles" rate={d.doublesRate} total={d.rows.filter(r => r.multiplicity === 'doubles').length} color={theme.colors.gold} />
          <Text style={s.insightText}>
            {d.singlesRate >= d.doublesRate ? 'Singles outperform doubles — ZK6 should favor singles' : 'Doubles outperform singles — ZK6 should favor doubles'}
          </Text>
        </View>

        {/* Section F — Top Pairs */}
        <SectionHeader title="F — Top Pairs on Hits" />
        <View style={s.card}>
          {d.topPairs.length === 0
            ? <Text style={s.noData}>No pair data on hits yet</Text>
            : d.topPairs.map((p, i) => (
              <View key={p.pair} style={s.pairRow}>
                <Text style={s.pairRank}>#{i + 1}</Text>
                <Text style={s.pairLabel}>Pair {p.pair}</Text>
                <Text style={s.pairCount}>{p.count} hits</Text>
                {i === 0 && <Text style={s.pairBadge}>highest</Text>}
              </View>
            ))
          }
        </View>

        {/* Section G — Scope Performance */}
        <SectionHeader title="G — Scope Performance" />
        <View style={s.card}>
          {d.scopeRates.map(sr => (
            <RateBar key={sr.scope} label={sr.scope} rate={sr.boxRate} total={sr.total} color={sr.scope === d.bestScope ? theme.colors.success : theme.colors.primary} />
          ))}
          <Text style={s.insightText}>
            Best scope: <Text style={s.bold}>{d.bestScope}</Text>
          </Text>
        </View>

        {/* Section H — Energy Sweet Spot */}
        <SectionHeader title="H — Energy Score Sweet Spot" />
        <View style={s.card}>
          {d.energyRanges.map(e => (
            <RateBar
              key={e.label}
              label={`Energy ${e.label}`}
              rate={e.rate}
              total={e.total}
              color={e.min === d.bestEnergyMin ? theme.colors.success : theme.colors.primary}
            />
          ))}
          <Text style={s.insightText}>
            Energy <Text style={s.bold}>{d.bestEnergyMin}–{d.energyRanges.find(e => e.min === d.bestEnergyMin)?.max ?? ''}</Text> produces highest hit rate
          </Text>
        </View>

        {/* Section I — Signal Synergy Matrix */}
        <SectionHeader title="I — Signal Synergy Matrix" />
        <View style={s.card}>
          <Text style={s.insightBadge}>
            Combinations with ROI {'>'} 20% represent "Super Signals"
          </Text>
          {d.synergyCombos.map(combo => (
            <RateBar 
              key={combo.name} 
              label={combo.name} 
              rate={combo.rate} 
              total={combo.count} 
              color={combo.rate > 20 ? theme.colors.gold : theme.colors.primary} 
            />
          ))}
          <Text style={s.insightText}>
            When these signals align, hit probability increases significantly.
          </Text>
        </View>

        {/* Engine Tuning Suggestions */}
        <SectionHeader title="Engine Tuning Suggestions" />

        <SuggestionCard
          icon="⚖️"
          title="Weight Adjustment"
          body={
            Math.abs(boxVsPburst) < 0.05
              ? 'BOX and PBURST signals are balanced — no weight adjustment needed.'
              : `Data suggests BOX:${sugBox}% PBURST:${sugPburst}% CO:${sugCo}% DGC:${sugDgc}% for balanced mode based on ${d.total} picks.`
          }
          dismissed={!!dismissed['weight']}
          onDismiss={() => dismiss('weight')}
          onApply={() => applySuggestion('engine_weights_balanced', sugWeightsJson)}
        />

        <SuggestionCard
          icon="📅"
          title="Draws Since Threshold"
          body={`Set pressure threshold to ${drawsRangeUpper} draws — best hit rate window is ${d.bestDrawsRange} draws from your data.`}
          dismissed={!!dismissed['draws']}
          onDismiss={() => dismiss('draws')}
          onApply={() => applySuggestion('pressure_threshold', drawsRangeUpper)}
        />

        <SuggestionCard
          icon="⚡"
          title="Energy Threshold"
          body={`Set minimum energy threshold to ${d.minEnergyWithHits} — eliminates low-scoring picks that rarely hit.`}
          dismissed={!!dismissed['energy']}
          onDismiss={() => dismiss('energy')}
          onApply={() => applySuggestion('min_energy_threshold', String(d.minEnergyWithHits))}
        />

        {diversityWarning && (
          <SuggestionCard
            icon="🔓"
            title="Pair Repetition Cap"
            body={`Ranks 7-15 (${mid15Rate.toFixed(1)}%) outperforming top-6 (${top6Rate.toFixed(1)}%). Raise pair rep cap to 3 to allow more diversity.`}
            dismissed={!!dismissed['rank']}
            onDismiss={() => dismiss('rank')}
            onApply={() => applySuggestion('pair_rep_cap', '3')}
          />
        )}

        <SuggestionCard
          icon="🎯"
          title="Default Scope"
          body={`Set default scope to ${d.bestScope} — currently your strongest performing scope with highest hit rate.`}
          dismissed={!!dismissed['scope']}
          onDismiss={() => dismiss('scope')}
          onApply={() => applySuggestion('default_scope', d.bestScope)}
        />

        {/* Backfill */}
        <SectionHeader title="Data Maintenance" />
        <View style={s.card}>
          <Text style={s.backfillDesc}>
            Backfill compares existing picks against histories to update hit_box / hit_straight for dates that were not auto-processed.
          </Text>
          <TouchableOpacity style={s.backfillBtn} onPress={handleBackfill} disabled={backfilling}>
            {backfilling
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.backfillBtnText}>Backfill Hit Data</Text>}
          </TouchableOpacity>
          {!!backfillStatus && <Text style={s.backfillStatus}>{backfillStatus}</Text>}
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>}

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { padding: theme.spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  header: { marginBottom: theme.spacing.lg },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center' },
  tabOn: { borderBottomWidth: 2, borderBottomColor: theme.colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  tabTextOn: { color: theme.colors.primary, fontWeight: '800' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  headerSub: { fontSize: 13, color: theme.colors.textTertiary, marginTop: 2 },
  loadingText: { marginTop: 12, color: theme.colors.textSecondary, fontSize: 14 },
  errorText: { color: theme.colors.error, textAlign: 'center', fontSize: 14, marginBottom: 16 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  emptyBody: { fontSize: 13, color: theme.colors.textTertiary, textAlign: 'center', marginBottom: 20 },
  sectionHeader: { fontSize: 13, fontWeight: '800', color: theme.colors.primary, marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.md, marginBottom: 4, borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.soft },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  statCard: { flex: 1, minWidth: 70, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border, ...theme.shadows.soft },
  statValue: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  statLabel: { fontSize: 10, color: theme.colors.textTertiary, marginTop: 2, textAlign: 'center' },
  compareRow: { marginBottom: 12 },
  compareLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  compareBars: { gap: 3 },
  compareBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compareBarLabel: { fontSize: 10, width: 28, fontWeight: '600' },
  compareBar: { height: 10, borderRadius: 4, minWidth: 4 },
  compareVal: { fontSize: 10, color: theme.colors.textSecondary, marginLeft: 4 },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  rateLabel: { fontSize: 11, color: theme.colors.text, width: 80 },
  rateTrack: { flex: 1, height: 10, backgroundColor: theme.colors.surfaceMuted, borderRadius: 5, overflow: 'hidden' },
  rateFill: { height: '100%', borderRadius: 5 },
  ratePct: { fontSize: 11, fontWeight: '700', color: theme.colors.text, width: 38, textAlign: 'right' },
  rateTotal: { fontSize: 10, color: theme.colors.textTertiary, width: 32 },
  insightBadge: { fontSize: 12, fontWeight: '700', color: theme.colors.text, marginBottom: 10, backgroundColor: theme.colors.surfaceLight, padding: 8, borderRadius: 8 },
  insightText: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 8 },
  bold: { fontWeight: '700', color: theme.colors.text },
  noData: { fontSize: 12, color: theme.colors.textTertiary, textAlign: 'center', padding: 12 },
  pairRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 8 },
  pairRank: { fontSize: 11, color: theme.colors.textTertiary, width: 24 },
  pairLabel: { fontSize: 13, fontWeight: '700', color: theme.colors.text, flex: 1 },
  pairCount: { fontSize: 12, color: theme.colors.textSecondary },
  pairBadge: { fontSize: 10, backgroundColor: theme.colors.goldLight, color: theme.colors.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, fontWeight: '700' },
  suggCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.md, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.borderMed, ...theme.shadows.soft },
  suggHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  suggIcon: { fontSize: 20 },
  suggTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  suggBody: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18, marginBottom: 12 },
  suggButtons: { flexDirection: 'row', gap: 8 },
  applyBtn: { flex: 1, backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, paddingVertical: 9, alignItems: 'center' },
  applyBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  dismissBtn: { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.borderRadius.md, paddingVertical: 9, paddingHorizontal: 16, alignItems: 'center' },
  dismissBtnText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  backfillDesc: { fontSize: 12, color: theme.colors.textTertiary, marginBottom: 12, lineHeight: 18 },
  backfillBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.md, paddingVertical: 12, alignItems: 'center' },
  backfillBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  backfillStatus: { fontSize: 12, color: theme.colors.success, marginTop: 10, textAlign: 'center', fontWeight: '600' },
  reloadBtn: { marginTop: 10, backgroundColor: theme.colors.primaryLight, borderRadius: theme.borderRadius.md, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start' },
  reloadBtnText: { color: theme.colors.primary, fontSize: 13, fontWeight: '700' },
});

const ss = StyleSheet.create({
  // Scope selector
  scopeRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  scopeBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  scopeBtnOn: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary },
  scopeText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  scopeTextOn: { color: theme.colors.primary, fontWeight: '800' },

  // Legend
  legend: { flexDirection: 'row', gap: 16, marginBottom: 14, paddingHorizontal: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: theme.colors.textTertiary },

  // Slate row
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: theme.colors.border,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
    ...theme.shadows.soft,
  },
  rowK6: {
    borderColor: theme.colors.gold + '66',
    backgroundColor: theme.colors.goldLight ?? (theme.colors.gold + '0A'),
  },

  // Rank badge
  rankBadge: {
    width: 34, height: 34, borderRadius: 9,
    backgroundColor: theme.colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rankBadgeK6: { backgroundColor: theme.colors.gold + '22' },
  rankNum: { fontSize: 11, fontWeight: '900', color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  rankCrown: { fontSize: 16, color: theme.colors.gold },

  // Combo
  combo: {
    fontSize: 22, fontWeight: '900', color: theme.colors.text,
    letterSpacing: 4, fontFamily: theme.typography.fontFamily.mono,
  },

  // Badges
  k6Badge: {
    backgroundColor: theme.colors.gold + '25', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: theme.colors.gold + '55',
  },
  k6BadgeText: { fontSize: 9, fontWeight: '900', color: theme.colors.gold, letterSpacing: 0.5 },
  multBadge: { backgroundColor: theme.colors.primaryLight, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  multText: { fontSize: 9, fontWeight: '700', color: theme.colors.primary },

  // Signal dots
  sigRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sigDot: {
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5,
    borderWidth: 1, borderColor: 'transparent',
  },
  sigLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.3 },
  drawsSince: { fontSize: 9, color: theme.colors.textTertiary, marginLeft: 3, fontFamily: theme.typography.fontFamily.mono },

  // Energy badge
  energyBadge: {
    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, backgroundColor: theme.colors.bgElevated,
  },
  energyNum: { fontSize: 12, fontWeight: '900', fontFamily: theme.typography.fontFamily.mono, lineHeight: 14 },
  energyLbl: { fontSize: 7, fontWeight: '800', letterSpacing: 0.3 },

  // Empty state
  emptySlate: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptySlateIcon: { fontSize: 36 },
  emptySlateTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  emptySlateBody: { fontSize: 12, color: theme.colors.textTertiary, textAlign: 'center' },
});
