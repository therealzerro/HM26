// components/zk30/CompactTile.tsx
//
// Dense tile for the 6×5 ZK30 grid. ~50px × ~50px (≈53% smaller area than
// the v1 tile). All 30 picks fit on one screen even on iPhone SE.
//
// Layout (in concentric order):
//   • Background — tinted by hit type for at-a-glance scanning
//   • Energy ring — SVG perimeter arc, color = tier, length = energy/100
//   • Combo — dead center, 13pt mono, dominant typographic element
//   • Signal pips — 4 micro dots below the ring, color=channel, opacity=strength
//   • Fireball glyph — corner glyph for fireball hits only
//
// Rank is removed (implied by reading order). Energy *number* is also
// removed — the ring fill is the visual idiom for that 0–100 scalar.

import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, cancelAnimation } from 'react-native-reanimated';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { EnergyRing } from './EnergyRing';
import { ZK30PickItem, energyTier } from './types';

interface Props {
  pick: ZK30PickItem;
  onPress: () => void;
  brandBlue: string;
}

// Background tint + ring override per NATURAL hit type (ARCH-08). Fireball
// gets its own subtle bottom-right glyph rather than dominating the chrome —
// most users can't claim fireball prizes (non-TX jurisdictions).
function hitChrome(
  hitType: ZK30PickItem['hitType'],
  colors: ColorTokens,
): { bg: string; ringOverride?: string; glyph?: string; glow?: string } {
  switch (hitType) {
    case 'straight':
      return { bg: colors.gold + '20', ringOverride: colors.gold, glow: colors.gold, glyph: '⭐' };
    case 'box':
      return { bg: colors.success + '15', ringOverride: colors.success };
    default:
      return { bg: colors.card };
  }
}

export function CompactTile({ pick, onPress, brandBlue }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors, brandBlue), [colors, brandBlue]);

  const combo = pick.bestOrder ?? pick.combo;
  const energy = typeof pick.energy === 'number' ? pick.energy : (pick.temperature ?? 0);
  const chrome = hitChrome(pick.hitType, colors);
  const isTriple = pick.multiplicity === 'triples';
  // ARCH-08: fireball is a secondary marker — small dim 🔥 in the corner,
  // visible only when fireball fires and natural did not (so it doesn't
  // duplicate the primary glyph on dual-hit picks).
  const fireballOnly = !pick.hitType && !!pick.fireballHitType;

  // Phase B1 — top-5 visual hierarchy. #1 gets thick ring + glow + medallion.
  // #2-5 get slightly thicker ring + small rank chip. #6-30 unchanged.
  const isRank1 = pick.rank === 1;
  const isTop5  = pick.rank >= 1 && pick.rank <= 5;
  const ringStroke = isRank1 ? 4 : isTop5 ? 3.5 : 2.5;

  // Phase B3 — gentle pulse animation on rank #1 only. Native platforms only
  // (skip web — reanimated's Web layer is fine but the animation cost on a
  // grid view doesn't earn its keep there). 2s cycle, scale 1.0→1.04→1.0,
  // opacity 1.0→0.85→1.0. Cancel on unmount.
  const pulseScale   = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);
  useEffect(() => {
    if (!isRank1 || Platform.OS === 'web') return;
    pulseScale.value = withRepeat(
      withSequence(withTiming(1.04, { duration: 1000 }), withTiming(1, { duration: 1000 })),
      -1, false,
    );
    pulseOpacity.value = withRepeat(
      withSequence(withTiming(0.85, { duration: 1000 }), withTiming(1, { duration: 1000 })),
      -1, false,
    );
    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
    };
  }, [isRank1, pulseScale, pulseOpacity]);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // Ring sizing: 68px outer (was 76) — trimmed to compensate for the new
  // secondary chip row that eats ~32px of vertical chrome.
  const RING_SIZE = 68;

  // Compose glow: hit-type glow always wins (data); rank-1 fallback glow
  // when no hit yet.
  const tileGlowColor = chrome.glow ?? (isRank1 ? brandBlue : undefined);
  const tileGlowStyle = tileGlowColor ? {
    shadowColor: tileGlowColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: isRank1 ? 0.5 : 0.55,
    shadowRadius: isRank1 ? 12 : 6,
    ...(Platform.OS === 'android' ? { elevation: isRank1 ? 8 : 3 } : null),
  } : null;

  // The ring wrapper — animated on rank #1, plain on the rest.
  const RingShell = ({ children }: { children: React.ReactNode }) =>
    isRank1 && Platform.OS !== 'web'
      ? <Animated.View style={pulseStyle}>{children}</Animated.View>
      : <>{children}</>;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        s.tile,
        { backgroundColor: chrome.bg },
        tileGlowStyle,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Rank ${pick.rank}, combo ${combo}, energy ${energy}${pick.hitType ? `, ${pick.hitType} hit` : ''}`}
    >
      <RingShell>
        <EnergyRing
          energy={energy}
          size={RING_SIZE}
          stroke={ringStroke}
          overrideColor={chrome.ringOverride}
          dashed={isTriple}
        >
          <Text style={s.combo}>{combo}</Text>
        </EnergyRing>
      </RingShell>

      {/* Phase B1 — rank emphasis (top-left).
          #1 gets a 20×20 brand-blue medallion with a white "1".
          #2-5 get a dark mini-chip with "#N".
          #6+ render nothing (rank implied by reading order). */}
      {isRank1 ? (
        <View style={[s.rankMedallion, { backgroundColor: brandBlue }]}>
          <Text style={s.rankMedallionText}>1</Text>
        </View>
      ) : isTop5 ? (
        <View style={[s.rankChip, { backgroundColor: colors.surface2, borderColor: brandBlue + '55' }]}>
          <Text style={[s.rankChipText, { color: brandBlue }]}>#{pick.rank}</Text>
        </View>
      ) : null}

      {/* Hit-type glyph (top-right corner) */}
      {chrome.glyph && (
        <View style={s.cornerGlyph}>
          <Text style={s.cornerGlyphText}>{chrome.glyph}</Text>
        </View>
      )}

      {/* Triple flag — moved to bottom-left to free top-left for rank
          medallion/chip. Still subtle, still marks the triples row. */}
      {isTriple && (
        <View style={s.tripleFlag}>
          <Text style={s.tripleFlagText}>▲</Text>
        </View>
      )}

      {/* Fireball-only marker (bottom-right) — see ARCH-08. */}
      {fireballOnly && (
        <View style={s.fbCornerGlyph}>
          <Text style={s.fbCornerGlyphText}>🔥</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const makeS = (colors: ColorTokens, _brandBlue: string) =>
  StyleSheet.create({
    tile: {
      flex: 1,
      // No aspectRatio — tiles flex to fill available row height. Min-height
      // guards short screens after the secondary chip row trimmed vertical.
      minHeight: 70,
      borderRadius: 11,
      paddingTop: 5,
      paddingBottom: 6,
      paddingHorizontal: 3,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      position: 'relative',
      overflow: 'visible',
    },
    combo: {
      fontSize: 16,
      fontFamily: theme.typography.fontFamily.monoBold,
      color: colors.text,
      letterSpacing: 1.6,
      fontWeight: '900',
    },
    cornerGlyph: {
      position: 'absolute',
      top: -2,
      right: -2,
    },
    cornerGlyphText: {
      fontSize: 11,
      lineHeight: 13,
    },
    tripleFlag: {
      // Moved to bottom-left in Phase B1 (top-left is now rank medallion/chip).
      position: 'absolute',
      bottom: 1,
      left: 3,
    },
    tripleFlagText: {
      fontSize: 9,
      lineHeight: 11,
      color: colors.textTertiary,
      fontWeight: '900',
    },
    // Phase B1 — rank #1 medallion. Brand-blue circle, white "1" centered.
    rankMedallion: {
      position: 'absolute',
      top: -3,
      left: -3,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.4,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      ...(Platform.OS === 'android' ? { elevation: 4 } : null),
    },
    rankMedallionText: {
      fontSize: 11,
      fontWeight: '900',
      color: '#fff',
      lineHeight: 12,
    },
    // Phase B1 — rank #2-5 chip. Mini rounded-rect, brand-tint border.
    rankChip: {
      position: 'absolute',
      top: -2,
      left: -1,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 4,
      borderWidth: 1,
      minWidth: 18,
      alignItems: 'center',
    },
    rankChipText: {
      fontSize: 9,
      fontWeight: '900',
      lineHeight: 11,
      letterSpacing: 0.2,
    },
    fbCornerGlyph: {
      position: 'absolute',
      bottom: 1,
      right: 3,
      opacity: 0.65,
    },
    fbCornerGlyphText: {
      fontSize: 9,
      lineHeight: 11,
    },
  });
