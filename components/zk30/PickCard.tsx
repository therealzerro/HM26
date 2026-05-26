// components/zk30/PickCard.tsx
//
// Full-width row for ZK30 List mode. Inspired by ZK6's PickCard but slimmer
// (ZK30 has 30 rows to scroll, not 6). Includes heat label, 4 signal bars,
// pressure messaging, and a 4-flag hit badge strip (S / B / 🔥S / 🔥B).
//
// Tap → opens ZK30PickDetailModal.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Modal } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { HelpCircle, X } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { SignalBar } from '@/components/SignalBar';
import { ZK30PickItem, energyTier, hitBorderColor, hitTypeLabel } from './types';

// Shared cached lookup for the Fresh/Building threshold. All 30 ZK30 rows mount
// PickCard simultaneously; TanStack Query dedupes via this stable queryKey so
// the GET fires once per session. Missing row → default 30 (UI-only label;
// engine does not consume).
function useFreshThreshold(): number {
  const { data } = useQuery<number>({
    queryKey: ['zk30-fresh-threshold-days'],
    queryFn: async () => {
      try {
        const rows = await fetchFromSupabase<Array<{ value: string }>>({
          path: `/rest/v1/app_config?key=eq.zk30_fresh_threshold_days&select=value&limit=1`,
        });
        const v = Array.isArray(rows) && rows[0] ? parseInt(rows[0].value, 10) : NaN;
        return Number.isFinite(v) && v >= 1 ? v : 30;
      } catch {
        return 30;
      }
    },
    staleTime: 10 * 60 * 1000,
  });
  return data ?? 30;
}

interface Props {
  pick: ZK30PickItem;
  onPress: () => void;
  brandBlue: string;
}

export function ZK30PickCardRow({ pick, onPress, brandBlue }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const freshDays = useFreshThreshold();
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const combo = pick.bestOrder ?? pick.combo;
  const energy = typeof pick.energy === 'number' ? pick.energy : (pick.temperature ?? 0);
  const tier = energyTier(energy);
  const tierColor = tier.color;
  const isTriple = pick.multiplicity === 'triples';

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
  const pressure: { txt: string; color: string; band: 'fresh' | 'building' | 'overdue' } | null =
    drawsSince == null || drawsSince >= 500 ? null
    : drawsSince <= freshDays ? { txt: `Fresh ${drawsSince}d`,    color: colors.success, band: 'fresh' }
    : drawsSince > 200        ? { txt: `Overdue ${drawsSince}d`,  color: colors.orange,  band: 'overdue' }
    :                            { txt: `Building ${drawsSince}d`, color: colors.gold,    band: 'building' };
  // (?) tooltip only renders next to Fresh/Building (the threshold-dependent
  // bands). Overdue uses a separate cutoff and gets no tooltip — the meaning
  // is self-evident.
  const showFreshTooltip = pressure?.band === 'fresh' || pressure?.band === 'building';

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
        <View style={s.rankRow}>
          <Text style={s.rank}>#{pick.rank}</Text>
          {isTriple && <Text style={s.tripleFlag}>▲</Text>}
        </View>
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
            <View style={s.pressureRow}>
              <Text style={[s.pressure, { color: pressure.color }]}>· {pressure.txt}</Text>
              {showFreshTooltip && (
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation?.(); setTooltipOpen(true); }}
                  hitSlop={6}
                  accessibilityLabel="Explain Fresh and Building"
                  accessibilityRole="button"
                >
                  <HelpCircle size={10} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
        {hitLabel && (
          <Text style={[s.hitLabel, { color: border }]}>{hitLabel}</Text>
        )}
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={tooltipOpen}
        onRequestClose={() => setTooltipOpen(false)}
      >
        <TouchableOpacity style={s.tipBackdrop} activeOpacity={1} onPress={() => setTooltipOpen(false)}>
          <View style={[s.tipCard, { borderColor: brandBlue + '55' }]}>
            <View style={s.tipHeader}>
              <Text style={[s.tipTitle, { color: brandBlue }]}>FRESHNESS</Text>
              <TouchableOpacity onPress={() => setTooltipOpen(false)} hitSlop={6}>
                <X size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[s.tipBody, { color: colors.textSecondary }]}>
              Days since this combo last drew (any TX session, fireball-substituted hits not counted).
            </Text>
            <View style={s.tipRow}>
              <Text style={[s.tipBand, { color: colors.success }]}>Fresh</Text>
              <Text style={[s.tipBandDesc, { color: colors.textSecondary }]}>{`≤ ${freshDays} days since last hit`}</Text>
            </View>
            <View style={s.tipRow}>
              <Text style={[s.tipBand, { color: colors.gold }]}>Building</Text>
              <Text style={[s.tipBandDesc, { color: colors.textSecondary }]}>{`> ${freshDays} days (pressure building)`}</Text>
            </View>
            <Text style={[s.tipFooter, { color: colors.textTertiary }]}>
              Threshold tunable via app_config.zk30_fresh_threshold_days (default 30).
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
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
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rank: {
    fontSize: 9,
    color: colors.textTertiary,
    fontFamily: theme.typography.fontFamily.mono,
    fontWeight: '700',
  },
  tripleFlag: {
    fontSize: 9,
    color: colors.textTertiary,
    fontWeight: '900',
    lineHeight: 11,
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
  pressureRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pressure: { fontSize: 9, fontWeight: '700' },
  hitLabel: {
    fontSize: 8, fontWeight: '900',
    letterSpacing: 0.5,
  },
  tipBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  tipCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tipTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  tipBody: {
    fontSize: 12,
    lineHeight: 17,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  tipBand: {
    fontSize: 11,
    fontWeight: '900',
    width: 64,
    letterSpacing: 0.5,
  },
  tipBandDesc: {
    fontSize: 11,
    flex: 1,
  },
  tipFooter: {
    fontSize: 9,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 13,
  },
});
