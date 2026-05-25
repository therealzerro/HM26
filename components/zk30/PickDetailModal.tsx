// components/zk30/PickDetailModal.tsx
//
// ZK30-specific detail modal. Lighter than ZK6's PickDetailModal (853 lines);
// single scroll, 5 sections. Reuses SignalBar + EnergyMeter from
// components/ — those honor useTheme() already.
//
// Sections:
//   1. Header — rank + combo + best-order disambiguation + close X
//   2. Energy — EnergyMeter + heat tier label
//   3. Signals — 4 SignalBar rows (BOX / PBURST / CO / DGC)
//   4. Hit (conditional) — when hitType is set; shows match shape + 4-flag strip
//        + fireball substitution explainer
//   5. History — last seen / draws since / times drawn / top pair / multiplicity

import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform,
} from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { X } from 'lucide-react-native';
import { SignalBar } from '@/components/SignalBar';
import { EnergyMeter } from '@/components/EnergyMeter';
import { ZK30PickItem, hitTypeLabel, energyTier } from './types';

interface Props {
  pick: ZK30PickItem | null;
  onClose: () => void;
  brandBlue: string;
}

export function ZK30PickDetailModal({ pick, onClose, brandBlue }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);

  if (!pick) return null;

  const combo = pick.combo;
  const bestOrder = pick.bestOrder ?? pick.combo;
  const energy = typeof pick.energy === 'number' ? pick.energy : (pick.temperature ?? 0);
  const tier = energyTier(energy);
  const tierColor = colors[tier.key as keyof ColorTokens] as string;

  const hit = pick.hitType
    ? {
        type: pick.hitType,
        label: hitTypeLabel(pick.hitType),
        session: pick.hitSession,
        result: pick.hitResult,
        fireball: pick.hitFireball ?? null,
      }
    : null;

  const fbAugmented =
    hit && hit.result && hit.fireball
      ? [
          { pos: 0, augmented: hit.fireball + hit.result[1] + hit.result[2] },
          { pos: 1, augmented: hit.result[0] + hit.fireball + hit.result[2] },
          { pos: 2, augmented: hit.result[0] + hit.result[1] + hit.fireball },
        ]
      : [];

  // 4-flag strip same as PickCard
  const flags = {
    s:   pick.hitType === 'straight',
    b:   pick.hitType === 'box',
    fbs: pick.hitType === 'fireball_straight',
    fbb: pick.hitType === 'fireball_box',
  };
  const badges = [
    { letter: 'S',   on: flags.s,                  color: colors.gold,    label: 'Straight match' },
    { letter: 'B',   on: flags.b && !flags.s,      color: colors.success, label: 'Box match' },
    { letter: '🔥S', on: flags.fbs,                color: colors.orange,  label: 'Fireball straight' },
    { letter: '🔥B', on: flags.fbb && !flags.fbs,  color: colors.amber,   label: 'Fireball box' },
  ];

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.rank}>RANK #{pick.rank}  ·  {tier.label}</Text>
              <View style={s.comboRow}>
                <Text style={s.combo}>{bestOrder}</Text>
                {bestOrder !== combo && (
                  <Text style={s.comboAlt}>(combo {combo})</Text>
                )}
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} accessibilityLabel="Close">
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            {/* Energy */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>ENERGY</Text>
              <View style={s.energyBlock}>
                <EnergyMeter value={energy} size={80} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[s.bigNum, { color: tierColor }]}>{energy}</Text>
                  <Text style={[s.tierLabel, { color: tierColor }]}>{tier.label}</Text>
                  <Text style={s.hint}>Percentile rank within the slate's 1000-combo score pool.</Text>
                </View>
              </View>
            </View>

            <View style={s.divider} />

            {/* Signals */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>SIGNALS</Text>
              <View style={{ gap: 2 }}>
                <SignalBar label="BOX"    value={pick.signals.BOX}     color={colors.cyan} />
                <SignalBar label="PBURST" value={pick.signals.PBURST}  color={colors.rose} />
                <SignalBar label="CO"     value={pick.signals.CO}      color={brandBlue} />
                <SignalBar label="DGC"    value={pick.signals.DGC ?? 0} color={colors.gold} />
              </View>
            </View>

            <View style={s.divider} />

            {/* Hit detail (conditional) */}
            {hit && (
              <>
                <View style={s.section}>
                  <Text style={[s.sectionLabel, { color: brandBlue }]}>HIT  ·  {hit.label}</Text>

                  {/* Match shape: pick vs draw */}
                  <View style={s.hitShape}>
                    <View style={s.hitCol}>
                      <Text style={s.hitColLabel}>PICK</Text>
                      <Text style={s.hitDigits}>{bestOrder}</Text>
                    </View>
                    <Text style={s.hitArrow}>vs</Text>
                    <View style={s.hitCol}>
                      <Text style={s.hitColLabel}>{hit.session?.toUpperCase() ?? 'DRAW'}</Text>
                      <Text style={s.hitDigits}>{hit.result}</Text>
                      {hit.fireball && (
                        <Text style={s.hitFireball}>+ fireball {hit.fireball}</Text>
                      )}
                    </View>
                  </View>

                  {/* Fireball substitution explainer (only for fireball hits) */}
                  {(hit.type === 'fireball_straight' || hit.type === 'fireball_box') && fbAugmented.length > 0 && (
                    <View style={s.fbExplainer}>
                      <Text style={s.fbExplainerLabel}>FIREBALL SUBSTITUTION</Text>
                      <Text style={s.hint}>
                        Replace one position of the draw with the fireball digit.
                      </Text>
                      <View style={{ gap: 4, marginTop: 6 }}>
                        {fbAugmented.map(fb => {
                          const matches =
                            (hit.type === 'fireball_straight' && fb.augmented === bestOrder) ||
                            (hit.type === 'fireball_box' &&
                              fb.augmented.split('').sort().join('') === bestOrder.split('').sort().join(''));
                          return (
                            <View key={fb.pos} style={s.fbRow}>
                              <Text style={s.fbPos}>POS {fb.pos}</Text>
                              <Text style={[s.fbDigits, matches && { color: colors.orange, fontWeight: '900' }]}>
                                {fb.augmented}
                              </Text>
                              {matches && <Text style={s.fbMatch}>✓ match</Text>}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* 4-flag strip */}
                  <View style={s.badgeStrip}>
                    {badges.map((b, i) => (
                      <View
                        key={i}
                        style={[
                          s.badge,
                          b.on
                            ? { backgroundColor: b.color + '22', borderColor: b.color + '88' }
                            : { backgroundColor: colors.surfaceLight, borderColor: colors.border },
                        ]}
                        accessibilityLabel={b.label}
                      >
                        <Text style={[s.badgeText, { color: b.on ? b.color : colors.textTertiary }]}>
                          {b.letter}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={s.divider} />
              </>
            )}

            {/* History */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>HISTORY</Text>
              <View style={s.kvGrid}>
                <KV label="Last seen"     value={pick.lastSeen ?? '—'} colors={colors} />
                <KV label="Draws since"   value={pick.drawsSince ?? pick.dsRaw ?? '—'} colors={colors} />
                <KV label="Times drawn"   value={pick.timesDrawn ?? 0} colors={colors} />
                <KV label="Top pair"      value={pick.topPair ?? '—'} colors={colors} />
                <KV label="Multiplicity"  value={pick.multiplicity ?? '—'} colors={colors} />
                <KV label="ComboSet"      value={pick.comboSet} colors={colors} />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function KV({ label, value, colors }: { label: string; value: string | number; colors: ColorTokens }) {
  return (
    <View style={{ width: '50%', paddingVertical: 4, paddingRight: 8 }}>
      <Text style={{
        fontSize: 9, color: colors.textTertiary, fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {label}
      </Text>
      <Text style={{
        fontSize: 13, color: colors.text, fontWeight: '700',
        fontFamily: theme.typography.fontFamily.mono, marginTop: 2,
      }}>
        {value}
      </Text>
    </View>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: colors.borderMed,
    maxHeight: '88%',
    ...(Platform.OS === 'ios' ? { paddingBottom: 24 } : { paddingBottom: 8 }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rank: {
    fontSize: 10, fontWeight: '900',
    color: colors.textTertiary, letterSpacing: 1.2,
    fontFamily: theme.typography.fontFamily.mono,
  },
  comboRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 4,
  },
  combo: {
    fontSize: 38,
    fontFamily: theme.typography.fontFamily.monoBold,
    color: colors.text,
    letterSpacing: 4,
    fontWeight: '900',
  },
  comboAlt: {
    fontSize: 11,
    color: colors.textTertiary,
    fontFamily: theme.typography.fontFamily.mono,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { paddingHorizontal: 20, paddingTop: 16 },
  section: { gap: 10, paddingVertical: 8 },
  sectionLabel: {
    fontSize: 10, fontWeight: '900',
    color: colors.textTertiary, letterSpacing: 1.5,
    fontFamily: theme.typography.fontFamily.mono,
  },
  divider: {
    height: 1, backgroundColor: colors.border, marginVertical: 6,
  },
  energyBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bigNum: {
    fontSize: 32,
    fontWeight: '900',
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  tierLabel: {
    fontSize: 11, fontWeight: '900', letterSpacing: 1,
  },
  hint: {
    fontSize: 10,
    color: colors.textTertiary,
    lineHeight: 14,
  },
  hitShape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceLight,
    borderRadius: 10,
  },
  hitCol: { alignItems: 'center', gap: 4, minWidth: 80 },
  hitColLabel: {
    fontSize: 9, fontWeight: '900',
    color: colors.textTertiary, letterSpacing: 1,
  },
  hitDigits: {
    fontSize: 26,
    fontFamily: theme.typography.fontFamily.monoBold,
    color: colors.text,
    letterSpacing: 3,
  },
  hitFireball: {
    fontSize: 10, fontWeight: '700',
    color: colors.orange,
    fontFamily: theme.typography.fontFamily.mono,
  },
  hitArrow: {
    fontSize: 14, color: colors.textTertiary, fontWeight: '700',
  },
  fbExplainer: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  fbExplainerLabel: {
    fontSize: 9, fontWeight: '900',
    color: colors.orange, letterSpacing: 1.2,
    fontFamily: theme.typography.fontFamily.mono,
  },
  fbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fbPos: {
    fontSize: 9, fontWeight: '700',
    color: colors.textTertiary,
    fontFamily: theme.typography.fontFamily.mono,
    width: 40,
  },
  fbDigits: {
    fontSize: 16,
    fontFamily: theme.typography.fontFamily.monoBold,
    color: colors.text,
    letterSpacing: 2,
  },
  fbMatch: {
    fontSize: 10, fontWeight: '900',
    color: colors.orange, letterSpacing: 0.5,
  },
  badgeStrip: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, borderWidth: 1,
    minWidth: 28, alignItems: 'center',
  },
  badgeText: {
    fontSize: 10, fontWeight: '900',
    letterSpacing: 0.3,
  },
  kvGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
