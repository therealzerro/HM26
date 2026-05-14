import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { theme } from '@/constants/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { SectionTitle, Card, st } from './AdminShared';

// ─────────────────────────────────────────────────────────────────────────────
// Engine Calibration Dashboard
//
// Purpose: surface, in one screen, every reason ZK6 might be picking poorly,
// so the operator can decide which knob to turn. Every metric is actionable:
//   • Hit rate trend  → are we improving or regressing?
//   • Scope breakdown → which scope is weakest (priority target)?
//   • Signal AUC      → is each of BOX/PBURST/CO/DGC actually predictive?
//   • Energy bands    → does the engine's own ranking correlate with hits?
//   • Multiplicity    → are singles/doubles caps mis-allocated?
//   • Pick position   → does #1 hit more than #6?
//
// Read-only — applying changes still goes through MASTER_AUDIT CONFIG-XX rules
// (backtest gate + service-role PATCH). The dashboard tells you WHAT to tune;
// the backtest harness tells you whether to ship it.
// ─────────────────────────────────────────────────────────────────────────────

// Reads from `adaptive_tracking` (ENH-01) — the K6-only training dataset.
// One row per K6 pick × slate_hash × mode with signals + outcome + quartile
// flags + dominant_signal pre-computed at slate-gen time. Cleaner than
// daily_intelligence (no top-30 watch-list noise), and the new analytic
// columns let the dashboard read flags directly instead of recomputing
// distributions on the fly.
//
// Important schema note: adaptive_tracking stores DGC values in the legacy
// `signal_burst` column (renaming would break `burst_top_quartile`).
// We map signal_burst → DGC for display.
interface AtRow {
  slate_date: string;
  scope: string;
  mode: string;
  rank: number | null;
  combo: string | null;
  energy_score: number | null;
  signal_box: number | null;
  signal_pburst: number | null;
  signal_co: number | null;
  signal_burst: number | null;   // DGC slot in adaptive_tracking
  hit_box: boolean | null;
  hit_straight: boolean | null;
  matched_state: string | null;
  matched_session: string | null;
  dominant_signal: string | null;
  box_top_quartile: boolean | null;
  pburst_top_quartile: boolean | null;
  co_top_quartile: boolean | null;
  burst_top_quartile: boolean | null;
}

const SIGNAL_KEYS = ['signal_box', 'signal_pburst', 'signal_co', 'signal_burst'] as const;
type SignalKey = (typeof SIGNAL_KEYS)[number];

const SIGNAL_LABEL: Record<SignalKey, string> = {
  signal_box: 'BOX',
  signal_pburst: 'PBURST',
  signal_co: 'CO',
  signal_burst: 'DGC',  // legacy column name, DGC is its semantic meaning
};

const DAYS_PRIMARY = 30;
const DAYS_PRIOR = 30; // for trend
const DAYS_TOTAL = DAYS_PRIMARY + DAYS_PRIOR;

// Mann–Whitney U → AUC. O(n log n). Ported from scripts/intel-tuning/fit.ts.
function computeAUC(samples: { score: number; positive: boolean }[]): number {
  if (samples.length === 0) return 0.5;
  const sorted = [...samples].sort((a, b) => a.score - b.score);
  let nPos = 0;
  let nNeg = 0;
  let posRankSum = 0;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].score === sorted[i].score) j++;
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      if (sorted[k].positive) { nPos++; posRankSum += avgRank; } else nNeg++;
    }
    i = j;
  }
  if (nPos === 0 || nNeg === 0) return 0.5;
  return (posRankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function rate(num: number, den: number): number {
  return den > 0 ? (num / den) * 100 : 0;
}

function pickIsHit(r: AtRow): boolean {
  return !!(r.hit_box || r.hit_straight);
}

// adaptive_tracking lacks a multiplicity column — compute from combo digits.
function multiplicityOf(combo: string | null): 'singles' | 'doubles' | 'triples' | null {
  if (!combo || combo.length !== 3) return null;
  const a = combo[0], b = combo[1], c = combo[2];
  if (a === b && b === c) return 'triples';
  if (a === b || b === c || a === c) return 'doubles';
  return 'singles';
}

// ─── Component ────────────────────────────────────────────────────────────────

// setView is optional so the screen still renders standalone if dropped into
// a context that doesn't supply it. When present, the "Tune in Engine Config →"
// CTAs route the operator to the matching admin view without losing context.
interface AdaptiveLearningViewProps {
  setView?: (view: string) => void;
}

export default function AdaptiveLearningView({ setView }: AdaptiveLearningViewProps = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AtRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const since = daysAgoISO(DAYS_TOTAL);
      const data = await fetchFromSupabase<AtRow[]>({
        path:
          '/rest/v1/adaptive_tracking?' +
          'select=slate_date,scope,mode,rank,combo,energy_score,' +
          'signal_box,signal_pburst,signal_co,signal_burst,' +
          'hit_box,hit_straight,matched_state,matched_session,' +
          'dominant_signal,box_top_quartile,pburst_top_quartile,' +
          'co_top_quartile,burst_top_quartile' +
          `&slate_date=gte.${since}` +
          '&mode=eq.balanced' +
          '&order=slate_date.desc&limit=20000',
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load calibration data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ─── Computed metrics (all memoized) ──────────────────────────────────────────

  const primaryCutoff = useMemo(() => daysAgoISO(DAYS_PRIMARY), []);

  const primaryRows = useMemo(
    () => rows.filter(r => r.slate_date >= primaryCutoff),
    [rows, primaryCutoff],
  );
  const priorRows = useMemo(
    () => rows.filter(r => r.slate_date < primaryCutoff),
    [rows, primaryCutoff],
  );

  // Slate-level hit rate = % of (date, scope) slates with ≥1 hit
  const slateHitRate = useCallback((window: AtRow[]) => {
    const slateMap = new Map<string, boolean>();
    for (const r of window) {
      if (!r.scope || !r.slate_date) continue;
      const k = `${r.slate_date}|${r.scope}`;
      slateMap.set(k, (slateMap.get(k) ?? false) || pickIsHit(r));
    }
    const total = slateMap.size;
    const hits = [...slateMap.values()].filter(Boolean).length;
    return { total, hits, rate: rate(hits, total) };
  }, []);

  const primary = useMemo(() => slateHitRate(primaryRows), [primaryRows, slateHitRate]);
  const prior = useMemo(() => slateHitRate(priorRows), [priorRows, slateHitRate]);
  const trendDelta = primary.rate - prior.rate;

  // Per-scope slate hit rate (primary window)
  const scopeStats = useMemo(() => {
    const scopes: Array<'midday' | 'evening' | 'allday'> = ['midday', 'evening', 'allday'];
    return scopes.map(scope => {
      const window = primaryRows.filter(r => r.scope === scope);
      return { scope, ...slateHitRate(window) };
    });
  }, [primaryRows, slateHitRate]);

  const weakestScope = useMemo(() => {
    const real = scopeStats.filter(s => s.total > 0);
    if (real.length === 0) return null;
    return real.reduce((m, s) => s.rate < m.rate ? s : m);
  }, [scopeStats]);

  // Signal AUC per signal (primary window) — does the signal predict hits?
  const signalAUC = useMemo(() => {
    const out: Record<SignalKey, { auc: number; n: number }> = {} as any;
    for (const key of SIGNAL_KEYS) {
      const samples = primaryRows
        .filter(r => typeof r[key] === 'number')
        .map(r => ({ score: r[key] as number, positive: pickIsHit(r) }));
      out[key] = { auc: computeAUC(samples), n: samples.length };
    }
    return out;
  }, [primaryRows]);

  // Energy calibration: bin by energy decile, compute hit rate per band
  const energyBands = useMemo(() => {
    const bands: Array<{ label: string; lo: number; hi: number; total: number; hits: number; rate: number }> = [
      { label: '0–40',   lo: 0,   hi: 40,  total: 0, hits: 0, rate: 0 },
      { label: '40–60',  lo: 40,  hi: 60,  total: 0, hits: 0, rate: 0 },
      { label: '60–80',  lo: 60,  hi: 80,  total: 0, hits: 0, rate: 0 },
      { label: '80–90',  lo: 80,  hi: 90,  total: 0, hits: 0, rate: 0 },
      { label: '90–100', lo: 90,  hi: 101, total: 0, hits: 0, rate: 0 },
    ];
    for (const r of primaryRows) {
      const e = r.energy_score;
      if (typeof e !== 'number') continue;
      const b = bands.find(x => e >= x.lo && e < x.hi);
      if (!b) continue;
      b.total++;
      if (pickIsHit(r)) b.hits++;
    }
    for (const b of bands) b.rate = rate(b.hits, b.total);
    return bands;
  }, [primaryRows]);

  const isCalibrationMonotonic = useMemo(() => {
    const real = energyBands.filter(b => b.total >= 20);
    for (let i = 1; i < real.length; i++) {
      if (real[i].rate < real[i - 1].rate - 5) return false; // allow 5pp wiggle
    }
    return real.length >= 3;
  }, [energyBands]);

  // Multiplicity performance — compute from combo since adaptive_tracking has no multiplicity column
  const multStats = useMemo(() => {
    const mults: Array<'singles' | 'doubles' | 'triples'> = ['singles', 'doubles', 'triples'];
    return mults.map(m => {
      const window = primaryRows.filter(r => multiplicityOf(r.combo) === m);
      const hits = window.filter(pickIsHit).length;
      return { mult: m, total: window.length, hits, rate: rate(hits, window.length) };
    });
  }, [primaryRows]);

  // Pick position (rank 1..6 hits) — adaptive_tracking is K6-only (ranks 1-6)
  const positionStats = useMemo(() => {
    const bins: Array<{ pos: number; total: number; hits: number; rate: number }> = [];
    for (let i = 1; i <= 6; i++) bins.push({ pos: i, total: 0, hits: 0, rate: 0 });
    for (const r of primaryRows) {
      if (typeof r.rank !== 'number') continue;
      if (r.rank < 1 || r.rank > 6) continue;
      bins[r.rank - 1].total++;
      if (pickIsHit(r)) bins[r.rank - 1].hits++;
    }
    for (const b of bins) b.rate = rate(b.hits, b.total);
    return bins;
  }, [primaryRows]);

  // Dominant-signal hit rates — new section enabled by ENH-01.
  // "When BOX dominated the pick, did it hit?" Quickly tells you which
  // signal channel is actually predictive vs noise.
  const dominantStats = useMemo(() => {
    const labels = ['BOX', 'PBURST', 'CO', 'DGC'] as const;
    return labels.map(label => {
      const window = primaryRows.filter(r => r.dominant_signal === label);
      const hits = window.filter(pickIsHit).length;
      return { label, total: window.length, hits, rate: rate(hits, window.length) };
    });
  }, [primaryRows]);

  // Quartile hit rates — for each signal, hit rate of picks flagged as
  // top-quartile vs not. If top-quartile dramatically out-hits bottom,
  // that signal is genuinely predictive. If they're equal, the signal
  // doesn't separate winners from losers.
  const quartileStats = useMemo(() => {
    type Q = { label: string; topRate: number; topN: number; botRate: number; botN: number; lift: number };
    const channels: Array<{ label: string; flag: keyof AtRow }> = [
      { label: 'BOX',    flag: 'box_top_quartile' },
      { label: 'PBURST', flag: 'pburst_top_quartile' },
      { label: 'CO',     flag: 'co_top_quartile' },
      { label: 'DGC',    flag: 'burst_top_quartile' },
    ];
    return channels.map<Q>(({ label, flag }) => {
      const top = primaryRows.filter(r => r[flag] === true);
      const bot = primaryRows.filter(r => r[flag] === false);
      const topHits = top.filter(pickIsHit).length;
      const botHits = bot.filter(pickIsHit).length;
      const topRate = rate(topHits, top.length);
      const botRate = rate(botHits, bot.length);
      return { label, topRate, topN: top.length, botRate, botN: bot.length, lift: topRate - botRate };
    });
  }, [primaryRows]);

  // Recommendations engine — generates 0–3 actionable items based on the diagnostics.
  // Each rec can optionally include `actionable: true` to surface a "Tune in
  // Engine Config →" CTA. Reserved for recs where Engine Config has the
  // matching knob — informational/diagnostic recs skip the CTA.
  const recommendations = useMemo(() => {
    const recs: { severity: 'high' | 'medium' | 'info'; title: string; body: string; actionable?: boolean }[] = [];

    // 1. Signal AUC near 0.5 → consider weight reduction
    for (const key of SIGNAL_KEYS) {
      const a = signalAUC[key].auc;
      if (signalAUC[key].n < 100) continue;
      if (a < 0.49) recs.push({
        severity: 'high',
        title: `${SIGNAL_LABEL[key]} AUC = ${a.toFixed(3)} (anti-predictive)`,
        body: `Higher ${SIGNAL_LABEL[key]} scores correlate with FEWER hits. Run \`npm run intel:propose\` to generate an AUC-fitted weight set, then backtest it before applying.`,
        actionable: true,
      });
      else if (a < 0.51 && a >= 0.49) recs.push({
        severity: 'medium',
        title: `${SIGNAL_LABEL[key]} AUC = ${a.toFixed(3)} (random)`,
        body: `${SIGNAL_LABEL[key]} provides no predictive lift over random. Consider zeroing its weight and redistributing to the higher-AUC signals.`,
        actionable: true,
      });
    }

    // 2. Energy calibration broken
    if (energyBands.filter(b => b.total >= 20).length >= 3 && !isCalibrationMonotonic) {
      recs.push({
        severity: 'high',
        title: 'Energy ranking is not calibrated',
        body: 'Higher-energy picks do not consistently hit more often than lower-energy picks. The percentile mapping may be inflating sub-quality picks. Audit `percentileRankOf` / scorePool construction.',
        // Not actionable from Engine Config — diagnosis points at code, not config.
      });
    }

    // 3. Doubles 0% hit rate
    const doubles = multStats.find(s => s.mult === 'doubles');
    if (doubles && doubles.total >= 30 && doubles.rate === 0) {
      recs.push({
        severity: 'medium',
        title: `Doubles: 0% over ${doubles.total} picks`,
        body: 'Doubles aren\'t producing any hits. Consider raising `k6_singles_max` from 4 → 5 to let an extra single fill the slot a double would have taken. Backtest required.',
        actionable: true,
      });
    } else if (doubles && doubles.total >= 30 && doubles.rate < 5) {
      recs.push({
        severity: 'medium',
        title: `Doubles hit rate ${doubles.rate.toFixed(1)}% over ${doubles.total} picks`,
        body: 'Doubles are underperforming. Investigate whether they\'re scoring high but missing, or whether the rails are forcing low-quality doubles into the slate.',
        actionable: true,
      });
    }

    // 4. Position #1 not winning most often
    const p1 = positionStats[0]?.rate ?? 0;
    const p6 = positionStats[5]?.rate ?? 0;
    if (positionStats[0]?.total >= 30 && p6 - p1 > 5) {
      recs.push({
        severity: 'high',
        title: `Pick #1 (${p1.toFixed(1)}%) hits less than Pick #6 (${p6.toFixed(1)}%)`,
        body: 'The display ordering (sort by indicator desc) is not predictive of hit likelihood. This may indicate the indicator formula needs re-weighting or the pass-relaxation logic is placing weaker picks above stronger ones.',
        actionable: true,
      });
    }

    // 5. Weakest scope flag — text refreshed 2026-05-13 (per-scope cooldown
    //    landed via CONFIG-05 on the same day, not 5/16 as the prior stale
    //    text indicated).
    if (weakestScope && weakestScope.total >= 10) {
      const others = scopeStats.filter(s => s.scope !== weakestScope.scope && s.total >= 10);
      const otherAvg = others.length > 0
        ? others.reduce((s, x) => s + x.rate, 0) / others.length
        : weakestScope.rate;
      if (otherAvg - weakestScope.rate > 10) {
        recs.push({
          severity: 'medium',
          title: `${weakestScope.scope} is the weakest scope (${weakestScope.rate.toFixed(1)}% vs ${otherAvg.toFixed(1)}% avg)`,
          body: `Per-scope cooldown overrides shipped 2026-05-13 (CONFIG-05). In Engine Config → K6 Rail Controls → Per-scope cooldown overrides, set \`${weakestScope.scope}\` to a lower value (try 10-15) and backtest before saving.`,
          actionable: true,
        });
      }
    }

    // 6. Trend regression
    if (prior.total >= 20 && primary.total >= 20 && trendDelta < -5) {
      recs.push({
        severity: 'high',
        title: `Hit rate dropped ${Math.abs(trendDelta).toFixed(1)}pp vs prior 30d`,
        body: 'Recent regression detected. Check the activity log for code/config changes in the last 30 days. Run `npm run backtest:replay -- --days 30 --config default` to verify the current config still produces backtest-projected numbers.',
        actionable: true,
      });
    }

    if (recs.length === 0 && primaryRows.length >= 200) {
      recs.push({
        severity: 'info',
        title: 'No tuning recommendations',
        body: 'All diagnostics are in healthy ranges. Continue current config; re-evaluate after 14 days of fresh data.',
        // No CTA — nothing to tune.
      });
    }

    return recs;
  }, [signalAUC, energyBands, multStats, positionStats, scopeStats, weakestScope, prior, primary, trendDelta, primaryRows.length, isCalibrationMonotonic]);

  const isEmpty = !loading && !error && primaryRows.length === 0;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text, marginBottom: 4 }}>
        ZK6 Engine Calibration
      </Text>
      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 16 }}>
        Diagnostic dashboard — every metric is a knob you can turn for more accurate picks.
      </Text>

      {loading && (
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 10 }}>Loading 60 days of pick data…</Text>
        </View>
      )}

      {error && !loading && (
        <Card style={{ padding: 16, marginBottom: 14, borderColor: theme.colors.error + '44', backgroundColor: theme.colors.error + '0A', alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: theme.colors.error, fontWeight: '700', marginBottom: 8 }}>Failed to load</Text>
          <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 12, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity style={st.btnGhost} onPress={load}>
            <Text style={st.btnGhostText}>Retry</Text>
          </TouchableOpacity>
        </Card>
      )}

      {isEmpty && (
        <Card style={{ padding: 24, marginBottom: 14, alignItems: 'center' }}>
          <Text style={{ fontSize: 28, marginBottom: 10 }}>📭</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text, marginBottom: 6, textAlign: 'center' }}>No pick data yet</Text>
          <Text style={{ fontSize: 11, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 18 }}>
            Generate slates and import ledger results to begin tracking calibration.
          </Text>
        </Card>
      )}

      {!loading && !error && !isEmpty && (
        <>
          {/* ── HERO: 30d hit rate + trend ───────────────────────────────────── */}
          <SectionTitle>HEADLINE</SectionTitle>
          <Card style={{ padding: 18, marginBottom: 14, alignItems: 'center' }}>
            <Text style={{
              fontSize: 44, fontWeight: '900',
              color: primary.rate >= 70 ? theme.colors.success : primary.rate >= 55 ? theme.colors.gold : theme.colors.error,
              fontFamily: theme.typography.fontFamily.monoBold,
            }}>
              {primary.rate.toFixed(1)}%
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 4 }}>
              slate hit rate · last {DAYS_PRIMARY} days · {primary.hits} of {primary.total} slates with ≥1 hit
            </Text>
            {prior.total >= 5 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: trendDelta >= 0 ? theme.colors.success : theme.colors.error }}>
                  {trendDelta >= 0 ? '↑' : '↓'} {Math.abs(trendDelta).toFixed(1)}pp
                </Text>
                <Text style={{ fontSize: 11, color: theme.colors.textTertiary }}>
                  vs prior {DAYS_PRIOR}d ({prior.rate.toFixed(1)}%)
                </Text>
              </View>
            )}
          </Card>

          {/* ── SCOPE BREAKDOWN ──────────────────────────────────────────────── */}
          <SectionTitle>BY SCOPE (LAST 30 DAYS)</SectionTitle>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {scopeStats.map(s => {
              const isWeakest = weakestScope?.scope === s.scope && s.total > 0;
              return (
                <Card key={s.scope} style={{ flex: 1, padding: 12, alignItems: 'center', borderColor: isWeakest ? theme.colors.error + '66' : undefined, borderWidth: isWeakest ? 1 : undefined }}>
                  <Text style={{ fontSize: 9, color: theme.colors.textTertiary, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' }}>{s.scope}</Text>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: isWeakest ? theme.colors.error : theme.colors.text, fontFamily: theme.typography.fontFamily.monoBold }}>
                    {s.total > 0 ? s.rate.toFixed(0) + '%' : '—'}
                  </Text>
                  <Text style={{ fontSize: 9, color: theme.colors.textTertiary, marginTop: 3 }}>{s.hits}/{s.total} slates</Text>
                </Card>
              );
            })}
          </View>

          {/* ── SIGNAL AUC ───────────────────────────────────────────────────── */}
          <SectionTitle>SIGNAL PREDICTIVE POWER (AUC)</SectionTitle>
          <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginBottom: 8, paddingHorizontal: 4 }}>
            AUC = 0.5 means random · 1.0 means perfect predictor · {'>'}0.55 is genuine lift
          </Text>
          <Card style={{ padding: 14, marginBottom: 14 }}>
            {SIGNAL_KEYS.map((key, idx) => {
              const a = signalAUC[key];
              const tone = a.auc >= 0.55 ? theme.colors.success
                : a.auc >= 0.51 ? theme.colors.gold
                : a.auc >= 0.49 ? theme.colors.textTertiary
                : theme.colors.error;
              const barW = Math.max(2, Math.min(100, (a.auc - 0.4) * 250));
              return (
                <View key={key} style={{ marginBottom: idx === SIGNAL_KEYS.length - 1 ? 0 : 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.text }}>{SIGNAL_LABEL[key]}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: tone, fontFamily: theme.typography.fontFamily.monoBold }}>
                      {a.auc.toFixed(3)}
                    </Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: theme.colors.surfaceMuted, borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: 6, width: `${barW}%`, backgroundColor: tone }} />
                  </View>
                </View>
              );
            })}
          </Card>

          {/* ── DOMINANT SIGNAL HIT RATES (new, ENH-01) ──────────────────────── */}
          <SectionTitle>BY DOMINANT SIGNAL</SectionTitle>
          <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginBottom: 8, paddingHorizontal: 4 }}>
            Hit rate of picks where each signal led the score. Big gap between signals = the engine is correctly picking based on what works.
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
            {dominantStats.map(s => (
              <Card key={s.label} style={{ flex: 1, padding: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 9, color: theme.colors.textTertiary, fontWeight: '700', marginBottom: 3 }}>{s.label}</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: s.total === 0 ? theme.colors.textTertiary : theme.colors.text, fontFamily: theme.typography.fontFamily.monoBold }}>
                  {s.total > 0 ? s.rate.toFixed(0) + '%' : '—'}
                </Text>
                <Text style={{ fontSize: 8, color: theme.colors.textTertiary, marginTop: 2 }}>{s.hits}/{s.total}</Text>
              </Card>
            ))}
          </View>

          {/* ── TOP-QUARTILE LIFT (new, ENH-02) ──────────────────────────────── */}
          <SectionTitle>TOP-QUARTILE LIFT PER SIGNAL</SectionTitle>
          <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginBottom: 8, paddingHorizontal: 4 }}>
            Hit rate when a signal is in the top 25% of the day vs not. Positive lift = the signal actually separates winners.
          </Text>
          <Card style={{ padding: 12, marginBottom: 14 }}>
            {quartileStats.map((q, idx) => {
              const tone = q.lift >= 10 ? theme.colors.success
                : q.lift >= 3 ? theme.colors.gold
                : q.lift >= -3 ? theme.colors.textTertiary
                : theme.colors.error;
              return (
                <View key={q.label} style={{ marginBottom: idx === quartileStats.length - 1 ? 0 : 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.text }}>{q.label}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '900', color: tone, fontFamily: theme.typography.fontFamily.monoBold }}>
                      {q.lift >= 0 ? '+' : ''}{q.lift.toFixed(1)}pp
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono }}>
                    top-quartile: {q.topRate.toFixed(0)}% ({q.topN})  ·  other: {q.botRate.toFixed(0)}% ({q.botN})
                  </Text>
                </View>
              );
            })}
          </Card>

          {/* ── ENERGY CALIBRATION ───────────────────────────────────────────── */}
          <SectionTitle>ENERGY BAND HIT RATES</SectionTitle>
          <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginBottom: 8, paddingHorizontal: 4 }}>
            Healthy engine: higher-energy bands hit more often. Flat or inverted = ranking is broken.
          </Text>
          <Card style={{ padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 90 }}>
              {energyBands.map(b => {
                const maxRate = Math.max(...energyBands.map(x => x.rate), 1);
                const h = b.total >= 5 ? Math.max(3, Math.round((b.rate / maxRate) * 70)) : 3;
                return (
                  <View key={b.label} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: theme.colors.text, marginBottom: 3, fontFamily: theme.typography.fontFamily.monoBold }}>
                      {b.total >= 5 ? b.rate.toFixed(0) + '%' : '—'}
                    </Text>
                    <View style={{ width: '70%', height: h, backgroundColor: b.total >= 5 ? theme.colors.primary : theme.colors.surfaceMuted, borderRadius: 3 }} />
                    <Text style={{ fontSize: 9, color: theme.colors.textTertiary, marginTop: 4 }}>{b.label}</Text>
                    <Text style={{ fontSize: 8, color: theme.colors.textTertiary }}>{b.total >= 1 ? `n=${b.total}` : ''}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.surfaceMuted }}>
              <Text style={{ fontSize: 10, color: isCalibrationMonotonic ? theme.colors.success : theme.colors.error, fontWeight: '700' }}>
                {isCalibrationMonotonic ? '✓ Calibrated — higher energy = higher hit rate' : '⚠ Not monotonic — engine ranking does not predict hits reliably'}
              </Text>
            </View>
          </Card>

          {/* ── MULTIPLICITY ─────────────────────────────────────────────────── */}
          <SectionTitle>MULTIPLICITY</SectionTitle>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {multStats.map(s => (
              <Card key={s.mult} style={{ flex: 1, padding: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 9, color: theme.colors.textTertiary, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' }}>{s.mult}</Text>
                <Text style={{ fontSize: 22, fontWeight: '900', color: s.total === 0 ? theme.colors.textTertiary : (s.rate < 10 && s.total >= 30 ? theme.colors.error : theme.colors.text), fontFamily: theme.typography.fontFamily.monoBold }}>
                  {s.total > 0 ? s.rate.toFixed(0) + '%' : '—'}
                </Text>
                <Text style={{ fontSize: 9, color: theme.colors.textTertiary, marginTop: 3 }}>{s.hits}/{s.total} picks</Text>
              </Card>
            ))}
          </View>

          {/* ── PICK POSITION ────────────────────────────────────────────────── */}
          <SectionTitle>PICK POSITION (RANK 1–6)</SectionTitle>
          <Text style={{ fontSize: 10, color: theme.colors.textTertiary, marginBottom: 8, paddingHorizontal: 4 }}>
            Engine sorts by indicator desc. Pick #1 should hit most often.
          </Text>
          <Card style={{ padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80 }}>
              {positionStats.map(p => {
                const maxRate = Math.max(...positionStats.map(x => x.rate), 1);
                const h = p.total >= 5 ? Math.max(3, Math.round((p.rate / maxRate) * 60)) : 3;
                return (
                  <View key={p.pos} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: theme.colors.text, marginBottom: 3, fontFamily: theme.typography.fontFamily.monoBold }}>
                      {p.total >= 5 ? p.rate.toFixed(0) + '%' : '—'}
                    </Text>
                    <View style={{ width: '70%', height: h, backgroundColor: theme.colors.teal, borderRadius: 3 }} />
                    <Text style={{ fontSize: 9, color: theme.colors.textTertiary, marginTop: 4 }}>#{p.pos}</Text>
                  </View>
                );
              })}
            </View>
          </Card>

          {/* ── RECOMMENDATIONS ──────────────────────────────────────────────── */}
          <SectionTitle>RECOMMENDED ACTIONS</SectionTitle>
          {recommendations.length === 0 ? (
            <Card style={{ padding: 14, marginBottom: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>Need more data for recommendations.</Text>
            </Card>
          ) : (
            recommendations.map((rec, idx) => {
              const tone =
                rec.severity === 'high' ? theme.colors.error :
                rec.severity === 'medium' ? theme.colors.gold :
                theme.colors.primary;
              const showCTA = rec.actionable && setView;
              return (
                <Card key={idx} style={{
                  padding: 14, marginBottom: 8,
                  borderLeftWidth: 3, borderLeftColor: tone,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: tone + '22', marginRight: 8 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: tone, textTransform: 'uppercase' }}>
                        {rec.severity}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.text, flex: 1 }}>{rec.title}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: theme.colors.textSecondary, lineHeight: 16 }}>{rec.body}</Text>
                  {showCTA && (
                    <TouchableOpacity
                      onPress={() => setView!('engine')}
                      style={{
                        alignSelf: 'flex-start',
                        marginTop: 10,
                        paddingHorizontal: 10, paddingVertical: 6,
                        borderRadius: 7,
                        backgroundColor: tone + '14',
                        borderWidth: 1, borderColor: tone + '44',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: tone }}>
                        Tune in Engine Config →
                      </Text>
                    </TouchableOpacity>
                  )}
                </Card>
              );
            })
          )}

          {/* ── HOW TO ACT ───────────────────────────────────────────────────── */}
          <Card style={{ padding: 14, marginTop: 6, marginBottom: 14, backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary + '33' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.colors.primary, marginBottom: 6 }}>
              How to act on these signals
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.textSecondary, lineHeight: 17 }}>
              • Per CLAUDE.md, no engine/config change ships without a backtest number. Run{' '}
              <Text style={{ fontFamily: theme.typography.fontFamily.monoBold, color: theme.colors.text }}>
                npm run backtest:replay -- --days 30 --config &lt;preset&gt;
              </Text>
              {'\n\n'}• For AUC-fitted weight proposals:{' '}
              <Text style={{ fontFamily: theme.typography.fontFamily.monoBold, color: theme.colors.text }}>
                npm run intel:propose
              </Text>
              {'\n\n'}• Production app_config changes get tracked as CONFIG-XX entries in MASTER_AUDIT.md.
            </Text>
          </Card>
        </>
      )}

      <TouchableOpacity style={[st.btnGhost, { marginTop: 4 }]} onPress={load} disabled={loading}>
        <Text style={st.btnGhostText}>{loading ? 'Loading…' : '↺ Refresh'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
