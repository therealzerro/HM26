/* ============================================================================
   SlatePosterCard
   ----------------------------------------------------------------------------
   Pure presentational tile used in two places:
     1. The Slates screen grid view (was inline GridTile in explore.tsx)
     2. The admin image-export pipeline (with redact=true)

   INVARIANT: rendering with no `redact` prop (or redact=false) must produce
   pixel-identical output to the prior inline GridTile. The only conditional
   behavior added is the redacted-digits substitution when redact=true.
   ============================================================================ */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Lock } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useTheme, heatColor, heatLabel, type ColorTokens } from '@/lib/theme';
import { PickItem } from './PickCard';
import { RedactedDigitRow } from './pickVisuals';
import { formatHitContext } from '@/lib/hitToPickItem';

const REDACT_LOCK_GOLD = '#FFD700';

// DESIGN-02 T1.1: former local 80/60/40 ramp (HOT/WARM/MILD/COLD) replaced by
// the canonical scale so the poster matches the list/grid at the same energy.
function tempColorForEnergy(e: number, colors: ColorTokens): string {
  return heatColor(e, colors);
}

function tempLabel(e: number): string {
  return heatLabel(e);
}

interface SlatePosterCardProps {
  pick: PickItem;
  onPress?: () => void;
  /** When true, replace pick digits + comboSet with block characters for redacted export. */
  redact?: boolean;
}

export function SlatePosterCard({ pick, onPress, redact = false }: SlatePosterCardProps) {
  const { colors } = useTheme();
  const gt = useMemo(() => makeGt(colors), [colors]);
  const tc       = tempColorForEnergy(pick.energy, colors);
  const tLabel   = tempLabel(pick.energy);
  const isLocked = pick.locked;
  const isHit    = !!pick.hitType;
  const isStraightHit = pick.hitType === 'straight';
  const hitLabel = isStraightHit ? 'STRAIGHT MATCH' : 'MATCH';
  // Straight matches get a gold stamp (rarer, more newsworthy); box matches stay green.
  const stampColor = isStraightHit ? colors.gold : colors.success;
  const rawDigits = isLocked ? '•••' : (pick.bestOrder ?? pick.combo);
  const digits   = rawDigits;
  const comboSetText = redact
    ? '{ ? , ? , ? }'
    : (isLocked ? '{•,•,•}' : pick.comboSet);

  const channels = [
    { k: 'B', v: pick.signals.BOX,      c: colors.cyan   },
    { k: 'P', v: pick.signals.PBURST,   c: colors.rose   },
    { k: 'C', v: pick.signals.CO,       c: colors.purple },
    { k: 'D', v: pick.signals.DGC ?? 0, c: colors.gold   },
  ];

  // Redaction overrides hit/normal border styling. When redacted, the card
  // edge picks up a cyan "premium gated" glow so the viewer reads it as
  // intentionally hidden rather than broken.
  const borderC = redact ? colors.cyan : (isHit ? stampColor : tc + '66');
  const shadowC = redact ? colors.cyan : (isHit ? stampColor : tc);

  return (
    <TouchableOpacity
      style={[gt.card, { borderColor: borderC, shadowColor: shadowC }, isHit && gt.cardHit]}
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      disabled={!onPress}
    >
      {/* Top: rank chip + temp badge */}
      <View style={gt.topRow}>
        <View style={[gt.rankChip, { borderColor: tc + '66', backgroundColor: tc + '14' }]}>
          <Text style={[gt.rankNum, { color: tc }]}>#{pick.rank}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={[gt.tempBadge, { borderColor: tc, shadowColor: tc }]}>
          <Text style={[gt.tempLabel, { color: tc }]}>{tLabel}</Text>
          <Text style={[gt.tempNum,   { color: tc }]}>{pick.energy}°</Text>
        </View>
      </View>

      {/* Combo digits — sized to fit. When redacted, three mosaic glyphs
          replace the digit Text so the card's color hero is preserved. */}
      {redact ? (
        <View style={gt.digitMosaicRow}>
          <RedactedDigitRow count={3} size={32} color={tc} gap={10} />
        </View>
      ) : (
        <Text
          style={[gt.digits, { color: tc, textShadowColor: tc + 'aa' }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {digits.split('').join(' ')}
        </Text>
      )}

      {/* comboSet · multiplicity */}
      <View style={gt.metaRow}>
        <Text style={gt.comboSet} numberOfLines={1}>
          {comboSetText}
        </Text>
        {pick.multiplicity && !isLocked && (
          <Text style={[gt.mult, { color: tc }]}>
            {pick.multiplicity === 'doubles' ? 'DBL' : 'SGL'}
          </Text>
        )}
      </View>

      {/* Signal grid — 4 mini-bars w/ label + value */}
      {!isLocked && (
        <View style={gt.signalGrid}>
          {channels.map(ch => {
            const pct = Math.max(0, Math.min(1, ch.v));
            return (
              <View key={ch.k} style={gt.signalCell}>
                <View style={gt.signalHead}>
                  <Text style={[gt.signalKey, { color: ch.c }]}>{ch.k}</Text>
                  <Text style={[gt.signalVal, { color: ch.c }]}>{Math.round(pct * 100)}</Text>
                </View>
                <View style={gt.barTrack}>
                  <View style={[gt.barFill, { width: (pct * 100) + '%' as any, backgroundColor: ch.c, shadowColor: ch.c }]} />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {isLocked && (
        <View style={gt.lockedRow}>
          <Text style={gt.lockedText}>🔒 Pro</Text>
        </View>
      )}

      {/* Premium-gated marker — gold lock icon in the top-right corner.
          Rendered last so it lays on top of every other element. */}
      {redact && (
        <View pointerEvents="none" style={gt.lockBadge}>
          <Lock size={16} color={REDACT_LOCK_GOLD} strokeWidth={2.5} />
        </View>
      )}

      {/* Match stamp — overlay on matched pick cards.
          Gold for straight matches, green for box matches.
          The hitResult subtitle (actual draw digits) is suppressed when
          redact=true — otherwise it would defeat the digit-tile redaction.
          The context line ("6/3 NC Midday") gives the viewer where/when the
          match landed — date · jurisdiction · session. */}
      {isHit && !isLocked && (() => {
        const context = redact ? '' : formatHitContext(pick);
        return (
          <View pointerEvents="none" style={gt.hitStampWrap}>
            <View style={[gt.hitStamp, { borderColor: stampColor, backgroundColor: stampColor + '22', shadowColor: stampColor }]}>
              <Text
                style={[gt.hitStampText, { color: stampColor, textShadowColor: stampColor + 'aa' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.5}
              >
                {hitLabel}
              </Text>
              {!redact && pick.hitResult ? (
                <Text style={[gt.hitStampSub, { color: stampColor }]} numberOfLines={1}>
                  {pick.hitResult}
                </Text>
              ) : null}
              {context ? (
                <Text style={[gt.hitStampContext, { color: stampColor }]} numberOfLines={1}>
                  {context}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })()}
    </TouchableOpacity>
  );
}

const makeGt = (colors: ColorTokens) => StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5,
    padding: 8,
    gap: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
  },
  cardHit: {
    borderWidth: 2,
    shadowOpacity: 0.8,
    shadowRadius: 14,
    elevation: 10,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rankChip: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, borderWidth: 1 },
  rankNum: { fontSize: 10, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.3 },
  tempBadge: {
    flexDirection: 'row', alignItems: 'baseline', gap: 3,
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 999, borderWidth: 1,
    // Scheme-correct chip fill: dark ink chip on dark, soft tint on light —
    // the temp hue text stays readable in both modes (DESIGN-02 T3 glass).
    backgroundColor: colors.surface2,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.55, shadowRadius: 6,
  },
  tempLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8, fontFamily: theme.typography.fontFamily.monoBold },
  tempNum:   { fontSize: 9,  fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },

  digits: {
    fontSize: 26, fontWeight: '900',
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 1.5, lineHeight: 28,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  // Holds the 3 mosaic glyphs when redact=true. Height matches the digits
  // line-height so the card layout doesn't shift vs. the non-redacted card.
  digitMosaicRow: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBadge: {
    position: 'absolute',
    top: 6, right: 6,
    width: 22, height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(20,12,38,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  comboSet: { flex: 1, fontSize: 9, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono },
  mult: { fontSize: 8, fontWeight: '900', letterSpacing: 1, fontFamily: theme.typography.fontFamily.monoBold },

  signalGrid: { flexDirection: 'row', columnGap: 4, marginTop: 'auto' },
  signalCell: { flex: 1, gap: 1 },
  signalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  signalKey: { fontSize: 8, fontWeight: '900', letterSpacing: 0.4, fontFamily: theme.typography.fontFamily.monoBold },
  signalVal: { fontSize: 9, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  barTrack: { height: 2.5, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  barFill: {
    height: 2.5, borderRadius: 2,
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 4,
  },

  lockedRow: { marginTop: 'auto', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.surfaceLight },
  lockedText: { fontSize: 10, color: colors.textTertiary, fontWeight: '700' },

  hitStampWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  hitStamp: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 2, borderRadius: 6,
    transform: [{ rotate: '-8deg' }],
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 10,
    elevation: 8,
    alignItems: 'center',
  },
  hitStampText: {
    fontSize: 18, fontWeight: '900',
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 1.5,
    textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6,
  },
  hitStampSub: {
    fontSize: 10, fontWeight: '900',
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 1,
    marginTop: 1,
  },
  hitStampContext: {
    fontSize: 8, fontWeight: '800',
    fontFamily: theme.typography.fontFamily.monoBold,
    letterSpacing: 0.8,
    marginTop: 1,
    opacity: 0.95,
  },
});
