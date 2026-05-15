import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { LoadingPhrase } from '@/components/LoadingPhrase';
import { scopeAccent } from '@/lib/scopeAccent';
import { useFollowedStates } from '@/hooks/useFollowedStates';

const SCOPE_LABEL: Record<string, string> = { midday: 'Midday', evening: 'Evening', allday: 'All Day' };
const SCOPE_ICON: Record<string, string> = { midday: '☀️', evening: '🌙', allday: '◈' };
const SESSION_ICON: Record<string, string> = { morning: '🌅', midday: '☀️', evening: '🌙', night: '🌑' };

const WINDOW_DAYS = 30;

interface HitRow {
  slate_date: string;
  scope: string;
  combo: string;
  rank: number;
  hit_state: string;
  hit_session: string;
  hit_box: boolean;
  hit_straight: boolean;
  hit_result: string;
}

function scopeMatchesSession(scope: string, session: string): boolean {
  const s = (scope ?? '').toLowerCase();
  const d = (session ?? '').toLowerCase();
  if (s === 'allday') return true;
  if (!d) return true;
  return s === d;
}

function formatDateLabel(date: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (date === today) return 'Today';
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (date === yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) return 'Yesterday';
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function lastNDates(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (n - 1));
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export default function TrackRecordScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const sinceDate = useMemo(() => lastNDates(WINDOW_DAYS), []);
  const { followed, toPostgrestFilter } = useFollowedStates();
  const stateFilter = toPostgrestFilter().replace('jurisdiction=', 'hit_state=');

  // BUG-141 (2026-05-13): consolidated from a two-query merge
  // (daily_intelligence primary + adaptive_tracking secondary) into a single
  // adaptive_tracking query. The prior daily_intelligence-based primary was
  // gated on `on_slate=eq.true` and missed hit-orphan rows after regens
  // (today's 916/924 had on_slate=false). adaptive_tracking is slate_hash-
  // keyed: every hit ever recorded survives regen, and the secondary query
  // we already had captures every (combo × matched_state) match. So the
  // primary just becomes the same source.
  //
  // Verified against the live DB on 2026-05-13:
  //   2026-05-13 — daily_intelligence: 0 on-slate hits, adaptive_tracking: 3
  //   2026-05-12 — daily_intelligence: 6, adaptive_tracking: 6 (parity)
  //   2026-05-11 — daily_intelligence: 0, adaptive_tracking: 4 (regen also
  //   hit-orphaned that day's hits)
  // i.e., adaptive_tracking is the strictly-more-complete source.
  const atStateFilter = stateFilter.replace('hit_state=', 'matched_state=');
  const { data: hitRows = [], isLoading } = useQuery<Array<{
    slate_date: string; scope: string; combo: string; rank: number;
    matched_state: string | null; matched_session: string | null;
    hit_box: boolean; hit_straight: boolean; actual_result: string | null;
  }>>({
    queryKey: ['verified_track_record_adaptive_v1', sinceDate, followed.join(',')],
    queryFn: async () => {
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/adaptive_tracking?slate_date=gte.${sinceDate}&matched_state=not.is.null&or=(hit_box.eq.true,hit_straight.eq.true)&mode=in.(balanced,conservative,aggressive)${atStateFilter}&select=slate_date,scope,combo,rank,matched_state,matched_session,hit_box,hit_straight,actual_result&order=slate_date.desc&limit=500`,
      });
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Same scope-validity gate as Results (BUG-132 defense in depth). De-dupe
  // by (date, scope, combo, matched_state) so true duplicates collapse but
  // multi-state matches stay distinct — pick 916 hitting in WI and ME,NH,VT
  // counts as 2 hits, matching BUG-138's display semantics.
  const validHits = useMemo(() => {
    const seen = new Set<string>();
    const merged: HitRow[] = [];
    for (const m of hitRows) {
      if (!m.matched_state) continue;
      if (!scopeMatchesSession(m.scope, m.matched_session ?? '')) continue;
      const k = `${m.slate_date}|${m.scope}|${m.combo}|${m.matched_state}`;
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push({
        slate_date: m.slate_date, scope: m.scope, combo: m.combo, rank: m.rank,
        hit_state: m.matched_state, hit_session: m.matched_session ?? '',
        hit_box: m.hit_box, hit_straight: m.hit_straight,
        hit_result: m.actual_result ?? '',
      });
    }
    return merged;
  }, [hitRows]);

  // Group by date for the stream layout
  const grouped = useMemo(() => {
    const sessionOrder: Record<string, number> = { morning: 0, midday: 1, evening: 2, night: 3 };
    const byDate = new Map<string, HitRow[]>();
    for (const h of validHits) {
      if (!byDate.has(h.slate_date)) byDate.set(h.slate_date, []);
      byDate.get(h.slate_date)!.push(h);
    }
    for (const arr of byDate.values()) {
      arr.sort((a, b) =>
        (sessionOrder[(a.hit_session ?? '').toLowerCase()] ?? 9) - (sessionOrder[(b.hit_session ?? '').toLowerCase()] ?? 9),
      );
    }
    return [...byDate.entries()];
  }, [validHits]);

  // Header summary
  const summary = useMemo(() => {
    const totalHits = validHits.length;
    const straightHits = validHits.filter(h => h.hit_straight).length;
    const boxHits = totalHits - straightHits;
    const distinctDates = new Set(validHits.map(h => h.slate_date)).size;
    const distinctStates = new Set(validHits.map(h => h.hit_state).filter(Boolean)).size;
    return { totalHits, straightHits, boxHits, distinctDates, distinctStates };
  }, [validHits]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityLabel="Back">
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Verified Track Record</Text>
          <Text style={s.subtitle}>Last {WINDOW_DAYS} days · ZK6 K6 hits, draw-by-draw</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator color={colors.cyan} />
          <LoadingPhrase
            style={{ color: colors.textSecondary, fontSize: 12 }}
            phrases={[
              '🧾 Pulling verified hits…',
              '🧾 Cross-checking against draws…',
              '🧾 Sorting your receipts…',
            ]}
          />
        </View>
      ) : validHits.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 32, marginBottom: 10 }}>🧾</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 }}>No verified hits in the last {WINDOW_DAYS} days</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>
            Hits will appear here as your slate matches real draws.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Summary band */}
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              <SummaryStat value={summary.totalHits} label="HITS" color={colors.cyan} />
              <View style={s.summaryDivider} />
              <SummaryStat value={summary.straightHits} label="STRAIGHT" color={colors.gold} />
              <View style={s.summaryDivider} />
              <SummaryStat value={summary.boxHits} label="BOX" color={colors.cyan} />
              <View style={s.summaryDivider} />
              <SummaryStat value={summary.distinctDates} label="DAYS" color={colors.purple} />
            </View>
            <Text style={s.summarySub}>Across {summary.distinctStates} jurisdictions · last {WINDOW_DAYS} days</Text>
          </View>

          {/* Stream */}
          {grouped.map(([date, dateHits]) => (
            <View key={date} style={s.daySection}>
              <View style={s.dayHeader}>
                <Text style={s.dayLabel}>{formatDateLabel(date)}</Text>
                <Text style={s.dayDate}>{date}</Text>
                <View style={s.dayBadge}><Text style={s.dayBadgeText}>{dateHits.length} {dateHits.length === 1 ? 'hit' : 'hits'}</Text></View>
              </View>
              {dateHits.map((h, i) => {
                const tint = scopeAccent(h.scope);
                const sessIcon = SESSION_ICON[(h.hit_session ?? '').toLowerCase()] ?? '◈';
                const isStraight = !!h.hit_straight;
                return (
                  <View key={`${h.combo}-${h.hit_state}-${h.hit_session}-${i}`} style={[s.hitRow, { borderLeftColor: tint }]}>
                    <Text style={s.hitSessIcon}>{sessIcon}</Text>
                    <Text style={s.hitCombo}>{h.combo}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={s.hitMain}>
                        <Text style={[s.hitTypeLabel, { color: isStraight ? colors.gold : colors.cyan }]}>
                          {isStraight ? '⭐ STRAIGHT' : '🎯 BOX'}
                        </Text>
                        {' · '}
                        <Text style={[s.hitScope, { color: tint }]}>{SCOPE_LABEL[h.scope] ?? h.scope}</Text>
                        {' '}
                        {SCOPE_ICON[h.scope] ?? ''}
                      </Text>
                      <Text style={s.hitMeta}>
                        Drew {h.hit_result || '???'} in {h.hit_state || '??'} {h.hit_session || ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SummaryStat({ value, label, color }: { value: number; label: string; color: string }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  return (
    <View style={s.summaryStat}>
      <Text style={[s.summaryValue, { color }]}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
    </View>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.bold },
  subtitle: { fontSize: 11, color: colors.textTertiary, marginTop: 2, fontFamily: theme.typography.fontFamily.mono },

  scroll: { padding: 14, paddingBottom: 40, gap: 12 },

  summaryCard: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: -0.4 },
  summaryLabel: { fontSize: 9, fontWeight: '900', color: colors.textTertiary, letterSpacing: 1.2, fontFamily: theme.typography.fontFamily.monoBold, marginTop: 2 },
  summaryDivider: { width: 1, height: 28, backgroundColor: colors.border },
  summarySub: { fontSize: 10, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono, textAlign: 'center', marginTop: 8, letterSpacing: 0.3 },

  daySection: { gap: 6 },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  dayLabel: { fontSize: 13, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.bold },
  dayDate: { fontSize: 11, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  dayBadge: { marginLeft: 'auto', backgroundColor: colors.gold + '22', borderWidth: 1, borderColor: colors.gold + '66', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  dayBadgeText: { fontSize: 9, fontWeight: '900', color: colors.gold, fontFamily: theme.typography.fontFamily.monoBold },

  hitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: colors.card, borderRadius: 10, borderLeftWidth: 3, borderColor: colors.border, borderWidth: 1 },
  hitSessIcon: { fontSize: 16 },
  hitCombo: { fontSize: 18, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 3, minWidth: 60 },
  hitMain: { fontSize: 11, color: colors.textSecondary },
  hitTypeLabel: { fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 },
  hitScope: { fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  hitMeta: { fontSize: 10, color: colors.textTertiary, marginTop: 2, fontFamily: theme.typography.fontFamily.mono },
});
