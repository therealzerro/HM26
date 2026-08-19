/**
 * Verified Track Record — consumer receipts stream, and the LIVE SET for the
 * nightly verify reels (MKT-02 render-verification-reel.ts + its --public cut).
 *
 * CAPTURE CONTRACT (MKT-51) — the reel rigs depend on this screen nightly:
 *  · The heading text "Verified Track Record" is a rig anchor — renaming it
 *    breaks that night's verify reels.
 *  · `?capture=1` puts the screen in deterministic-capture mode: summary
 *    count-up snaps to final values (no animation frames). Rigs pass it.
 *  · Stable anchors: summary band = testID/nativeID "tr-summary"; each day
 *    group = nativeID "day-<YYYY-MM-DD>" (DOM id on web) so rigs can
 *    scrollIntoView instead of computing pixel offsets.
 *  · ALL digits must stay in TEXT nodes (no images/SVG numerals): the
 *    verify_public redaction sweep (MKT-30) masks text nodes only, and its
 *    abort is the last gate before a tier-1 surface.
 *  · SANCTIONED EXCEPTION (MKT-62, operator ruling 2026-08-19): `&scope=
 *    midday|evening|allday` seeds the scope filter — ONLY when capture=1.
 *    The same-day midday verify reel needs today's MIDDAY rows alone, and
 *    the scope pills are hidden under capture. Ruled in over a rig-side DOM
 *    prune because a prune breaks SILENTLY on any layout change; this is
 *    three explicit lines that are dead code for members (the param does
 *    nothing without capture=1, so it cannot shape the member surface).
 *    Recorded as a decision, not a violation — see MASTER_AUDIT MKT-62.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { NeonSkeleton } from '@/components/NeonSkeleton';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { LoadingPhrase } from '@/components/LoadingPhrase';
import { scopeAccent } from '@/lib/scopeAccent';
import { useFollowedStates } from '@/hooks/useFollowedStates';
import { PickDetailModal } from '@/components/PickDetailModal';
import type { PickItem } from '@/components/PickCard';
import { hitRowToPickItem } from '@/lib/hitToPickItem';
import { useAuth } from '@/hooks/useAuth';
import { useCountUp } from '@/hooks/useCountUp';
import { getDaysAgoET, getTodayET, getYesterdayET } from '@/lib/dateUtils';

const SCOPE_LABEL: Record<string, string> = { midday: 'Midday', evening: 'Evening', allday: 'All Day' };
const SCOPE_ICON: Record<string, string> = { midday: '☀️', evening: '🌙', allday: '◈' };
const SESSION_ICON: Record<string, string> = { morning: '🌅', midday: '☀️', evening: '🌙', night: '🌑' };

// MKT-51 Tier A: member-selectable window. 30 stays the default — it is what
// the capture rigs expect (capture mode also hides the controls entirely).
const WINDOW_OPTIONS = [7, 30, 90] as const;
const DEFAULT_WINDOW = 30;
// BUG-162 era floor: stored hit flags before the 2026-06-10 detection fix are
// inflated (~30% phantom rows). A "verified" surface must never render that
// era, so long windows clamp here — the 90d option stops clamping naturally
// once 90 days have elapsed past the fix.
const ERA_FLOOR = '2026-06-11';
type ScopeFilter = 'all' | 'midday' | 'evening' | 'allday';

interface HitRow {
  slate_date: string;
  scope: string;
  combo: string;
  combo_set?: string;
  rank: number;
  hit_state: string;
  hit_session: string;
  hit_box: boolean;
  hit_straight: boolean;
  hit_result: string;
  signal_box?: number;
  signal_pburst?: number;
  signal_co?: number;
  signal_dgc?: number; // signal_burst in DB (legacy)
  energy?: number;
}

function scopeMatchesSession(scope: string, session: string): boolean {
  const s = (scope ?? '').toLowerCase();
  const d = (session ?? '').toLowerCase();
  if (s === 'allday') return true;
  if (!d) return true;
  return s === d;
}

// MKT-51: ET end to end via dateUtils. The old versions did the date
// arithmetic in the DEVICE timezone and only formatted in ET, so a
// late-evening West-coast or overseas viewer got a shifted window and a
// wrong Today/Yesterday label.
function formatDateLabel(date: string): string {
  if (date === getTodayET()) return 'Today';
  if (date === getYesterdayET()) return 'Yesterday';
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' });
}

// PostgREST hard-caps every GET at 1000 rows; asking for exactly that gives
// ~6× headroom over current volume (~160 matches/30d) AND makes truncation
// detectable: length === FETCH_LIMIT ⇒ the oldest days fell off, and the
// summary says so instead of silently under-claiming the window.
const FETCH_LIMIT = 1000;

export default function TrackRecordScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  // MKT-51 capture contract: rigs pass ?capture=1 for deterministic frames.
  const params = useLocalSearchParams<{ capture?: string; scope?: string }>();
  const captureMode = params.capture === '1';
  // MKT-62 sanctioned exception (header): capture-gated scope seed. Without
  // capture=1 the param is ignored entirely — members always start on 'all'.
  const captureScope: ScopeFilter =
    captureMode && (params.scope === 'midday' || params.scope === 'evening' || params.scope === 'allday')
      ? params.scope
      : 'all';

  const [windowDays, setWindowDays] = useState<number>(DEFAULT_WINDOW);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(captureScope);
  const { sinceDate, eraClamped } = useMemo(() => {
    const raw = getDaysAgoET(windowDays - 1);
    return raw < ERA_FLOOR ? { sinceDate: ERA_FLOOR, eraClamped: true } : { sinceDate: raw, eraClamped: false };
  }, [windowDays]);
  // Honest window label: while the era floor bites, "last 90 days" would
  // overclaim — say what the data actually covers instead.
  const windowLabel = eraClamped
    ? `since ${new Date(ERA_FLOOR + 'T12:00:00').toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })}`
    : `last ${windowDays} days`;
  const { followed, toPostgrestFilter } = useFollowedStates();
  const stateFilter = toPostgrestFilter().replace('jurisdiction=', 'hit_state=');
  const { user } = useAuth();
  const isPro = user?.role !== 'free';
  const [detail, setDetail] = useState<PickItem | null>(null);
  const navigation = useNavigation();

  // router.back() silently no-ops with no prior history (direct URL load,
  // page refresh on web, first navigation after launch) — the back chevron
  // went dead and stranded the user. Same fix as admin-image-export: fall
  // back to a replace into Home when there's nothing to pop.
  const handleBack = useCallback(() => {
    try {
      const can: boolean = typeof navigation?.canGoBack === 'function' ? navigation.canGoBack() : false;
      if (can) router.back();
      else router.replace('/(tabs)');
    } catch {
      router.replace('/(tabs)');
    }
  }, [navigation]);

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
    slate_date: string; scope: string; combo: string; combo_set: string | null; rank: number;
    matched_state: string | null; matched_session: string | null;
    hit_box: boolean; hit_straight: boolean; actual_result: string | null;
    signal_box: number | null; signal_pburst: number | null;
    signal_co: number | null; signal_burst: number | null;
    energy_score: number | null;
  }>>({
    // MKT-51: mode pinned to balanced. The old in.(balanced,conservative,
    // aggressive) filter was a latent phantom-match vector — the served slate
    // is balanced-only, so the day another mode starts writing tracking rows,
    // this screen would have shown "verified" matches from slates no
    // subscriber ever saw. (Verified 2026-08-07: all rows were balanced, so
    // pinning changes nothing displayed today.)
    queryKey: ['verified_track_record_adaptive_v3', sinceDate, followed.join(',')],
    queryFn: async () => {
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/adaptive_tracking?slate_date=gte.${sinceDate}&matched_state=not.is.null&or=(hit_box.eq.true,hit_straight.eq.true)&mode=eq.balanced${atStateFilter}&select=slate_date,scope,combo,combo_set,rank,matched_state,matched_session,hit_box,hit_straight,actual_result,signal_box,signal_pburst,signal_co,signal_burst,energy_score&order=slate_date.desc&limit=${FETCH_LIMIT}`,
      });
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const truncated = hitRows.length >= FETCH_LIMIT;

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
        slate_date: m.slate_date, scope: m.scope, combo: m.combo, combo_set: m.combo_set ?? undefined, rank: m.rank,
        hit_state: m.matched_state, hit_session: m.matched_session ?? '',
        hit_box: m.hit_box, hit_straight: m.hit_straight,
        hit_result: m.actual_result ?? '',
        signal_box:    m.signal_box    ?? undefined,
        signal_pburst: m.signal_pburst ?? undefined,
        signal_co:     m.signal_co     ?? undefined,
        signal_dgc:    m.signal_burst  ?? undefined,
        energy:        m.energy_score  ?? undefined,
      });
    }
    return merged;
  }, [hitRows]);

  // MKT-51 Tier A: scope chips filter client-side — summary and stream both
  // reflect the filter so the numbers never disagree with the rows shown.
  const scoped = useMemo(
    () => (scopeFilter === 'all' ? validHits : validHits.filter(h => h.scope === scopeFilter)),
    [validHits, scopeFilter],
  );

  // Group by date for the stream layout. MKT-51 Tier A: STRAIGHTS FIRST within
  // each day — same editorial rule as the verify reel (MKT-27: straights are
  // the strongest proof and lead). Session order breaks ties.
  const grouped = useMemo(() => {
    const sessionOrder: Record<string, number> = { morning: 0, midday: 1, evening: 2, night: 3 };
    const byDate = new Map<string, HitRow[]>();
    for (const h of scoped) {
      if (!byDate.has(h.slate_date)) byDate.set(h.slate_date, []);
      byDate.get(h.slate_date)!.push(h);
    }
    for (const arr of byDate.values()) {
      arr.sort((a, b) =>
        (b.hit_straight ? 1 : 0) - (a.hit_straight ? 1 : 0) ||
        (sessionOrder[(a.hit_session ?? '').toLowerCase()] ?? 9) - (sessionOrder[(b.hit_session ?? '').toLowerCase()] ?? 9),
      );
    }
    return [...byDate.entries()];
  }, [scoped]);

  // Header summary
  const summary = useMemo(() => {
    const totalHits = scoped.length;
    const straightHits = scoped.filter(h => h.hit_straight).length;
    const boxHits = totalHits - straightHits;
    const distinctDates = new Set(scoped.map(h => h.slate_date)).size;
    const distinctStates = new Set(scoped.map(h => h.hit_state).filter(Boolean)).size;
    return { totalHits, straightHits, boxHits, distinctDates, distinctStates };
  }, [scoped]);

  // MKT-51 Tier A: DAYS denominator. Complete days = window start through
  // yesterday; today joins the denominator only once it has a match (a
  // partial day with nothing yet must not read as a miss at 9am).
  const daysDen = useMemo(() => {
    const complete = Math.max(0, Math.round(
      (Date.parse(getYesterdayET() + 'T12:00:00') - Date.parse(sinceDate + 'T12:00:00')) / 86400000,
    ) + 1);
    const todayMatched = scoped.some(h => h.slate_date === getTodayET());
    return complete + (todayMatched ? 1 : 0);
  }, [scoped, sinceDate]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={handleBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Back">
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Verified Track Record</Text>
          <Text style={s.subtitle}>{windowLabel} · verified signal matches, draw-by-draw</Text>
        </View>
      </View>

      {/* MKT-51 Tier A controls — hidden under ?capture=1 so reel frames stay
          clean and the rig always captures the 30d/all default layout. */}
      {!captureMode && (
        <View style={s.controlsRow}>
          {WINDOW_OPTIONS.map(w => (
            <TouchableOpacity
              key={w}
              style={[s.pill, windowDays === w && s.pillOn]}
              onPress={() => setWindowDays(w)}
              accessibilityRole="button"
              accessibilityState={{ selected: windowDays === w }}
              accessibilityLabel={`Show last ${w} days`}
            >
              <Text style={[s.pillText, windowDays === w && s.pillTextOn]}>{w}D</Text>
            </TouchableOpacity>
          ))}
          <View style={s.controlsDivider} />
          {(['all', 'midday', 'evening', 'allday'] as const).map(sc => (
            <TouchableOpacity
              key={sc}
              style={[s.pill, scopeFilter === sc && s.pillOn]}
              onPress={() => setScopeFilter(sc)}
              accessibilityRole="button"
              accessibilityState={{ selected: scopeFilter === sc }}
              accessibilityLabel={sc === 'all' ? 'All scopes' : SCOPE_LABEL[sc]}
            >
              <Text style={[s.pillText, scopeFilter === sc && s.pillTextOn]}>
                {sc === 'all' ? 'All' : `${SCOPE_ICON[sc]} ${SCOPE_LABEL[sc]}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isLoading ? (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
          <NeonSkeleton variant="row" count={7} />
          <LoadingPhrase
            style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}
            phrases={[
              '🧾 Pulling verified matches…',
              '🧾 Cross-checking against draws…',
              '🧾 Sorting your receipts…',
            ]}
          />
        </View>
      ) : scoped.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 32, marginBottom: 10 }}>🧾</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 }}>No verified matches {windowLabel}{scopeFilter !== 'all' ? ` for ${SCOPE_LABEL[scopeFilter]}` : ''}</Text>
          <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>
            Matches will appear here as your slate matches real draws.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Summary band */}
          <View style={s.summaryCard} testID="tr-summary" nativeID="tr-summary">
            <View style={s.summaryRow}>
              <SummaryStat value={summary.totalHits} label="MATCHES" color={colors.cyan} snap={captureMode} />
              <View style={s.summaryDivider} />
              <SummaryStat value={summary.straightHits} label="STRAIGHT" color={colors.gold} snap={captureMode} />
              <View style={s.summaryDivider} />
              <SummaryStat value={summary.boxHits} label="BOX" color={colors.cyan} snap={captureMode} />
              <View style={s.summaryDivider} />
              {/* Tier A: numerator/denominator — matched days over elapsed days.
                  The denominator is what turns "29" into a claim worth reading. */}
              <SummaryStat value={summary.distinctDates} suffix={`/${daysDen}`} label="DAYS" color={colors.purple} snap={captureMode} />
            </View>
            <Text style={s.summarySub}>
              Across {summary.distinctStates} jurisdictions · {windowLabel}
              {truncated ? ` · showing the most recent ${FETCH_LIMIT} matches` : ''}
            </Text>
          </View>

          {/* Stream — nativeID per day group is a rig scroll anchor (MKT-51) */}
          {grouped.map(([date, dateHits]) => (
            <View key={date} style={s.daySection} nativeID={`day-${date}`} testID={`tr-day-${date}`}>
              <View style={s.dayHeader}>
                <Text style={s.dayLabel}>{formatDateLabel(date)}</Text>
                <Text style={s.dayDate}>{date}</Text>
                <View style={s.dayBadge}><Text style={s.dayBadgeText}>{dateHits.length} {dateHits.length === 1 ? 'match' : 'matches'}</Text></View>
              </View>
              {dateHits.map((h, i) => {
                const tint = scopeAccent(h.scope, colors);
                const sessIcon = SESSION_ICON[(h.hit_session ?? '').toLowerCase()] ?? '◈';
                const isStraight = !!h.hit_straight;
                return (
                  <TouchableOpacity
                    key={`${h.combo}-${h.hit_state}-${h.hit_session}-${i}`}
                    style={[s.hitRow, { borderLeftColor: tint }]}
                    onPress={() => setDetail(hitRowToPickItem(h))}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`${isStraight ? 'Straight' : 'Box'} match on ${h.combo} in ${h.hit_state}, tap for details`}
                  >
                    <Text style={s.hitSessIcon}>{sessIcon}</Text>
                    {/* h.combo is the sorted comboSet key; for STRAIGHT, the
                        predicted order equals the draw — render hit_result so
                        the digits match what was actually predicted. */}
                    <Text style={s.hitCombo}>{isStraight && h.hit_result ? h.hit_result : h.combo}</Text>
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
                    {/* Tier A: published slate position — the receipt's "called
                        in advance at slot N" half. rank is 1–6 (slate ordinality
                        in adaptive_tracking, verified 2026-08-07). */}
                    {h.rank >= 1 && h.rank <= 6 && (
                      <View style={s.rankChip} accessibilityLabel={`Slate position ${h.rank}`}>
                        <Text style={s.rankChipText}>#{h.rank}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* Tier A: brand attribution (MKT-14 pattern) so organic member
              screenshots of the stream self-attribute. Tier-neutral copy. */}
          <View style={s.brandFooter}>
            <Text style={s.brandWordmark}>HITMASTER <Text style={{ color: colors.cyan }}>ZK6</Text></Text>
            <Text style={s.brandFooterMeta}>verified daily · {getTodayET()}</Text>
          </View>
        </ScrollView>
      )}

      {detail && (
        <PickDetailModal
          pick={detail}
          scope={detail.snapshotScope ?? 'allday'}
          isPro={isPro}
          onClose={() => setDetail(null)}
        />
      )}
    </SafeAreaView>
  );
}

function SummaryStat({ value, label, color, snap, suffix }: { value: number; label: string; color: string; snap?: boolean; suffix?: string }) {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  // DESIGN-02 T2 (2.1): summary numbers count up 0→value (~600ms ease-out);
  // snaps to the final value under Reduce Motion — and under ?capture=1
  // (MKT-51), where an animation frame would leak nondeterminism into the
  // verify reel's frame capture. duration 0 hits useCountUp's snap guard.
  const display = useCountUp(value, snap ? { duration: 0 } : undefined);
  return (
    <View style={s.summaryStat}>
      <Text style={[s.summaryValue, { color }]}>{display}{suffix ?? ''}</Text>
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

  // MKT-51 Tier A controls
  controlsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  controlsDivider: { width: 1, height: 18, backgroundColor: colors.border, marginHorizontal: 2 },
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, borderWidth: 1, borderColor: colors.border },
  pillOn: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
  pillText: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },
  pillTextOn: { color: colors.primary, fontWeight: '900' },

  hitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: colors.card, borderRadius: 10, borderLeftWidth: 3, borderColor: colors.border, borderWidth: 1 },
  rankChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  rankChipText: { fontSize: 9, fontWeight: '900', color: colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 },

  brandFooter: { alignItems: 'center', gap: 2, marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  brandWordmark: { fontSize: 11, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 2 },
  brandFooterMeta: { fontSize: 9, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },
  hitSessIcon: { fontSize: 16 },
  hitCombo: { fontSize: 18, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 3, minWidth: 60 },
  hitMain: { fontSize: 11, color: colors.textSecondary },
  hitTypeLabel: { fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.4 },
  hitScope: { fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  hitMeta: { fontSize: 10, color: colors.textTertiary, marginTop: 2, fontFamily: theme.typography.fontFamily.mono },
});
