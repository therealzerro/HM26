/* ============================================================================
   v7 PATCH — Results Ledger screen (Option A — aggressive cleanup)
   ============================================================================
   FILE:        app/(tabs)/results.tsx
   STRATEGY:    Strip 5 bands of chrome down to 3. The list is the product —
                everything else should be tappable on demand, not stacked.

                BEFORE                          AFTER
                ─────────                       ──────────
                Header (title + meta)           Header (title + ⋯)
                Date tabs                       Date tabs
                Search bar (full row)           ───
                Session filter pills            One compact controls strip:
                Stats row (6 numbers)             [🔍] [All|🌅|☀️|🌙|🌑] [count]
                LIST                            LIST
                                                (stats moved → overflow sheet)
                                                (search expands inline on tap)

   REPLACES:    Full file replacement. All hooks, queries, processed data, and
                card rendering are preserved — only the chrome layout changes.
   ============================================================================ */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { NeonRefreshControl as RefreshControl } from '@/components/NeonRefreshControl';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { storage } from '@/lib/storage';
import { useFollowedStates } from '@/hooks/useFollowedStates';
import { getYesterdayET } from '@/lib/dateUtils';
import { fetchFromSupabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { shareTextSafe } from '@/lib/shareText';
import { alertAsync } from '@/lib/confirm';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { Calendar, MoreHorizontal, Search, X, ChevronDown, ChevronUp } from 'lucide-react-native';
import { EmptyState } from '@/components/EmptyState';
import { NeonSkeleton } from '@/components/NeonSkeleton';
import { SessionFilter } from '@/components/SessionFilter';
import { ScreenHeader } from '@/components/ScreenHeader';
import { HitHeroBand, type HitHeroItem } from '@/components/HitHeroBand';
import { MissDayCard } from '@/components/MissDayCard';
import { HitReplay } from '@/components/HitReplay';
import { PickDetailModal } from '@/components/PickDetailModal';
import type { PickItem } from '@/components/PickCard';
import { hitRowToPickItem } from '@/lib/hitToPickItem';
import { useAuth } from '@/hooks/useAuth';
import { useReduceMotion } from '@/hooks/useReduceMotion';

// Local D color alias map removed (design.md step 6) — every reference
// now uses colors.* directly so grep-for-cyan finds this file.

interface LedgerRow {
  jurisdiction: string; game: string; date_et: string; session: string; result_digits: string; comboset_sorted?: string;
}
interface HitRow {
  slate_date: string; scope: string; mode: string; rank: number; combo: string;
  combo_set?: string;
  hit_state: string; hit_session: string; hit_box: boolean; hit_straight: boolean;
  actual_result?: string;
  signal_box?: number; signal_pburst?: number; signal_co?: number; signal_dgc?: number;
  energy?: number;
}
interface ProcessedEntry extends LedgerRow { hits: HitRow[] }

const SESSION_ICONS:  Record<string, string> = { morning: '🌅', midday: '☀️', evening: '🌙', night: '🌑' };
// Indirection via color-token keys so SESSION_COLORS resolves through the
// active palette at render time (dark vs light) rather than locking to dark
// at module load. Look up: `colors[SESSION_COLOR_KEYS[session]]`.
const SESSION_COLOR_KEYS: Record<string, keyof ColorTokens> = {
  morning: 'amber', midday: 'gold', evening: 'purple', night: 'blue',
};

function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function getNextDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function toComboSet(digits: string): string {
  return '{' + digits.split('').sort().join(',') + '}';
}
// A slate scope only matches a draw session of the same time of day. allday
// matches any session. Prevents cross-scope hit attribution (e.g. an evening
// pick being credited as a hit on a midday draw with the same comboSet).
function scopeMatches(slateScope: string | undefined, drawSession: string | undefined): boolean {
  const s = (slateScope ?? '').toLowerCase();
  const d = (drawSession ?? '').toLowerCase();
  if (!s) return true; // unknown scope — fall back to permissive (preserves Tier 1 behavior)
  if (s === 'allday') return true;
  return s === d;
}
function getDateLabel(dateStr: string): string {
  const today = getTodayET();
  const yStr = getYesterdayET();
  if (dateStr === today) return 'Today';
  if (dateStr === yStr)  return 'Yesterday';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
}
function getRecentDates(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    out.push(d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  }
  return out;
}
function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'long', day: 'numeric' });
}

// ─── stats overflow sheet ──────────────────────────────────────────────
function StatsSheet({ visible, onClose, stats, selectedDate }: {
  visible: boolean; onClose: () => void; selectedDate: string;
  stats: { mid: number; eve: number; total: number; hits: number };
}) {
  const { colors } = useTheme();
  const ss = useMemo(() => makeSs(colors), [colors]);
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={ss.backdrop} onPress={onClose}>
        <Pressable style={ss.sheet} onPress={e => e.stopPropagation()}>
          <View style={ss.handle} />
          <View style={ss.headerRow}>
            <Text style={ss.heading}>{formatDisplayDate(selectedDate)}</Text>
            <TouchableOpacity onPress={onClose}><X size={20} color={colors.textSecondary} /></TouchableOpacity>
          </View>

          <Text style={ss.sectionTitle}>Session breakdown</Text>
          <View style={ss.grid}>
            <Stat n={stats.mid}   label="☀️ Midday"  c={colors.gold}  />
            <Stat n={stats.eve}   label="🌙 Evening" c={colors.purple} />
          </View>

          <Text style={ss.sectionTitle}>Totals</Text>
          <View style={ss.bigRow}>
            <View style={ss.bigStat}>
              <Text style={[ss.bigNum, { color: colors.text }]}>{stats.total}</Text>
              <Text style={ss.bigLabel}>Total draws</Text>
            </View>
            <View style={ss.divider} />
            <View style={ss.bigStat}>
              <Text style={[ss.bigNum, { color: colors.cyan }]}>{stats.hits}</Text>
              <Text style={ss.bigLabel}>🎯 ZK6 matches</Text>
            </View>
            <View style={ss.divider} />
            <View style={ss.bigStat}>
              <Text style={[ss.bigNum, { color: colors.gold }]}>
                {stats.total > 0 ? Math.round((stats.hits / stats.total) * 100) : 0}%
              </Text>
              <Text style={ss.bigLabel}>Match rate</Text>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
function Stat({ n, label, c }: { n: number; label: string; c: string }) {
  const { colors } = useTheme();
  const ss = useMemo(() => makeSs(colors), [colors]);
  return (
    <View style={ss.cell}>
      <Text style={[ss.cellNum, { color: c }]}>{n}</Text>
      <Text style={ss.cellLabel}>{label}</Text>
    </View>
  );
}

// ─── hit summary (rendered both in footer and in the sheet) ──────────────
interface HitSummaryItem {
  combo: string;
  scope: string;
  jurisdiction: string;
  session: string;
  hitType: 'BOX' | 'STRAIGHT';
  /** Actual drawn digits — used by HitHeroBand for the WE-PICKED → DRAWN replay. */
  hitResult?: string;
  rank?: number;
  // Optional pass-through fields used by callers that wire onTap → PickDetailModal.
  comboSet?: string;
  signalBox?: number;
  signalPburst?: number;
  signalCo?: number;
  signalDgc?: number;
  energy?: number;
}
function flattenHits(processed: ProcessedEntry[]): HitSummaryItem[] {
  const out: HitSummaryItem[] = [];
  for (const row of processed) {
    for (const h of row.hits ?? []) {
      // For a STRAIGHT hit, the predicted bestOrder matched the draw exactly,
      // so the row's result_digits IS the order we picked. h.combo (the
      // sorted comboSet key, per BUG-155) would render in the wrong order.
      const displayCombo = h.hit_straight && row.result_digits
        ? row.result_digits
        : (h.combo ?? '');
      out.push({
        combo: displayCombo,
        scope: h.scope ?? '',
        jurisdiction: h.hit_state || row.jurisdiction || '',
        session: h.hit_session || row.session || '',
        hitType: h.hit_straight ? 'STRAIGHT' : 'BOX',
        hitResult: row.result_digits ?? '',
        rank: h.rank,
        comboSet: h.combo_set,
        signalBox:    h.signal_box,
        signalPburst: h.signal_pburst,
        signalCo:     h.signal_co,
        signalDgc:    h.signal_dgc,
        energy:       h.energy,
      });
    }
  }
  return out;
}
function HitSummary({ items, onItemPress }: { items: HitSummaryItem[]; onItemPress?: (item: HitSummaryItem) => void }) {
  const { colors } = useTheme();
  const hs = useMemo(() => makeHs(colors), [colors]);
  if (items.length === 0) {
    return (
      <View style={hs.container}>
        <Text style={hs.title}>🎯 No matches yet today</Text>
        <Text style={hs.sub}>Slate matches will appear here as draws come in.</Text>
      </View>
    );
  }
  return (
    <View style={hs.container}>
      <Text style={hs.title}>🎯 {items.length} {items.length === 1 ? 'MATCH' : 'MATCHES'} TODAY</Text>
      {items.map((h, i) => {
        const RowComp: any = onItemPress ? TouchableOpacity : View;
        const rowProps = onItemPress
          ? { onPress: () => onItemPress(h), activeOpacity: 0.85, accessibilityRole: 'button' as const, accessibilityLabel: `${h.hitType} match ${h.combo}, tap for details` }
          : {};
        return (
          <RowComp key={`${h.combo}-${h.jurisdiction}-${h.session}-${i}`} style={hs.row} {...rowProps}>
            <Text style={hs.combo}>{h.combo}</Text>
            <View style={{ flex: 1 }}>
              <Text style={hs.main}>
                <Text style={{ color: h.hitType === 'STRAIGHT' ? colors.gold : colors.cyan, fontWeight: '900' }}>K6 {h.hitType}</Text>
                {h.scope ? ` · ${h.scope}` : ''}
              </Text>
              <Text style={hs.sub2}>{h.jurisdiction} {h.session}</Text>
            </View>
          </RowComp>
        );
      })}
    </View>
  );
}
function HitSummarySheet({ visible, onClose, items, selectedDate, onItemPress }: {
  visible: boolean; onClose: () => void; items: HitSummaryItem[]; selectedDate: string;
  onItemPress?: (item: HitSummaryItem) => void;
}) {
  const { colors } = useTheme();
  const ss = useMemo(() => makeSs(colors), [colors]);
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={ss.backdrop} onPress={onClose}>
        <Pressable style={ss.sheet} onPress={e => e.stopPropagation()}>
          <View style={ss.handle} />
          <View style={ss.headerRow}>
            <Text style={ss.heading}>{formatDisplayDate(selectedDate)}</Text>
            <TouchableOpacity onPress={onClose}><X size={20} color={colors.textSecondary} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
            <HitSummary items={items} onItemPress={onItemPress} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
const makeHs = (colors: ColorTokens) => StyleSheet.create({
  container: { backgroundColor: colors.card, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 14, marginHorizontal: 12, gap: 10 },
  title: { fontSize: 12, fontWeight: '900', color: colors.text, letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold, marginBottom: 4 },
  sub: { fontSize: 12, color: colors.textTertiary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border + '55' },
  combo: { fontSize: 22, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 3, minWidth: 64 },
  main: { fontSize: 12, color: colors.textSecondary },
  sub2: { fontSize: 11, color: colors.textTertiary, marginTop: 2 },
});
const makeSs = (colors: ColorTokens) => StyleSheet.create({
  // scrim stays dark in both modes (LIGHT-01)
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 36, gap: 12, borderTopWidth: 1.5, borderColor: colors.purple + '44' },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 18, fontWeight: '900', color: colors.text },
  sectionTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold, marginTop: 6 },
  grid: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  cellNum: { fontSize: 22, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '900' },
  cellLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 4 },
  bigRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 14 },
  bigStat: { flex: 1, alignItems: 'center' },
  bigNum: { fontSize: 26, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '900' },
  bigLabel: { fontSize: 10, color: colors.textTertiary, marginTop: 4 },
  divider: { width: 1, height: 30, backgroundColor: colors.border },
});

// ─── main screen ───────────────────────────────────────────────────────
export default function ResultsScreen() {
  const { colors } = useTheme();
  const s = useMemo(() => makeS(colors), [colors]);
  const { user } = useAuth();
  const isPro = user?.role !== 'free';
  const recentDates = useMemo(() => getRecentDates(), []);
  const [selectedDate,  setSelectedDate]  = useState(recentDates[0]);
  const [sessionFilter, setSessionFilter] = useState<string>('all');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [detail, setDetail] = useState<PickItem | null>(null);
  // Build a PickItem from a flattened HitSummaryItem (used by HitHeroBand and
  // HitSummary tap handlers). Maps the flattened shape back onto the AT-row
  // shape that hitRowToPickItem expects.
  const openHitDetail = useCallback((h: HitSummaryItem) => {
    setDetail(hitRowToPickItem({
      combo: h.combo,
      combo_set: h.comboSet ?? null,
      scope: h.scope ?? null,
      rank: h.rank ?? null,
      hit_state: h.jurisdiction ?? null,
      hit_session: h.session ?? null,
      hit_box: true,
      hit_straight: h.hitType === 'STRAIGHT',
      hit_result: h.hitResult ?? null,
      signal_box:    h.signalBox    ?? null,
      signal_pburst: h.signalPburst ?? null,
      signal_co:     h.signalCo     ?? null,
      signal_dgc:    h.signalDgc    ?? null,
      energy:        h.energy       ?? null,
    }));
  }, []);
  const [statsOpen,     setStatsOpen]     = useState(false);
  const [hitSummaryOpen, setHitSummaryOpen] = useState(false);
  const [clusterView,   setClusterView]   = useState(false);
  // E2: inline-replay expand state — row id (`${jurisdiction}-${session}-${date}`)
  // of the currently-expanded hit card, or null. Only one row open at a time.
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  // DESIGN-02 T2 (2.1): replay expansion fades; no-op on Reduce Motion.
  const reduceMotion = useReduceMotion();

  const { followed: followedStates, toPostgrestFilter } = useFollowedStates();
  const jurisdictionFilter = toPostgrestFilter(); // already in `&jurisdiction=in.(...)` form
  const hitStateFilter = jurisdictionFilter.replace('jurisdiction=', 'hit_state=');
  // BUG-140 (2026-05-13): adaptive_tracking uses `matched_state` instead of
  // `hit_state` (legacy daily_intelligence column name). When the queries
  // below moved off daily_intelligence onto adaptive_tracking, the followed-
  // states filter needs the new column name.
  const matchedStateFilter = jurisdictionFilter.replace('jurisdiction=', 'matched_state=');

  const { data: ledger, isLoading: ledgerLoading, refetch: refetchLedger, isRefetching } = useQuery<LedgerRow[]>({
    queryKey: ['v_recent_ledger', selectedDate, followedStates.join(',')],
    queryFn: async () => {
      const res = await fetchFromSupabase<LedgerRow[]>({
        path: `/rest/v1/histories?select=jurisdiction,game,date_et,session,result_digits,comboset_sorted&date_et=eq.${selectedDate}${jurisdictionFilter}&order=session.asc,jurisdiction.asc&limit=500`,
        method: 'GET',
      });
      return Array.isArray(res) ? res : [];
    },
    staleTime: 30000,
  });

  // Slates can be tagged with selectedDate OR the next calendar day if the
  // slate was regenerated after midnight ET (BUG-18 late-regen scenario).
  // All three hit-detection queries use in.(selectedDate,nextDay).
  const nextDay = getNextDay(selectedDate);

  // BUG-140 (2026-05-13): Tier 1 hits + onSlatePicks + weekHits all migrated
  // from daily_intelligence to adaptive_tracking. The prior queries gated on
  // `on_slate=eq.true`, which becomes FALSE on hit-bearing combos after a
  // mid-day regen excludes them from the new K6 (today's 916/924 are at
  // ranks 31/32 with on_slate=false). adaptive_tracking is slate_hash-keyed
  // so hit rows survive regens by design. Column name mapping:
  //   daily_intelligence.hit_state    → adaptive_tracking.matched_state
  //   daily_intelligence.hit_session  → adaptive_tracking.matched_session
  //   daily_intelligence.signal_dgc   → adaptive_tracking.signal_burst (legacy)
  // The remap helper returns the same HitRow shape consumers already expect.
  const remapToHitRow = (r: any): HitRow => ({
    slate_date: r.slate_date,
    scope: r.scope,
    mode: r.mode,
    rank: r.rank ?? 0,
    combo: r.combo ?? '',
    combo_set: r.combo_set ?? undefined,
    hit_state: r.matched_state ?? '',
    hit_session: r.matched_session ?? '',
    hit_box: !!r.hit_box,
    hit_straight: !!r.hit_straight,
    actual_result: r.actual_result ?? undefined,
    signal_box: r.signal_box,
    signal_pburst: r.signal_pburst,
    signal_co: r.signal_co,
    signal_dgc: r.signal_burst,
    energy: r.energy_score,
  });

  const { data: hits, refetch: refetchHits } = useQuery<HitRow[]>({
    queryKey: ['adaptive_tracking_hits_v2', selectedDate, followedStates.join(',')],
    queryFn: async () => {
      const res = await fetchFromSupabase<any[]>({
        path: `/rest/v1/adaptive_tracking?select=slate_date,scope,mode,rank,combo,combo_set,energy_score,signal_box,signal_pburst,signal_co,signal_burst,actual_result,matched_state,matched_session,hit_box,hit_straight&slate_date=in.(${selectedDate},${nextDay})&or=(hit_box.eq.true,hit_straight.eq.true)&mode=in.(balanced,conservative,aggressive)${matchedStateFilter}&order=rank.asc.nullslast&limit=500`,
        method: 'GET',
      });
      return Array.isArray(res) ? res.map(remapToHitRow) : [];
    },
    staleTime: 30000,
  });

  // All K6 picks today — feeds Tier 2 csMap for client-side comboSet matching
  // when daily_intelligence's hit annotations haven't been written yet (e.g.,
  // before backfill runs). adaptive_tracking has one row per K6 pick at slate-
  // gen time even when no hit occurred (ENH-01 primary rows), so this returns
  // the full K6 universe across all regens of the day. De-dupe by combo so
  // multi-state secondary rows don't bloat csMap.
  const { data: onSlatePicks, refetch: refetchOnSlatePicks } = useQuery<HitRow[]>({
    queryKey: ['adaptive_tracking_on_slate_v2', selectedDate],
    queryFn: async () => {
      const res = await fetchFromSupabase<any[]>({
        path: `/rest/v1/adaptive_tracking?select=slate_date,scope,mode,rank,combo,combo_set,energy_score,signal_box,signal_pburst,signal_co,signal_burst,actual_result,matched_state,matched_session,hit_box,hit_straight&slate_date=in.(${selectedDate},${nextDay})&mode=in.(balanced,conservative,aggressive)&order=rank.asc.nullslast&limit=1000`,
        method: 'GET',
      });
      const rows = Array.isArray(res) ? res : [];
      // De-dupe by (scope, combo): prefer the row with a hit annotation, then
      // the row with a rank (primary) over secondaries.
      const byKey = new Map<string, any>();
      for (const r of rows) {
        if (!r.combo) continue;
        const key = `${r.scope}|${r.combo}`;
        const existing = byKey.get(key);
        const isHit = !!r.hit_box || !!r.hit_straight;
        const exHit = existing && (existing.hit_box || existing.hit_straight);
        if (!existing) byKey.set(key, r);
        else if (isHit && !exHit) byKey.set(key, r);
        else if (r.rank != null && existing.rank == null) byKey.set(key, r);
      }
      return [...byKey.values()].map(remapToHitRow);
    },
    staleTime: 30000,
  });

  // E3/E4/E5: week-hits map — single query powers streak chip, date-tab dots,
  // and miss-day trend fact. Also migrated to adaptive_tracking (BUG-140).
  const { data: weekHits } = useQuery<{ slate_date: string; hit_straight: boolean }[]>({
    queryKey: ['week_hits_for_results_adaptive_v1', recentDates.join(','), followedStates.join(',')],
    queryFn: async () => {
      const res = await fetchFromSupabase<{ slate_date: string; hit_straight: boolean }[]>({
        path: `/rest/v1/adaptive_tracking?select=slate_date,hit_straight&slate_date=in.(${recentDates.join(',')})&or=(hit_box.eq.true,hit_straight.eq.true)&mode=in.(balanced,conservative,aggressive)${matchedStateFilter}&limit=500`,
        method: 'GET',
      });
      return Array.isArray(res) ? res : [];
    },
    staleTime: 60_000,
  });

  // Tier-3: direct all-scope snapshot query — avoids useSnapshot() scope limitation.
  // Fetches all scopes (midday/evening/allday) so allday slate hits appear regardless
  // of the user's current scope selection.
  const { data: snapshotRows } = useQuery<any[]>({
    queryKey: ['slate_snapshots_hits_v2_slate_date_safe', selectedDate],
    queryFn: async () => {
      // slate_date filter scopes Tier 3 to the slate(s) generated FOR
      // selectedDate (or its late-night twin). Without it, yesterday's
      // snapshot — re-touched today by hit detection — bleeds into today's
      // Results as a "K6 hit" even though that K6 belongs to yesterday.
      const res = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?select=scope,slate_date,top_k_straights_json&deleted_at=is.null&slate_date=in.(${selectedDate},${nextDay})&mode=in.(balanced,conservative,aggressive)&order=updated_at_et.desc.nullslast&limit=20`,
        method: 'GET',
      });
      return Array.isArray(res) ? res : [];
    },
    staleTime: 30000,
  });
  const snapshotHitPicks = useMemo<any[]>(() => {
    if (!snapshotRows) return [];
    const out: any[] = [];
    for (const row of snapshotRows) {
      let picks: any[] = [];
      try {
        picks = typeof row.top_k_straights_json === 'string'
          ? JSON.parse(row.top_k_straights_json)
          : (row.top_k_straights_json ?? []);
      } catch { continue; }
      for (const p of picks) {
        if (p?.hitType) out.push({ ...p, scope: row.scope });
      }
    }
    return out;
  }, [snapshotRows]);

  // E3/E4/E5 derived from weekHits.
  // hitsByDate: how many K6 hits per day in the last 7 days (dotted tabs, miss-day trend)
  // hitsLast7Days: number of distinct days in window with ≥1 hit
  // streak: consecutive days ending today (or yesterday if today empty + at least one earlier hit) with ≥1 hit
  const hitsByDate = useMemo(() => {
    const map = new Map<string, { total: number; straight: number }>();
    for (const h of weekHits || []) {
      const cur = map.get(h.slate_date) ?? { total: 0, straight: 0 };
      cur.total += 1;
      if (h.hit_straight) cur.straight += 1;
      map.set(h.slate_date, cur);
    }
    return map;
  }, [weekHits]);
  const hitsLast7Days = useMemo(
    () => recentDates.filter(d => (hitsByDate.get(d)?.total ?? 0) > 0).length,
    [hitsByDate, recentDates],
  );
  const streak = useMemo(() => {
    // recentDates is [today, yesterday, …] (line 88). Walk forward and count
    // consecutive days with ≥1 hit. If today has 0 hits but yesterday does,
    // skip today (likely pre-evening-draw) and count from yesterday.
    let count = 0;
    let started = false;
    for (let i = 0; i < recentDates.length; i++) {
      const has = (hitsByDate.get(recentDates[i])?.total ?? 0) > 0;
      if (!started) {
        if (has) { started = true; count = 1; }
        else if (i === 0) { continue; } // today empty — try yesterday
        else { break; } // started must begin within first two slots
      } else {
        if (has) count++;
        else break;
      }
    }
    return count;
  }, [hitsByDate, recentDates]);

  // Reset row expansion whenever the user changes context — date, session, or search.
  useEffect(() => { setExpandedRowId(null); }, [selectedDate, sessionFilter, searchQuery]);

  // When today has no draw results yet, auto-select yesterday so the screen
  // is never blank on first load (draws typically land around noon/7:30pm ET).
  useEffect(() => {
    if (!ledgerLoading && ledger !== undefined && ledger.length === 0 && selectedDate === recentDates[0]) {
      setSelectedDate(recentDates[1]);
    }
  }, [ledger, ledgerLoading, recentDates]);

  // Mark Results as viewed (clears the §7.7 stale-tab badge).
  const queryClient = useQueryClient();
  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    storage.setItem('results_last_viewed_date', today);
    queryClient.invalidateQueries({ queryKey: ['unviewed_results_hits'] });
  }, [queryClient]);

  const handleRefresh = async () => {
    await Promise.all([refetchLedger(), refetchHits(), refetchOnSlatePicks()]);
  };

  const processed = useMemo<ProcessedEntry[]>(() => {
    if (!ledger) return [];

    // Tier 2: daily_intelligence on-slate picks (combo-set map)
    const csMap = new Map<string, HitRow[]>();
    for (const h of (onSlatePicks || [])) {
      const cs = toComboSet(h.combo ?? '');
      if (!csMap.has(cs)) csMap.set(cs, []);
      csMap.get(cs)!.push(h);
    }

    // Tier 3: snapshot hitType picks (all scopes). hitDate filter narrows to selectedDate.
    const snapMap = new Map<string, HitRow[]>();
    for (const p of (snapshotHitPicks as any[])) {
      if (!p?.hitType) continue;
      if (p.hitDate && p.hitDate !== selectedDate) continue;
      const cs = toComboSet(p.combo ?? '');
      if (!snapMap.has(cs)) snapMap.set(cs, []);
      snapMap.get(cs)!.push({
        slate_date: selectedDate,
        scope: p.scope ?? '',
        mode: 'balanced',
        rank: p.rank ?? 0,
        combo: p.combo ?? '',
        hit_state: '',
        hit_session: '',
        hit_box: true,
        hit_straight: p.hitType === 'straight',
        signal_box:    p.signals?.BOX    ?? p.box    ?? undefined,
        signal_pburst: p.signals?.PBURST ?? p.pburst ?? undefined,
        signal_dgc:    p.signals?.DGC    ?? p.dgc    ?? undefined,
      });
    }

    return ledger.map(row => {
      const rowDate = row.date_et?.split('T')[0];
      const rowSet  = toComboSet(row.result_digits ?? '');

      // Tier 1: DB-confirmed hits (backfill ran, hit_box/hit_straight set).
      // hit_session is whatever session hit detection ran against — does NOT
      // necessarily match the slate's scope. Add scopeMatches gate so an
      // evening slate pick can't be credited to a midday draw even if hit
      // detection wrote hit_session=midday on the row.
      // BUG-144 (2026-05-14): dedup by (scope, combo, hit_state, hit_session) —
      // regens can leave multiple adaptive_tracking rows at different slate
      // hashes for the same pick (e.g., 5/13 evening 034 had AT rows at both
      // the live hash and a regen'd-out hash). Without dedup the hero band
      // (and HitSummary) renders the same hit twice.
      // BUG-149 (2026-05-20): also require the AT row's combo to share a
      // comboSet with this ledger row's actual draw. Without this gate,
      // multi-game states (TX/DC/GA each run two evening games) attach the
      // same hit to BOTH games' ledger rows — the wrong-game card shows a
      // bogus 🎯 badge and flattenHits emits the hit twice in the footer.
      const dbHits = (hits || []).filter(h => {
        const hDate = h.slate_date?.split('T')[0];
        return h.hit_state === row.jurisdiction && hDate === rowDate
          && h.hit_session?.toLowerCase() === row.session?.toLowerCase()
          && scopeMatches(h.scope, row.session)
          && toComboSet(h.combo) === rowSet;
      });
      const dbHitsDedup = (() => {
        const seen = new Map<string, HitRow>();
        for (const h of dbHits) {
          const key = `${h.scope}|${h.combo}|${h.hit_state}|${h.hit_session}`;
          const existing = seen.get(key);
          // Prefer the row with a rank (primary > secondary) and with
          // hit_straight set over box-only — matches the BUG-141 tie-breaker.
          if (!existing) seen.set(key, h);
          else if (h.hit_straight && !existing.hit_straight) seen.set(key, h);
          else if (h.rank != null && existing.rank == null) seen.set(key, h);
        }
        return [...seen.values()];
      })();
      if (dbHitsDedup.length > 0) return { ...row, hits: dbHitsDedup };

      // Tier 2: daily_intelligence box-match (backfill not yet run).
      // scopeMatches enforces midday-pick→midday-draw, etc.
      const diHits = (csMap.get(rowSet) || [])
        .filter(h => scopeMatches(h.scope, row.session))
        .map(h => ({
          ...h,
          hit_box: true,
          hit_straight: h.combo === row.result_digits,
          hit_state: row.jurisdiction,
          hit_session: row.session,
        }));
      if (diHits.length > 0) return { ...row, hits: diHits };

      // Tier 3: snapshot hitType picks — bypasses daily_intelligence entirely.
      // Same scopeMatches gate.
      const snapHits = (snapMap.get(rowSet) || [])
        .filter(h => scopeMatches(h.scope, row.session))
        .map(h => ({
          ...h,
          hit_state: row.jurisdiction,
          hit_session: row.session,
        }));
      return { ...row, hits: snapHits };
    });
  }, [ledger, hits, onSlatePicks, snapshotHitPicks, selectedDate]);

  const filtered = useMemo(() => {
    let rows = processed;
    if (sessionFilter !== 'all') rows = rows.filter(r => r.session?.toLowerCase() === sessionFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r =>
        r.jurisdiction?.toLowerCase().includes(q) ||
        r.result_digits?.includes(q) ||
        r.game?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [processed, sessionFilter, searchQuery]);

  const stats = useMemo(() => ({
    mid:   processed.filter(r => r.session === 'midday').length,
    eve:   processed.filter(r => r.session === 'evening').length,
    total: processed.length,
    hits:  processed.filter(r => r.hits.length > 0).length,
  }), [processed]);

  const hitSummaryItems = useMemo(() => flattenHits(processed), [processed]);

  const grouped = useMemo(() => {
    const sessions = ['midday', 'evening'];
    const result: Array<{ type: 'header'; session: string; count: number } | { type: 'row'; data: ProcessedEntry }> = [];
    for (const sess of sessions) {
      const rows = filtered.filter(r => r.session === sess);
      if (rows.length === 0) continue;
      result.push({ type: 'header', session: sess, count: rows.length });
      rows.forEach(r => result.push({ type: 'row', data: r }));
    }
    return result;
  }, [filtered]);

  const clustered = useMemo(() => {
    const map = new Map<string, { comboSet: string; drawCount: number; hitCount: number; digits: string[] }>();
    for (const row of filtered) {
      const cs = row.comboset_sorted ?? `{${row.result_digits.split('').sort().join(',')}}`;
      if (!map.has(cs)) map.set(cs, { comboSet: cs, drawCount: 0, hitCount: 0, digits: [] });
      const entry = map.get(cs)!;
      entry.drawCount++;
      if (row.hits.length > 0) entry.hitCount++;
      if (!entry.digits.includes(row.result_digits)) entry.digits.push(row.result_digits);
    }
    return [...map.values()].sort((a, b) => b.hitCount - a.hitCount || b.drawCount - a.drawCount);
  }, [filtered]);

  const renderItem = ({ item }: { item: typeof grouped[0] }) => {
    if (item.type === 'header') {
      const color = colors[SESSION_COLOR_KEYS[item.session] ?? 'purple'];
      const icon  = SESSION_ICONS[item.session]  ?? '•';
      const label = item.session.charAt(0).toUpperCase() + item.session.slice(1);
      return (
        <View style={s.sectionHeader}>
          <Text style={[s.dot, { color }]}>●</Text>
          <Text style={s.sectionIcon}>{icon}</Text>
          <Text style={[s.sectionText, { color }]}>{label.toUpperCase()} DRAWS</Text>
          <Text style={s.sectionCount}>— {item.count} results</Text>
        </View>
      );
    }
    const row = item.data;
    const hasHit = row.hits.length > 0;
    const sessionColor = colors[SESSION_COLOR_KEYS[row.session] ?? 'purple'];
    const sessionIcon  = SESSION_ICONS[row.session]  ?? '•';
    const stripColor   = hasHit ? colors.cyan : sessionColor + '80';
    const digitColor   = hasHit ? colors.cyan : sessionColor;
    const hit          = row.hits[0];
    const rowId        = `${row.jurisdiction}|${row.session}|${row.date_et}`;
    const isExpanded   = hasHit && expandedRowId === rowId;
    // Use signal_box (0–1) as temperature for HitReplay color (0–100 scale).
    // Hot picks get red, warm gold, mild green — the existing HitReplay vocabulary.
    const replayTemp   = hasHit ? Math.round((hit?.signal_box ?? 0.75) * 100) : 0;

    return (
      <View style={[s.card, hasHit && s.cardHit]}>
        <View style={[s.strip, { backgroundColor: stripColor }]} />
        <View style={s.cardInner}>
          <View style={s.cardHeader}>
            <View style={[s.statePill, { borderColor: hasHit ? colors.cyan : sessionColor + '70' }]}>
              <Text style={[s.stateText, { color: hasHit ? colors.cyan : sessionColor }]}>{row.jurisdiction}</Text>
            </View>
            <View style={s.gameInfo}>
              <Text style={s.gameName}>{row.jurisdiction} · {row.game || '3-digit draw'}</Text>
              {hasHit && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    style={[s.hitBadge, { flex: 1 }]}
                    onPress={() => setDetail(hitRowToPickItem({
                      combo: hit.combo,
                      combo_set: hit.combo_set ?? null,
                      scope: hit.scope ?? null,
                      rank: hit.rank ?? null,
                      hit_state: hit.hit_state || row.jurisdiction || null,
                      hit_session: hit.hit_session || row.session || null,
                      hit_box: !!hit.hit_box,
                      hit_straight: !!hit.hit_straight,
                      hit_result: hit.actual_result || row.result_digits || null,
                      signal_box:    hit.signal_box    ?? null,
                      signal_pburst: hit.signal_pburst ?? null,
                      signal_co:     hit.signal_co     ?? null,
                      signal_dgc:    hit.signal_dgc    ?? null,
                      energy:        hit.energy        ?? null,
                    }))}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={`ZK6 match ${hit.combo}, tap for details`}
                  >
                    <Text style={s.hitBadgeText}>
                      {'🎯 ZK6 MATCH · '}
                      {row.hits.map(h => {
                        const type  = h.hit_straight ? 'Straight' : 'Box';
                        const scope = h.scope ? h.scope.charAt(0).toUpperCase() + h.scope.slice(1) : '';
                        // Drop indicator rank — for K6 picks outside top-30 (BUG-127),
                        // rank can be 31+ which reads as a "top-30 leak" even though
                        // on_slate=true confirms it's a real K6 pick.
                        return `K6 ${scope} · ${type}`;
                      }).join('  ')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      const r = await shareTextSafe(`🎯 ZK6 MATCH! ${row.result_digits} — ${row.hits.map(h => h.hit_straight ? 'Straight' : 'Box').join(' & ')} match on ${row.date_et ?? ''} (${row.jurisdiction})`);
                      if (r === 'copied') alertAsync('Copied to clipboard', 'Sharing is unavailable in this browser — the text is on your clipboard.');
                    }}
                    style={s.shareBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel="Share this match"
                  >
                    <Text style={s.shareBtnText}>↑</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {hasHit ? (
              // E2: chevron replaces the BOX/PBR/DGC operator column.
              // Tap to expand inline HitReplay (the WE-PICKED → DRAWN moment).
              <TouchableOpacity
                onPress={() => setExpandedRowId(prev => prev === rowId ? null : rowId)}
                style={s.chevronBtn}
                accessibilityRole="button"
                accessibilityLabel={isExpanded ? 'Hide match replay' : 'Show match replay'}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {isExpanded
                  ? <ChevronUp size={18} color={colors.cyan} />
                  : <ChevronDown size={18} color={colors.cyan} />}
                <Text style={s.chevronLabel}>Replay</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={s.resultRow}>
            <View style={s.sessionRow}>
              <Text style={s.sessionIcon}>{sessionIcon}</Text>
              <Text style={[s.sessionText, { color: sessionColor }]}>
                {row.session.charAt(0).toUpperCase() + row.session.slice(1)}
              </Text>
            </View>
            <Text style={[s.resultDigits, { color: digitColor }]}>{row.result_digits}</Text>
          </View>

          {/* E2: inline HitReplay revealed on tap — DESIGN-02 T2 (2.1):
              fade in/out instead of instant mount; no-ops on Reduce Motion. */}
          {isExpanded && hit && (
            <Animated.View
              entering={reduceMotion ? undefined : FadeIn.duration(150)}
              exiting={reduceMotion ? undefined : FadeOut.duration(100)}
              style={{ marginTop: 12 }}
            >
              <HitReplay
                pick={{
                  combo: hit.combo,
                  hitResult: row.result_digits,
                  hitType: hit.hit_straight ? 'straight' : 'box',
                  hitState: row.jurisdiction,
                  hitDate: row.date_et,
                  temperature: replayTemp,
                }}
              />
            </Animated.View>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* ── Header (shared ScreenHeader — design.md step 3) ── */}
      <ScreenHeader
        title={
          <Text style={s.headerTitle}>
            <Text style={s.headerWhite}>Results </Text>
            <Text style={s.headerCyan}>Ledger</Text>
          </Text>
        }
        subtitle={
          <Text style={s.headerSub}>
            {formatDisplayDate(selectedDate)} · {stats.total} draws
            {stats.hits > 0 && (
              <Text
                onPress={() => setHitSummaryOpen(true)}
                style={{ color: colors.cyan }}
                accessibilityRole="button"
                accessibilityLabel={`${stats.hits} matches — open match summary`}
              > · {stats.hits} 🎯</Text>
            )}
            {/* E3: streak chip — only shown when streak >= 2 (1 isn't a streak) */}
            {streak >= 2 && (
              <Text
                onPress={() => setHitSummaryOpen(true)}
                style={{ color: colors.hotStreak }}
                accessibilityRole="button"
                accessibilityLabel={`${streak} day match streak — open match summary`}
              > · 🔥 {streak}d streak</Text>
            )}
          </Text>
        }
        rightSlot={
          <TouchableOpacity onPress={() => setStatsOpen(true)} style={s.overflowBtn}>
            <MoreHorizontal size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        }
      />

      {/* ── Date tabs (E4: hit-count dots) ── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={s.dateTabs} contentContainerStyle={s.dateTabsContent}
      >
        {recentDates.map(date => {
          const isActive = date === selectedDate;
          const dayHits = hitsByDate.get(date);
          const hadHit = (dayHits?.total ?? 0) > 0;
          const hadStraight = (dayHits?.straight ?? 0) > 0;
          const dotColor = hadStraight ? colors.gold : colors.cyan;
          return (
            <TouchableOpacity key={date} onPress={() => setSelectedDate(date)} style={[s.dateTab, isActive && s.dateTabActive]}>
              <Text style={[s.dateTabText, isActive && s.dateTabTextActive]}>{getDateLabel(date)}</Text>
              {hadHit && (
                <View style={[s.tabDot, { backgroundColor: dotColor, shadowColor: dotColor }]} />
              )}
              {(dayHits?.total ?? 0) >= 2 && (
                <View style={[s.tabDot, s.tabDotSecondary, { backgroundColor: dotColor }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Compact controls strip — search icon + session pills + count ── */}
      {searchOpen ? (
        <View style={s.searchRow}>
          <Search size={14} color={colors.textTertiary} />
          <TextInput
            style={s.searchInput} placeholder="Search state, game, or digits…"
            placeholderTextColor={colors.textTertiary} value={searchQuery} onChangeText={setSearchQuery} autoFocus
          />
          <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchOpen(false); }}>
            <X size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.controlsRow}>
          <TouchableOpacity onPress={() => setSearchOpen(true)} style={s.searchTrigger}>
            <Search size={14} color={searchQuery ? colors.cyan : colors.textTertiary} />
            {searchQuery ? <Text style={s.searchActiveText}>{searchQuery}</Text> : null}
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.filterRow} contentContainerStyle={s.filterRowContent}>
            {/* DESIGN-02 T1.4: shared SessionFilter (design.md step 5) replaces
                the inline pills; 44pt effective targets via hitSlop */}
            <SessionFilter value={sessionFilter} onChange={setSessionFilter} />
          </ScrollView>
          <Text style={s.drawCount}>{filtered.length}</Text>
          <TouchableOpacity
            onPress={() => setClusterView(v => !v)}
            style={[s.filterBtn, clusterView && s.filterBtnActive]}
          >
            <Text style={[s.filterText, clusterView && s.filterTextActive]}>Clusters</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── E1 / E5: Hit Hero band when hits > 0, otherwise miss-day warmth ── */}
      {!ledgerLoading && processed.length > 0 && (
        stats.hits > 0 ? (
          <HitHeroBand
            items={hitSummaryItems.map<HitHeroItem>(h => ({
              combo: h.combo,
              hitResult: h.hitResult,
              hitType: h.hitType === 'STRAIGHT' ? 'straight' : 'box',
              jurisdiction: h.jurisdiction,
              session: h.session,
              scope: h.scope,
              rank: h.rank,
              comboSet: h.comboSet,
              signalBox:    h.signalBox,
              signalPburst: h.signalPburst,
              signalCo:     h.signalCo,
              signalDgc:    h.signalDgc,
              energy:       h.energy,
            }))}
            onItemPress={(it) => {
              // Locate the matching HitSummaryItem so we keep our richer
              // pass-through fields (signals + energy + comboSet) when
              // opening the modal.
              const src = hitSummaryItems.find(h =>
                h.combo === it.combo &&
                (h.jurisdiction ?? '') === (it.jurisdiction ?? '') &&
                (h.session ?? '') === (it.session ?? '')
              ) ?? null;
              if (src) openHitDetail(src);
            }}
          />
        ) : (
          <MissDayCard
            selectedDate={selectedDate}
            hitsLast7Days={hitsLast7Days}
            followedCount={followedStates.length}
          />
        )
      )}

      {/* ── List (the hero) ── */}
      {ledgerLoading ? (
        <View style={{ paddingHorizontal: theme.layout.screenInset, paddingTop: 12 }}>
          <NeonSkeleton variant="row" count={8} />
        </View>
      ) : clusterView ? (
        <ScrollView style={s.flatList} contentContainerStyle={s.list}>
          {clustered.length === 0 ? (
            <View style={{ padding: 32, alignItems: 'center' }}>
              <Text style={{ color: colors.textTertiary, fontSize: 13 }}>No draws to cluster</Text>
            </View>
          ) : clustered.map(c => (
            <View key={c.comboSet} style={[s.card, c.hitCount > 0 && s.cardHit]}>
              <View style={[s.strip, { backgroundColor: c.hitCount > 0 ? colors.cyan : colors.bgElevated }]} />
              <View style={s.cardInner}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: colors.text, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 2 }}>
                    {c.comboSet}
                  </Text>
                  <View style={{ flex: 1 }} />
                  {c.hitCount > 0 && (
                    <View style={{ backgroundColor: colors.cyan + '22', borderWidth: 1, borderColor: colors.cyan + '55', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: colors.cyan }}>🎯 {c.hitCount} MATCH{c.hitCount > 1 ? 'ES' : ''}</Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 11, color: colors.textTertiary }}>{c.drawCount} draw{c.drawCount > 1 ? 's' : ''}</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>
                  Perms: {c.digits.join(' · ')}
                </Text>
              </View>
            </View>
          ))}
          <HitSummary items={hitSummaryItems} onItemPress={openHitDetail} />
        </ScrollView>
      ) : (
        <FlatList
          style={s.flatList} data={grouped}
          keyExtractor={(item, idx) =>
            item.type === 'header' ? `h-${item.session}`
            : `r-${item.data.jurisdiction}-${item.data.date_et}-${item.data.session}-${idx}`}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          ListFooterComponent={<HitSummary items={hitSummaryItems} onItemPress={openHitDetail} />}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={colors.purple} colors={[colors.purple]} />
          }
          ListEmptyComponent={
            <EmptyState icon={Calendar} title="No draws found"
              message="No draws recorded for this date. Import results to see the ledger." />
          }
        />
      )}

      <StatsSheet visible={statsOpen} onClose={() => setStatsOpen(false)} stats={stats} selectedDate={selectedDate} />
      <HitSummarySheet visible={hitSummaryOpen} onClose={() => setHitSummaryOpen(false)} items={hitSummaryItems} selectedDate={selectedDate} onItemPress={(h) => { setHitSummaryOpen(false); openHitDetail(h); }} />

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

// ─── styles ────────────────────────────────────────────────────────────
const makeS = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // header
  // header layout moved to components/ScreenHeader.tsx (design.md step 3).
  // The opaque `backgroundColor: colors.bgElevated` on the gradient view was likely
  // hiding the gradient on some platforms — fixed in passing.
  headerTitle: { fontSize: 22, fontWeight: '900', color: colors.text, lineHeight: 26, fontFamily: theme.typography.fontFamily.bold },
  headerWhite: { color: colors.text },
  headerCyan:  { color: colors.cyan },
  headerSub:   { fontSize: 11, color: colors.textTertiary, marginTop: 3, fontFamily: theme.typography.fontFamily.mono },
  overflowBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },

  // date tabs
  dateTabs: { flexShrink: 0, maxHeight: 46, backgroundColor: colors.bgElevated, borderBottomWidth: 1, borderBottomColor: colors.border },
  dateTabsContent: { paddingHorizontal: theme.layout.screenInset, paddingVertical: 6, gap: 8 },
  dateTab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: theme.borderRadius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, position: 'relative' },
  dateTabActive: { backgroundColor: colors.purple + '22', borderColor: colors.purple + '88' },
  dateTabText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono },
  dateTabTextActive: { color: colors.purple, fontWeight: '700' },
  // E4: hit-count dots — absolute-positioned top-right of each date tab.
  tabDot: {
    position: 'absolute',
    top: 4,
    right: 6,
    width: 5,
    height: 5,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
  },
  tabDotSecondary: { right: 13 },

  // controls strip (collapsed default)
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.layout.screenInset, paddingVertical: 8, backgroundColor: colors.bgElevated, borderBottomWidth: 1, borderBottomColor: colors.border },
  searchTrigger: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.borderRadius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, maxWidth: 120 },
  searchActiveText: { fontSize: 11, color: colors.cyan, fontFamily: theme.typography.fontFamily.mono, maxWidth: 80 },
  filterRow: { flex: 1, flexShrink: 0, maxHeight: 32 },
  filterRowContent: { gap: 4, alignItems: 'center' },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 5, borderRadius: theme.borderRadius.pill, backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  filterBtnActive: { backgroundColor: colors.cyan + '18', borderColor: colors.cyan + '66' },
  filterIcon: { fontSize: 11 },
  filterText: { fontSize: 10, fontWeight: '600', color: colors.textSecondary, fontFamily: theme.typography.fontFamily.mono },
  filterTextActive: { color: colors.cyan, fontWeight: '700' },
  drawCount: { fontSize: 11, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '700', flexShrink: 0 },

  // search expanded
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: theme.layout.screenInset, marginVertical: 8, backgroundColor: colors.surface2, borderRadius: theme.borderRadius.card, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.cyan + '55' },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: colors.text, fontFamily: theme.typography.fontFamily.mono },

  // section header in list
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.layout.screenInset, paddingVertical: 10, gap: 6 },
  dot: { fontSize: 7 },
  sectionIcon: { fontSize: 14 },
  sectionText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold },
  sectionCount: { fontSize: 10, color: colors.textTertiary, fontFamily: theme.typography.fontFamily.mono },

  // list/loading
  flatList: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: colors.textTertiary },
  list: { paddingBottom: 40 },

  // card
  card: { flexDirection: 'row', backgroundColor: colors.surface2, marginHorizontal: theme.layout.screenInset, marginBottom: 8, borderRadius: theme.borderRadius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  cardHit: { backgroundColor: colors.cyan + '0d', borderColor: colors.cyan + '55' },
  strip: { width: 6 },
  cardInner: { flex: 1, padding: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  statePill: { width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, marginRight: 8 },
  stateText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  gameInfo: { flex: 1 },
  gameName: { fontSize: 13, fontWeight: '700', color: colors.text, fontFamily: theme.typography.fontFamily.medium },
  hitBadge: { marginTop: 4, backgroundColor: colors.cyan + '18', borderWidth: 1, borderColor: colors.cyan + '55', borderRadius: theme.borderRadius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  hitBadgeText: { fontSize: 9, fontWeight: '900', color: colors.cyan, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.5 },
  shareBtn: { marginTop: 4, backgroundColor: colors.cyan + '22', borderWidth: 1, borderColor: colors.cyan + '55', borderRadius: 8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  shareBtnText: { fontSize: 13, fontWeight: '900', color: colors.cyan },
  // E2: chevron column — replaces BOX/PBR/DGC operator-speak signal column.
  chevronBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
    gap: 1,
  },
  chevronLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: colors.cyan + 'aa',
    fontFamily: theme.typography.fontFamily.monoBold,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sessionIcon: { fontSize: 13 },
  sessionText: { fontSize: 11, fontWeight: '600' },
  resultDigits: { fontSize: 30, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 8 },
});
