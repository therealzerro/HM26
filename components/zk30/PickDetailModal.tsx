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
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { ZK30_THEME } from '@/lib/theme/zk30Theme';
import { X } from 'lucide-react-native';
import { fetchFromSupabase } from '@/lib/supabase';
import { SignalBar } from '@/components/SignalBar';
import { EnergyMeter } from '@/components/EnergyMeter';
import { ZK30PickItem, hitTypeLabel, fireballHitTypeLabel, energyTier } from './types';
import { useZK30ViewMode } from '@/lib/zk30/viewMode';
import { SIGNAL_LABELS, ENERGY_LABELS, ENERGY_LABEL_TO_KEY } from '@/lib/zk30/labelMaps';

// All distinct permutations of a 3-digit combo. Triples → 1, doubles → 3,
// singles → 6. Used to query histories_tx for any past hit of this comboSet.
function permsOf(combo: string): string[] {
  const [a, b, c] = combo;
  return Array.from(new Set([
    a + b + c, a + c + b,
    b + a + c, b + c + a,
    c + a + b, c + b + a,
  ]));
}

// Per-pick fireball detail fetch (ARCH-08). Snapshot picks carry
// hitSession/Result/Fireball for NATURAL primary only — when a pick fired
// fireball, we look up the specific match row in adaptive_tracking_zk30 to
// surface session/result/digit on the detail modal.
//
// Picks fb_straight > fb_box; session order tiebreak (Morning < Day <
// Evening < Night). Returns null when no fireball detail to show.
function useFireballHitDetail(args: {
  slateDate: string;
  combo: string;
  rank: number;
  fireballHitType: ZK30PickItem['fireballHitType'];
}) {
  const { slateDate, combo, rank, fireballHitType } = args;
  return useQuery<{ session: string; result: string; fireball: string | null } | null>({
    queryKey: ['zk30-fireball-detail', slateDate, combo, rank],
    enabled: !!fireballHitType && slateDate.length === 10 && combo.length > 0,
    queryFn: async () => {
      const rows = await fetchFromSupabase<Array<{
        matched_session: string; matched_result: string; matched_fireball: string | null;
        hit_fireball_straight: boolean; hit_fireball_box: boolean;
      }>>({
        path: `/rest/v1/adaptive_tracking_zk30?slate_date=eq.${slateDate}` +
              `&combo=eq.${encodeURIComponent(combo)}&rank=eq.${rank}` +
              `&or=(hit_fireball_straight.eq.true,hit_fireball_box.eq.true)` +
              `&select=matched_session,matched_result,matched_fireball,hit_fireball_straight,hit_fireball_box` +
              `&limit=10`,
      });
      if (!Array.isArray(rows) || rows.length === 0) return null;
      // Prefer fb_straight; then session order.
      const rank2 = (r: typeof rows[0]) => r.hit_fireball_straight ? 2 : (r.hit_fireball_box ? 1 : 0);
      const SESSION_RANK: Record<string, number> = { Morning: 0, Day: 1, Evening: 2, Night: 3 };
      rows.sort((a, b) =>
        rank2(b) - rank2(a) ||
        (SESSION_RANK[a.matched_session] ?? 99) - (SESSION_RANK[b.matched_session] ?? 99),
      );
      const best = rows[0];
      return {
        session: best.matched_session,
        result: best.matched_result,
        fireball: best.matched_fireball,
      };
    },
    staleTime: 60 * 1000,
  });
}

// Per-pick hit history. "straight" match = result_digits equals the
// recommended bestOrder; any other in-set permutation is a "box". Limit 12 —
// covers the last ~year of hits for a typical combo, more than enough to spot
// cadence at a glance.
//
// Accepts empty `combo` so the hook can be called unconditionally at the top of
// the modal (Rules of Hooks — the modal early-returns null when no pick is
// selected, so the query must be wired with `enabled` rather than gated by
// the early return).
function usePickHitHistory(combo: string, straightAgainst: string) {
  return useQuery<Array<{ date_et: string; session: string; match_type: 'straight' | 'box' }>>({
    queryKey: ['zk30-pick-hit-history', combo],
    enabled: combo.length === 3,
    queryFn: async () => {
      const inList = permsOf(combo).join(',');
      const rows = await fetchFromSupabase<Array<{ date_et: string; session: string; result_digits: string }>>({
        path: `/rest/v1/histories_tx?result_digits=in.(${inList})` +
              `&select=date_et,session,result_digits&order=date_et.desc,session.desc&limit=12`,
      });
      if (!Array.isArray(rows)) return [];
      return rows.map(r => ({
        date_et: r.date_et,
        session: r.session,
        match_type: r.result_digits === straightAgainst ? 'straight' : 'box',
      }));
    },
    staleTime: 60 * 1000,
  });
}

interface Props {
  pick: ZK30PickItem | null;
  onClose: () => void;
  brandBlue: string;
  /** Slate date this pick belongs to. Required for the fireball detail
   *  lookup in adaptive_tracking_zk30 (snapshot carries natural detail only
   *  post-ARCH-08; fireball session/result/digit live in AT). */
  slateDate?: string;
}

export function ZK30PickDetailModal({ pick, onClose, brandBlue, slateDate = '' }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const { mode } = useZK30ViewMode();
  const sigLabels = SIGNAL_LABELS[mode];

  // ALL hooks must run on every render — pick may be null on first mount and
  // become non-null when a row is tapped. Early-return AFTER all hook calls.
  const combo     = pick?.combo ?? '';
  const bestOrder = pick?.bestOrder ?? pick?.combo ?? '';
  const { data: hitHistory } = usePickHitHistory(combo, bestOrder);
  const { data: fireballDetail } = useFireballHitDetail({
    slateDate,
    combo,
    rank: pick?.rank ?? 0,
    fireballHitType: pick?.fireballHitType ?? null,
  });

  if (!pick) return null;

  const energy = typeof pick.energy === 'number' ? pick.energy : (pick.temperature ?? 0);
  const tier = energyTier(energy);
  const tierColor = tier.color;
  // Phase C1 — translate energy label per view mode.
  const tierKey = ENERGY_LABEL_TO_KEY[tier.label] ?? 'COLD';
  const tierLabel = ENERGY_LABELS[mode][tierKey];

  // ARCH-08 split: separate natural + fireball blocks. Either can be present
  // independently. `hit` (natural) reads from snapshot fields; `fbHit`
  // (fireball) reads from the AT lookup above.
  const hit = pick.hitType
    ? {
        type: pick.hitType,
        label: hitTypeLabel(pick.hitType),
        session: pick.hitSession ?? null,
        result: pick.hitResult ?? null,
      }
    : null;

  const fbHit = pick.fireballHitType
    ? {
        type: pick.fireballHitType,
        label: fireballHitTypeLabel(pick.fireballHitType),
        session: fireballDetail?.session ?? null,
        result:  fireballDetail?.result  ?? null,
        fireball: fireballDetail?.fireball ?? null,
      }
    : null;

  // Fireball substitution explainer only renders when we have a fireball
  // hit AND the AT lookup returned a fireball digit to demonstrate.
  const fbAugmented =
    fbHit && fbHit.result && fbHit.fireball
      ? [
          { pos: 0, augmented: fbHit.fireball + fbHit.result[1] + fbHit.result[2] },
          { pos: 1, augmented: fbHit.result[0] + fbHit.fireball + fbHit.result[2] },
          { pos: 2, augmented: fbHit.result[0] + fbHit.result[1] + fbHit.fireball },
        ]
      : [];

  // Match-summary strip (used at the bottom of the Match Results section).
  // Natural badges live next to fireball badges, both rendered per truth.
  const badges = [
    { letter: 'S',   on: pick.hitType === 'straight',                                    color: colors.gold,    label: 'Straight match' },
    { letter: 'B',   on: pick.hitType === 'box',                                         color: colors.success, label: 'Box match' },
    { letter: '🔥S', on: pick.fireballHitType === 'fireball_straight',                   color: colors.orange,  label: 'Fireball straight' },
    { letter: '🔥B', on: pick.fireballHitType === 'fireball_box',                        color: colors.amber,   label: 'Fireball box' },
  ];
  const anyHit = !!hit || !!fbHit;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.rank}>RANK #{pick.rank}  ·  {tierLabel}</Text>
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
                  <Text style={[s.tierLabel, { color: tierColor }]}>{tierLabel}</Text>
                  <Text style={s.hint}>Percentile rank within the slate's 1000-combo score pool.</Text>
                </View>
              </View>
            </View>

            <View style={s.divider} />

            {/* Signals */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>SIGNALS</Text>
              <View style={{ gap: 2 }}>
                <SignalBar label={sigLabels.BOX}    value={pick.signals.BOX}     color={colors.cyan} />
                <SignalBar label={sigLabels.PBURST} value={pick.signals.PBURST}  color={colors.rose} />
                <SignalBar label={sigLabels.CO}     value={pick.signals.CO}      color={brandBlue} />
                <SignalBar label={sigLabels.DGC}    value={pick.signals.DGC ?? 0} color={colors.gold} />
              </View>
            </View>

            <View style={s.divider} />

            {/* Match Results — ARCH-08 split. Renders when either natural OR
                fireball fired. Two sub-blocks, both always shown for
                transparency about what hit vs what didn't. */}
            {anyHit && (
              <>
                <View style={s.section}>
                  <Text style={[s.sectionLabel, { color: brandBlue }]}>MATCH RESULTS</Text>

                  {/* NATURAL sub-block */}
                  <Text style={[s.subSectionLabel, { color: colors.textSecondary }]}>NATURAL MATCH</Text>
                  {hit ? (
                    <View style={s.hitShape}>
                      <View style={s.hitCol}>
                        <Text style={s.hitColLabel}>PICK</Text>
                        <Text style={s.hitDigits}>{bestOrder}</Text>
                      </View>
                      <Text style={s.hitArrow}>vs</Text>
                      <View style={s.hitCol}>
                        <Text style={s.hitColLabel}>{hit.session?.toUpperCase() ?? 'DRAW'}</Text>
                        <Text style={s.hitDigits}>{hit.result ?? '—'}</Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={[s.hint, { marginBottom: 8 }]}>No natural match.</Text>
                  )}

                  {/* FIREBALL sub-block. Channel label uses textSecondary
                      (neutral); TX-only suffix uses accentTX per Phase C2. */}
                  <Text style={[s.subSectionLabel, { marginTop: 12 }]}>
                    <Text style={{ color: colors.textSecondary }}>🔥 FIREBALL MATCH</Text>
                    <Text style={{ color: ZK30_THEME.accentTX }}>{'  ·  TX-only'}</Text>
                  </Text>
                  {fbHit ? (
                    <>
                      <View style={s.hitShape}>
                        <View style={s.hitCol}>
                          <Text style={s.hitColLabel}>PICK</Text>
                          <Text style={s.hitDigits}>{bestOrder}</Text>
                        </View>
                        <Text style={s.hitArrow}>vs</Text>
                        <View style={s.hitCol}>
                          <Text style={s.hitColLabel}>{(fbHit.session ?? 'DRAW').toUpperCase()}</Text>
                          <Text style={s.hitDigits}>{fbHit.result ?? '—'}</Text>
                          {fbHit.fireball && (
                            <Text style={s.hitFireball}>+ fireball {fbHit.fireball}</Text>
                          )}
                        </View>
                      </View>
                      <Text style={[s.subSectionLabel, { color: colors.orange, marginTop: 4 }]}>
                        {fbHit.label}
                      </Text>

                      {/* Fireball substitution explainer */}
                      {fbAugmented.length > 0 && (
                        <View style={s.fbExplainer}>
                          <Text style={s.fbExplainerLabel}>FIREBALL SUBSTITUTION</Text>
                          <Text style={s.hint}>
                            Replace one position of the draw with the fireball digit.
                          </Text>
                          <View style={{ gap: 4, marginTop: 6 }}>
                            {fbAugmented.map(fb => {
                              const matches =
                                (fbHit.type === 'fireball_straight' && fb.augmented === bestOrder) ||
                                (fbHit.type === 'fireball_box' &&
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
                    </>
                  ) : (
                    <Text style={[s.hint, { marginBottom: 8 }]}>No fireball match.</Text>
                  )}

                  {/* 4-flag strip — all matched flags across both channels */}
                  <View style={[s.badgeStrip, { marginTop: 12 }]}>
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

            {/* Hit history — last 12 matches of this comboSet against TX draws */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>HIT HISTORY</Text>
              {!hitHistory ? (
                <Text style={s.hint}>Loading…</Text>
              ) : hitHistory.length === 0 ? (
                <Text style={s.hint}>No prior hits in the TX history window.</Text>
              ) : (
                <View style={{ gap: 4 }}>
                  {hitHistory.slice(0, 12).map((h, i) => (
                    <View key={i} style={s.hitHistRow}>
                      <Text style={s.hitHistDate}>{h.date_et}</Text>
                      <Text style={s.hitHistSession}>
                        {(h.session || '').toUpperCase()}
                      </Text>
                      <Text
                        style={[
                          s.hitHistType,
                          {
                            color: h.match_type === 'straight' ? colors.gold : colors.success,
                          },
                        ]}
                      >
                        {h.match_type === 'straight' ? 'STRAIGHT' : 'BOX'}
                      </Text>
                    </View>
                  ))}
                  {hitHistory.length === 12 && (
                    // PostgREST cap is the LIMIT we passed (12). If the row count
                    // hits the cap, surface that more hits likely exist beyond
                    // what we've fetched — operator can drill via SQL if needed.
                    <Text style={[s.hint, { marginTop: 2 }]}>
                      + more historical hits (showing 12 most recent)
                    </Text>
                  )}
                </View>
              )}
            </View>

            <View style={s.divider} />

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
  // ARCH-08: sub-section header used inside MATCH RESULTS to split natural
  // and fireball blocks. Smaller + less prominent than the parent sectionLabel.
  subSectionLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: 6,
    marginBottom: 4,
  },
  // Hit history rows — compact 3-column timeline (date · session · type)
  hitHistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  hitHistDate: {
    fontSize: 11,
    color: colors.text,
    fontFamily: theme.typography.fontFamily.mono,
    fontWeight: '700',
    width: 86,
  },
  hitHistSession: {
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: '700',
    letterSpacing: 0.6,
    flex: 1,
  },
  hitHistType: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
