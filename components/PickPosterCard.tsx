/* ============================================================================
   PickPosterCard
   ----------------------------------------------------------------------------
   Static, capture-ready single-pick poster used by the admin image-export
   pipeline. Composes the same EnergyArc / SignalPill / WhyRow primitives the
   live modal uses (via ./pickVisuals), so future styling changes propagate
   automatically — INVARIANT 4.

   This component is presentational only:
     - No data fetching (callers pass pairScores via prop, default 0/0/0)
     - No animations (EnergyArc gets animate=false for deterministic capture)
     - No interaction handlers

   LIGHT-01: posters are brand share artifacts — MODE-LOCKED to the dark
   palette by operator decision. A light phone theme must not produce light
   posters, so D is built from darkColors, never from useTheme().
   ============================================================================ */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Lock } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { darkColors, heatTier, heatLabelDetailed } from '@/lib/theme';
import { PickItem } from './PickCard';
import { EnergyArc, SignalPill, WhyRow, RedactedGlyph, RedactedDigitRow, makeD, type DTokens } from './pickVisuals';
import { getPairs } from '../lib/pairUtils';

const REDACT_LOCK_GOLD = '#FFD700';

interface PickPosterCardProps {
  pick: PickItem;
  scope: string;
  /** Optional pair scores 0-100 to display in WHY THIS ORDER (defaults to zeros). */
  pairScores?: { front: number; back: number; split: number };
  /** When true, replace digits + box set with block characters. */
  redact?: boolean;
  /** Target height for the poster (used so banner + poster sum to 1920). */
  height?: number;
}

export function PickPosterCard({ pick, scope, pairScores, redact = false, height }: PickPosterCardProps) {
  // LIGHT-01 mode lock: dark palette regardless of the phone's theme.
  const D = useMemo(() => makeD(darkColors), []);
  const s = useMemo(() => makeS(D), [D]);

  const bestOrder = pick.bestOrder ?? pick.combo ?? '000';
  const pairs     = useMemo(() => getPairs(bestOrder), [bestOrder]);

  // DESIGN-02 T1.1: canonical heat scale (90/80/65/45) replaces the former
  // inline 90/75/60 color ramp. Label via the shared heatLabelDetailed seam —
  // canonical on every rung since the MKT-28 ruling (2026-07-30).
  const tier = heatTier(pick.energy, darkColors);
  const energyLabel = heatLabelDetailed(tier);
  const energyColor = tier.color;

  const confidence = pick.energy;
  const ps = pairScores ?? { front: 0, back: 0, split: 0 };

  const visibleDigits  = `${bestOrder[0]} · ${bestOrder[1]} · ${bestOrder[2]}`;
  const renderComboSet = redact ? '{ ? , ? , ? }' : pick.comboSet;

  return (
    <View style={[s.root, height ? { height } : null, redact && s.rootRedacted]}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <View style={s.hero}>
        <View style={s.heroLeft}>
          <EnergyArc value={pick.energy} size={72} animate={false} palette={darkColors} />
          <Text style={[s.heroEnergyLabel, { color: energyColor }]}>{energyLabel}</Text>
        </View>

        <View style={s.heroCenter}>
          <Text style={s.heroBestLabel}>⚡ BEST EXACT</Text>
          {redact ? (
            <View style={s.heroDigitsRedactedRow}>
              <RedactedDigitRow count={3} size={26} color={energyColor} gap={8} />
            </View>
          ) : (
            <Text
              style={[s.heroDigits, { color: energyColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}
            >
              {visibleDigits}
            </Text>
          )}
          <View style={s.posRow}>
            {bestOrder.split('').map((d, i) => (
              <View key={i} style={[s.posBox, i === 0 && { borderColor: energyColor + '88', backgroundColor: energyColor + '14' }]}>
                {redact ? (
                  <View style={s.posDigitRedacted}>
                    <RedactedGlyph size={18} color={i === 0 ? energyColor : D.text} seed={i + 5} />
                  </View>
                ) : (
                  <Text style={[s.posDigit, i === 0 && { color: energyColor }]}>{d}</Text>
                )}
                <Text style={s.posLabel}>P{i + 1}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.heroRight}>
          <View style={s.boxBadge}>
            <Text style={s.boxBadgeLabel}>BOX SET</Text>
            <Text style={s.boxBadgeCombo}>{renderComboSet}</Text>
          </View>
          <Text style={s.heroMeta}>{scope.toUpperCase()}</Text>
          <Text style={s.heroVersion}>ZK6 v2.1</Text>
        </View>
      </View>

      {/* ── Rank chip ────────────────────────────────────────────────────── */}
      <View style={s.rankRow}>
        <View style={[s.rankChip, { borderColor: energyColor + '66', backgroundColor: energyColor + '14' }]}>
          <Text style={[s.rankNum, { color: energyColor }]}>SIGNAL #{pick.rank}</Text>
        </View>
        {pick.multiplicity && (
          <View style={s.multChip}>
            <Text style={[s.multTxt, { color: energyColor }]}>
              {pick.multiplicity === 'doubles' ? 'DOUBLE' : 'SINGLE'}
            </Text>
          </View>
        )}
      </View>

      {/* ── Confidence band ─────────────────────────────────────────────── */}
      <View style={s.confBand}>
        <Text style={s.confLabel}>ZK6 CONFIDENCE</Text>
        <View style={s.confTrack}>
          <View style={[s.confFill, { width: `${confidence}%` as any }]} />
        </View>
        <Text style={[s.confScore, { color: confidence >= 70 ? D.cyan : confidence >= 45 ? D.gold : D.textDim }]}>
          {confidence}%
        </Text>
      </View>

      {/* ── Signal breakdown ────────────────────────────────────────────── */}
      <Text style={s.sectionTitle}>SIGNAL BREAKDOWN</Text>
      <View style={s.signalRow}>
        <SignalPill label="FREQ"    value={pick.signals.BOX}      color={D.cyan}   palette={darkColors} />
        <SignalPill label="MOMO"    value={pick.signals.PBURST}   color={D.rose}   palette={darkColors} />
        <SignalPill label="PATTERN" value={pick.signals.CO}       color={D.purple} palette={darkColors} />
        <SignalPill label="CONSIST" value={pick.signals.DGC ?? 0} color={D.gold}   palette={darkColors} />
      </View>

      {/* ── Why this order ──────────────────────────────────────────────── */}
      <Text style={[s.sectionTitle, { marginTop: 18 }]}>WHY THIS ORDER</Text>
      <View style={s.whyCard}>
        <WhyRow
          icon="📈" label={`Front pair  ${redact ? '??' :pairs.front}`}
          desc={redact ? 'Pair signal hidden — full content for subscribers' : `${pairs.front} surging — highest recent frequency in front position`}
          score={ps.front}
          palette={darkColors}
        />
        <WhyRow
          icon="⚙️" label={`Back pair  ${redact ? '??' :pairs.back}`}
          desc={redact ? 'Pair signal hidden — full content for subscribers' : `${pairs.back} has strong digit co-occurrence in back position`}
          score={ps.back}
          palette={darkColors}
        />
        <WhyRow
          icon="🔗" label={`Split pair  ${redact ? '??' :pairs.split}`}
          desc={redact ? 'Pair signal hidden — full content for subscribers' : `${pairs.split} confirms alignment across all 3 signal channels`}
          score={ps.split}
          palette={darkColors}
        />
      </View>

      {/* Premium-gated marker — gold lock icon top-right of the poster. */}
      {redact && (
        <View pointerEvents="none" style={s.lockBadge}>
          <Lock size={16} color={REDACT_LOCK_GOLD} strokeWidth={2.5} />
        </View>
      )}

      {/* ── Footer brand ─────────────────────────────────────────────────── */}
      <View style={s.footer}>
        <Text style={s.brandWordmark}>HITMASTER <Text style={{ color: D.cyan }}>ZK6</Text></Text>
        <Text style={s.brandTag}>Intelligence is your edge. Use it.</Text>
      </View>
    </View>
  );
}

// All sizes below are MOBILE-NATIVE logical pixels. The poster is rendered
// inside a ~390px-wide stage and scaled up ~2.77× by the capture pipeline,
// so e.g. fontSize: 22 here lands at ~61px in the 1080-wide output PNG. Match
// these to PickDetailModal's sizes for visual parity with the live app.
const makeS = (D: DTokens) => StyleSheet.create({
  root: {
    width: '100%',
    backgroundColor: D.bg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  rootRedacted: {
    borderWidth: 1,
    borderColor: D.cyan,
    shadowColor: D.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
  },

  // Hero — matches PickDetailModal hero sizing
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: D.surface,
    borderRadius: 14, borderWidth: 1, borderColor: D.glassBorder,
    paddingHorizontal: 14, paddingVertical: 12,
    overflow: 'hidden',
  },
  heroLeft: { alignItems: 'center', gap: 4 },
  heroEnergyLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  heroCenter: { flex: 1, alignItems: 'center', gap: 4 },
  heroBestLabel: { fontSize: 8, fontWeight: '900', color: D.cyan, letterSpacing: 2 },
  heroDigits: {
    fontSize: 22, fontWeight: '900',
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 1, lineHeight: 26,
  },
  heroDigitsRedactedRow: {
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  posBox: {
    width: 30, height: 36,
    borderRadius: 7,
    borderWidth: 1, borderColor: D.glassBorder,
    backgroundColor: D.text + theme.alpha.faint,
    alignItems: 'center', justifyContent: 'center',
  },
  posDigit: { fontSize: 15, fontWeight: '900', color: D.text, fontFamily: theme.typography.fontFamily.monoBold, lineHeight: 17 },
  posDigitRedacted: { width: 14, height: 18, alignItems: 'center', justifyContent: 'center' },
  posLabel: { fontSize: 6, color: D.textDim, fontWeight: '700', letterSpacing: 0.5, marginTop: 1 },

  heroRight: { alignItems: 'flex-end', gap: 3 },
  boxBadge: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: D.glassBorder, backgroundColor: D.text + theme.alpha.faint, alignItems: 'center' },
  boxBadgeLabel: { fontSize: 6, fontWeight: '900', color: D.textDim, letterSpacing: 1 },
  boxBadgeCombo: { fontSize: 10, fontWeight: '900', color: D.text, fontFamily: theme.typography.fontFamily.mono, marginTop: 1 },
  heroMeta: { fontSize: 7, color: D.textSub, fontWeight: '800', letterSpacing: 1.2, marginTop: 1 },
  heroVersion: { fontSize: 6, color: D.textDim, fontWeight: '700', letterSpacing: 0.8 },

  // Rank + multiplicity
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  rankNum: { fontSize: 9, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1.2 },
  multChip: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: D.glassBorder, backgroundColor: D.text + theme.alpha.faint },
  multTxt: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2, fontFamily: theme.typography.fontFamily.monoBold },

  // Confidence
  confBand: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: D.surface,
    borderRadius: 9, borderWidth: 1, borderColor: D.glassBorder,
    paddingHorizontal: 10, paddingVertical: 9,
  },
  confLabel: { fontSize: 7, fontWeight: '900', color: D.textDim, letterSpacing: 1.2 },
  confTrack: { flex: 1, height: 6, backgroundColor: D.text + theme.alpha.faint, borderRadius: 3, overflow: 'hidden' },
  confFill:  { height: 6, borderRadius: 3, backgroundColor: D.cyan },
  confScore: { fontSize: 12, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },

  sectionTitle: { fontSize: 8, fontWeight: '900', color: D.cyan, letterSpacing: 1.6, marginBottom: 4 },
  signalRow: { flexDirection: 'row', gap: 5 },

  whyCard: {
    backgroundColor: D.surface,
    borderRadius: 9, borderWidth: 1, borderColor: D.glassBorder,
    paddingHorizontal: 10, paddingVertical: 2,
  },

  lockBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(10,21,37,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 6,
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    gap: 4,
    paddingTop: 8,
  },
  brandWordmark: {
    fontSize: 12, fontWeight: '900', color: D.text,
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 2.2,
  },
  brandTag: {
    fontSize: 8, fontWeight: '600', color: D.textDim,
    letterSpacing: 1,
  },
});
