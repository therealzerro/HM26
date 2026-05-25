// components/zk30/PickCard.tsx
//
// Full-width row for ZK30 List mode. Inspired by ZK6's PickCard but slimmer
// (ZK30 has 30 rows to scroll, not 6). Includes heat label, 4 signal bars,
// pressure messaging, and a 4-flag hit badge strip (S / B / 🔥S / 🔥B).
//
// Tap → opens ZK30PickDetailModal.

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { SignalBar } from '@/components/SignalBar';
import { ZK30PickItem, energyTier, hitBorderColor, hitTypeLabel } from './types';

interface Props {
  pick: ZK30PickItem;
  onPress: () => void;
  brandBlue: string;
}

export function ZK30PickCardRow({ pick, onPress, brandBlue }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);

  const combo = pick.bestOrder ?? pick.combo;
  const energy = typeof pick.energy === 'number' ? pick.energy : (pick.temperature ?? 0);
  const tier = energyTier(energy);
  const tierColor = colors[tier.key as keyof ColorTokens] as string;

  const border = hitBorderColor(pick.hitType, brandBlue + '33', {
    success: colors.success, gold: colors.gold,
    orange: colors.orange, amber: colors.amber,
  });
  const hitLabel = hitTypeLabel(pick.hitType);

  // 4-badge strip (derived from primary hitType; superset suppression).
  const flags = {
    s:   pick.hitType === 'straight',
    b:   pick.hitType === 'box',
    fbs: pick.hitType === 'fireball_straight',
    fbb: pick.hitType === 'fireball_box',
  };
  const badges = [
    { letter: 'S',   on: flags.s,                  color: colors.gold },
    { letter: 'B',   on: flags.b && !flags.s,      color: colors.success },
    { letter: '🔥S', on: flags.fbs,                color: colors.orange },
    { letter: '🔥B', on: flags.fbb && !flags.fbs,  color: colors.amber },
  ];

  const drawsSince = pick.drawsSince ?? pick.dsRaw ?? null;
  const pressure: { txt: string; color: string } | null =
    drawsSince == null || drawsSince >= 500 ? null
    : drawsSince < 30  ? { txt: `Fresh ${drawsSince}d`, color: colors.success }
    : drawsSince > 200 ? { txt: `Overdue ${drawsSince}d`, color: colors.orange }
    : { txt: `Building ${drawsSince}d`, color: colors.gold };

  const isStraight = pick.hitType === 'straight';

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={[
        s.row,
        { borderColor: border },
        isStraight && {
          shadowColor: colors.gold,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 8,
          ...(Platform.OS === 'android' ? { elevation: 3 } : null),
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Pick rank ${pick.rank}, combo ${combo}, energy ${energy}`}
    >
      {/* Left: rank + combo + heat */}
      <View style={s.left}>
        <Text style={s.rank}>#{pick.rank}</Text>
        <Text style={s.combo}>{combo}</Text>
        <View style={s.heatRow}>
          <View style={[s.dot, { backgroundColor: tierColor }]} />
          <Text style={[s.heatLabel, { color: tierColor }]}>{tier.label}</Text>
          <Text style={[s.energyNum, { color: colors.textSecondary }]}>{energy}</Text>
        </View>
      </View>

      {/* Middle: signal bars */}
      <View style={s.mid}>
        <SignalBar label="BOX"    value={pick.signals.BOX}     color={colors.cyan} />
        <SignalBar label="PBURST" value={pick.signals.PBURST}  color={colors.rose} />
        <SignalBar label="CO"     value={pick.signals.CO}      color={brandBlue} />
        <SignalBar label="DGC"    value={pick.signals.DGC ?? 0} color={colors.gold} />
      </View>

      {/* Right: badges, pressure, hit label — single horizontal row */}
      <View style={s.right}>
        <View style={s.rightRow}>
          {badges.map((b, i) => (
            <View
              key={i}
              style={[
                s.badge,
                b.on
                  ? { backgroundColor: b.color + '22', borderColor: b.color + '88' }
                  : { backgroundColor: colors.surfaceLight, borderColor: colors.border },
              ]}
            >
              <Text style={[s.badgeText, { color: b.on ? b.color : colors.textTertiary }]}>
                {b.letter}
              </Text>
            </View>
          ))}
          {pressure && (
            <Text style={[s.pressure, { color: pressure.color }]}>· {pressure.txt}</Text>
          )}
        </View>
        {hitLabel && (
          <Text style={[s.hitLabel, { color: border }]}>{hitLabel}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 10,
    gap: 10,
    alignItems: 'center',
  },
  left: {
    width: 70,
    gap: 2,
  },
  rank: {
    fontSize: 9,
    color: colors.textTertiary,
    fontFamily: theme.typography.fontFamily.mono,
    fontWeight: '700',
  },
  combo: {
    fontSize: 22,
    fontFamily: theme.typography.fontFamily.monoBold,
    color: colors.text,
    letterSpacing: 2,
    fontWeight: '900',
  },
  heatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  heatLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  energyNum: { fontSize: 9, fontWeight: '700' },
  mid: { flex: 1, gap: 1 },
  right: { width: 120, alignItems: 'flex-end', gap: 3 },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end' },
  badge: {
    paddingHorizontal: 4, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1,
    minWidth: 18, alignItems: 'center',
  },
  badgeText: { fontSize: 8, fontWeight: '900' },
  pressure: { fontSize: 9, fontWeight: '700' },
  hitLabel: {
    fontSize: 8, fontWeight: '900',
    letterSpacing: 0.5,
  },
});
