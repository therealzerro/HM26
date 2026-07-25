// components/analytics/PatternStatsPanel.tsx — ENH-ANALYTICS-01
//
// Expected-vs-observed explorer: all 220 unordered sets, or digit pairs
// (any-position / front / split / back), with observed count, expected
// baseline, ratio, and gap. Rendered on admin and consumer surfaces;
// strings must stay brand-safe.

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useDrawWindow } from '@/hooks/useDrawWindow';
import { WINDOW_LABELS, type SessionFilter, type WindowKey } from '@/lib/analytics/drawWindow';
import {
  computeComboStats,
  computePairStats,
  PAIR_MODE_LABELS,
  type PairMode,
  type StatRow,
  type StatSort,
} from '@/lib/analytics/patternStats';
import type { Multiplicity } from '@/lib/analytics/expectedMath';
import {
  Chip,
  ChipRow,
  DescriptiveNote,
  fmtExpected,
  fmtRatio,
  RatioBar,
  useAnalyticsStyles,
} from './analyticsShared';

const SESSIONS: SessionFilter[] = ['all', 'midday', 'evening'];
const WINDOWS: WindowKey[] = ['30d', '90d', 'clean'];
const MULTS: ('all' | Multiplicity)[] = ['all', 'singles', 'doubles', 'triples'];
const PAIR_MODES: PairMode[] = ['any', 'front', 'split', 'back'];
const SORTS: { id: StatSort; label: string }[] = [
  { id: 'observed', label: 'Most observed' },
  { id: 'ratio', label: 'Ratio' },
  { id: 'gap', label: 'Longest gap' },
];

export default function PatternStatsPanel() {
  const { colors } = useTheme();
  const st = useAnalyticsStyles();
  const [mode, setMode] = useState<'sets' | 'pairs'>('sets');
  const [win, setWin] = useState<WindowKey>('90d');
  const [session, setSession] = useState<SessionFilter>('all');
  const [multFilter, setMultFilter] = useState<'all' | Multiplicity>('all');
  const [pairMode, setPairMode] = useState<PairMode>('any');
  const [sort, setSort] = useState<StatSort>('observed');
  const { rows, isLoading, error, refetch } = useDrawWindow(win);

  const stats = useMemo(
    () =>
      mode === 'sets'
        ? computeComboStats(rows, session, multFilter, sort)
        : computePairStats(rows, session, pairMode, sort),
    [rows, mode, session, multFilter, pairMode, sort],
  );

  const header = (
    <View>
      <View style={st.card}>
        <ChipRow>
          <Chip label="Sets" active={mode === 'sets'} onPress={() => setMode('sets')} />
          <Chip label="Pairs" active={mode === 'pairs'} onPress={() => setMode('pairs')} />
        </ChipRow>
        <ChipRow>
          {WINDOWS.map(w => (
            <Chip key={w} label={WINDOW_LABELS[w]} active={win === w} onPress={() => setWin(w)} />
          ))}
        </ChipRow>
        <ChipRow>
          {SESSIONS.map(s => (
            <Chip
              key={s}
              label={s === 'all' ? 'All sessions' : s}
              active={session === s}
              onPress={() => setSession(s)}
            />
          ))}
        </ChipRow>
        {mode === 'sets' ? (
          <ChipRow>
            {MULTS.map(m => (
              <Chip key={m} label={m} active={multFilter === m} onPress={() => setMultFilter(m)} />
            ))}
          </ChipRow>
        ) : (
          <ChipRow>
            {PAIR_MODES.map(p => (
              <Chip
                key={p}
                label={PAIR_MODE_LABELS[p]}
                active={pairMode === p}
                onPress={() => setPairMode(p)}
              />
            ))}
          </ChipRow>
        )}
        <ChipRow>
          {SORTS.map(s => (
            <Chip key={s.id} label={s.label} active={sort === s.id} onPress={() => setSort(s.id)} />
          ))}
        </ChipRow>
        {!isLoading && !error && (
          <Text style={st.cellDim}>
            {stats.totalDraws.toLocaleString()} draws in window · expected = draws × per-draw
            probability
          </Text>
        )}
      </View>

      {isLoading && (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[st.cellDim, { marginTop: 8 }]}>Loading drawing history…</Text>
        </View>
      )}
      {error && (
        <TouchableOpacity onPress={() => refetch()}>
          <Text style={st.error}>Could not load drawing history. Tap to retry.</Text>
        </TouchableOpacity>
      )}

      {!isLoading && !error && (
        <View style={[st.statRow, { borderBottomWidth: 0, paddingVertical: 2 }]}>
          <Text style={[st.cellDim, { width: 56 }]}>pattern</Text>
          <Text style={[st.cellDim, { width: 40, textAlign: 'right' }]}>obs</Text>
          <Text style={[st.cellDim, { width: 40, textAlign: 'right' }]}>exp</Text>
          <Text style={[st.cellDim, { width: 92, textAlign: 'center' }]}>vs expected</Text>
          <Text style={[st.cellDim, { flex: 1, textAlign: 'right' }]}>gap (draws)</Text>
        </View>
      )}
    </View>
  );

  const renderRow = ({ item }: { item: StatRow }) => (
    <View style={st.statRow}>
      <Text style={[st.mono, { width: 56 }]}>{item.key}</Text>
      <Text style={[st.cell, { width: 40, textAlign: 'right' }]}>{item.observed}</Text>
      <Text style={[st.cellDim, { width: 40, textAlign: 'right' }]}>
        {fmtExpected(item.expected)}
      </Text>
      {/* DESIGN-02 T1.5: the ratio — the whole point of the table — gets a
          diverging bar around the 1.0× baseline, not just a number */}
      <View style={{ width: 92, alignItems: 'center', gap: 2 }}>
        <Text style={[st.cell, { fontSize: 10 }]}>{fmtRatio(item.ratio)}</Text>
        <RatioBar ratio={item.ratio} width={80} />
      </View>
      <Text style={[st.cellDim, { flex: 1, textAlign: 'right' }]}>
        {item.lastSeen ? item.drawsSince.toLocaleString() : 'never'}
      </Text>
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      data={isLoading || error ? [] : stats.rows}
      keyExtractor={item => item.key}
      renderItem={renderRow}
      ListHeaderComponent={header}
      ListFooterComponent={<DescriptiveNote />}
      initialNumToRender={30}
      windowSize={10}
    />
  );
}
