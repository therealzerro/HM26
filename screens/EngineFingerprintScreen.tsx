/* ──────────────────────────────────────────────────────────────────────────
   v5 PATCH 03 — EngineFingerprint dashboard
   New file: screens/EngineFingerprintScreen.tsx (or app/(tabs)/fingerprint.tsx)

   WHAT
     One-screen overview of YOUR engine's behavior over time:
       • Hit rate · scope count · singles share · hot-pick share (KPI tiles)
       • Temperature distribution (stacked horizontal bar)
       • Average channel strength per signal (BOX · PBURST · CO · DGC if present)

   USE CASES
     • Settings → "How my engine is performing"
     • Internal debug screen during tuning
     • Premium tier — show users the algorithm's character

   DATA
     Takes a `stats` prop computed from your slate_snapshots table.
     A helper to compute it from a snapshot array is included at the bottom.

   ─── INTEGRATION ───────────────────────────────────────────────────────────
   1) Drop this file into screens/.
   2) Add a route or call it from Settings:

        import { EngineFingerprintScreen, computeFingerprint } from '@/screens/EngineFingerprintScreen';
        …
        const stats = useMemo(() => computeFingerprint(snapshots), [snapshots]);
        return <EngineFingerprintScreen stats={stats}/>;

   3) `snapshots` should be an array of rows from your slate_snapshots
      table (or just `top_k_straights_json` already parsed). The helper
      handles both shapes.
   ────────────────────────────────────────────────────────────────────────── */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

export interface FingerprintStats {
  totalSnapshots: number;
  totalPicks: number;
  hits: number;
  hitRate: number;          // percent
  tempBuckets: { hot: number; warm: number; mild: number; cold: number };
  multiplicity: { singles: number; doubles: number; triples?: number };
  avgSignals: { BOX: number; PBURST: number; CO: number; DGC?: number };
  scopes: string[];
}

interface Props { stats: FingerprintStats }

export function EngineFingerprintScreen({ stats }: Props) {
  const total = stats.tempBuckets.hot + stats.tempBuckets.warm
              + stats.tempBuckets.mild + stats.tempBuckets.cold;
  const tempPct = (k: keyof FingerprintStats['tempBuckets']) =>
    (stats.tempBuckets[k] / total) * 100;

  const tempBars = [
    { label: 'HOT',  v: stats.tempBuckets.hot,  pct: tempPct('hot'),  color: theme.colors.hot },
    { label: 'WARM', v: stats.tempBuckets.warm, pct: tempPct('warm'), color: theme.colors.warm },
    { label: 'MILD', v: stats.tempBuckets.mild, pct: tempPct('mild'), color: theme.colors.mild },
    { label: 'COLD', v: stats.tempBuckets.cold, pct: tempPct('cold'), color: theme.colors.cold },
  ];

  const signalBars: Array<{ k: string; v: number; color: string; note: string }> = [
    { k:'BOX',    v:stats.avgSignals.BOX,    color:theme.colors.cyan,   note:'frequency'   },
    { k:'PBURST', v:stats.avgSignals.PBURST, color:theme.colors.rose,   note:'momentum'    },
    { k:'CO',     v:stats.avgSignals.CO,     color:theme.colors.purple, note:'cluster'     },
  ];
  if (typeof stats.avgSignals.DGC === 'number') {
    signalBars.push({ k:'DGC', v:stats.avgSignals.DGC, color:theme.colors.gold, note:'consistency' });
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <View>
        <Text style={s.eyebrow}>Engine fingerprint</Text>
        <Text style={s.h1}>
          {stats.totalSnapshots} snapshots · {stats.totalPicks} picks
        </Text>
      </View>

      {/* KPI row */}
      <View style={s.kpiRow}>
        <Kpi label="HIT RATE" value={`${stats.hitRate.toFixed(2)}%`}
             sub={`${stats.hits} of ${stats.totalPicks}`} color={theme.colors.cyan}/>
        <Kpi label="SCOPES" value={String(stats.scopes.length)}
             sub={stats.scopes.join(' · ')} color={theme.colors.purple}/>
        <Kpi label="SINGLES"
             value={`${Math.round(stats.multiplicity.singles / stats.totalPicks * 100)}%`}
             sub={`${stats.multiplicity.singles} of ${stats.totalPicks}`} color={theme.colors.gold}/>
        <Kpi label="HOT PICKS" value={`${Math.round(tempPct('hot'))}%`}
             sub={`${stats.tempBuckets.hot} of ${total}`} color={theme.colors.hot}/>
      </View>

      {/* Temperature distribution */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Temperature distribution</Text>
        <View style={s.tempBarTrack}>
          {tempBars.map(b => (
            <View key={b.label} style={{ width: `${b.pct}%`, backgroundColor: b.color, height: '100%' }}/>
          ))}
        </View>
        <View style={s.tempLegend}>
          {tempBars.map(b => (
            <View key={b.label} style={s.tempLegendItem}>
              <View style={[s.dot, { backgroundColor: b.color }]}/>
              <Text style={[s.legendLabel, { color: b.color }]}>{b.label}</Text>
              <Text style={s.legendValue}>{b.v}</Text>
              <Text style={s.legendPct}>· {Math.round(b.pct)}%</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Average channel strength */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Average channel strength</Text>
        {signalBars.map(b => (
          <View key={b.k} style={s.signalRow}>
            <Text style={[s.signalKey, { color: b.color }]}>{b.k}</Text>
            <View style={s.signalTrack}>
              <View style={{
                width: `${b.v * 100}%`, height: '100%',
                backgroundColor: b.color,
                shadowColor: b.color, shadowOpacity: 0.7, shadowRadius: 8,
              }}/>
            </View>
            <Text style={s.signalValue}>{b.v.toFixed(2)}</Text>
            <Text style={s.signalNote}>{b.note}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Kpi({ label, value, sub, color }: {
  label: string; value: string; sub: string; color: string;
}) {
  return (
    <View style={[s.kpi, { borderColor: color + '55', shadowColor: color }]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, { color, textShadowColor: color }]}>{value}</Text>
      <Text style={s.kpiSub}>{sub}</Text>
    </View>
  );
}

/* ── computeFingerprint helper ─────────────────────────────────────────────
   Pass an array of slate_snapshot rows (with top_k_straights_json string
   OR an already-parsed picks array). Returns FingerprintStats. */
export function computeFingerprint(
  snapshots: Array<{ scope?: string; top_k_straights_json?: string; picks?: any[] }>,
): FingerprintStats {
  const allPicks: any[] = [];
  const scopes = new Set<string>();
  for (const snap of snapshots) {
    if (snap.scope) scopes.add(snap.scope);
    let picks: any = snap.picks;
    // PostgREST returns JSON columns already parsed; handle both shapes.
    if (!picks && snap.top_k_straights_json != null) {
      if (typeof snap.top_k_straights_json === 'string') {
        try { picks = JSON.parse(snap.top_k_straights_json); } catch { picks = []; }
      } else {
        picks = snap.top_k_straights_json;
      }
    }
    if (Array.isArray(picks)) allPicks.push(...picks);
  }
  const tempBuckets = { hot: 0, warm: 0, mild: 0, cold: 0 };
  const mult = { singles: 0, doubles: 0, triples: 0 };
  let coSum = 0, boxSum = 0, pbSum = 0, dgcSum = 0, dgcCount = 0;
  let hits = 0;
  for (const p of allPicks) {
    const t = p.temperature ?? 0;
    if (t >= 80) tempBuckets.hot++;
    else if (t >= 60) tempBuckets.warm++;
    else if (t >= 40) tempBuckets.mild++;
    else tempBuckets.cold++;
    if (p.multiplicity && mult.hasOwnProperty(p.multiplicity)) (mult as any)[p.multiplicity]++;
    coSum += p.signals?.CO ?? 0;
    boxSum += p.signals?.BOX ?? 0;
    pbSum += p.signals?.PBURST ?? 0;
    if (typeof p.signals?.DGC === 'number') { dgcSum += p.signals.DGC; dgcCount++; }
    if (p.hitType) hits++;
  }
  const n = allPicks.length || 1;
  return {
    totalSnapshots: snapshots.length,
    totalPicks: allPicks.length,
    hits,
    hitRate: (hits / n) * 100,
    tempBuckets,
    multiplicity: mult,
    avgSignals: {
      BOX: boxSum / n, PBURST: pbSum / n, CO: coSum / n,
      ...(dgcCount > 0 ? { DGC: dgcSum / dgcCount } : {}),
    },
    scopes: [...scopes],
  };
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 18, gap: 18 },
  eyebrow: {
    fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
    color: theme.colors.purple,
    fontFamily: theme.typography.fontFamily.bold,
  },
  h1: {
    fontSize: 22, color: '#fff', marginTop: 4,
    fontFamily: theme.typography.fontFamily.bold,
  },
  kpiRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  kpi: {
    flexGrow: 1, flexBasis: '46%', padding: 12, borderRadius: 10, borderWidth: 1,
    backgroundColor: theme.colors.surface2 ?? 'rgba(20,12,38,0.72)',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 12,
  },
  kpiLabel: {
    fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase',
    color: theme.colors.textTertiary,
    fontFamily: theme.typography.fontFamily.bold,
  },
  kpiValue: {
    fontSize: 26, marginTop: 4,
    fontFamily: theme.typography.fontFamily.monoBold,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10,
  },
  kpiSub: {
    fontSize: 10, color: theme.colors.textSecondary, marginTop: 2,
    fontFamily: theme.typography.fontFamily.regular,
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase',
    color: theme.colors.textTertiary,
    fontFamily: theme.typography.fontFamily.bold,
  },
  tempBarTrack: {
    flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden',
    backgroundColor: '#1a0f2e',
  },
  tempLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tempLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 2 },
  legendLabel: {
    fontSize: 9, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1,
  },
  legendValue: {
    fontSize: 9, color: '#fff', fontFamily: theme.typography.fontFamily.monoBold,
  },
  legendPct: {
    fontSize: 9, color: theme.colors.textTertiary,
    fontFamily: theme.typography.fontFamily.regular,
  },
  signalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  signalKey: {
    width: 60, fontSize: 10, letterSpacing: 1,
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  signalTrack: {
    flex: 1, height: 6, borderRadius: 3, backgroundColor: '#1a0f2e', overflow: 'hidden',
  },
  signalValue: {
    width: 40, textAlign: 'right', fontSize: 10, color: '#fff',
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  signalNote: {
    width: 90, fontSize: 9, color: theme.colors.textTertiary,
    fontFamily: theme.typography.fontFamily.monoBold,
  },
});

export default EngineFingerprintScreen;
