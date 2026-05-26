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

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
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

  // Ring sizing: 68px outer (was 76) — trimmed to compensate for the new
  // secondary chip row that eats ~32px of vertical chrome.
  const RING_SIZE = 68;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        s.tile,
        { backgroundColor: chrome.bg },
        chrome.glow && {
          shadowColor: chrome.glow,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.55,
          shadowRadius: 6,
          ...(Platform.OS === 'android' ? { elevation: 3 } : null),
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Rank ${pick.rank}, combo ${combo}, energy ${energy}${pick.hitType ? `, ${pick.hitType} hit` : ''}`}
    >
      <EnergyRing
        energy={energy}
        size={RING_SIZE}
        stroke={2.5}
        overrideColor={chrome.ringOverride}
        dashed={isTriple}
      >
        <Text style={s.combo}>{combo}</Text>
      </EnergyRing>

      {/* Hit-type glyph (top-right corner) */}
      {chrome.glyph && (
        <View style={s.cornerGlyph}>
          <Text style={s.cornerGlyphText}>{chrome.glyph}</Text>
        </View>
      )}

      {/* Triple flag (top-left corner) — kept on the opposite corner so it
          doesn't collide with hit glyphs, and small enough to read as "marker"
          rather than "warning". */}
      {isTriple && (
        <View style={s.tripleFlag}>
          <Text style={s.tripleFlagText}>▲</Text>
        </View>
      )}

      {/* Fireball-only marker (bottom-right) — dim 🔥. Renders ONLY when
          this pick has a fireball hit and no natural hit. Dual-hit picks
          already show the natural glyph top-right; the fireball is
          implicit (sub-row visible on the detail modal). */}
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
      position: 'absolute',
      top: 1,
      left: 3,
    },
    tripleFlagText: {
      fontSize: 9,
      lineHeight: 11,
      color: colors.textTertiary,
      fontWeight: '900',
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
