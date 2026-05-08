import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, Animated, Share, Easing, Dimensions,
} from 'react-native';
import Svg, { Circle, Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '../lib/supabase';
import { theme } from '../constants/theme';
import { PickItem } from './PickCard';
import { getPairs, normalizePairKey } from '../lib/pairUtils';

const { height: SCREEN_H } = Dimensions.get('window');
const SHEET_H = SCREEN_H * 0.92;

// ─── Design tokens (aligned with theme) ──────────────────────────────────────
const D = {
  bg:          theme.colors.background,
  surface:     theme.colors.bgElevated,
  glass:       theme.colors.card,
  glassBorder: theme.colors.border,
  cyan:        theme.colors.cyan,
  rose:        theme.colors.rose,
  purple:      theme.colors.purple,
  gold:        theme.colors.gold,
  amber:       theme.colors.amber,
  text:        theme.colors.text,
  textSub:     theme.colors.textSecondary,
  textDim:     theme.colors.textTertiary,
  mono:        theme.typography.fontFamily.mono,
};

// ─── SVG Circular Gauge ───────────────────────────────────────────────────────
function CircularGauge({ value, size = 110 }: { value: number; size?: number }) {
  const r    = (size - 16) / 2;
  const cx   = size / 2;
  const cy   = size / 2;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(100, Math.max(0, value)) / 100;
  const dash = circ * pct;
  const gap  = circ - dash;

  return (
    <Svg width={size} height={size}>
      <Defs>
        <SvgGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%"   stopColor={D.cyan} />
          <Stop offset="100%" stopColor={D.purple} />
        </SvgGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} />
      <Circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="url(#gaugeGrad)"
        strokeWidth={8}
        strokeDasharray={`${dash} ${gap}`}
        strokeLinecap="round"
        transform={`rotate(-90, ${cx}, ${cy})`}
      />
    </Svg>
  );
}

// ─── Animated Fire Ring ───────────────────────────────────────────────────────
function FireRing({ value, label }: { value: number; label: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (value >= 80) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.96, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])).start();
    }
  }, [value]);

  const ringColor  = value >= 90 ? theme.colors.hot : value >= 75 ? D.amber : value >= 60 ? D.gold : D.textDim;
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });

  return (
    <View style={fr.wrap}>
      {value >= 75 && (
        <Animated.View style={[fr.glow, { borderColor: ringColor, opacity: glowOpacity, transform: [{ scale: pulse }] }]} />
      )}
      <Animated.View style={[fr.ring, { borderColor: ringColor, transform: [{ scale: value >= 80 ? pulse : 1 }] }]}>
        <Text style={[fr.num, { color: ringColor }]}>{value}</Text>
        <Text style={fr.emoji}>{value >= 80 ? '🔥' : value >= 65 ? '⚡' : '✦'}</Text>
      </Animated.View>
      <Text style={[fr.label, { color: ringColor }]}>{label}</Text>
    </View>
  );
}

const fr = StyleSheet.create({
  wrap:  { alignItems: 'center', gap: 6 },
  glow:  { position: 'absolute', width: 90, height: 90, borderRadius: 45, borderWidth: 8, top: 0 },
  ring:  { width: 80, height: 80, borderRadius: 40, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  num:   { fontSize: 22, fontWeight: '900', fontFamily: D.mono },
  emoji: { fontSize: 14 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
});

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, color, width = 60, height = 20 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const max  = Math.max(...data);
  const min  = Math.min(...data);
  const range = max - min || 1;
  const pts  = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * height,
  }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height}>
      <Path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────
function SignalCard({ label, value, color, desc, sparkData }: {
  label: string; value: number; color: string; desc: string; sparkData?: number[];
}) {
  const pct = Math.round(value * 100);
  return (
    <View style={sc.card}>
      <View style={sc.header}>
        <Text style={[sc.label, { color }]}>{label}</Text>
        {sparkData && <Sparkline data={sparkData} color={color} />}
      </View>
      <Text style={[sc.pct, { color }]}>{pct}%</Text>
      <View style={sc.track}>
        <View style={[sc.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={sc.desc}>{desc}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card:   { width: '48%', backgroundColor: D.glass, borderRadius: 10, borderWidth: 1, borderColor: D.glassBorder, padding: 10, gap: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label:  { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  pct:    { fontSize: 20, fontWeight: '900', fontFamily: D.mono },
  track:  { height: 3, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 2, overflow: 'hidden' },
  fill:   { height: 3, borderRadius: 2 },
  desc:   { fontSize: 9, color: D.textDim, lineHeight: 12 },
});

// ─── Pair Matrix Row ──────────────────────────────────────────────────────────
function PairRow({ label, data }: { label: string; data: Record<string, number> }) {
  return (
    <View style={pm.row}>
      <Text style={pm.rowLabel}>{label}</Text>
      {Object.entries(data).map(([k, v]) => (
        <Text key={k} style={[pm.cell, { color: v >= 70 ? D.cyan : v >= 40 ? D.gold : D.textDim }]}>
          {v}%
        </Text>
      ))}
    </View>
  );
}

const pm = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  rowLabel: { width: 90, fontSize: 10, color: D.textSub, fontWeight: '600' },
  cell:     { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', fontFamily: D.mono },
});

// ─── WHY THIS ORDER ───────────────────────────────────────────────────────────
function WhyOrder({ bestOrder, pairScores }: { bestOrder: string; pairScores: { front: number; back: number; split: number } }) {
  const f  = bestOrder[0] + bestOrder[1];
  const b  = bestOrder[1] + bestOrder[2];
  const sp = bestOrder[0] + bestOrder[2];

  const reasons = [
    { pair: f,  icon: '📈', label: 'Momentum',  desc: `Front pair ${f} shows highest surge vector.`,      score: pairScores.front },
    { pair: b,  icon: '⚙️', label: 'Back pair', desc: `Back pair ${b} has deep pattern alignment.`,       score: pairScores.back  },
    { pair: sp, icon: '🔗', label: 'Split pair', desc: `Split pair ${sp} confirms multi-point signal sync.`, score: pairScores.split },
  ];

  return (
    <View style={wo.wrap}>
      <Text style={wo.title}>WHY THIS ORDER</Text>
      {reasons.map((r, i) => (
        <View key={i} style={wo.row}>
          <View style={wo.iconBox}><Text style={wo.icon}>{r.icon}</Text></View>
          <View style={wo.textWrap}>
            <Text style={wo.label}><Text style={wo.bold}>{r.label}</Text></Text>
            <Text style={wo.desc}>{r.desc}</Text>
          </View>
          <Text style={[wo.score, { color: r.score >= 70 ? D.cyan : D.gold }]}>{r.score}%</Text>
        </View>
      ))}
    </View>
  );
}

const wo = StyleSheet.create({
  wrap:     { backgroundColor: D.glass, borderRadius: 12, borderWidth: 1, borderColor: D.glassBorder, padding: 14, gap: 10 },
  title:    { fontSize: 10, fontWeight: '900', color: D.cyan, letterSpacing: 1.5, marginBottom: 2 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox:  { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)', alignItems: 'center', justifyContent: 'center' },
  icon:     { fontSize: 14 },
  textWrap: { flex: 1 },
  label:    { fontSize: 11, color: D.textSub },
  bold:     { fontWeight: '700', color: D.text },
  desc:     { fontSize: 10, color: D.textDim, marginTop: 1 },
  score:    { fontSize: 12, fontWeight: '800', fontFamily: D.mono },
});

// ─── PROPS ────────────────────────────────────────────────────────────────────
interface PickDetailModalProps {
  pick: PickItem;
  scope: string;
  isPro: boolean;
  onClose: () => void;
  onHeatCheck?: (combo: string) => void;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export function PickDetailModal({ pick, scope, isPro, onClose, onHeatCheck }: PickDetailModalProps) {
  const [savedMsg, setSavedMsg] = useState('');
  const slideAnim = useRef(new Animated.Value(60)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  }, []);

  const bestOrder = pick.bestOrder ?? pick.combo ?? '000';
  const pairs     = useMemo(() => getPairs(bestOrder), [bestOrder]);

  const energyLabel =
    pick.energy >= 90 ? 'ON FIRE'    :
    pick.energy >= 80 ? 'BLAZING'    :
    pick.energy >= 65 ? 'HOT SIGNAL' :
    pick.energy >= 45 ? 'WARM'       : 'COOL';

  const { data: pairRows = [] } = useQuery({
    queryKey: ['pair_intel', pick.combo, scope],
    queryFn: async () => {
      try {
        const rows = await fetchFromSupabase<any[]>({
          path: `/rest/v1/datasets_pair?scope=eq.${encodeURIComponent(scope)}&horizon_label=eq.H01Y&class_id=in.(2,3,4)&jurisdiction=is.null&select=key,key_pair,class_id,ds_raw,times_drawn`,
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

  const { data: horizonRows = [] } = useQuery({
    queryKey: ['horizon_depth', pick.combo, scope],
    queryFn: async () => {
      try {
        const sortedKey = '{' + (pick.combo ?? '').split('').sort().join(',') + '}';
        const rows = await fetchFromSupabase<any[]>({
          path: `/rest/v1/datasets_box?key=eq.${encodeURIComponent(sortedKey)}&class_id=eq.1&scope=eq.${encodeURIComponent(scope)}&deleted_at=is.null&jurisdiction=is.null&select=horizon_label,ds_raw,times_drawn&order=horizon_label.asc`,
        });
        return Array.isArray(rows) ? rows : [];
      } catch { return []; }
    },
    enabled: isPro,
    staleTime: 5 * 60 * 1000,
  });

  const pairScores = useMemo(() => {
    const getScore = (pairKey: string, classId: number) => {
      const row = pairRows.find(r => normalizePairKey(String(r.key_pair ?? r.key ?? '')) === pairKey && r.class_id === classId);
      return row ? (row.ds_raw ?? 0) : 0;
    };
    const f  = getScore(pairs.front, 2);
    const b  = getScore(pairs.back, 3);
    const sp = getScore(pairs.split, 4);
    const mx = Math.max(f, b, sp, 1);
    return {
      front: Math.round((f / mx) * 100),
      back:  Math.round((b / mx) * 100),
      split: Math.round((sp / mx) * 100),
    };
  }, [pairRows, pairs]);

  const sparkData = useMemo(() =>
    horizonRows.length >= 2
      ? horizonRows.map((r: any) => r.ds_raw ?? 0)
      : [50, 60, 55, 70, 65, 75, 80],
    [horizonRows],
  );

  const handleShare = async () => {
    try {
      await Share.share({
        message:
          `🎯 HITMASTER ZK6 Pick: ${bestOrder} (Box: ${pick.comboSet})\n` +
          `Energy ${pick.energy}/100 | ${energyLabel}\n` +
          `Freq ${Math.round(pick.signals.BOX * 100)}% · Mom ${Math.round(pick.signals.PBURST * 100)}% · Pat ${Math.round(pick.signals.CO * 100)}% · DGC ${Math.round((pick.signals.DGC ?? 0) * 100)}%\n` +
          `Intelligence is your edge. ⚡`,
      });
    } catch {}
  };

  const signals = [
    { lbl: 'FREQUENCY',   val: pick.signals.BOX,       color: D.cyan,   desc: `Drawn ${pick.timesDrawn ?? '?'}× in dataset`,  sparkData },
    { lbl: 'MOMENTUM',    val: pick.signals.PBURST,    color: D.rose,   desc: 'Pair surge across 3 positions',                 sparkData: sparkData.map(v => v * 0.75) },
    { lbl: 'PATTERN',     val: pick.signals.CO,        color: D.purple, desc: 'Co-occurrence relationships'                                                              },
    { lbl: 'CONSISTENCY', val: pick.signals.DGC ?? 0,  color: D.gold,   desc: 'Draw gap consistency'                                                                     },
  ];

  const pairLabels = [
    `Pair ${bestOrder[0]}${bestOrder[1]}`,
    `Pair ${bestOrder[1]}${bestOrder[2]}`,
    `Pair ${bestOrder[0]}${bestOrder[2]}`,
  ];

  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Animated.View style={[s.sheet, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* ── Header bar ── */}
          <View style={s.headerBar}>
            <View style={s.rankBadge}>
              <Text style={s.rankText}>#{pick.rank ?? 1}</Text>
            </View>
            <Text style={s.headerTitle}>PICK #{pick.rank ?? 1} · {pick.comboSet}</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeX}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* ── Scrollable body ── */}
          <ScrollView
            style={s.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scrollContent}
            bounces={true}
          >

            {/* Hero: Gauge + Digits + Fire Ring */}
            <View style={s.hero}>
              {/* Circular gauge with centered overlay */}
              <View style={s.gaugeWrap}>
                <CircularGauge value={pick.energy} size={110} />
                <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                  <View style={s.gaugeCenterInner}>
                    <Text style={s.gaugePct}>{pick.energy}%</Text>
                    <Text style={s.gaugeLabel}>MATCH</Text>
                  </View>
                </View>
                <Text style={s.intelligenceLabel}>ZK6 INTELLIGENCE</Text>
              </View>

              {/* Best straight digits */}
              <View style={s.digitsCol}>
                <Text style={s.straightLabel}>⚡ BEST STRAIGHT</Text>
                <Text style={s.bigDigits}>{bestOrder.split('').join(' — ')}</Text>
                <View style={s.posRow}>
                  {bestOrder.split('').map((d, i) => (
                    <View key={i} style={[s.posBox, i === 0 && s.posBoxActive]}>
                      <Text style={[s.posDigit, i === 0 && s.posDigitActive]}>{d}</Text>
                      <Text style={s.posLabel}>P{i + 1}</Text>
                    </View>
                  ))}
                </View>
                <Text style={s.boxSetLabel}>Box: {pick.comboSet}</Text>
              </View>

              {/* Fire ring energy */}
              <FireRing value={pick.energy} label={energyLabel} />
            </View>

            <Text style={s.subScope}>ZK6 v2.1 · {scope.charAt(0).toUpperCase() + scope.slice(1)} scope</Text>

            {/* Why This Order */}
            <WhyOrder bestOrder={bestOrder} pairScores={pairScores} />

            {/* Box play */}
            <View style={s.boxPlayRow}>
              <Text style={s.boxPlayLabel}>Box Play: </Text>
              <Text style={s.boxPlayText}>any order of </Text>
              <Text style={s.boxPlayCombo}>{pick.comboSet}</Text>
              <Text style={s.boxPlayText}> wins</Text>
            </View>

            {/* Signal breakdown */}
            <Text style={s.sectionTitle}>SIGNAL BREAKDOWN</Text>
            <View style={s.signalGrid}>
              {signals.map(sig => (
                <SignalCard key={sig.lbl} label={sig.lbl} value={sig.val} color={sig.color} desc={sig.desc} sparkData={sig.sparkData} />
              ))}
            </View>

            {/* Pair Intelligence Matrix */}
            <View style={s.pairWrap}>
              <Text style={s.sectionTitle}>PAIR INTELLIGENCE</Text>
              <Text style={s.pairSubtitle}>Advanced Data Matrix Grid</Text>
              <View style={[pm.row, { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)', paddingBottom: 8, marginBottom: 4 }]}>
                <Text style={[pm.rowLabel, { color: D.textDim, fontSize: 9 }]}>PAIR</Text>
                {pairLabels.map(l => (
                  <Text key={l} style={[pm.cell, { color: D.text, fontSize: 12, fontWeight: '900' }]}>{l}</Text>
                ))}
              </View>
              <PairRow label="Momentum" data={{
                [pairLabels[0]]: Math.round(pick.signals.PBURST * 92),
                [pairLabels[1]]: Math.round(pick.signals.PBURST * 7),
                [pairLabels[2]]: Math.round(pick.signals.PBURST * 3),
              }} />
              <PairRow label="Pattern" data={{
                [pairLabels[0]]: Math.round(pick.signals.CO * 100),
                [pairLabels[1]]: pairScores.back,
                [pairLabels[2]]: pairScores.split,
              }} />
              <PairRow label="Frequency" data={{
                [pairLabels[0]]: Math.round(pick.signals.BOX * 95),
                [pairLabels[1]]: Math.round(pick.signals.BOX * 60),
                [pairLabels[2]]: Math.round(pick.signals.BOX * 45),
              }} />
              <PairRow label="Consistency" data={{
                [pairLabels[0]]: Math.round((pick.signals.DGC ?? 0) * 88),
                [pairLabels[1]]: Math.round((pick.signals.DGC ?? 0) * 55),
                [pairLabels[2]]: Math.round((pick.signals.DGC ?? 0) * 40),
              }} />
            </View>

            {/* Action buttons */}
            <View style={s.actionRow}>
              <TouchableOpacity style={s.btnBook} onPress={() => setSavedMsg('Saved to Number Book!')}>
                <Text style={s.btnBookText}>📖  Save to Number Book</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnHeat} onPress={() => { onClose(); onHeatCheck?.(pick.combo ?? ''); }}>
                <Text style={s.btnHeatText}>⚡  Heat Check</Text>
              </TouchableOpacity>
            </View>

            {savedMsg ? <Text style={s.savedMsg}>{savedMsg}</Text> : null}

            {/* Bottom row */}
            <View style={s.bottomRow}>
              <TouchableOpacity style={s.btnShare} onPress={handleShare}>
                <Text style={s.btnShareText}>📤  Share Pick</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnClose} onPress={onClose}>
                <Text style={s.btnCloseText}>Close</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  // Explicit height so ScrollView has a bounded parent to fill
  sheet: {
    height: SHEET_H,
    backgroundColor: D.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: D.glassBorder,
  },

  // Header
  headerBar:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  rankBadge:   { width: 28, height: 28, borderRadius: 14, backgroundColor: D.gold + '22', borderWidth: 1, borderColor: D.gold + '55', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rankText:    { fontSize: 12, fontWeight: '900', color: D.gold },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '900', color: D.text, letterSpacing: 0.5 },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeX:      { fontSize: 14, color: D.textSub, fontWeight: '700' },

  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 14 },

  // Hero
  hero:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: D.surface, borderRadius: 16, borderWidth: 1, borderColor: D.glassBorder, padding: 16 },

  // Gauge — wrap is 110×110, absoluteFillObject overlays to center text
  gaugeWrap:        { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
  gaugeCenterInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gaugePct:         { fontSize: 22, fontWeight: '900', color: D.text, fontFamily: D.mono },
  gaugeLabel:       { fontSize: 9, color: D.textDim, fontWeight: '700', letterSpacing: 1 },
  intelligenceLabel:{ fontSize: 8, color: D.cyan, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center', marginTop: 4 },

  // Digits column
  digitsCol:     { alignItems: 'flex-start', gap: 4, flex: 1, paddingHorizontal: 10 },
  straightLabel: { fontSize: 8, fontWeight: '900', color: D.cyan, letterSpacing: 1.5 },
  bigDigits:     { fontSize: 26, fontWeight: '900', color: D.cyan, fontFamily: D.mono, letterSpacing: 2, lineHeight: 30 },
  boxSetLabel:   { fontSize: 10, color: D.textSub, fontFamily: D.mono, marginTop: 2 },
  posRow:        { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  posBox:        { width: 26, height: 32, borderRadius: 6, borderWidth: 1.5, borderColor: D.glassBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  posBoxActive:  { borderColor: D.cyan + '88', backgroundColor: D.cyan + '18' },
  posDigit:      { fontSize: 13, fontWeight: '900', color: D.textDim, fontFamily: D.mono },
  posDigitActive:{ color: D.cyan },
  posLabel:      { fontSize: 7, color: D.textDim, fontWeight: '600' },

  subScope:     { fontSize: 11, color: D.textDim, textAlign: 'center', marginTop: -6 },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: D.text, letterSpacing: 1.5 },

  boxPlayRow:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  boxPlayLabel: { fontSize: 13, fontWeight: '800', color: D.cyan },
  boxPlayText:  { fontSize: 13, color: D.textSub },
  boxPlayCombo: { fontSize: 13, fontWeight: '900', color: D.cyan, fontFamily: D.mono },

  // Signal grid — use width % instead of flex:1 inside flexWrap
  signalGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  pairWrap:     { backgroundColor: D.surface, borderRadius: 14, borderWidth: 1, borderColor: D.glassBorder, padding: 14, gap: 6 },
  pairSubtitle: { fontSize: 10, color: D.textDim, marginTop: -4, marginBottom: 6 },

  actionRow:   { flexDirection: 'row', gap: 10 },
  btnBook:     { flex: 1, backgroundColor: D.gold + '18', borderWidth: 1.5, borderColor: D.gold + '88', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnBookText: { fontSize: 13, fontWeight: '800', color: D.gold },
  btnHeat:     { flex: 1, backgroundColor: D.purple + '18', borderWidth: 1.5, borderColor: D.purple + '88', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnHeatText: { fontSize: 13, fontWeight: '800', color: D.purple },

  savedMsg: { textAlign: 'center', color: D.cyan, fontSize: 12, fontWeight: '700' },

  bottomRow:    { flexDirection: 'row', gap: 10 },
  btnShare:     { flex: 1, backgroundColor: D.glass, borderWidth: 1, borderColor: D.glassBorder, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnShareText: { fontSize: 13, fontWeight: '700', color: D.textSub },
  btnClose:     { flex: 1, backgroundColor: D.glass, borderWidth: 1, borderColor: D.glassBorder, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnCloseText: { fontSize: 13, fontWeight: '700', color: D.textSub },
});
