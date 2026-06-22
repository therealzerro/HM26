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

const SCOPE_ICON: Record<string, string> = { midday: '☀️', evening: '🌙', allday: '◈' };
const SCOPE_LABEL: Record<string, string> = { midday: 'Midday', evening: 'Evening', allday: 'All Day' };

function toComboSet(combo: string): string {
  return '{' + combo.split('').sort().join(',') + '}';
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  }
  return out;
}

function formatDateLabel(date: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (date === today) return 'Today';
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (date === yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) return 'Yesterday';
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
}

function scopeMatchesSession(scope: string, session: string): boolean {
  const s = (scope ?? '').toLowerCase();
  const d = (session ?? '').toLowerCase();
  if (s === 'allday') return true;
  return s === d;
}

interface Snap { scope: string; slate_date: string; top_k_straights_json: any; updated_at_et?: string; deleted_at?: string | null; }
interface Draw { result_digits: string; jurisdiction: string; session: string; date_et: string; }

export default function ReplayScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const dates = useMemo(() => lastNDates(7), []);
  const earliest = dates[dates.length - 1];

  // Include soft-deleted snapshots in the replay window — when a slate is
  // regenerated mid-day after a hit, the engine intentionally excludes the
  // already-drawn box-sets from the new picks AND soft-deletes the old
  // snapshot. The OLD snapshot is where the hitType annotations live; the
  // new active one has no hits. Filtering on deleted_at=is.null would
  // hide today's actual hits.
  const { data: snapshots = [], isLoading: snapsLoading } = useQuery<Snap[]>({
    queryKey: ['replay_snapshots_v2', earliest],
    queryFn: async () => {
      const rows = await fetchFromSupabase<Snap[]>({
        path: `/rest/v1/slate_snapshots?select=scope,slate_date,top_k_straights_json,updated_at_et,deleted_at&mode=in.(balanced,conservative,aggressive)&slate_date=gte.${earliest}&top_k_straights_json=not.is.null&order=slate_date.desc,updated_at_et.desc`,
      });
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Histories exclusion: PR + MD are the only jurisdictions the parser
  // skips (per parseLedger EXCLUDE_STATES_FROM_PARSING). The legacy
  // exclusion (ME,NH,VT,MS,MS2) is obsolete — ME/NH/VT now map to the
  // composite `ME,NH,VT` jurisdiction code (which doesn't match the
  // individual letters in not.in anyway), and MS is a valid active
  // jurisdiction in current imports.
  const { data: draws = [], isLoading: drawsLoading } = useQuery<Draw[]>({
    queryKey: ['replay_draws_v2', earliest],
    queryFn: async () => {
      const rows = await fetchFromSupabase<Draw[]>({
        path: `/rest/v1/histories?select=result_digits,jurisdiction,session,date_et&date_et=gte.${earliest}&jurisdiction=not.in.(PR,MD)&order=date_et.desc,session.asc`,
      });
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const grouped = useMemo(() => {
    type CardData = {
      date: string;
      scope: string;
      picks: Array<{ rank: number; combo: string; comboSet: string; hit: 'box' | 'straight' | null; hitState?: string; hitSession?: string; hitResult?: string; matchCount: number; straightCount: number; boxOnlyCount: number }>;
      draws: Draw[];
      // BUG-141: total match count for this card. A pick that hit in multiple
      // jurisdictions (e.g. 916 today in WI + ME,NH,VT) contributes its
      // multi-state count. `picks.filter(p => p.hit).length` would have given
      // 1 for that pick (since `hit` is a single value); totalMatches gives 2.
      totalMatches: number;
    };

    // For each (date, scope), prefer the snapshot with the most hitType
    // annotations on its picks — that's the slate that actually recorded
    // hits. Mid-day regens can wipe annotations from the active snapshot;
    // the hits live on the soft-deleted older version. Fall back to most
    // recent if no version of the day has hits.
    const candidatesByKey = new Map<string, Snap[]>();
    for (const snap of snapshots) {
      const key = `${snap.slate_date}__${snap.scope}`;
      if (!candidatesByKey.has(key)) candidatesByKey.set(key, []);
      candidatesByKey.get(key)!.push(snap);
    }
    const parsePicks = (raw: any): any[] =>
      Array.isArray(raw) ? raw
      : typeof raw === 'string' ? (() => { try { return JSON.parse(raw || '[]'); } catch { return []; } })()
      : [];
    const chosen = new Map<string, Snap>();
    for (const [key, list] of candidatesByKey) {
      // Score: count hitType-annotated picks. Highest wins; ties broken by
      // most-recent updated_at_et.
      const ranked = list
        .map(s => ({ s, hits: parsePicks(s.top_k_straights_json).filter((p: any) => p?.hitType).length }))
        .sort((a, b) => {
          if (b.hits !== a.hits) return b.hits - a.hits;
          return (b.s.updated_at_et ?? '').localeCompare(a.s.updated_at_et ?? '');
        });
      chosen.set(key, ranked[0].s);
    }
    const cards: CardData[] = [];
    for (const snap of chosen.values()) {
      const picks = parsePicks(snap.top_k_straights_json);
      const dayDraws = draws.filter(d =>
        (d.date_et?.split('T')[0] === snap.slate_date) && scopeMatchesSession(snap.scope, d.session)
      );
      // BUG-141: track ALL matching draws per comboSet, not just the last
      // one. A combo can hit in multiple jurisdictions on the same day (e.g.
      // 916 hit in WI 619 AND ME,NH,VT 196 today) and the prior single-Map
      // logic discarded the additional matches.
      const drawsBySet = new Map<string, Draw[]>();
      for (const d of dayDraws) {
        const cs = toComboSet(d.result_digits);
        if (!drawsBySet.has(cs)) drawsBySet.set(cs, []);
        drawsBySet.get(cs)!.push(d);
      }

      let cardTotalMatches = 0;
      const cardPicks = picks.slice(0, 6).map((p: any, i: number) => {
        const combo = String(p.combo ?? '');
        const set = toComboSet(combo);
        const matches = drawsBySet.get(set) ?? [];
        // For the pick pill: prefer a straight hit as the displayed marker;
        // otherwise show the first box match. The total-count badge below
        // surfaces the full multi-state count.
        const straightMatch = matches.find(m => m.result_digits === combo);
        const matched = straightMatch ?? matches[0];
        const hit = matches.length === 0 ? null : (straightMatch ? 'straight' as const : 'box' as const);
        // A box-set can match in multiple jurisdictions on one day; some of those
        // draws may land the exact straight order, the rest are box-only. Track
        // the two counts SEPARATELY so the pill doesn't render the total
        // box-match count next to the straight star (which read as "straight ×N"
        // when really it was 1 straight + N-1 box — e.g. 6/15 midday {1,5,8}).
        const straightCount = matches.filter(m => m.result_digits === combo).length;
        const boxOnlyCount = matches.length - straightCount;
        cardTotalMatches += matches.length;
        return {
          rank: p.rank ?? i + 1,
          combo,
          comboSet: set,
          hit,
          hitState: matched?.jurisdiction,
          hitSession: matched?.session,
          hitResult: matched?.result_digits,
          matchCount: matches.length,
          straightCount,
          boxOnlyCount,
        };
      });

      cards.push({ date: snap.slate_date, scope: snap.scope, picks: cardPicks, draws: dayDraws, totalMatches: cardTotalMatches });
    }

    // Group by date (descending by date_et based on input order)
    const byDate = new Map<string, CardData[]>();
    for (const c of cards) {
      if (!byDate.has(c.date)) byDate.set(c.date, []);
      byDate.get(c.date)!.push(c);
    }
    // Order each day's scope cards: midday → evening → allday
    const scopeOrder: Record<string, number> = { midday: 0, evening: 1, allday: 2 };
    for (const arr of byDate.values()) {
      arr.sort((a, b) => (scopeOrder[a.scope] ?? 9) - (scopeOrder[b.scope] ?? 9));
    }
    return [...byDate.entries()];
  }, [snapshots, draws]);

  const isLoading = snapsLoading || drawsLoading;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Replay</Text>
          <Text style={s.subtitle}>Last 7 days · ZK6 signals vs actual draws</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator color={colors.cyan} />
          <LoadingPhrase
            style={{ color: colors.textSecondary, fontSize: 12 }}
            phrases={[
              '⏪ Rewinding the tape…',
              '⏪ Pulling slate snapshots…',
              '⏪ Cross-checking draws…',
              '⏪ Stitching matches to signals…',
            ]}
          />
        </View>
      ) : grouped.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 32, marginBottom: 10 }}>📼</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 }}>No slates in the last 7 days</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>
            Generate a slate to start building your replay history.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {grouped.map(([date, cards]) => {
            // BUG-141: use totalMatches (sums per-pick match counts) instead
            // of picks.filter(p => p.hit).length (counts hit picks). Multi-
            // state matches each count separately, matching the band/feed
            // display semantics elsewhere.
            const totalHits = cards.reduce((sum, c) => sum + c.totalMatches, 0);
            return (
              <View key={date} style={s.daySection}>
                <View style={s.dayHeader}>
                  <Text style={s.dayLabel}>{formatDateLabel(date)}</Text>
                  <Text style={s.dayDate}>{date}</Text>
                  {totalHits > 0 && (
                    <View style={s.dayHitsBadge}>
                      <Text style={s.dayHitsText}>🎯 {totalHits} {totalHits === 1 ? 'match' : 'matches'}</Text>
                    </View>
                  )}
                </View>
                {cards.map(card => {
                  // BUG-141: count multi-state matches separately.
                  const hits = card.totalMatches;
                  return (
                    <View key={card.scope} style={s.scopeCard}>
                      <View style={s.scopeHeader}>
                        <Text style={s.scopeLabel}>{SCOPE_ICON[card.scope] ?? '◈'} {SCOPE_LABEL[card.scope] ?? card.scope}</Text>
                        <View style={{ flex: 1 }} />
                        {hits > 0 ? (
                          <Text style={s.scopeHitsBadge}>{hits} match{hits === 1 ? '' : 'es'}</Text>
                        ) : (
                          <Text style={s.scopeMissedBadge}>0 matches</Text>
                        )}
                      </View>
                      <View style={s.picksGrid}>
                        {card.picks.map(p => (
                          <View key={p.rank} style={[s.pickPill, p.hit === 'straight' && s.pickPillStraight, p.hit === 'box' && s.pickPillBox]}>
                            <Text style={[s.pickRank, p.hit && { color: colors.bgElevated }]}>#{p.rank}</Text>
                            <Text style={[s.pickCombo, p.hit && { color: colors.bgElevated }]}>{p.combo || '•••'}</Text>
                            {p.hit && (
                              <Text style={s.pickHitMark}>
                                {p.straightCount > 0 ? `⭐${p.straightCount > 1 ? `×${p.straightCount}` : ''}` : ''}
                                {p.straightCount > 0 && p.boxOnlyCount > 0 ? ' ' : ''}
                                {p.boxOnlyCount > 0 ? `🎯${p.boxOnlyCount > 1 ? `×${p.boxOnlyCount}` : ''}` : ''}
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                      {card.draws.length > 0 ? (
                        <Text style={s.drawsLine} numberOfLines={2}>
                          Drew: {card.draws.slice(0, 6).map(d => `${d.jurisdiction} ${d.result_digits}`).join(' · ')}{card.draws.length > 6 ? ` · +${card.draws.length - 6} more` : ''}
                        </Text>
                      ) : (
                        <Text style={s.drawsLineEmpty}>No draws recorded for this scope.</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const makeS = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.bold },
  subtitle: { fontSize: 11, color: colors.textTertiary, marginTop: 2, fontFamily: theme.typography.fontFamily.mono },

  scroll: { padding: 14, paddingBottom: 32, gap: 14 },

  daySection: { gap: 8 },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  dayLabel: { fontSize: 14, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.bold },
  dayDate: { fontSize: 11, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  dayHitsBadge: { marginLeft: 'auto', backgroundColor: colors.gold + '22', borderWidth: 1, borderColor: colors.gold + '66', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  dayHitsText: { fontSize: 10, fontWeight: '900', color: colors.gold, fontFamily: theme.typography.fontFamily.monoBold },

  scopeCard: { backgroundColor: colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 8 },
  scopeHeader: { flexDirection: 'row', alignItems: 'center' },
  scopeLabel: { fontSize: 12, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.5 },
  scopeHitsBadge: { fontSize: 10, fontWeight: '900', color: colors.cyan, fontFamily: theme.typography.fontFamily.monoBold },
  scopeMissedBadge: { fontSize: 10, fontWeight: '700', color: colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold },

  picksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.bgElevated, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: colors.border },
  pickPillBox: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  pickPillStraight: { backgroundColor: colors.gold, borderColor: colors.gold },
  pickRank: { fontSize: 9, fontWeight: '900', color: colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold },
  pickCombo: { fontSize: 13, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1 },
  pickHitMark: { fontSize: 11 },

  drawsLine: { fontSize: 10, color: colors.textSecondary, lineHeight: 14, fontFamily: theme.typography.fontFamily.mono },
  drawsLineEmpty: { fontSize: 10, color: colors.textTertiary, fontStyle: 'italic' },
});
