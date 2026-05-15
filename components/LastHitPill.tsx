import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { useFollowedStates } from '@/hooks/useFollowedStates';

interface HitRow {
  slate_date: string;
  scope: string;
  combo: string;
  hit_state: string;
  hit_session: string;
  hit_box: boolean;
  hit_straight: boolean;
}

const LOOKBACK_DAYS = 7;

function lookbackSinceDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - (LOOKBACK_DAYS - 1));
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function formatHitWhen(slateDate: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (slateDate === today) return 'today';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (slateDate === y.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) return 'yesterday';
  // Approx N days ago
  const daysAgo = Math.max(2, Math.round(
    (new Date(today + 'T12:00:00Z').getTime() - new Date(slateDate + 'T12:00:00Z').getTime()) / 86400000,
  ));
  return `${daysAgo}d ago`;
}

function scopeMatchesSession(scope: string, session: string): boolean {
  const s = (scope ?? '').toLowerCase();
  const d = (session ?? '').toLowerCase();
  if (s === 'allday') return true;
  if (!d) return true;
  return s === d;
}

/**
 * Compact persistent pill: "🎯 Last hit · 605 · MS · 2d ago" → tapping
 * opens the Verified Track Record screen. Suppressed when no K6 hit
 * occurred in the last LOOKBACK_DAYS so stale/distant wins don't get
 * surfaced as "fresh news."
 */
export function LastHitPill() {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const sinceDate = useMemo(() => lookbackSinceDate(), []);
  const { followed, toPostgrestFilter } = useFollowedStates();
  const stateFilter = toPostgrestFilter().replace('jurisdiction=', 'hit_state=');

  // BUG-141 (2026-05-13): migrated from daily_intelligence?on_slate=eq.true
  // to adaptive_tracking. The prior query missed today's hits whenever a
  // mid-day regen orphaned them (on_slate=false), causing the pill to fall
  // back to YESTERDAY's last hit and display stale "yesterday" text on
  // days when fresh hits actually existed.
  const matchedStateFilter = stateFilter.replace('hit_state=', 'matched_state=');
  const { data: hit } = useQuery<HitRow | null>({
    queryKey: ['last_hit_pill_adaptive_v1', sinceDate, followed.join(',')],
    queryFn: async () => {
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/adaptive_tracking?slate_date=gte.${sinceDate}&matched_state=not.is.null&or=(hit_box.eq.true,hit_straight.eq.true)&mode=in.(balanced,conservative,aggressive)${matchedStateFilter}&select=slate_date,scope,combo,matched_state,matched_session,hit_box,hit_straight&order=slate_date.desc&limit=50`,
      });
      const list = (Array.isArray(rows) ? rows : []).map(r => ({
        slate_date: r.slate_date,
        scope: r.scope,
        combo: r.combo,
        hit_state: r.matched_state ?? '',
        hit_session: r.matched_session ?? '',
        hit_box: !!r.hit_box,
        hit_straight: !!r.hit_straight,
      }));
      // Server orders by slate_date.desc only — within a single day we need
      // session order (latest session first) so an evening hit beats a midday
      // hit when both landed today.
      const sessionOrder: Record<string, number> = { morning: 0, midday: 1, evening: 2, night: 3 };
      list.sort((a, b) => {
        if (a.slate_date !== b.slate_date) return a.slate_date < b.slate_date ? 1 : -1;
        return (sessionOrder[(b.hit_session ?? '').toLowerCase()] ?? 0)
             - (sessionOrder[(a.hit_session ?? '').toLowerCase()] ?? 0);
      });
      const valid = list.find(r => scopeMatchesSession(r.scope, r.hit_session));
      return valid ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!hit) return null;

  const isStraight = !!hit.hit_straight;
  const accent = isStraight ? colors.gold : colors.cyan;
  const when = formatHitWhen(hit.slate_date);
  const label = isStraight ? 'STRAIGHT' : 'BOX';

  return (
    <TouchableOpacity
      style={[s.pill, { borderColor: accent + '88', backgroundColor: accent + '10' }]}
      onPress={() => router.push('/track-record')}
      accessibilityRole="button"
      accessibilityLabel={`Last hit: ${hit.combo} in ${hit.hit_state} ${when}. Tap to open verified track record.`}
      activeOpacity={0.85}
    >
      <Text style={s.icon}>🎯</Text>
      <Text style={s.label}>LAST HIT</Text>
      <Text style={[s.combo, { color: accent }]}>{hit.combo}</Text>
      <Text style={s.meta}>· {hit.hit_state || '??'} · {when}</Text>
      <View style={[s.tag, { borderColor: accent }]}>
        <Text style={[s.tagText, { color: accent }]}>{label}</Text>
      </View>
      <Text style={s.chev}>›</Text>
    </TouchableOpacity>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
  },
  icon: { fontSize: 13 },
  label: { fontSize: 9, fontWeight: '900', color: colors.textTertiary, letterSpacing: 1.4, fontFamily: theme.typography.fontFamily.monoBold },
  combo: { fontSize: 13, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1.5 },
  meta: { flex: 1, fontSize: 10, color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  tagText: { fontSize: 8, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 },
  chev: { fontSize: 16, color: colors.textTertiary, marginLeft: 2 },
});
