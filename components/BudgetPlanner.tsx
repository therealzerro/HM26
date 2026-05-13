import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { theme } from '@/constants/theme';
import type { PickItem } from '@/components/PickCard';

// Pick 3 player logic per user direction (2026-05-12):
//   Straight ($0.25 stake) → $225 payout
//   Box ($0.25 stake) → singles $37.50 · doubles $75 · triples $225
const STAKE = 0.25;
const STRAIGHT_PAYOUT = 225;
function boxPayout(multiplicity?: string): number {
  switch ((multiplicity ?? '').toLowerCase()) {
    case 'doubles': return 75;
    case 'triples': return 225;
    default:        return 37.5; // singles + unknown default
  }
}

type PlanRow = { pick: PickItem; box: boolean; straight: boolean; cost: number };

function planBudget(budget: number, picks: PickItem[]): { rows: PlanRow[]; totalSpent: number; leftover: number } {
  const visible = picks.filter(p => !p.locked && p.combo !== '---' && p.combo !== '•••');
  let remaining = Math.max(0, budget);
  const rows: PlanRow[] = [];
  // Pass 1: $0.25 box on each visible pick, top-down.
  for (const pick of visible) {
    if (remaining < STAKE) break;
    rows.push({ pick, box: true, straight: false, cost: STAKE });
    remaining -= STAKE;
  }
  // Pass 2: add $0.25 straight to top picks if budget remains.
  for (const row of rows) {
    if (remaining < STAKE) break;
    row.straight = true;
    row.cost += STAKE;
    remaining -= STAKE;
  }
  const totalSpent = budget - remaining;
  return { rows, totalSpent, leftover: remaining };
}

interface Props {
  picks: PickItem[];
}

export function BudgetPlanner({ picks }: Props) {
  const [budgetStr, setBudgetStr] = useState('5.00');
  const budget = useMemo(() => {
    const n = parseFloat(budgetStr.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [budgetStr]);
  const plan = useMemo(() => planBudget(budget, picks), [budget, picks]);

  const presets = [1, 5, 10, 20];

  if (picks.filter(p => !p.locked && p.combo !== '---' && p.combo !== '•••').length === 0) return null;

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <Text style={s.label}>💰 PLAN MY PLAY</Text>
        <Text style={s.headerHint}>Box $0.25 · Str $0.25</Text>
      </View>

      <View style={s.budgetRow}>
        <View style={s.inputWrap}>
          <Text style={s.dollar}>$</Text>
          <TextInput
            style={s.input}
            value={budgetStr}
            onChangeText={setBudgetStr}
            keyboardType="decimal-pad"
            placeholder="5.00"
            placeholderTextColor={theme.colors.textTertiary}
            accessibilityLabel="Budget in dollars"
          />
        </View>
        <View style={s.presetRow}>
          {presets.map(p => (
            <TouchableOpacity key={p} style={[s.preset, budget === p && s.presetOn]} onPress={() => setBudgetStr(p.toFixed(2))}>
              <Text style={[s.presetText, budget === p && s.presetTextOn]}>${p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {plan.rows.length === 0 ? (
        <Text style={s.emptyMsg}>Budget is below the $0.25 minimum stake. Try $1 or $5.</Text>
      ) : (
        <>
          {plan.rows.map(row => {
            const boxWin = boxPayout(row.pick.multiplicity);
            const totalWin = (row.box ? boxWin : 0) + (row.straight ? STRAIGHT_PAYOUT : 0);
            const betLabel = row.box && row.straight ? 'BOX + STR' : row.box ? 'BOX' : 'STR';
            return (
              <View key={row.pick.rank} style={s.planRow}>
                <Text style={s.rank}>#{row.pick.rank}</Text>
                <Text style={s.combo}>{row.pick.combo}</Text>
                <View style={s.betChip}><Text style={s.betChipText}>{betLabel}</Text></View>
                <View style={{ flex: 1 }} />
                <Text style={s.cost}>${row.cost.toFixed(2)}</Text>
                <Text style={s.win}>→ ${totalWin.toFixed(2)}</Text>
              </View>
            );
          })}
          <View style={s.footer}>
            <Text style={s.footerLabel}>
              Total: <Text style={s.footerValue}>${plan.totalSpent.toFixed(2)}</Text>
              {plan.leftover >= 0.01 && (
                <Text style={s.footerLeft}>  ·  ${plan.leftover.toFixed(2)} unplayed</Text>
              )}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.gold + '55',
    gap: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { fontSize: 11, fontWeight: '900', color: theme.colors.gold, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold },
  headerHint: { fontSize: 9, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, letterSpacing: 0.4 },

  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.bgElevated, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 10, paddingVertical: 4, minWidth: 96 },
  dollar: { fontSize: 14, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold },
  input: { fontSize: 16, fontWeight: '900', color: theme.colors.text, fontFamily: theme.typography.fontFamily.monoBold, padding: 0, marginLeft: 4, minWidth: 56 },
  presetRow: { flexDirection: 'row', gap: 4, flex: 1, justifyContent: 'flex-end' },
  preset: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: theme.colors.bgElevated, borderWidth: 1, borderColor: theme.colors.border },
  presetOn: { backgroundColor: theme.colors.gold + '22', borderColor: theme.colors.gold + '88' },
  presetText: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.monoBold },
  presetTextOn: { color: theme.colors.gold, fontWeight: '900' },

  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.colors.border + '55' },
  rank: { fontSize: 10, fontWeight: '900', color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold, minWidth: 22 },
  combo: { fontSize: 14, fontWeight: '900', color: theme.colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1.5, minWidth: 44 },
  betChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: theme.colors.cyan + '14', borderWidth: 1, borderColor: theme.colors.cyan + '66' },
  betChipText: { fontSize: 9, fontWeight: '900', color: theme.colors.cyan, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 },
  cost: { fontSize: 11, color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.mono, fontWeight: '700' },
  win: { fontSize: 11, color: theme.colors.gold, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '900', minWidth: 60, textAlign: 'right' },

  footer: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.border + '77' },
  footerLabel: { fontSize: 11, color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.mono },
  footerValue: { color: theme.colors.text, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  footerLeft: { color: theme.colors.textTertiary },

  emptyMsg: { fontSize: 11, color: theme.colors.textTertiary, fontStyle: 'italic', paddingVertical: 4 },
});
