import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET } from '@/lib/dateUtils';
import { useFollowedStates } from '@/hooks/useFollowedStates';

interface HitRow {
  scope: string;
  combo: string;
  hit_state: string;
  hit_session: string;
  hit_box: boolean;
  hit_straight: boolean;
}

// End-of-day recap card (enhancements §3.3 in-app variant). Push variant
// deferred until §1.4 phase 2 native pipeline lands. Shows after 8 PM ET
// when at least one K6 hit verified today, falls off at midnight as the
// ET date rolls forward.
function etHourNow(): number {
  try {
    const h = parseInt(
      new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).replace(/[^0-9]/g, ''),
      10,
    );
    return Number.isFinite(h) ? h : 0;
  } catch { return 0; }
}

function scopeMatchesSession(scope: string, session: string): boolean {
  const s = (scope ?? '').toLowerCase();
  const d = (session ?? '').toLowerCase();
  if (s === 'allday') return true;
  if (!d) return true;
  return s === d;
}

export function DailyRecapCard() {
  const today = useMemo(() => getTodayET(), []);
  const hour = etHourNow();
  const { followed, toPostgrestFilter } = useFollowedStates();
  const stateFilter = toPostgrestFilter().replace('jurisdiction=', 'hit_state=');

  const { data: hits = [] } = useQuery<HitRow[]>({
    queryKey: ['daily_recap', today, followed.join(',')],
    queryFn: async () => {
      const rows = await fetchFromSupabase<HitRow[]>({
        path: `/rest/v1/daily_intelligence?slate_date=eq.${today}&on_slate=eq.true&or=(hit_box.eq.true,hit_straight.eq.true)&mode=in.(balanced,conservative,aggressive)${stateFilter}&select=scope,combo,hit_state,hit_session,hit_box,hit_straight&limit=50`,
      });
      const list = Array.isArray(rows) ? rows : [];
      return list.filter(h => scopeMatchesSession(h.scope, h.hit_session));
    },
    enabled: hour >= 20, // only fetch after 8 PM ET
    staleTime: 5 * 60 * 1000,
  });

  if (hour < 20) return null;

  // Miss-day branch (§3.2 absorbed into §3.3): on 0-hit days after 8 PM ET,
  // still render a "tomorrow preview" so users who open late aren't left
  // with no signal at all. Pulls them back tomorrow without manufacturing
  // false enthusiasm.
  if (hits.length === 0) {
    return (
      <TouchableOpacity
        style={[s.card, { borderColor: theme.colors.purple + '66' }]}
        onPress={() => router.push('/track-record')}
        accessibilityRole="button"
        accessibilityLabel="Day's done. Tap to see recent track record."
        activeOpacity={0.85}
      >
        <View style={s.headerRow}>
          <Text style={[s.label, { color: theme.colors.purple }]}>🌙 DAY'S DONE</Text>
          <Text style={s.chev}>›</Text>
        </View>
        <Text style={s.line1}>
          <Text style={s.bold}>0</Text> verified hits today
        </Text>
        <Text style={s.line3}>Tomorrow's slate is fresh after the evening import lands.</Text>
      </TouchableOpacity>
    );
  }

  // Hit-day branch: pick the most "impressive" hit for the headline
  // (prefer straight, then most recent session).
  const sessionOrder: Record<string, number> = { morning: 0, midday: 1, evening: 2, night: 3 };
  const sorted = [...hits].sort((a, b) => {
    if (a.hit_straight && !b.hit_straight) return -1;
    if (!a.hit_straight && b.hit_straight) return 1;
    return (sessionOrder[(b.hit_session ?? '').toLowerCase()] ?? 0) - (sessionOrder[(a.hit_session ?? '').toLowerCase()] ?? 0);
  });
  const top = sorted[0];
  const straightCount = hits.filter(h => h.hit_straight).length;
  const boxCount = hits.length - straightCount;

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => router.push('/track-record')}
      accessibilityRole="button"
      accessibilityLabel={`Today's recap: ${hits.length} hits. Tap for full track record.`}
      activeOpacity={0.85}
    >
      <View style={s.headerRow}>
        <Text style={s.label}>📊 TODAY'S RECAP</Text>
        <Text style={s.chev}>›</Text>
      </View>
      <Text style={s.line1}>
        <Text style={s.bold}>{hits.length}</Text> verified {hits.length === 1 ? 'hit' : 'hits'} today
        {straightCount > 0 && <Text style={s.subStat}> · ⭐ {straightCount} straight</Text>}
        {boxCount > 0 && <Text style={s.subStat}> · 🎯 {boxCount} box</Text>}
      </Text>
      <Text style={s.line2}>
        Top: <Text style={s.bold}>{top.combo}</Text> {top.hit_straight ? 'STRAIGHT' : 'BOX'} in {top.hit_state || '??'} {top.hit_session || ''}
      </Text>
      <Text style={s.line3}>Tomorrow's slate is fresh after the evening import lands.</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: theme.colors.bgElevated, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.gold + '66', gap: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { fontSize: 10, fontWeight: '900', color: theme.colors.gold, letterSpacing: 1.4, fontFamily: theme.typography.fontFamily.monoBold },
  chev: { fontSize: 16, color: theme.colors.textTertiary, fontWeight: '700' },
  line1: { fontSize: 13, color: theme.colors.text, fontFamily: theme.typography.fontFamily.monoBold },
  line2: { fontSize: 11, color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.mono, marginTop: 2 },
  line3: { fontSize: 10, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, fontStyle: 'italic', marginTop: 4 },
  bold: { color: theme.colors.text, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  subStat: { color: theme.colors.textSecondary, fontFamily: theme.typography.fontFamily.mono, fontWeight: '700' },
});
