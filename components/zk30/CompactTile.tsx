// components/zk30/CompactTile.tsx
//
// Dense tile for the 5×6 ZK30 grid. All 30 picks fit on one screen on most
// modern devices. Tap → opens ZK30PickDetailModal anchored to this pick.
//
// Visual hierarchy:
//   • Combo (= bestOrder ?? combo) — dominant monospace
//   • Energy: colored dot + integer
//   • Rank chip — top-left corner
//   • Hit encoding rides the BORDER COLOR (no badge strip — too dense for that here)
//   • Fireball hits get a corner flame glyph
//   • Straight hits get a soft shadow glow

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { ZK30PickItem, energyTier, hitBorderColor, hitTypeGlyph } from './types';

interface Props {
  pick: ZK30PickItem;
  onPress: () => void;
  brandBlue: string;
}

export function CompactTile({ pick, onPress, brandBlue }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);

  const combo = pick.bestOrder ?? pick.combo;
  const energy = typeof pick.energy === 'number' ? pick.energy : (pick.temperature ?? 0);
  const tier = energyTier(energy);
  const tierColor = colors[tier.key as keyof ColorTokens] as string;

  const border = hitBorderColor(pick.hitType, brandBlue + '55', {
    success: colors.success, gold: colors.gold,
    orange: colors.orange, amber: colors.amber,
  });
  const isHit = !!pick.hitType;
  const isStraight = pick.hitType === 'straight';
  const isFireball = pick.hitType === 'fireball_straight' || pick.hitType === 'fireball_box';
  const glyph = hitTypeGlyph(pick.hitType);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        s.tile,
        { borderColor: border },
        isStraight && {
          shadowColor: colors.gold,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 8,
          ...(Platform.OS === 'android' ? { elevation: 4 } : null),
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Pick rank ${pick.rank}, combo ${combo}, energy ${energy}${isHit ? `, ${pick.hitType} hit` : ''}`}
    >
      {/* Rank chip */}
      <Text style={s.rank}>#{pick.rank}</Text>

      {/* Combo */}
      <Text style={s.combo}>{combo}</Text>

      {/* Energy row */}
      <View style={s.energyRow}>
        <View style={[s.dot, { backgroundColor: tierColor }]} />
        <Text style={[s.energyNum, { color: tierColor }]}>{energy}</Text>
      </View>

      {/* Hit corner glyph (fireball or straight star) */}
      {glyph !== '' && (
        <View style={s.cornerGlyph}>
          <Text style={s.cornerGlyphText}>{isFireball ? '🔥' : glyph}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  tile: {
    flex: 1,
    aspectRatio: 1.05,            // ≈ square; slightly taller than wide
    borderWidth: 1.5,
    borderRadius: 10,
    backgroundColor: colors.card,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    position: 'relative',
    overflow: 'visible',
  },
  rank: {
    position: 'absolute',
    top: 4,
    left: 6,
    fontSize: 9,
    color: colors.textTertiary,
    fontFamily: theme.typography.fontFamily.mono,
    fontWeight: '700',
  },
  combo: {
    fontSize: 18,
    fontFamily: theme.typography.fontFamily.monoBold,
    color: colors.text,
    letterSpacing: 2,
    fontWeight: '900',
  },
  energyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
  },
  energyNum: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  cornerGlyph: {
    position: 'absolute',
    top: 2,
    right: 4,
  },
  cornerGlyphText: {
    fontSize: 12,
    lineHeight: 14,
  },
});
