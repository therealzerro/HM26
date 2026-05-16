import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import type { PickItem } from '@/components/PickCard';

// Pick 3 player logic per user direction (2026-05-12).
// A play = stake $0.25 placed against (jurisdiction × draw × bet_type).
//   Straight  → wins $225          (only on exact match)
//   Box       → wins $37.50 singles · $75 doubles · $225 triples
const STAKE = 0.25;
const STRAIGHT_PAYOUT = 225;
function boxPayout(multiplicity?: string): number {
  switch ((multiplicity ?? '').toLowerCase()) {
    case 'doubles': return 75;
    case 'triples': return 225;
    default:        return 37.5;
  }
}

// Approximate count of jurisdictions HitMaster covers (after the standard
// histories filter excludes ME/NH/VT/MS/PR/MD/MS2). Tune if the histories
// table membership shifts. Used only for the "All states" cost multiplier.
const ALL_STATES_COUNT = 32;

type PlanRow = { pick: PickItem; box: boolean; straight: boolean; perPlayCost: number; totalCost: number };

interface PlanArgs {
  budget: number;
  picks: PickItem[];
  drawCount: number;       // 1 or 2 (midday and/or evening)
  stateCount: number;      // 1 or ALL_STATES_COUNT
}

function planBudget({ budget, picks, drawCount, stateCount }: PlanArgs): { rows: PlanRow[]; totalSpent: number; leftover: number } {
  const visible = picks.filter(p => !p.locked && p.combo !== '---' && p.combo !== '•••');
  let remaining = Math.max(0, budget);
  const rows: PlanRow[] = [];
  if (drawCount === 0 || stateCount === 0) {
    return { rows, totalSpent: 0, leftover: budget };
  }
  const perPlayCost = STAKE * drawCount * stateCount; // cost of ONE bet type on ONE pick
  // Pass 1: $0.25 box on each visible pick × draws × states, top to bottom.
  for (const pick of visible) {
    if (remaining < perPlayCost) break;
    rows.push({ pick, box: true, straight: false, perPlayCost, totalCost: perPlayCost });
    remaining -= perPlayCost;
  }
  // Pass 2: add straight to top picks.
  for (const row of rows) {
    if (remaining < perPlayCost) break;
    row.straight = true;
    row.totalCost += perPlayCost;
    remaining -= perPlayCost;
  }
  return { rows, totalSpent: budget - remaining, leftover: remaining };
}

interface Props {
  picks: PickItem[];
  scope?: string; // 'midday' | 'evening' | 'allday' — used only to seed the draws checkboxes
}

export function BudgetPlanner({ picks, scope }: Props) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  // Budget input
  const [budgetStr, setBudgetStr] = useState('1.00');
  const budget = useMemo(() => {
    const n = parseFloat(budgetStr.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [budgetStr]);
  const presets = [0.25, 1, 5, 10, 20];

  // Draws — seeded from scope. Allday seeds both; midday/evening seed just one.
  const [playMidday, setPlayMidday] = useState(true);
  const [playEvening, setPlayEvening] = useState(false);
  useEffect(() => {
    const s = (scope ?? '').toLowerCase();
    if (s === 'midday') { setPlayMidday(true); setPlayEvening(false); }
    else if (s === 'evening') { setPlayMidday(false); setPlayEvening(true); }
    else if (s === 'allday') { setPlayMidday(true); setPlayEvening(true); }
  }, [scope]);
  const drawCount = (playMidday ? 1 : 0) + (playEvening ? 1 : 0);
  const drawLabel = playMidday && playEvening ? 'Mid+Eve' : playMidday ? 'Mid' : playEvening ? 'Eve' : '—';

  // State coverage — 1 state (per-state unit cost) or all states.
  const [allStates, setAllStates] = useState(false);
  const stateCount = allStates ? ALL_STATES_COUNT : 1;
  const stateLabel = allStates ? `${ALL_STATES_COUNT}st` : '1st';

  const plan = useMemo(
    () => planBudget({ budget, picks, drawCount, stateCount }),
    [budget, picks, drawCount, stateCount],
  );

  if (picks.filter(p => !p.locked && p.combo !== '---' && p.combo !== '•••').length === 0) return null;

  const visibleCount = plan.rows.length;
  const totalVisible = picks.filter(p => !p.locked && p.combo !== '---' && p.combo !== '•••').length;

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.label}>💰 PLAN MY ARRANGEMENT</Text>
        <Text style={s.headerHint}>Box/Str $0.25 each</Text>
      </View>

      <View style={s.budgetRow}>
        <View style={s.inputWrap}>
          <Text style={s.dollar}>$</Text>
          <TextInput
            style={s.input}
            value={budgetStr}
            onChangeText={setBudgetStr}
            keyboardType="decimal-pad"
            placeholder="1.00"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Budget in dollars"
          />
        </View>
        <View style={s.presetRow}>
          {presets.map(p => (
            <TouchableOpacity key={p} style={[s.preset, budget === p && s.presetOn]} onPress={() => setBudgetStr(p < 1 ? p.toFixed(2) : p.toFixed(0))}>
              <Text style={[s.presetText, budget === p && s.presetTextOn]}>${p < 1 ? p.toFixed(2).replace(/^0/, '') : p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={s.controlRow}>
        <Text style={s.controlLabel}>DRAWS</Text>
        <Pill on={playMidday} label="☀️ Midday" onPress={() => setPlayMidday(v => !v)} accent={colors.gold} />
        <Pill on={playEvening} label="🌙 Evening" onPress={() => setPlayEvening(v => !v)} accent={colors.purple} />
      </View>

      <View style={s.controlRow}>
        <Text style={s.controlLabel}>STATES</Text>
        <Pill on={!allStates} label="1 state" onPress={() => setAllStates(false)} accent={colors.cyan} />
        <Pill on={allStates} label={`All ${ALL_STATES_COUNT}`} onPress={() => setAllStates(true)} accent={colors.cyan} />
      </View>

      {drawCount === 0 ? (
        <Text style={s.emptyMsg}>Select at least one draw to plan an arrangement.</Text>
      ) : plan.rows.length === 0 ? (
        <Text style={s.emptyMsg}>
          Budget below ${(STAKE * drawCount * stateCount).toFixed(2)} (one box across {drawLabel}, {stateLabel}).
        </Text>
      ) : (
        <>
          {plan.rows.map(row => {
            const boxWin = boxPayout(row.pick.multiplicity);
            const winPerHit = row.straight ? STRAIGHT_PAYOUT : boxWin;
            const betLabel = row.box && row.straight ? 'BOX+STR' : row.box ? 'BOX' : 'STR';
            const multSuffix = `× ${drawLabel} × ${stateLabel}`;
            return (
              <View key={row.pick.rank} style={s.planRow}>
                <Text style={s.rank}>#{row.pick.rank}</Text>
                <Text style={s.combo}>{row.pick.combo}</Text>
                <View style={{ flex: 1 }}>
                  <View style={s.betChip}><Text style={s.betChipText}>{betLabel}</Text></View>
                  <Text style={s.betSub}>{multSuffix}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.cost}>${row.totalCost.toFixed(2)}</Text>
                  <Text style={s.win}>→ ${winPerHit.toFixed(2)} / match</Text>
                </View>
              </View>
            );
          })}
          <View style={s.footer}>
            <Text style={s.footerLabel}>
              Total: <Text style={s.footerValue}>${plan.totalSpent.toFixed(2)}</Text>
              {plan.leftover >= 0.01 && (
                <Text style={s.footerLeft}>  ·  ${plan.leftover.toFixed(2)} unplayed</Text>
              )}
              {visibleCount < totalVisible && (
                <Text style={s.footerLeft}>  ·  {visibleCount} of {totalVisible} signals fit</Text>
              )}
            </Text>
            {allStates && (
              <Text style={s.footerNote}>Each arrangement scores independently per state — multi-state increases your chance of catching a match.</Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function Pill({ on, label, onPress, accent }: { on: boolean; label: string; onPress: () => void; accent: string }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  return (
    <TouchableOpacity
      style={[s.pill, on && { backgroundColor: accent + '20', borderColor: accent + '88' }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[s.pillText, on && { color: accent, fontWeight: '900' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.gold + '55',
    gap: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { fontSize: 11, fontWeight: '900', color: colors.gold, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold },
  headerHint: { fontSize: 9, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, letterSpacing: 0.4 },

  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 2 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgElevated, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4, minWidth: 80 },
  dollar: { fontSize: 14, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold },
  input: { fontSize: 16, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, padding: 0, marginLeft: 4, minWidth: 48 },
  presetRow: { flexDirection: 'row', gap: 4, flex: 1, justifyContent: 'flex-end', flexWrap: 'wrap' },
  preset: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  presetOn: { backgroundColor: colors.gold + '22', borderColor: colors.gold + '88' },
  presetText: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, fontFamily: theme.typography.fontFamily.monoBold },
  presetTextOn: { color: colors.gold, fontWeight: '900' },

  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  controlLabel: { fontSize: 9, fontWeight: '900', color: colors.textTertiary, letterSpacing: 1.4, fontFamily: theme.typography.fontFamily.monoBold, minWidth: 50 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  pillText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.3 },

  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border + '55' },
  rank: { fontSize: 10, fontWeight: '900', color: colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold, minWidth: 22 },
  combo: { fontSize: 14, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1.5, minWidth: 44 },
  betChip: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: colors.cyan + '14', borderWidth: 1, borderColor: colors.cyan + '66' },
  betChipText: { fontSize: 9, fontWeight: '900', color: colors.cyan, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 },
  betSub: { fontSize: 9, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, marginTop: 2, letterSpacing: 0.3 },
  cost: { fontSize: 12, color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '900' },
  win: { fontSize: 10, color: colors.gold, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '700', marginTop: 1 },

  footer: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border + '77', gap: 4 },
  footerLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono, lineHeight: 15 },
  footerValue: { color: colors.text, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  footerLeft: { color: colors.textTertiary },
  footerNote: { fontSize: 10, color: colors.textTertiary, fontStyle: 'italic', lineHeight: 14 },

  emptyMsg: { fontSize: 11, color: colors.textTertiary, fontStyle: 'italic', paddingVertical: 4 },
});
