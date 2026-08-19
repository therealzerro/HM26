import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Animated, Easing, useWindowDimensions, ScrollView,
} from 'react-native';
import { Zap, Link2, Target, Share2, Clock, BookMarked } from 'lucide-react-native';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { shareTextSafe } from '@/lib/shareText';
import { alertAsync } from '@/lib/confirm';
import { storage } from '../lib/storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '../lib/supabase';
import { theme } from '../constants/theme';
import { useTheme, heatTier, heatLabelDetailed, type ColorTokens } from '../lib/theme';
import { PickItem } from './PickCard';
import { HitReplay } from './HitReplay';
import { getPairs, fetchPairScores } from '../lib/pairUtils';
import { EnergyArc, SignalPill, WhyRow } from './pickVisuals';
import { formatHitContext } from '../lib/hitToPickItem';
import { ReelPromoPanel } from './ReelPromoPanel';

// DESIGN-03 F10: window dimensions read per-render via useWindowDimensions
// (the module-scope Dimensions.get snapshot went stale on rotation/resize).

// Active design tokens — same shape as the original `D` map but resolved
// per render through useTheme so the modal flips with light/dark mode.
type DTokens = ReturnType<typeof makeD>;
function makeD(colors: ColorTokens) {
  return {
    bg:          colors.background,
    surface:     colors.bgElevated,
    glass:       colors.card,
    glassBorder: colors.border,
    borderMed:   colors.borderMed,
    cyan:        colors.cyan,
    rose:        colors.rose,
    purple:      colors.purple,
    gold:        colors.gold,
    amber:       colors.amber,
    hot:         colors.hot,
    success:     colors.success,
    text:        colors.text,
    textSub:     colors.textSecondary,
    textDim:     colors.textTertiary,
    mono:        theme.typography.fontFamily.mono,
    monoBold:    theme.typography.fontFamily.monoBold,
  };
}

function useStyles() {
  const { colors } = useTheme();
  return useMemo(() => {
    const D = makeD(colors);
    return {
      D,
      mx: makeMx(D),
      tb: makeTb(D),
      ct: makeCt(D),
      s:  makeS(D),
    };
  }, [colors]);
}

// ─── Gradient accent line ─────────────────────────────────────────────────────
function GradientLine() {
  const { D } = useStyles();
  const { width } = useWindowDimensions();
  return (
    <Svg width={width} height={3} style={{ display: 'flex' }}>
      <Defs>
        <SvgGradient id="gline" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%"   stopColor={D.purple} stopOpacity={0.7} />
          <Stop offset="40%"  stopColor={D.cyan}   stopOpacity={1}   />
          <Stop offset="70%"  stopColor={D.cyan}   stopOpacity={1}   />
          <Stop offset="100%" stopColor={D.rose}   stopOpacity={0.7} />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={3} fill="url(#gline)" />
    </Svg>
  );
}

// EnergyArc + SignalPill moved to ./pickVisuals so PickPosterCard can reuse them.

// ─── Pair strength rows ───────────────────────────────────────────────────────
// DESIGN-03 S1 (2026-08-13): the old 4-row "matrix" rendered FABRICATED
// percentages — hardcoded multipliers (PBURST×92/×70/×30, BOX×95/60/45,
// DGC×88/55/40) styled identically to real data. Replaced with one honest
// row per pair, driven entirely by fetchPairScores (position-pair classes
// 2/3/4, H01Y national dataset, max-normed within the pick). No synthetic
// numbers may enter this card — if a value is not measured, it is not shown.
function PairStrengthRow({ pair, role, score }: { pair: string; role: string; score: number }) {
  const { D, mx } = useStyles();
  const c = score >= 70 ? D.cyan : score >= 40 ? D.gold : D.textDim;
  return (
    <View style={mx.dataRow}>
      <View style={mx.rowLabel}>
        <Text style={mx.rowPair}>{pair}</Text>
        <Text style={mx.rowRole}>{role}</Text>
      </View>
      <View style={mx.cell}>
        <View style={mx.track}>
          <View style={[mx.fill, { width: `${Math.min(100, score)}%` as any, backgroundColor: c }]} />
        </View>
      </View>
      <Text style={[mx.scoreText, { color: c }]}>{score}%</Text>
    </View>
  );
}
const makeMx = (D: DTokens) => StyleSheet.create({
  dataRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: D.glassBorder, gap: 10 },
  rowLabel:   { width: 64 },
  rowPair:    { fontSize: 16, fontWeight: '900', color: D.text, fontFamily: D.monoBold, letterSpacing: 2 },
  rowRole:    { fontSize: 9, color: D.textDim, letterSpacing: 0.5, marginTop: 1 },
  cell:       { flex: 1 },
  track:      { height: 8, backgroundColor: D.text + theme.alpha.faint, borderRadius: 4, overflow: 'hidden' },
  fill:       { height: 8, borderRadius: 4 },
  scoreText:  { fontSize: 12, fontWeight: '800', fontFamily: D.mono, width: 42, textAlign: 'right' },
});

// WhyRow moved to ./pickVisuals so PickPosterCard can reuse it.

// ─── Tab bar ──────────────────────────────────────────────────────────────────
// DESIGN-03 S6: lucide icons replace emoji (platform-variant rendering — the
// captured tab bar looked different on the capture host than on devices).
// S4 ruling batch: the third tab's LABEL is ACTION (was PLAY — brand-brief
// avoid-list verb); the internal key stays 'PLAY' so no state plumbing moves.
type Tab = 'INTEL' | 'PAIRS' | 'PLAY';
const TABS: { key: Tab; Icon: typeof Zap; label: string }[] = [
  { key: 'INTEL', Icon: Zap,    label: 'INTEL'  },
  { key: 'PAIRS', Icon: Link2,  label: 'PAIRS'  },
  { key: 'PLAY',  Icon: Target, label: 'ACTION' },
];

function TabBar({ active, onPress }: { active: Tab; onPress: (t: Tab) => void }) {
  const { D, tb } = useStyles();
  return (
    <View style={tb.bar}>
      {TABS.map(t => (
        <TouchableOpacity key={t.key} style={[tb.tab, active === t.key && tb.tabActive]} onPress={() => onPress(t.key)} activeOpacity={0.7}>
          <t.Icon size={13} color={active === t.key ? D.cyan : D.textDim} />
          <Text style={[tb.tabLabel, active === t.key && tb.tabLabelActive]}>{t.label}</Text>
          {active === t.key && <View style={tb.indicator} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}
const makeTb = (D: DTokens) => StyleSheet.create({
  bar:            { flexDirection: 'row', backgroundColor: D.surface, borderBottomWidth: 1, borderBottomColor: D.glassBorder },
  tab:            { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 13, position: 'relative' },
  tabActive:      { backgroundColor: D.cyan + theme.alpha.faint },
  tabLabel:       { fontSize: 10, fontWeight: '700', color: D.textDim, letterSpacing: 1.5 },
  tabLabelActive: { color: D.cyan },
  indicator:      { position: 'absolute', bottom: 0, left: 20, right: 20, height: 2, backgroundColor: D.cyan, borderRadius: 1 },
});

// ─── Props ────────────────────────────────────────────────────────────────────
interface PickDetailModalProps {
  pick: PickItem;
  scope: string;
  isPro: boolean;
  onClose: () => void;
  onHeatCheck?: (combo: string) => void;
  /** Slate date (YYYY-MM-DD). Only used to seed the capture-only panel rotation. */
  slateDate?: string;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PickDetailModal({ pick, scope, isPro, onClose, onHeatCheck, slateDate }: PickDetailModalProps) {
  const { D, ct, s } = useStyles();
  const { colors } = useTheme();
  const { height: screenH } = useWindowDimensions();
  const [tab, setTab]       = useState<Tab>('INTEL');
  const [savedMsg, setSavedMsg] = useState('');
  const slideAnim = useRef(new Animated.Value(screenH)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const insets    = useSafeAreaInsets();
  // DESIGN-03 S7: the screen honors OS Reduce Motion; the modal now does too.
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: reduceMotion ? 0 : 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: reduceMotion ? 0 : 280, useNativeDriver: true }),
    ]).start();
  }, []);

  const bestOrder   = pick.bestOrder ?? pick.combo ?? '000';
  const pairs       = useMemo(() => getPairs(bestOrder), [bestOrder]);

  // MKT-28b — onto the canonical heat scale. This file was the last holdout of
  // the pre-DESIGN-02 ramp, and its two ladders DISAGREED WITH EACH OTHER: the
  // label thresholds were already canonical (90/80/65/45) while the colour ramp
  // was still the old 90/75/60, so an energy of 78 read "HOT SIGNAL" in the
  // 80-band colour and 50 read "WARM" in the sub-scale cyan. PickPosterCard was
  // migrated in the T1.1 batch and this one was missed — the exact defect that
  // batch existed to remove, surviving in the highest-traffic surface.
  //
  // The label comes from the shared heatLabelDetailed seam (MKT-28a), which
  // PickPosterCard also uses. Ruling 2026-07-30: canonical 'HOT' wins — the
  // old 'HOT SIGNAL' override is retired in heat.ts, one edit for both files.
  const tier = heatTier(pick.energy, colors);
  const energyLabel = heatLabelDetailed(tier);
  const energyColor = tier.color;

  // Shared helper: query + class-id mapping + max-norm. Same code path as
  // the admin image export, so the live modal and the exported PNG render
  // identical pair %s.
  const { data: pairScores = { front: 0, back: 0, split: 0 } } = useQuery({
    queryKey: ['pair_intel', pick.combo, scope],
    queryFn: () => fetchPairScores(bestOrder, scope),
    enabled: isPro,
    staleTime: 5 * 60 * 1000,
  });

  // Where this signal has resolved before — last 30 days of adaptive_tracking,
  // matched by combo_set (any-order class). Mirrors the track-record filter:
  // matched_state present, hit_box|hit_straight, production modes only. Dedupe
  // per (date, state) so a same-day multi-mode hit counts once.
  const { data: resolutionStates = [] } = useQuery({
    queryKey: ['pick_resolution_trail', pick.comboSet],
    queryFn: async () => {
      const sinceDate = (() => {
        const d = new Date(); d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
      })();
      try {
        const rows = await fetchFromSupabase<Array<{
          slate_date: string; matched_state: string; hit_straight: boolean;
        }>>({
          path: `/rest/v1/adaptive_tracking?slate_date=gte.${sinceDate}&combo_set=eq.${encodeURIComponent(pick.comboSet)}&matched_state=not.is.null&or=(hit_box.eq.true,hit_straight.eq.true)&mode=eq.balanced&select=slate_date,matched_state,hit_straight&limit=500`,
        });
        if (!Array.isArray(rows)) return [];
        const seen = new Map<string, { state: string; exact: boolean; date: string }>();
        for (const r of rows) {
          if (!r.matched_state) continue;
          const k = `${r.slate_date}|${r.matched_state}`;
          const prev = seen.get(k);
          seen.set(k, {
            state: r.matched_state,
            exact: (prev?.exact ?? false) || !!r.hit_straight,
            date: r.slate_date,
          });
        }
        const byState = new Map<string, { state: string; count: number; exactCount: number; latest: string }>();
        for (const v of seen.values()) {
          const cur = byState.get(v.state) ?? { state: v.state, count: 0, exactCount: 0, latest: '' };
          cur.count += 1;
          if (v.exact) cur.exactCount += 1;
          if (v.date > cur.latest) cur.latest = v.date;
          byState.set(v.state, cur);
        }
        return Array.from(byState.values()).sort((a, b) =>
          b.count - a.count || b.latest.localeCompare(a.latest)
        );
      } catch { return []; }
    },
    staleTime: 5 * 60 * 1000,
  });
  const resolutionTotals = useMemo(() => {
    const total  = resolutionStates.reduce((a, s) => a + s.count, 0);
    const exact  = resolutionStates.reduce((a, s) => a + s.exactCount, 0);
    return { total, exact, states: resolutionStates.length };
  }, [resolutionStates]);

  const handleShare = async () => {
    try {
      const drawsInfo = pick.drawsSince != null && pick.drawsSince < 500
        ? `  Pressure      ${pick.drawsSince} draws since last hit`
        : null;
      const hitsInfo = pick.timesDrawn != null && pick.timesDrawn > 0
        ? `  All-time      ${pick.timesDrawn}× hits`
        : null;
      const lines = [
        `━━━━━ HITMASTER ZK6 ━━━━━`,
        `  ${bestOrder[0]} · ${bestOrder[1]} · ${bestOrder[2]}  ◀ ${energyLabel}`,
        `  Box: ${pick.comboSet}   Scope: ${scope.toUpperCase()}`,
        ``,
        // Signal 1 is "Energy" (carrier vocab: energy · momentum · pattern ·
        // consistency); the composite keeps its full "Energy Score" name so
        // the two lines can't be read as one thing.
        `  Energy Score  ${pick.energy}/100`,
        `  Energy        ${Math.round(pick.signals.BOX * 100)}%`,
        `  Momentum      ${Math.round(pick.signals.PBURST * 100)}%`,
        `  Pattern       ${Math.round(pick.signals.CO * 100)}%`,
        `  Consistency   ${Math.round((pick.signals.DGC ?? 0) * 100)}%`,
        drawsInfo,
        hitsInfo,
        ``,
        `⚡ Intelligence is your edge.`,
        // DESIGN-03 F5: the old line linked hitmaster.app — neither the
        // wordmark nor the secured domain (hitmasterzk.com), whose wiring
        // needs a per-surface tier ruling first. Hashtags stand alone.
        `#HitMasterZK6 #DataIntelligence`,
      ].filter(Boolean).join('\n');
      const r = await shareTextSafe(lines);
      if (r === 'copied') alertAsync('Copied to clipboard', 'Sharing is unavailable here — the text is on your clipboard.');
    } catch {}
  };

  const pairLabels = [
    `${bestOrder[0]}${bestOrder[1]}`,
    `${bestOrder[1]}${bestOrder[2]}`,
    `${bestOrder[0]}${bestOrder[2]}`,
  ];

  const generatedAt = useMemo(() => {
    const src = pick.generatedAt;
    const d = src ? new Date(src) : null;
    if (!d || isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  }, [pick.generatedAt]);

  const confidence = pick.energy;

  // ── INTEL tab ──────────────────────────────────────────────────────────────
  const renderIntel = () => (
    <View style={ct.pad}>
      {/* Energy percentile band — DESIGN-03 S3: this value IS pick.energy
          (percentile rank of the pick's score across the 1000-combo universe);
          the old "ZK6 CONFIDENCE" label named it as something it is not. */}
      <View style={ct.confBand}>
        <Text style={ct.confLabel}>ENERGY PERCENTILE</Text>
        <View style={ct.confTrack}>
          <View style={[ct.confFill, { width: `${confidence}%` as any }]} />
        </View>
        <Text style={[ct.confScore, { color: confidence >= 70 ? D.cyan : confidence >= 45 ? D.gold : D.textDim }]}>
          {confidence}%
        </Text>
      </View>

      {/* 4-signal strip */}
      <Text style={ct.sectionTitle}>SIGNAL BREAKDOWN</Text>
      <View style={ct.signalRow}>
        <SignalPill label="ENERGY"  value={pick.signals.BOX}      color={D.cyan}   />
        <SignalPill label="MOMO"    value={pick.signals.PBURST}   color={D.rose}   />
        <SignalPill label="PATTERN" value={pick.signals.CO}       color={D.purple} />
        <SignalPill label="CONSIST" value={pick.signals.DGC ?? 0} color={D.gold}   />
      </View>

      {/* Why this order — DESIGN-03 S2: copy is TIERED BY THE MEASURED SCORE
          (≥70 leading / 40-69 supporting / <40 quiet). The old strings
          asserted "surging" and "confirms alignment" at any score. */}
      <Text style={[ct.sectionTitle, { marginTop: 14 }]}>WHY THIS ORDER</Text>
      <View style={ct.whyCard}>
        {([
          ['📈', 'Front pair', pairs.front, pairScores.front, 'front'],
          ['⚙️', 'Back pair', pairs.back, pairScores.back, 'back'],
          ['🔗', 'Split pair', pairs.split, pairScores.split, 'split'],
        ] as const).map(([icon, role, pair, score, pos]) => (
          <WhyRow
            key={pos}
            icon={icon}
            label={`${role}  ${pair}`}
            desc={
              score >= 70 ? `${pair} leads this pick's ${pos}-position pairs in the 1-year dataset`
              : score >= 40 ? `${pair} carries supporting weight in the ${pos} position`
              : `${pair} is quiet in the ${pos} position — the order leans on the other pairs`
            }
            score={score}
          />
        ))}
      </View>

      {/* Resolution trail — where this signal has appeared in the last 30d */}
      <Text style={[ct.sectionTitle, { marginTop: 14 }]}>RESOLVED IN  ·  LAST 30 DAYS</Text>
      <View style={ct.trailCard}>
        {resolutionStates.length === 0 ? (
          <Text style={ct.trailEmpty}>
            New signal — no prior resolutions in this window.
          </Text>
        ) : (
          <>
            <View style={ct.trailPills}>
              {resolutionStates.slice(0, 6).map(rs => (
                <View
                  key={rs.state}
                  style={[
                    ct.trailPill,
                    rs.exactCount > 0 && { borderColor: D.cyan + '55', backgroundColor: D.cyan + '12' },
                  ]}
                >
                  <Text style={ct.trailState}>{rs.state}</Text>
                  <Text style={[ct.trailCount, rs.exactCount > 0 && { color: D.cyan }]}>
                    {rs.count}×{rs.exactCount > 0 ? ' ✓' : ''}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={ct.trailMeta}>
              {resolutionTotals.total} match{resolutionTotals.total === 1 ? '' : 'es'} across {resolutionTotals.states} jurisdiction{resolutionTotals.states === 1 ? '' : 's'}
              {resolutionTotals.exact > 0 ? ` · ${resolutionTotals.exact} straight` : ''}
              {resolutionStates.length > 6 ? ' · top 6 shown' : ''}
            </Text>
          </>
        )}
      </View>

      {/* MKT-11: rotating brand panel — renders ONLY during reel capture, so
          subscribers never see it. Null in the shipped app. */}
      {slateDate && <ReelPromoPanel rank={pick.rank} dateISO={slateDate} />}
    </View>
  );

  // ── PAIRS tab ──────────────────────────────────────────────────────────────
  // DESIGN-03 S1: every number on this tab is now MEASURED — the three
  // position-pair strengths from datasets_pair (classes 2/3/4, H01Y national
  // slice, max-normed within the pick). The old 4-row matrix multiplied
  // whole-pick signals by hardcoded constants and presented the results as
  // per-pair data; nothing synthetic renders here any more.
  const renderPairs = () => (
    <View style={ct.pad}>
      <Text style={ct.sectionTitle}>POSITION PAIR STRENGTH</Text>
      <Text style={ct.subtitle}>
        Measured share of this pick's strongest position pair · {scope.toUpperCase()} dataset · 1-year window
      </Text>

      <View style={ct.matrixCard}>
        <PairStrengthRow pair={pairLabels[0]} role="front"  score={pairScores.front} />
        <PairStrengthRow pair={pairLabels[1]} role="back"   score={pairScores.back}  />
        <PairStrengthRow pair={pairLabels[2]} role="split"  score={pairScores.split} />
      </View>

      {/* Legend */}
      <View style={ct.legendRow}>
        {[
          { color: D.cyan,    label: '≥ 70%  Leading'    },
          { color: D.gold,    label: '≥ 40%  Supporting' },
          { color: D.textDim, label: '< 40%  Quiet'      },
        ].map(l => (
          <View key={l.label} style={ct.legendItem}>
            <View style={[ct.legendDot, { backgroundColor: l.color }]} />
            <Text style={ct.legendText}>{l.label}</Text>
          </View>
        ))}
      </View>

      {/* Drawn count callout */}
      <View style={ct.drawnRow}>
        <Text style={ct.drawnLabel}>Times drawn (dataset)</Text>
        <Text style={[ct.drawnVal, { color: D.cyan }]}>{pick.timesDrawn ?? '—'}×</Text>
        <Text style={ct.drawnLabel}>Scope</Text>
        <Text style={[ct.drawnVal, { color: D.gold }]}>{scope.toUpperCase()}</Text>
      </View>

      <Text style={ct.pairsFootnote}>
        The best-straight order maximizes the combined strength of all three
        position pairs. Whole-pick signal channels live on the INTEL tab.
      </Text>
    </View>
  );

  // ── PLAY tab ───────────────────────────────────────────────────────────────
  const renderPlay = () => (
    <View style={ct.pad}>
      {/* Hit replay — shown when this pick has already hit */}
      {pick.hitType && pick.hitResult && (
        <HitReplay pick={{ ...pick, hitType: pick.hitType, hitResult: pick.hitResult, temperature: pick.energy }} />
      )}
      {/* Straight vs Box cards — amounts per actual player logic (2026-05-12):
          $0.25 entry; straight pays $225; box pays by multiplicity (singles
          $37.50 / doubles $75 / triples $225). Multiplicity derived from
          unique-digit count when pick.multiplicity isn't set.
          DESIGN-03 S4 (2026-08-13): vocabulary moved off the brand avoid list
          ("Bet"→"Entry", "Win"→"Pays", "SAFE PLAY"→"ANY ORDER") — the numbers
          and the utility are unchanged. */}
      {(() => {
        const uniq = new Set((pick.combo ?? '').split('')).size;
        const mult = (pick.multiplicity ?? '').toLowerCase() ||
          (uniq === 1 ? 'triples' : uniq === 2 ? 'doubles' : 'singles');
        const boxWin = mult === 'doubles' ? 75 : mult === 'triples' ? 225 : 37.5;
        const boxLabel = mult === 'doubles' ? 'DOUBLE' : mult === 'triples' ? 'TRIPLE' : 'SINGLE';
        return (
          <View style={ct.betRow}>
            <View style={[ct.betCard, { borderColor: D.cyan + '66' }]}>
              <Text style={[ct.betType, { color: D.cyan }]}>STRAIGHT</Text>
              <Text
                style={[ct.betCombo, { color: D.cyan, fontSize: 22, letterSpacing: 3 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >{bestOrder}</Text>
              <Text style={ct.betBetLine}>Entry <Text style={ct.betBetNum}>$0.25</Text></Text>
              <Text style={ct.betPayout}>Pays $225</Text>
              <Text style={ct.betNote}>Exact order only</Text>
              <View style={[ct.betBadge, { backgroundColor: D.cyan + '18', borderColor: D.cyan + '44' }]}>
                <Text style={[ct.betBadgeText, { color: D.cyan }]}>ZK6 BEST ORDER</Text>
              </View>
            </View>
            <View style={[ct.betCard, { borderColor: D.gold + '66' }]}>
              <Text style={[ct.betType, { color: D.gold }]}>BOX</Text>
              <Text
                style={[ct.betCombo, { color: D.gold, fontSize: 18, letterSpacing: 1 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >{pick.comboSet}</Text>
              <Text style={ct.betBetLine}>Entry <Text style={ct.betBetNum}>$0.25</Text></Text>
              <Text style={ct.betPayout}>Pays ${boxWin % 1 === 0 ? boxWin : boxWin.toFixed(2)}</Text>
              <Text style={ct.betNote}>Any order · {boxLabel}</Text>
              <View style={[ct.betBadge, { backgroundColor: D.gold + '18', borderColor: D.gold + '44' }]}>
                <Text style={[ct.betBadgeText, { color: D.gold }]}>ANY ORDER</Text>
              </View>
            </View>
          </View>
        );
      })()}

      {/* Action buttons */}
      <View style={ct.actionStack}>
        <TouchableOpacity
          style={[ct.actionBtn, { backgroundColor: D.gold + '18', borderColor: D.gold + '88' }]}
          onPress={async () => {
            try {
              const raw = await storage.getItem('number_book_lists');
              const lists: Array<{ id: string; name: string; picks: string[]; createdAt: string }> =
                raw ? JSON.parse(raw) : [];
              const combo = pick.combo ?? '';
              if (lists.length === 0) {
                lists.push({ id: Date.now().toString(), name: 'My Picks', picks: [combo], createdAt: new Date().toISOString() });
              } else if (!lists[0].picks.includes(combo)) {
                lists[0].picks = [...lists[0].picks, combo];
              }
              await storage.setItem('number_book_lists', JSON.stringify(lists));
              setSavedMsg('Saved to Number Book ✓');
            } catch {
              setSavedMsg('Save failed — try again');
            }
          }}
        >
          <BookMarked size={17} color={D.gold} />
          <Text style={[ct.actionBtnText, { color: D.gold }]}>Save to Number Book</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ct.actionBtn, { backgroundColor: D.purple + '18', borderColor: D.purple + '88' }]}
          onPress={() => { onClose(); onHeatCheck?.(pick.combo ?? ''); }}
        >
          <Zap size={17} color={D.purple} />
          <Text style={[ct.actionBtnText, { color: D.purple }]}>Run Signal Check</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ct.actionBtn, { backgroundColor: D.glass, borderColor: D.glassBorder }]}
          onPress={handleShare}
        >
          <Share2 size={17} color={D.textSub} />
          <Text style={[ct.actionBtnText, { color: D.textSub }]}>Share This Signal</Text>
        </TouchableOpacity>
      </View>

      {savedMsg ? <Text style={ct.savedMsg}>{savedMsg}</Text> : null}
    </View>
  );

  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
        <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }] }]}>

          {/* ── Safe area spacer + drag handle ── */}
          <View style={[s.topArea, { paddingTop: insets.top || 14 }]}>
            <View style={s.dragHandle} />
          </View>

          {/* ── Gradient accent top line ── */}
          <GradientLine />

          {/* ── Header ── */}
          <View style={s.header}>
            <TouchableOpacity
              onPress={onClose}
              style={s.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <View style={s.closeBtnInner}>
                <Text style={s.closeX}>✕</Text>
              </View>
            </TouchableOpacity>
            <View style={s.headerCenter}>
              <View style={s.rankBadge}>
                <Text style={s.rankText}>#{pick.rank ?? 1}</Text>
              </View>
              <Text style={s.headerTitle}>PICK #{pick.rank ?? 1}  ·  ZK6</Text>
            </View>
            <TouchableOpacity
              onPress={handleShare}
              style={s.closeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <View style={s.closeBtnInner}>
                <Share2 size={16} color={D.text} />
              </View>
            </TouchableOpacity>
          </View>

          {/* ── Hero ── */}
          <View style={s.hero}>
            {/* Hit stamp — continuity marker when entering from a hit surface.
                Translucent fill so the digits behind still read; pointerEvents
                disabled so taps fall through to the hero. Intentionally more
                restrained than the GridTile stamp (smaller font, lower fill)
                because the modal also surfaces HitReplay on the PLAY tab and
                we don't want to compete with it. */}
            {pick.hitType && (() => {
              const isStraight = pick.hitType === 'straight';
              const stampC = isStraight ? D.gold : D.success;
              const context = formatHitContext(pick);
              return (
                <View pointerEvents="none" style={s.hitStampWrap}>
                  <View style={[s.hitStamp, { borderColor: stampC, backgroundColor: stampC + '20', shadowColor: stampC }]}>
                    <Text
                      style={[s.hitStampText, { color: stampC, textShadowColor: stampC + 'aa' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {isStraight ? 'STRAIGHT MATCH' : 'MATCH'}
                    </Text>
                    {pick.hitResult ? (
                      <Text style={[s.hitStampSub, { color: stampC }]} numberOfLines={1}>
                        {pick.hitResult}
                      </Text>
                    ) : null}
                    {context ? (
                      <Text style={[s.hitStampContext, { color: stampC }]} numberOfLines={1}>
                        {context}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })()}

            {/* Left: energy arc */}
            <View style={s.heroLeft}>
              <EnergyArc value={pick.energy} size={80} />
              <Text style={[s.heroEnergyLabel, { color: energyColor }]}>{energyLabel}</Text>
            </View>

            {/* Center: combo display */}
            <View style={s.heroCenter}>
              <Text style={s.heroBestLabel}>⚡ BEST STRAIGHT</Text>
              <Text
                style={[s.heroDigits, { color: energyColor }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {bestOrder[0]} · {bestOrder[1]} · {bestOrder[2]}
              </Text>
              <View style={s.posRow}>
                {bestOrder.split('').map((d, i) => (
                  <View key={i} style={[s.posBox, i === 0 && { borderColor: energyColor + '88', backgroundColor: energyColor + '14' }]}>
                    <Text style={[s.posDigit, i === 0 && { color: energyColor }]}>{d}</Text>
                    <Text style={s.posLabel}>P{i + 1}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Right: box badge + meta */}
            <View style={s.heroRight}>
              <View style={s.boxBadge}>
                <Text style={s.boxBadgeLabel}>BOX SET</Text>
                <Text style={s.boxBadgeCombo}>{pick.comboSet}</Text>
              </View>
              <Text style={s.heroMeta}>{scope.toUpperCase()}</Text>
              {/* DESIGN-03 F9: the hardcoded "ZK6 v2.1" line is gone — it
                  drifted silently from the real engine version. Version info
                  is an operator concern; the hero right column thins to the
                  BOX SET badge + scope. */}
            </View>
          </View>

          {/* ── Timestamp strip ── */}
          <View style={s.tsStrip}>
            <Clock size={11} color={D.textDim} />
            <Text style={s.tsLabel}>Generated</Text>
            <Text style={s.tsValue}>{generatedAt}</Text>
          </View>

          {/* ── Tabs ── */}
          <TabBar active={tab} onPress={setTab} />

          {/* ── Content ── */}
          <ScrollView
            style={s.content}
            contentContainerStyle={{ paddingBottom: (insets.bottom || 0) + 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {tab === 'INTEL' && renderIntel()}
            {tab === 'PAIRS' && renderPairs()}
            {tab === 'PLAY'  && renderPlay()}
          </ScrollView>

        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// DESIGN-03 S5: typography floor pass — micro-labels raised off the 7-8pt
// floor (a11y ≈11pt guidance; these are also the pixels the 1080×1920 reels
// show at phone size). Digits/heroes untouched; layout bands untouched so the
// captured composition shifts by type size only.
const makeCt = (D: DTokens) => StyleSheet.create({
  pad:          { padding: 16 },
  sectionTitle: { fontSize: 10, fontWeight: '900', color: D.cyan, letterSpacing: 2, marginBottom: 8 },
  subtitle:     { fontSize: 10, color: D.textDim, marginTop: -4, marginBottom: 10, lineHeight: 14 },
  pairsFootnote:{ fontSize: 10, color: D.textDim, marginTop: 12, lineHeight: 14, textAlign: 'center' },

  // Energy percentile band
  confBand:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, backgroundColor: D.glass, borderRadius: 10, borderWidth: 1, borderColor: D.glassBorder, paddingHorizontal: 12, paddingVertical: 10 },
  confLabel:  { fontSize: 9, fontWeight: '900', color: D.textDim, letterSpacing: 1.2, width: 108 },
  confTrack:  { flex: 1, height: 4, backgroundColor: D.text + theme.alpha.faint, borderRadius: 2, overflow: 'hidden' },
  confFill:   { height: 4, borderRadius: 2, backgroundColor: D.cyan },
  confScore:  { fontSize: 13, fontWeight: '900', fontFamily: D.monoBold, width: 36, textAlign: 'right' },

  // Signal row
  signalRow:  { flexDirection: 'row', gap: 6 },

  // Why card
  whyCard:    { backgroundColor: D.glass, borderRadius: 12, borderWidth: 1, borderColor: D.glassBorder, paddingHorizontal: 12, paddingTop: 2, paddingBottom: 2 },

  // Resolution trail (state pills under WHY THIS ORDER on INTEL tab)
  trailCard:   { backgroundColor: D.glass, borderRadius: 12, borderWidth: 1, borderColor: D.glassBorder, padding: 12, gap: 8 },
  trailPills:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  trailPill:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: D.surface, borderWidth: 1, borderColor: D.glassBorder },
  trailState:  { fontSize: 11, fontWeight: '900', color: D.text, fontFamily: D.monoBold, letterSpacing: 0.5 },
  trailCount:  { fontSize: 10, fontWeight: '800', color: D.textSub, fontFamily: D.mono },
  trailMeta:   { fontSize: 10, color: D.textDim, marginTop: 2 },
  trailEmpty:  { fontSize: 11, color: D.textDim, fontStyle: 'italic', textAlign: 'center', paddingVertical: 6 },

  // Matrix card
  matrixCard: { backgroundColor: D.glass, borderRadius: 12, borderWidth: 1, borderColor: D.glassBorder, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },

  // Legend
  legendRow:  { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 10, color: D.textDim },

  // Drawn row
  drawnRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10, backgroundColor: D.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: D.glassBorder },
  drawnLabel: { fontSize: 10, color: D.textDim },
  drawnVal:   { fontSize: 14, fontWeight: '900', fontFamily: D.monoBold },

  // Bet cards
  betRow:          { flexDirection: 'row', gap: 10, marginBottom: 12 },
  betCard:         { flex: 1, backgroundColor: D.glass, borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 3, alignItems: 'center' },
  betType:         { fontSize: 10, fontWeight: '900', letterSpacing: 2.5 },
  betCombo:        { fontSize: 28, fontWeight: '900', fontFamily: D.monoBold, marginVertical: 4 },
  betBetLine:      { fontSize: 11, color: D.textDim, fontWeight: '600' },
  betBetNum:       { color: D.text, fontWeight: '800' },
  betPayout:       { fontSize: 18, fontWeight: '900', color: D.text },
  betNote:         { fontSize: 10, color: D.textDim },
  betBadge:        { marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  betBadgeText:    { fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  // Action buttons
  actionStack:     { gap: 8 },
  actionBtn:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 13, paddingVertical: 14, paddingHorizontal: 16 },
  actionBtnIcon:   { fontSize: 17 },
  actionBtnText:   { fontSize: 14, fontWeight: '800' },
  savedMsg:        { textAlign: 'center', color: D.cyan, fontSize: 12, fontWeight: '700', marginTop: 10 },
});

const makeS = (D: DTokens) => StyleSheet.create({
  // scrim stays dark in both modes (LIGHT-01)
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  sheet:    { flex: 1, backgroundColor: D.bg },

  // Safe area top + drag handle
  topArea:      { backgroundColor: D.bg, alignItems: 'center', paddingBottom: 8 },
  dragHandle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: D.borderMed },

  // Header
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: D.glassBorder },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rankBadge:    { width: 24, height: 24, borderRadius: 12, backgroundColor: D.gold + '22', borderWidth: 1, borderColor: D.gold + '55', alignItems: 'center', justifyContent: 'center' },
  rankText:     { fontSize: 10, fontWeight: '900', color: D.gold },
  headerTitle:  { fontSize: 14, fontWeight: '900', color: D.text, letterSpacing: 0.5 },
  // Close / share buttons — 44×44 touch area with visible inner circle
  closeBtn:     { padding: 4 },
  closeBtnInner:{ width: 44, height: 44, borderRadius: 22, backgroundColor: D.text + theme.alpha.soft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: D.borderMed },
  closeX:       { fontSize: 15, color: D.text, fontWeight: '800' },

  // Hero
  hero:            { position: 'relative', flexDirection: 'row', alignItems: 'center', backgroundColor: D.surface, borderBottomWidth: 1, borderBottomColor: D.glassBorder, paddingHorizontal: 16, paddingVertical: 14, gap: 10, overflow: 'hidden' },
  // Hit stamp — absolutely centered watermark over the hero. Tuned smaller +
  // less saturated than the GridTile/coffee-mode versions intentionally.
  hitStampWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  hitStamp: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 6, borderWidth: 2,
    borderColor: D.success,
    backgroundColor: D.success + '20',
    transform: [{ rotate: '-8deg' }],
    shadowColor: D.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 10,
    elevation: 6,
    alignItems: 'center',
  },
  hitStampText: {
    fontSize: 16, fontWeight: '900',
    color: D.success,
    fontFamily: D.monoBold,
    letterSpacing: 1.3,
    textShadowColor: D.success + 'aa',
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6,
  },
  hitStampSub: {
    fontSize: 10, fontWeight: '900',
    color: D.success,
    fontFamily: D.monoBold,
    letterSpacing: 0.8,
    marginTop: 1,
  },
  hitStampContext: {
    fontSize: 9, fontWeight: '800',
    color: D.success,
    fontFamily: D.monoBold,
    letterSpacing: 0.6,
    marginTop: 1,
    opacity: 0.95,
  },
  heroLeft:        { alignItems: 'center', gap: 5 },
  heroEnergyLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  heroCenter:      { flex: 1, alignItems: 'center', gap: 5 },
  heroBestLabel:   { fontSize: 9, fontWeight: '900', color: D.cyan, letterSpacing: 2 },
  heroDigits:      { fontSize: 22, fontWeight: '900', fontFamily: D.monoBold, letterSpacing: 1, lineHeight: 26 },
  posRow:          { flexDirection: 'row', gap: 5 },
  posBox:          { width: 28, height: 34, borderRadius: 7, borderWidth: 1.5, borderColor: D.glassBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: D.text + theme.alpha.faint },
  posDigit:        { fontSize: 13, fontWeight: '900', color: D.textDim, fontFamily: D.monoBold },
  posLabel:        { fontSize: 9, color: D.textDim },
  heroRight:       { alignItems: 'center', gap: 5 },
  boxBadge:        { backgroundColor: D.gold + '18', borderRadius: 9, borderWidth: 1, borderColor: D.gold + '44', paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  boxBadgeLabel:   { fontSize: 9, fontWeight: '900', color: D.gold, letterSpacing: 1.5 },
  boxBadgeCombo:   { fontSize: 17, fontWeight: '900', color: D.text, fontFamily: D.monoBold, letterSpacing: 2 },
  heroMeta:        { fontSize: 9, color: D.textDim, fontWeight: '700', letterSpacing: 1 },

  // Timestamp strip
  tsStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: D.surface, borderBottomWidth: 1, borderBottomColor: D.glassBorder },
  tsLabel: { fontSize: 10, color: D.textDim, fontWeight: '700', letterSpacing: 1 },
  tsValue: { flex: 1, fontSize: 11, color: D.textSub, fontFamily: D.mono, textAlign: 'right' },

  // Content
  content: { flex: 1 },
});
