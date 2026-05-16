import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Animated, Share, Easing, Dimensions, ScrollView,
} from 'react-native';
import { storage } from '../lib/storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '../lib/supabase';
import { theme } from '../constants/theme';
import { useTheme, type ColorTokens } from '../lib/theme';
import { PickItem } from './PickCard';
import { HitReplay } from './HitReplay';
import { getPairs, normalizePairKey } from '../lib/pairUtils';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

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
      sp: makeSp(D),
      mx: makeMx(D),
      wy: makeWy(D),
      tb: makeTb(D),
      ct: makeCt(D),
      s:  makeS(D),
    };
  }, [colors]);
}

// ─── Gradient accent line ─────────────────────────────────────────────────────
function GradientLine() {
  const { D } = useStyles();
  return (
    <Svg width={SCREEN_W} height={3} style={{ display: 'flex' }}>
      <Defs>
        <SvgGradient id="gline" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0%"   stopColor={D.purple} stopOpacity={0.7} />
          <Stop offset="40%"  stopColor={D.cyan}   stopOpacity={1}   />
          <Stop offset="70%"  stopColor={D.cyan}   stopOpacity={1}   />
          <Stop offset="100%" stopColor={D.rose}   stopOpacity={0.7} />
        </SvgGradient>
      </Defs>
      <Rect x={0} y={0} width={SCREEN_W} height={3} fill="url(#gline)" />
    </Svg>
  );
}

// ─── Animated energy arc ──────────────────────────────────────────────────────
function EnergyArc({ value, size = 80 }: { value: number; size?: number }) {
  const { D } = useStyles();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (value >= 80) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.07, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.96, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])).start();
    }
  }, [value]);

  const r     = (size - 14) / 2;
  const cx    = size / 2;
  const cy    = size / 2;
  const circ  = 2 * Math.PI * r;
  const dash  = circ * Math.min(1, Math.max(0, value) / 100);
  const gap   = circ - dash;
  const accent = value >= 90 ? D.hot : value >= 75 ? D.amber : value >= 60 ? D.gold : D.cyan;

  return (
    <Animated.View style={{ transform: [{ scale: value >= 80 ? pulse : 1 }] }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id="earc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%"   stopColor={D.cyan}   />
            <Stop offset="100%" stopColor={accent}   />
          </SvgGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={7} />
        <Circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke="url(#earc)" strokeWidth={7}
          strokeDasharray={`${dash} ${gap}`} strokeLinecap="round"
          transform={`rotate(-90, ${cx}, ${cy})`}
        />
      </Svg>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: accent, fontFamily: D.monoBold, lineHeight: 22 }}>{value}</Text>
          <Text style={{ fontSize: 7, color: D.textDim, fontWeight: '700', letterSpacing: 0.5 }}>ENERGY</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Signal pill (compact, 4-across) ─────────────────────────────────────────
function SignalPill({ label, value, color }: { label: string; value: number; color: string }) {
  const { sp } = useStyles();
  const pct = Math.round(value * 100);
  return (
    <View style={sp.card}>
      <Text style={[sp.label, { color }]}>{label}</Text>
      <Text style={[sp.val, { color }]}>{pct}<Text style={sp.suffix}>%</Text></Text>
      <View style={sp.track}>
        <View style={[sp.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}
const makeSp = (D: DTokens) => StyleSheet.create({
  card:   { flex: 1, backgroundColor: D.glass, borderRadius: 10, borderWidth: 1, borderColor: D.glassBorder, paddingVertical: 10, paddingHorizontal: 8, gap: 4, alignItems: 'center' },
  label:  { fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  val:    { fontSize: 22, fontWeight: '900', fontFamily: D.monoBold, lineHeight: 24 },
  suffix: { fontSize: 11, fontWeight: '700' },
  track:  { width: '100%', height: 3, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 2, overflow: 'hidden' },
  fill:   { height: 3, borderRadius: 2 },
});

// ─── Pair matrix header + rows ────────────────────────────────────────────────
function PairMatrixHeader({ labels }: { labels: string[] }) {
  const { D, mx } = useStyles();
  return (
    <View style={mx.headerRow}>
      <View style={{ width: 76 }}>
        <Text style={{ fontSize: 8, color: D.textDim, fontWeight: '700' }}>SIGNAL</Text>
      </View>
      {labels.map(l => (
        <View key={l} style={mx.headerCell}>
          <Text style={mx.headerPair}>{l}</Text>
          <Text style={mx.headerSub}>pair</Text>
        </View>
      ))}
    </View>
  );
}

function PairProgressRow({ icon, label, scores }: { icon: string; label: string; scores: number[] }) {
  const { D, mx } = useStyles();
  return (
    <View style={mx.dataRow}>
      <View style={mx.rowLabel}>
        <Text style={mx.rowIcon}>{icon}</Text>
        <Text style={mx.rowText}>{label}</Text>
      </View>
      {scores.map((score, i) => {
        const c = score >= 70 ? D.cyan : score >= 40 ? D.gold : D.textDim;
        return (
          <View key={i} style={mx.cell}>
            <View style={mx.track}>
              <View style={[mx.fill, { width: `${Math.min(100, score)}%` as any, backgroundColor: c }]} />
            </View>
            <Text style={[mx.scoreText, { color: c }]}>{score}%</Text>
          </View>
        );
      })}
    </View>
  );
}
const makeMx = (D: DTokens) => StyleSheet.create({
  headerRow:  { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 10, borderBottomWidth: 1.5, borderBottomColor: D.borderMed, marginBottom: 2 },
  headerCell: { flex: 1, alignItems: 'center' },
  headerPair: { fontSize: 14, fontWeight: '900', color: D.text, fontFamily: D.monoBold },
  headerSub:  { fontSize: 7, color: D.textDim, letterSpacing: 0.5 },
  dataRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  rowLabel:   { width: 76 },
  rowIcon:    { fontSize: 11 },
  rowText:    { fontSize: 8, color: D.textSub, fontWeight: '700', letterSpacing: 0.5, marginTop: 1 },
  cell:       { flex: 1, paddingHorizontal: 5, gap: 3 },
  track:      { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' },
  fill:       { height: 6, borderRadius: 3 },
  scoreText:  { fontSize: 10, fontWeight: '800', fontFamily: D.mono, textAlign: 'center' },
});

// ─── Why row ──────────────────────────────────────────────────────────────────
function WhyRow({ icon, label, desc, score }: { icon: string; label: string; desc: string; score: number }) {
  const { D, wy } = useStyles();
  const c = score >= 70 ? D.cyan : score >= 40 ? D.gold : D.textDim;
  return (
    <View style={wy.row}>
      <View style={wy.iconBox}><Text style={wy.icon}>{icon}</Text></View>
      <View style={wy.text}>
        <Text style={wy.label}>{label}</Text>
        <Text style={wy.desc}>{desc}</Text>
      </View>
      <View style={[wy.badge, { borderColor: c + '55', backgroundColor: c + '15' }]}>
        <Text style={[wy.badgeNum, { color: c }]}>{score}%</Text>
      </View>
    </View>
  );
}
const makeWy = (D: DTokens) => StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  iconBox:  { width: 32, height: 32, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  icon:     { fontSize: 16 },
  text:     { flex: 1 },
  label:    { fontSize: 11, fontWeight: '700', color: D.text, lineHeight: 14 },
  desc:     { fontSize: 9, color: D.textDim, marginTop: 2, lineHeight: 12 },
  badge:    { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  badgeNum: { fontSize: 13, fontWeight: '900', fontFamily: D.monoBold },
});

// ─── Tab bar ──────────────────────────────────────────────────────────────────
type Tab = 'INTEL' | 'PAIRS' | 'PLAY';
const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'INTEL', icon: '⚡', label: 'INTEL' },
  { key: 'PAIRS', icon: '🔗', label: 'PAIRS' },
  { key: 'PLAY',  icon: '🎯', label: 'PLAY'  },
];

function TabBar({ active, onPress }: { active: Tab; onPress: (t: Tab) => void }) {
  const { tb } = useStyles();
  return (
    <View style={tb.bar}>
      {TABS.map(t => (
        <TouchableOpacity key={t.key} style={[tb.tab, active === t.key && tb.tabActive]} onPress={() => onPress(t.key)} activeOpacity={0.7}>
          <Text style={tb.tabIcon}>{t.icon}</Text>
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
  tabActive:      { backgroundColor: 'rgba(43,255,204,0.04)' },
  tabIcon:        { fontSize: 13 },
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
}

// ─── Main component ───────────────────────────────────────────────────────────
export function PickDetailModal({ pick, scope, isPro, onClose, onHeatCheck }: PickDetailModalProps) {
  const { D, ct, s } = useStyles();
  const [tab, setTab]       = useState<Tab>('INTEL');
  const [savedMsg, setSavedMsg] = useState('');
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const insets    = useSafeAreaInsets();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 340, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  }, []);

  const bestOrder   = pick.bestOrder ?? pick.combo ?? '000';
  const pairs       = useMemo(() => getPairs(bestOrder), [bestOrder]);

  const energyLabel =
    pick.energy >= 90 ? 'ON FIRE'    :
    pick.energy >= 80 ? 'BLAZING'    :
    pick.energy >= 65 ? 'HOT SIGNAL' :
    pick.energy >= 45 ? 'WARM'       : 'COOL';

  const energyColor =
    pick.energy >= 90 ? D.hot   :
    pick.energy >= 75 ? D.amber :
    pick.energy >= 60 ? D.gold  : D.cyan;

  // Normalized lookup keys — datasets_pair stores keys sorted (sortedPair()
  // in engine), so position-pair lookups must normalize before comparing.
  // Without this, any combo with a non-ascending position-pair (e.g. "417"
  // → front="41") fails the find() and shows 0 in the "Why this order" UI
  // even when real pair data exists.
  const wantedPairKeys = useMemo(
    () => ({
      front: normalizePairKey(pairs.front),
      back:  normalizePairKey(pairs.back),
      split: normalizePairKey(pairs.split),
    }),
    [pairs],
  );

  const { data: pairRows = [] } = useQuery({
    queryKey: ['pair_intel', pick.combo, scope],
    queryFn: async () => {
      try {
        const rows = await fetchFromSupabase<any[]>({
          path: `/rest/v1/datasets_pair?scope=eq.${encodeURIComponent(scope)}&horizon_label=eq.H01Y&class_id=in.(2,3,4)&jurisdiction=is.null&select=key,key_pair,class_id,ds_raw,times_drawn`,
        });
        if (!Array.isArray(rows)) return [];
        const wantedSet = new Set([wantedPairKeys.front, wantedPairKeys.back, wantedPairKeys.split]);
        return rows.filter(r => wantedSet.has(normalizePairKey(String(r.key_pair ?? r.key ?? ''))));
      } catch { return []; }
    },
    enabled: isPro,
    staleTime: 5 * 60 * 1000,
  });

  const pairScores = useMemo(() => {
    const getScore = (pairKey: string, classId: number) => {
      const row = pairRows.find(r => normalizePairKey(String(r.key_pair ?? r.key ?? '')) === pairKey && r.class_id === classId);
      return row ? (row.times_drawn ?? 0) : 0;
    };
    const f  = getScore(wantedPairKeys.front, 2);
    const b  = getScore(wantedPairKeys.back,  3);
    const sp = getScore(wantedPairKeys.split, 4);
    const mx = Math.max(f, b, sp, 1);
    return {
      front: Math.round((f / mx) * 100),
      back:  Math.round((b / mx) * 100),
      split: Math.round((sp / mx) * 100),
    };
  }, [pairRows, wantedPairKeys]);

  const handleShare = async () => {
    try {
      const drawsInfo = pick.drawsSince != null && pick.drawsSince < 500
        ? `  Pressure  ${pick.drawsSince} draws since last hit`
        : null;
      const hitsInfo = pick.timesDrawn != null && pick.timesDrawn > 0
        ? `  All-time  ${pick.timesDrawn}× hits`
        : null;
      const lines = [
        `━━━━━ HITMASTER ZK6 ━━━━━`,
        `  ${bestOrder[0]} · ${bestOrder[1]} · ${bestOrder[2]}  ◀ ${energyLabel}`,
        `  Box: ${pick.comboSet}   Scope: ${scope.toUpperCase()}`,
        ``,
        `  Energy    ${pick.energy}/100`,
        `  Freq      ${Math.round(pick.signals.BOX * 100)}%`,
        `  Momentum  ${Math.round(pick.signals.PBURST * 100)}%`,
        `  Pattern   ${Math.round(pick.signals.CO * 100)}%`,
        `  Consist.  ${Math.round((pick.signals.DGC ?? 0) * 100)}%`,
        drawsInfo,
        hitsInfo,
        ``,
        `⚡ Intelligence is your edge.`,
        `📲 hitmaster.app  #ZK6 #Pick3`,
      ].filter(Boolean).join('\n');
      await Share.share({ message: lines });
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
      {/* Confidence band */}
      <View style={ct.confBand}>
        <Text style={ct.confLabel}>ZK6 CONFIDENCE</Text>
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
        <SignalPill label="FREQ"    value={pick.signals.BOX}      color={D.cyan}   />
        <SignalPill label="MOMO"    value={pick.signals.PBURST}   color={D.rose}   />
        <SignalPill label="PATTERN" value={pick.signals.CO}       color={D.purple} />
        <SignalPill label="CONSIST" value={pick.signals.DGC ?? 0} color={D.gold}   />
      </View>

      {/* Why this order */}
      <Text style={[ct.sectionTitle, { marginTop: 14 }]}>WHY THIS ORDER</Text>
      <View style={ct.whyCard}>
        <WhyRow
          icon="📈" label={`Front pair  ${pairs.front}`}
          desc={`${pairs.front} surging — highest recent frequency in front position`}
          score={pairScores.front}
        />
        <WhyRow
          icon="⚙️" label={`Back pair  ${pairs.back}`}
          desc={`${pairs.back} has strong digit co-occurrence in back position`}
          score={pairScores.back}
        />
        <WhyRow
          icon="🔗" label={`Split pair  ${pairs.split}`}
          desc={`${pairs.split} confirms alignment across all 3 signal channels`}
          score={pairScores.split}
        />
      </View>
    </View>
  );

  // ── PAIRS tab ──────────────────────────────────────────────────────────────
  const renderPairs = () => (
    <View style={ct.pad}>
      <Text style={ct.sectionTitle}>PAIR INTELLIGENCE MATRIX</Text>
      <Text style={ct.subtitle}>Signal strength per digit pair · cyan ≥ 70% · gold ≥ 40%</Text>

      <View style={ct.matrixCard}>
        <PairMatrixHeader labels={pairLabels} />
        <PairProgressRow
          icon="⚡" label="MOMENTUM"
          scores={[Math.round(pick.signals.PBURST * 92), Math.round(pick.signals.PBURST * 70), Math.round(pick.signals.PBURST * 30)]}
        />
        <PairProgressRow
          icon="🔄" label="PATTERN"
          scores={[Math.round(pick.signals.CO * 100), pairScores.back, pairScores.split]}
        />
        <PairProgressRow
          icon="📊" label="FREQUENCY"
          scores={[Math.round(pick.signals.BOX * 95), Math.round(pick.signals.BOX * 60), Math.round(pick.signals.BOX * 45)]}
        />
        <PairProgressRow
          icon="📐" label="CONSIST."
          scores={[Math.round((pick.signals.DGC ?? 0) * 88), Math.round((pick.signals.DGC ?? 0) * 55), Math.round((pick.signals.DGC ?? 0) * 40)]}
        />
      </View>

      {/* Legend */}
      <View style={ct.legendRow}>
        {[
          { color: D.cyan,    label: '≥ 70%  Strong'   },
          { color: D.gold,    label: '≥ 40%  Moderate' },
          { color: D.textDim, label: '< 40%  Weak'     },
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
    </View>
  );

  // ── PLAY tab ───────────────────────────────────────────────────────────────
  const renderPlay = () => (
    <View style={ct.pad}>
      {/* Hit replay — shown when this pick has already hit */}
      {pick.hitType && pick.hitResult && (
        <HitReplay pick={{ ...pick, temperature: pick.energy }} />
      )}
      {/* Straight vs Box bet cards — payouts per actual player logic (2026-05-12):
          $0.25 stake; straight wins $225; box wins by multiplicity (singles
          $37.50 / doubles $75 / triples $225). Multiplicity derived from
          unique-digit count when pick.multiplicity isn't set. */}
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
              <Text style={ct.betBetLine}>Bet <Text style={ct.betBetNum}>$0.25</Text></Text>
              <Text style={ct.betPayout}>Win $225</Text>
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
              <Text style={ct.betBetLine}>Bet <Text style={ct.betBetNum}>$0.25</Text></Text>
              <Text style={ct.betPayout}>Win ${boxWin % 1 === 0 ? boxWin : boxWin.toFixed(2)}</Text>
              <Text style={ct.betNote}>Any order · {boxLabel}</Text>
              <View style={[ct.betBadge, { backgroundColor: D.gold + '18', borderColor: D.gold + '44' }]}>
                <Text style={[ct.betBadgeText, { color: D.gold }]}>SAFE PLAY</Text>
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
          <Text style={ct.actionBtnIcon}>📖</Text>
          <Text style={[ct.actionBtnText, { color: D.gold }]}>Save to Number Book</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ct.actionBtn, { backgroundColor: D.purple + '18', borderColor: D.purple + '88' }]}
          onPress={() => { onClose(); onHeatCheck?.(pick.combo ?? ''); }}
        >
          <Text style={ct.actionBtnIcon}>⚡</Text>
          <Text style={[ct.actionBtnText, { color: D.purple }]}>Run Heat Check</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[ct.actionBtn, { backgroundColor: D.glass, borderColor: D.glassBorder }]}
          onPress={handleShare}
        >
          <Text style={ct.actionBtnIcon}>📤</Text>
          <Text style={[ct.actionBtnText, { color: D.textSub }]}>Share This Pick</Text>
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
                <Text style={{ fontSize: 16 }}>📤</Text>
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
            {pick.hitType && (
              <View pointerEvents="none" style={s.hitStampWrap}>
                <View style={s.hitStamp}>
                  <Text style={s.hitStampText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                    {pick.hitType === 'straight' ? 'STRAIGHT HIT' : 'BOX HIT'}
                  </Text>
                  {pick.hitResult ? (
                    <Text style={s.hitStampSub} numberOfLines={1}>
                      {pick.hitResult}
                      {pick.hitState ? ` · ${pick.hitState}` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
            )}

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
              <Text style={s.heroVersion}>ZK6 v2.1</Text>
            </View>
          </View>

          {/* ── Timestamp strip ── */}
          <View style={s.tsStrip}>
            <Text style={s.tsClock}>🕐</Text>
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
const makeCt = (D: DTokens) => StyleSheet.create({
  pad:          { padding: 16 },
  sectionTitle: { fontSize: 9, fontWeight: '900', color: D.cyan, letterSpacing: 2, marginBottom: 8 },
  subtitle:     { fontSize: 9, color: D.textDim, marginTop: -4, marginBottom: 10 },

  // Confidence band
  confBand:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, backgroundColor: D.glass, borderRadius: 10, borderWidth: 1, borderColor: D.glassBorder, paddingHorizontal: 12, paddingVertical: 10 },
  confLabel:  { fontSize: 8, fontWeight: '900', color: D.textDim, letterSpacing: 1.5, width: 92 },
  confTrack:  { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 2, overflow: 'hidden' },
  confFill:   { height: 4, borderRadius: 2, backgroundColor: D.cyan },
  confScore:  { fontSize: 13, fontWeight: '900', fontFamily: 'JetBrainsMono_700Bold', width: 36, textAlign: 'right' },

  // Signal row
  signalRow:  { flexDirection: 'row', gap: 6 },

  // Why card
  whyCard:    { backgroundColor: D.glass, borderRadius: 12, borderWidth: 1, borderColor: D.glassBorder, paddingHorizontal: 12, paddingTop: 2, paddingBottom: 2 },

  // Matrix card
  matrixCard: { backgroundColor: D.glass, borderRadius: 12, borderWidth: 1, borderColor: D.glassBorder, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },

  // Legend
  legendRow:  { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 9, color: D.textDim },

  // Drawn row
  drawnRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10, backgroundColor: D.surface, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: D.glassBorder },
  drawnLabel: { fontSize: 9, color: D.textDim },
  drawnVal:   { fontSize: 14, fontWeight: '900', fontFamily: 'JetBrainsMono_700Bold' },

  // Bet cards
  betRow:          { flexDirection: 'row', gap: 10, marginBottom: 12 },
  betCard:         { flex: 1, backgroundColor: D.glass, borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 3, alignItems: 'center' },
  betType:         { fontSize: 9, fontWeight: '900', letterSpacing: 2.5 },
  betCombo:        { fontSize: 28, fontWeight: '900', fontFamily: 'JetBrainsMono_700Bold', marginVertical: 4 },
  betBetLine:      { fontSize: 10, color: D.textDim, fontWeight: '600' },
  betBetNum:       { color: D.text, fontWeight: '800' },
  betPayout:       { fontSize: 18, fontWeight: '900', color: D.text },
  betNote:         { fontSize: 9, color: D.textDim },
  betBadge:        { marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  betBadgeText:    { fontSize: 8, fontWeight: '900', letterSpacing: 1 },

  // Action buttons
  actionStack:     { gap: 8 },
  actionBtn:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 13, paddingVertical: 14, paddingHorizontal: 16 },
  actionBtnIcon:   { fontSize: 17 },
  actionBtnText:   { fontSize: 14, fontWeight: '800' },
  savedMsg:        { textAlign: 'center', color: D.cyan, fontSize: 12, fontWeight: '700', marginTop: 10 },
});

const makeS = (D: DTokens) => StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  sheet:    { flex: 1, backgroundColor: D.bg },

  // Safe area top + drag handle
  topArea:      { backgroundColor: D.bg, alignItems: 'center', paddingBottom: 8 },
  dragHandle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Header
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rankBadge:    { width: 24, height: 24, borderRadius: 12, backgroundColor: D.gold + '22', borderWidth: 1, borderColor: D.gold + '55', alignItems: 'center', justifyContent: 'center' },
  rankText:     { fontSize: 10, fontWeight: '900', color: D.gold },
  headerTitle:  { fontSize: 14, fontWeight: '900', color: D.text, letterSpacing: 0.5 },
  // Close / share buttons — 44×44 touch area with visible inner circle
  closeBtn:     { padding: 4 },
  closeBtnInner:{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
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
  heroLeft:        { alignItems: 'center', gap: 5 },
  heroEnergyLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  heroCenter:      { flex: 1, alignItems: 'center', gap: 5 },
  heroBestLabel:   { fontSize: 8, fontWeight: '900', color: D.cyan, letterSpacing: 2 },
  heroDigits:      { fontSize: 22, fontWeight: '900', fontFamily: 'JetBrainsMono_700Bold', letterSpacing: 1, lineHeight: 26 },
  posRow:          { flexDirection: 'row', gap: 5 },
  posBox:          { width: 28, height: 34, borderRadius: 7, borderWidth: 1.5, borderColor: D.glassBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  posDigit:        { fontSize: 13, fontWeight: '900', color: D.textDim, fontFamily: D.monoBold },
  posLabel:        { fontSize: 7, color: D.textDim },
  heroRight:       { alignItems: 'center', gap: 5 },
  boxBadge:        { backgroundColor: D.gold + '18', borderRadius: 9, borderWidth: 1, borderColor: D.gold + '44', paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center' },
  boxBadgeLabel:   { fontSize: 7, fontWeight: '900', color: D.gold, letterSpacing: 1.5 },
  boxBadgeCombo:   { fontSize: 17, fontWeight: '900', color: D.text, fontFamily: D.monoBold, letterSpacing: 2 },
  heroMeta:        { fontSize: 8, color: D.textDim, fontWeight: '700', letterSpacing: 1 },
  heroVersion:     { fontSize: 8, color: D.cyan + 'AA', fontWeight: '600' },

  // Timestamp strip
  tsStrip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: D.surface, borderBottomWidth: 1, borderBottomColor: D.glassBorder },
  tsClock: { fontSize: 11 },
  tsLabel: { fontSize: 9, color: D.textDim, fontWeight: '700', letterSpacing: 1 },
  tsValue: { flex: 1, fontSize: 10, color: D.textSub, fontFamily: D.mono, textAlign: 'right' },

  // Content
  content: { flex: 1 },
});
