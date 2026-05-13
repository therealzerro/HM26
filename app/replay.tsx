import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
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
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
      picks: Array<{ rank: number; combo: string; comboSet: string; hit: 'box' | 'straight' | null; hitState?: string; hitSession?: string; hitResult?: string }>;
      draws: Draw[];
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
      const drawSetMap = new Map<string, Draw>();
      for (const d of dayDraws) drawSetMap.set(toComboSet(d.result_digits), d);

      const cardPicks = picks.slice(0, 6).map((p: any, i: number) => {
        const combo = String(p.combo ?? '');
        const set = toComboSet(combo);
        const matched = drawSetMap.get(set);
        const isStraight = matched && matched.result_digits === combo;
        const hit = matched ? (isStraight ? 'straight' as const : 'box' as const) : null;
        return {
          rank: p.rank ?? i + 1,
          combo,
          comboSet: set,
          hit,
          hitState: matched?.jurisdiction,
          hitSession: matched?.session,
          hitResult: matched?.result_digits,
        };
      });

      cards.push({ date: snap.slate_date, scope: snap.scope, picks: cardPicks, draws: dayDraws });
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
          <ChevronLeft size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Replay</Text>
          <Text style={s.subtitle}>Last 7 days · ZK6 picks vs actual draws</Text>
        </View>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator color={theme.colors.cyan} />
          <LoadingPhrase
            style={{ color: theme.colors.textSecondary, fontSize: 12 }}
            phrases={[
              '⏪ Rewinding the tape…',
              '⏪ Pulling slate snapshots…',
              '⏪ Cross-checking draws…',
              '⏪ Stitching hits to picks…',
            ]}
          />
        </View>
      ) : grouped.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 32, marginBottom: 10 }}>📼</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>No slates in the last 7 days</Text>
          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center' }}>
            Generate a slate to start building your replay history.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {grouped.map(([date, cards]) => {
            const totalHits = cards.reduce((sum, c) => sum + c.picks.filter(p => p.hit).length, 0);
            return (
              <View key={date} style={s.daySection}>
                <View style={s.dayHeader}>
                  <Text style={s.dayLabel}>{formatDateLabel(date)}</Text>
                  <Text style={s.dayDate}>{date}</Text>
                  {totalHits > 0 && (
                    <View style={s.dayHitsBadge}>
                      <Text style={s.dayHitsText}>🎯 {totalHits} {totalHits === 1 ? 'hit' : 'hits'}</Text>
                    </View>
                  )}
                </View>
                {cards.map(card => {
                  const hits = card.picks.filter(p => p.hit).length;
                  return (
                    <View key={card.scope} style={s.scopeCard}>
                      <View style={s.scopeHeader}>
                        <Text style={s.scopeLabel}>{SCOPE_ICON[card.scope] ?? '◈'} {SCOPE_LABEL[card.scope] ?? card.scope}</Text>
                        <View style={{ flex: 1 }} />
                        {hits > 0 ? (
                          <Text style={s.scopeHitsBadge}>{hits} hit{hits === 1 ? '' : 's'}</Text>
                        ) : (
                          <Text style={s.scopeMissedBadge}>0 hits</Text>
                        )}
                      </View>
                      <View style={s.picksGrid}>
                        {card.picks.map(p => (
                          <View key={p.rank} style={[s.pickPill, p.hit === 'straight' && s.pickPillStraight, p.hit === 'box' && s.pickPillBox]}>
                            <Text style={[s.pickRank, p.hit && { color: theme.colors.bgElevated }]}>#{p.rank}</Text>
                            <Text style={[s.pickCombo, p.hit && { color: theme.colors.bgElevated }]}>{p.combo || '•••'}</Text>
                            {p.hit && (
                              <Text style={s.pickHitMark}>{p.hit === 'straight' ? '⭐' : '🎯'}</Text>
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text, fontFamily: theme.typography.fontFamily.bold },
  subtitle: { fontSize: 11, color: theme.colors.textTertiary, marginTop: 2, fontFamily: theme.typography.fontFamily.mono },

  scroll: { padding: 14, paddingBottom: 32, gap: 14 },

  daySection: { gap: 8 },
  dayHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  dayLabel: { fontSize: 14, fontWeight: '900', color: theme.colors.text, fontFamily: theme.typography.fontFamily.bold },
  dayDate: { fontSize: 11, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  dayHitsBadge: { marginLeft: 'auto', backgroundColor: theme.colors.gold + '22', borderWidth: 1, borderColor: theme.colors.gold + '66', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  dayHitsText: { fontSize: 10, fontWeight: '900', color: theme.colors.gold, fontFamily: theme.typography.fontFamily.monoBold },

  scopeCard: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.border, gap: 8 },
  scopeHeader: { flexDirection: 'row', alignItems: 'center' },
  scopeLabel: { fontSize: 12, fontWeight: '900', color: theme.colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.5 },
  scopeHitsBadge: { fontSize: 10, fontWeight: '900', color: theme.colors.cyan, fontFamily: theme.typography.fontFamily.monoBold },
  scopeMissedBadge: { fontSize: 10, fontWeight: '700', color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold },

  picksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.bgElevated, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: theme.colors.border },
  pickPillBox: { backgroundColor: theme.colors.cyan, borderColor: theme.colors.cyan },
  pickPillStraight: { backgroundColor: theme.colors.gold, borderColor: theme.colors.gold },
  pickRank: { fontSize: 9, fontWeight: '900', color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold },
  pickCombo: { fontSize: 13, fontWeight: '900', color: theme.colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 1 },
  pickHitMark: { fontSize: 11 },

  drawsLine: { fontSize: 10, color: theme.colors.textSecondary, lineHeight: 14, fontFamily: theme.typography.fontFamily.mono },
  drawsLineEmpty: { fontSize: 10, color: theme.colors.textTertiary, fontStyle: 'italic' },
});
