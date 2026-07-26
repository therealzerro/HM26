// components/analytics/FootprintPanel.tsx — ENH-ANALYTICS-01
//
// Footprint search: enter any 3-digit pattern and see every appearance in
// the observed drawing results — jurisdiction footprint, drawn orderings,
// and observed-vs-expected frequency. Rendered on admin (Analytics view)
// and consumer (Pattern Explorer) surfaces; strings must stay brand-safe.

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/lib/theme';
import { theme } from '@/constants/theme';
import { useDrawWindow } from '@/hooks/useDrawWindow';
import { WINDOW_LABELS, type SessionFilter, type WindowKey } from '@/lib/analytics/drawWindow';
import { computeFootprint } from '@/lib/analytics/patternStats';
import {
  Chip,
  ChipRow,
  CountBar,
  DescriptiveNote,
  fmtExpected,
  fmtRatio,
  useAnalyticsStyles,
} from './analyticsShared';

const SESSIONS: SessionFilter[] = ['all', 'midday', 'evening'];
const WINDOWS: WindowKey[] = ['30d', '90d', 'clean'];
const APPEARANCE_DISPLAY_CAP = 40;

export default function FootprintPanel() {
  const { colors } = useTheme();
  const st = useAnalyticsStyles();
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [win, setWin] = useState<WindowKey>('90d');
  const [session, setSession] = useState<SessionFilter>('all');
  const { rows, isLoading, error, refetch } = useDrawWindow(win);

  const result = useMemo(
    () => (submitted ? computeFootprint(rows, submitted, session) : null),
    [rows, submitted, session],
  );

  const search = () => {
    if (/^\d{3}$/.test(input)) setSubmitted(input);
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={st.card}>
        <Text style={st.label}>3-digit pattern</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <TextInput
            value={input}
            onChangeText={t => setInput(t.replace(/\D/g, '').slice(0, 3))}
            onSubmitEditing={search}
            keyboardType="number-pad"
            maxLength={3}
            placeholder="e.g. 146"
            placeholderTextColor={colors.textTertiary}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: theme.borderRadius.md,
              paddingHorizontal: 12,
              paddingVertical: 8,
              fontSize: 16,
              fontFamily: theme.typography.fontFamily.mono,
              color: colors.text,
              backgroundColor: colors.background,
            }}
          />
          <TouchableOpacity
            onPress={search}
            disabled={!/^\d{3}$/.test(input)}
            style={{
              backgroundColor: /^\d{3}$/.test(input) ? colors.primary : colors.border,
              borderRadius: theme.borderRadius.md,
              paddingHorizontal: 18,
              justifyContent: 'center',
            }}
          >
            {/* Enabled: '#fff' on the saturated primary fill is correct in both
                modes (LIGHT-01). Disabled: the fill is colors.border, so the
                label needs theme ink to stay readable on light. */}
            <Text
              style={{
                color: /^\d{3}$/.test(input) ? '#fff' : colors.textTertiary,
                fontWeight: '700',
                fontSize: 13,
              }}
            >
              Search
            </Text>
          </TouchableOpacity>
        </View>
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

      {!isLoading && !error && result && (
        <>
          <View style={st.card}>
            <Text style={st.sectionTitle}>
              {result.digits} · {result.mult} · set {result.comboSet}
            </Text>
            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 6 }}>
              <View>
                <Text style={st.label}>Observed</Text>
                <Text style={st.bigStat}>{result.observed}</Text>
              </View>
              <View>
                <Text style={st.label}>Expected</Text>
                <Text style={st.bigStat}>{fmtExpected(result.expected)}</Text>
              </View>
              <View>
                <Text style={st.label}>Ratio</Text>
                <Text style={st.bigStat}>
                  {result.expected > 0 ? fmtRatio(result.observed / result.expected) : '—'}
                </Text>
              </View>
            </View>
            <Text style={st.cell}>
              Across {result.totalDraws.toLocaleString()} draws in window · last seen{' '}
              {result.lastSeen ?? 'never in window'} · {result.drawsSince.toLocaleString()} draws
              since
            </Text>
          </View>

          {result.orderBreakdown.length > 0 && (
            <View style={st.card}>
              <Text style={st.sectionTitle}>Drawn orderings</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {result.orderBreakdown.map(o => (
                  <View
                    key={o.order}
                    style={{
                      flexDirection: 'row',
                      gap: 4,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={st.mono}>{o.order}</Text>
                    <Text style={st.cellDim}>×{o.count}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {result.byJurisdiction.length > 0 && (
            <View style={st.card}>
              <Text style={st.sectionTitle}>Jurisdiction footprint</Text>
              {result.byJurisdiction.map(j => (
                <View key={j.jurisdiction} style={st.statRow}>
                  <Text style={[st.mono, { width: 90, fontSize: 12 }]} numberOfLines={1}>
                    {j.jurisdiction}
                  </Text>
                  <Text style={[st.cell, { width: 36 }]}>×{j.count}</Text>
                  <CountBar value={j.count} max={result.byJurisdiction[0].count} />
                  <Text style={st.cellDim}>last {j.lastDate}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={st.card}>
            <Text style={st.sectionTitle}>Appearances</Text>
            {result.appearances.length === 0 && (
              <Text style={st.cell}>No appearances in this window.</Text>
            )}
            {result.appearances.slice(0, APPEARANCE_DISPLAY_CAP).map((a, i) => (
              <View key={`${a.date_et}-${a.jurisdiction}-${i}`} style={st.statRow}>
                <Text style={[st.cell, { width: 84 }]}>{a.date_et}</Text>
                <Text style={[st.cell, { width: 64 }]}>{a.session}</Text>
                <Text style={[st.cell, { flex: 1 }]} numberOfLines={1}>
                  {a.jurisdiction ?? '—'}
                </Text>
                <Text style={st.mono}>{a.result_digits}</Text>
              </View>
            ))}
            {result.appearances.length > APPEARANCE_DISPLAY_CAP && (
              <Text style={[st.cellDim, { marginTop: 6 }]}>
                Showing newest {APPEARANCE_DISPLAY_CAP} of {result.appearances.length}.
              </Text>
            )}
          </View>
        </>
      )}

      {!isLoading && !result && !error && (
        <Text style={[st.cellDim, { marginTop: 4 }]}>
          Enter any 3-digit pattern to see its full appearance history across all tracked
          jurisdictions.
        </Text>
      )}

      <DescriptiveNote />
    </ScrollView>
  );
}
