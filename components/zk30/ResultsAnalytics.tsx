// components/zk30/ResultsAnalytics.tsx
//
// Phase D analytics for the Results tab. Four cards + one banner:
//   FailedRunsBanner  — red strip atop Results when any of last 14 cron
//                       runs failed (D1 contract)
//   CronHealthCard    — last 14 runs from hit_detection_runs + engine_runs,
//                       color-coded ✓/✗/⚠ (D1)
//   SevenDayChart     — stacked-bar SVG of last 7 days, hit types
//                       (straight/box/fb-straight/fb-box) + 7d avg line (D2)
//   SessionBreakdown  — horizontal 4-bar of M/D/E/N hits, 7d/30d/90d
//                       toggle (D3)
//   FireballNaturalSplit — 3-segment horizontal bar (natural-only,
//                       fireball-only, both) over 30d (D4)
//
// All charts hand-rolled with react-native-svg (existing dep via EnergyRing)
// to avoid the unmaintained react-native-svg-charts the spec suggested.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { theme } from '@/constants/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import type { ColorTokens } from '@/lib/theme';
import { getTodayET } from '@/lib/dateUtils';

// ─── Shared helpers ────────────────────────────────────────────────────────

function isoDateNDaysAgo(n: number): string {
  const d = new Date(getTodayET() + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function shortDateLabel(slateDate: string): string {
  const d = new Date(slateDate + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/New_York' });
}

function fmtRunTime(ts: string): string {
  const d = new Date(ts);
  const dt = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  const tm = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
  return `${dt} ${tm}`;
}

// ─── Data types ────────────────────────────────────────────────────────────

type CronRunRow = {
  ts: string;
  kind: 'slate-gen' | 'hit-detect';
  ok: boolean;
  warn: boolean;
  durationMs: number | null;
  hitsFound: number | null;
  errorCount: number;
};

type HitDayCounts = {
  slate_date: string;
  straight: number;
  box: number;
  fb_straight: number;
  fb_box: number;
};

type HitRow = {
  slate_date: string;
  matched_session: string | null;
  hit_straight: boolean;
  hit_box: boolean;
  hit_fireball_straight: boolean;
  hit_fireball_box: boolean;
};

// ─── Fetchers ──────────────────────────────────────────────────────────────

async function fetchCronRuns(): Promise<CronRunRow[]> {
  // Pull more than 14 of each, merge, then trim — the latest 14 across both
  // crons isn't 7-and-7.
  const [hits, engines] = await Promise.all([
    fetchFromSupabase<Array<{ run_at: string; duration_ms: number | null; hits_found: number | null; error_count: number | null }>>({
      path: `/rest/v1/hit_detection_runs?run_source=eq.edge-zk30&order=run_at.desc&limit=30` +
            `&select=run_at,duration_ms,hits_found,error_count`,
    }),
    fetchFromSupabase<Array<{ generated_at_et: string; source: string | null; effective_weights: any }>>({
      path: `/rest/v1/engine_runs?effective_weights->>_engine=eq.zk30&order=generated_at_et.desc&limit=30` +
            `&select=generated_at_et,source,effective_weights`,
    }),
  ]);

  const merged: CronRunRow[] = [];
  for (const r of hits ?? []) {
    const errs = r.error_count ?? 0;
    merged.push({
      ts: r.run_at,
      kind: 'hit-detect',
      ok: errs === 0,
      warn: false,
      durationMs: r.duration_ms,
      hitsFound: r.hits_found ?? 0,
      errorCount: errs,
    });
  }
  for (const r of engines ?? []) {
    merged.push({
      ts: r.generated_at_et,
      kind: 'slate-gen',
      ok: true,
      warn: false,
      durationMs: null,
      hitsFound: null,
      errorCount: 0,
    });
  }
  merged.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return merged.slice(0, 14);
}

async function fetchHits(daysBack: number): Promise<HitRow[]> {
  const startStr = isoDateNDaysAgo(daysBack - 1);
  const rows = await fetchFromSupabase<HitRow[]>({
    path: `/rest/v1/adaptive_tracking_zk30?matched_session=not.is.null` +
          `&slate_date=gte.${startStr}` +
          `&select=slate_date,matched_session,hit_straight,hit_box,hit_fireball_straight,hit_fireball_box` +
          `&limit=1000`,
  });
  return Array.isArray(rows) ? rows : [];
}

// ─── D1: FailedRunsBanner ──────────────────────────────────────────────────

export function FailedRunsBanner({ colors }: { colors: ColorTokens }) {
  const { data: runs } = useQuery({ queryKey: ['zk30-cron-runs'], queryFn: fetchCronRuns, staleTime: 60_000 });
  const failed = (runs ?? []).filter(r => !r.ok);
  if (failed.length === 0) return null;
  return (
    <View style={[bannerStyles.bar, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
      <Text style={[bannerStyles.text, { color: colors.error }]}>
        {`⚠ ${failed.length} failed cron run${failed.length !== 1 ? 's' : ''} in the last 14`}
      </Text>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  bar: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  text: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
});

// ─── D1: CronHealthCard ────────────────────────────────────────────────────

export function CronHealthCard({ colors, brand }: { colors: ColorTokens; brand: string }) {
  const { data: runs, isPending } = useQuery({ queryKey: ['zk30-cron-runs'], queryFn: fetchCronRuns, staleTime: 60_000 });

  return (
    <View style={[cardStyles.card, { borderColor: colors.border }]}>
      <Text style={[cardStyles.sectionLabel, { color: brand }]}>CRON HEALTH  ·  LAST 14 RUNS</Text>
      {isPending ? (
        <ActivityIndicator color={brand} />
      ) : !runs || runs.length === 0 ? (
        <Text style={[cardStyles.empty, { color: colors.textTertiary }]}>
          No cron runs recorded yet. First scheduled fire: 09:00 ET Mon–Sat.
        </Text>
      ) : (
        <View style={{ gap: 2 }}>
          {runs.map((r, i) => {
            const statusColor = !r.ok ? colors.error : r.warn ? colors.warning : colors.success;
            const statusGlyph = !r.ok ? '✗' : r.warn ? '⚠' : '✓';
            return (
              <View key={i} style={[cardStyles.runRow, { borderBottomColor: colors.border }]}>
                <Text style={[cardStyles.runStatus, { color: statusColor }]}>{statusGlyph}</Text>
                <Text style={[cardStyles.runTs, { color: colors.text }]}>{fmtRunTime(r.ts)}</Text>
                <Text style={[cardStyles.runKind, { color: r.kind === 'slate-gen' ? brand : colors.gold }]}>
                  {r.kind}
                </Text>
                <Text style={[cardStyles.runMeta, { color: colors.textSecondary }]}>
                  {r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'}
                </Text>
                <Text style={[cardStyles.runMeta, { color: colors.textSecondary }]}>
                  {r.hitsFound != null ? `${r.hitsFound} hit${r.hitsFound !== 1 ? 's' : ''}` : '—'}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── D2: SevenDayChart ─────────────────────────────────────────────────────

export function SevenDayChart({ colors, brand }: { colors: ColorTokens; brand: string }) {
  const { data: hits, isPending } = useQuery({
    queryKey: ['zk30-hits-7d'],
    queryFn: () => fetchHits(7),
    staleTime: 60_000,
  });

  const days: HitDayCounts[] = useMemo(() => {
    const out: HitDayCounts[] = [];
    for (let i = 6; i >= 0; i--) {
      out.push({ slate_date: isoDateNDaysAgo(i), straight: 0, box: 0, fb_straight: 0, fb_box: 0 });
    }
    const idx = new Map(out.map(d => [d.slate_date, d]));
    if (hits) for (const h of hits) {
      const d = idx.get(h.slate_date);
      if (!d) continue;
      if (h.hit_straight) d.straight++;
      else if (h.hit_box) d.box++;
      if (h.hit_fireball_straight) d.fb_straight++;
      else if (h.hit_fireball_box) d.fb_box++;
    }
    return out;
  }, [hits]);

  const totals = days.map(d => d.straight + d.box + d.fb_straight + d.fb_box);
  const max = Math.max(1, ...totals);
  const avg = totals.reduce((s, n) => s + n, 0) / 7;

  const W = 320, H = 130;
  const padL = 18, padR = 6, padT = 6, padB = 20;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const barW = (innerW / 7) * 0.7;
  const gap  = (innerW / 7) * 0.3;
  const yFor = (n: number) => padT + innerH - (n / max) * innerH;

  return (
    <View style={[cardStyles.card, { borderColor: colors.border }]}>
      <Text style={[cardStyles.sectionLabel, { color: brand }]}>7-DAY HITS</Text>
      {isPending ? (
        <ActivityIndicator color={brand} />
      ) : (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Svg width={W} height={H}>
            {/* Y axis baseline */}
            <Line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke={colors.border} strokeWidth={1} />

            {/* Bars (stacked bottom-up: straight → box → fb_straight → fb_box) */}
            {days.map((d, i) => {
              const x = padL + (i * innerW / 7) + gap / 2;
              const segs: Array<{ v: number; color: string }> = [
                { v: d.straight,    color: colors.success },
                { v: d.box,         color: '#4a90e2' },
                { v: d.fb_straight, color: colors.orange },
                { v: d.fb_box,      color: colors.amber },
              ];
              let runningY = padT + innerH;
              return (
                <React.Fragment key={d.slate_date}>
                  {segs.map((seg, j) => {
                    if (seg.v === 0) return null;
                    const h = (seg.v / max) * innerH;
                    runningY -= h;
                    return (
                      <Rect key={j} x={x} y={runningY} width={barW} height={h} fill={seg.color} rx={1.5} />
                    );
                  })}
                  <SvgText
                    x={x + barW / 2} y={H - 5}
                    fontSize={8} fill={colors.textTertiary}
                    textAnchor="middle" fontWeight="700"
                  >
                    {shortDateLabel(d.slate_date)}
                  </SvgText>
                </React.Fragment>
              );
            })}

            {/* 7-day average line */}
            <Line
              x1={padL} y1={yFor(avg)}
              x2={padL + innerW} y2={yFor(avg)}
              stroke={brand}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <SvgText
              x={padL + 2} y={Math.max(yFor(avg) - 3, padT + 8)}
              fontSize={8} fill={brand} fontWeight="800"
            >
              {`avg ${avg.toFixed(1)}`}
            </SvgText>
          </Svg>
          {/* Legend */}
          <View style={cardStyles.legendRow}>
            <Legend color={colors.success} label="Straight" />
            <Legend color="#4a90e2"        label="Box" />
            <Legend color={colors.orange}  label="🔥S" />
            <Legend color={colors.amber}   label="🔥B" />
          </View>
        </View>
      )}
    </View>
  );
}

// ─── D3: SessionBreakdown ──────────────────────────────────────────────────

const SESSION_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'Morning', label: 'MORNING' },
  { key: 'Day',     label: 'DAY' },
  { key: 'Evening', label: 'EVENING' },
  { key: 'Night',   label: 'NIGHT' },
];

export function SessionBreakdown({ colors, brand }: { colors: ColorTokens; brand: string }) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const { data: hits, isPending } = useQuery({
    queryKey: ['zk30-hits-by-session', days],
    queryFn: () => fetchHits(days),
    staleTime: 60_000,
  });

  const counts = useMemo(() => {
    const map = new Map<string, number>(SESSION_ORDER.map(s => [s.key, 0]));
    if (hits) for (const h of hits) {
      const k = (h.matched_session ?? '').trim();
      // Match case-insensitively to absorb future label drift.
      const canon = SESSION_ORDER.find(s => s.key.toLowerCase() === k.toLowerCase());
      if (canon) map.set(canon.key, (map.get(canon.key) ?? 0) + 1);
    }
    return SESSION_ORDER.map(s => ({ ...s, count: map.get(s.key) ?? 0 }));
  }, [hits]);

  const max = Math.max(1, ...counts.map(c => c.count));

  return (
    <View style={[cardStyles.card, { borderColor: colors.border }]}>
      <View style={cardStyles.cardHeader}>
        <Text style={[cardStyles.sectionLabel, { color: brand }]}>BY SESSION</Text>
        <View style={cardStyles.toggleRow}>
          {([7, 30, 90] as const).map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => setDays(n)}
              style={[
                cardStyles.toggleBtn,
                { borderColor: colors.border },
                days === n && { backgroundColor: brand + '20', borderColor: brand },
              ]}
            >
              <Text style={[cardStyles.toggleText, { color: days === n ? brand : colors.textSecondary }]}>
                {`${n}d`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {isPending ? (
        <ActivityIndicator color={brand} />
      ) : (
        <View style={{ gap: 6 }}>
          {counts.map(c => (
            <View key={c.key} style={cardStyles.hbarRow}>
              <Text style={[cardStyles.hbarLabel, { color: colors.textSecondary }]}>{c.label}</Text>
              <View style={[cardStyles.hbarTrack, { backgroundColor: colors.surfaceLight }]}>
                <View
                  style={[
                    cardStyles.hbarFill,
                    { backgroundColor: brand, width: `${(c.count / max) * 100}%` },
                  ]}
                />
              </View>
              <Text style={[cardStyles.hbarCount, { color: colors.text }]}>{c.count}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── D4: FireballNaturalSplit ──────────────────────────────────────────────

export function FireballNaturalSplit({ colors, brand }: { colors: ColorTokens; brand: string }) {
  const { data: hits, isPending } = useQuery({
    queryKey: ['zk30-hits-fb-split-30d'],
    queryFn: () => fetchHits(30),
    staleTime: 60_000,
  });

  const buckets = useMemo(() => {
    let nat = 0, fb = 0, both = 0;
    if (hits) for (const h of hits) {
      const isNat = h.hit_straight || h.hit_box;
      const isFb  = h.hit_fireball_straight || h.hit_fireball_box;
      if (isNat && isFb) both++;
      else if (isNat) nat++;
      else if (isFb) fb++;
    }
    const total = nat + fb + both;
    return { nat, fb, both, total };
  }, [hits]);

  const { nat, fb, both, total } = buckets;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

  return (
    <View style={[cardStyles.card, { borderColor: colors.border }]}>
      <Text style={[cardStyles.sectionLabel, { color: brand }]}>FIREBALL vs NATURAL  ·  30D</Text>
      {isPending ? (
        <ActivityIndicator color={brand} />
      ) : total === 0 ? (
        <Text style={[cardStyles.empty, { color: colors.textTertiary }]}>
          No hits in the last 30 days. Trigger detection or wait for the nightly cron.
        </Text>
      ) : (
        <>
          {/* 3-segment horizontal bar */}
          <View style={cardStyles.splitTrack}>
            <View style={{ flex: nat || 0, backgroundColor: colors.success, height: '100%' }} />
            <View style={{ flex: fb || 0,  backgroundColor: colors.orange,  height: '100%' }} />
            <View style={{ flex: both || 0, backgroundColor: brand,         height: '100%' }} />
          </View>

          <View style={{ gap: 4, marginTop: 6 }}>
            <SplitRow color={colors.success} label="Natural only"    count={nat}  pct={pct(nat)}  textColor={colors.text} subColor={colors.textSecondary} />
            <SplitRow color={colors.orange}  label="Fireball only"   count={fb}   pct={pct(fb)}   textColor={colors.text} subColor={colors.textSecondary} />
            <SplitRow color={brand}          label="Both"            count={both} pct={pct(both)} textColor={colors.text} subColor={colors.textSecondary} />
          </View>
        </>
      )}
    </View>
  );
}

// ─── Tiny subcomponents ────────────────────────────────────────────────────

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text style={cardStyles.legendText}>{label}</Text>
    </View>
  );
}

function SplitRow({
  color, label, count, pct, textColor, subColor,
}: { color: string; label: string; count: number; pct: number; textColor: string; subColor: string }) {
  return (
    <View style={cardStyles.splitRow}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text style={[cardStyles.splitLabel, { color: textColor }]}>{label}</Text>
      <Text style={[cardStyles.splitCount, { color: subColor }]}>{`${count} hits (${pct}%)`}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1, borderRadius: 12,
    padding: 12, gap: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  empty: { fontSize: 11, fontStyle: 'italic' },

  // Cron rows
  runRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  runStatus: { fontSize: 11, fontWeight: '900', width: 14, textAlign: 'center' },
  runTs:     { fontSize: 10, fontWeight: '700', width: 100 },
  runKind:   { fontSize: 9, fontWeight: '900', letterSpacing: 0.4, width: 64 },
  runMeta:   { fontSize: 10, fontWeight: '600', flex: 1, textAlign: 'right' },

  // Chart legend
  legendRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  legendText: { fontSize: 9, fontWeight: '700' },

  // Horizontal-bar (D3)
  hbarRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hbarLabel: { width: 70, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  hbarTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  hbarFill:  { height: '100%', borderRadius: 5 },
  hbarCount: { width: 28, textAlign: 'right', fontSize: 11, fontWeight: '800' },

  // 7d/30d/90d toggle
  toggleRow: { flexDirection: 'row', gap: 4 },
  toggleBtn: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1,
  },
  toggleText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },

  // Split bar (D4)
  splitTrack: {
    flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden',
  },
  splitRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  splitLabel: { fontSize: 11, fontWeight: '700', flex: 1 },
  splitCount: { fontSize: 11, fontWeight: '700' },
});

// keep `theme` import used so tree-shake doesn't warn (mono font available
// for any future numerical column you'd want to swap in).
void theme;
