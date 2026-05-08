import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────

const D = {
  bg:       theme.colors.background,
  surface:  theme.colors.bgElevated,
  surface2: theme.colors.card,
  border:   theme.colors.border,
  purple:   theme.colors.purple,
  teal:     theme.colors.cyan,   // BOX / Frequency / Hits
  orange:   theme.colors.amber,  // Morning / warm
  amber:    theme.colors.gold,   // Midday / consistency
  violet:   theme.colors.purple, // Evening
  indigo:   theme.colors.blue,   // Night
  text:     theme.colors.text,
  textSub:  theme.colors.textSecondary,
  textDim:  theme.colors.textTertiary,
};

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface LedgerRow {
  jurisdiction: string;
  game: string;
  date_et: string;
  session: string;
  result_digits: string;
}

interface HitRow {
  slate_date: string;
  scope: string;
  mode: string;
  rank: number;
  combo: string;
  best_order: string;
  hit_state: string;
  hit_session: string;
  hit_box: boolean;
  hit_straight: boolean;
  signal_box?: number;
  signal_pburst?: number;
  signal_dgc?: number;
}

interface ProcessedEntry extends LedgerRow {
  hits: HitRow[];
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const SESSION_ICONS: Record<string, string> = {
  morning: '🌅',
  midday:  '☀️',
  evening: '🌙',
  night:   '🌑',
};

const SESSION_COLORS: Record<string, string> = {
  morning: theme.colors.amber,
  midday:  theme.colors.gold,
  evening: theme.colors.purple,
  night:   theme.colors.blue,
};

function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function getDateLabel(dateStr: string): string {
  const today = getTodayET();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (dateStr === today) return 'Today';
  if (dateStr === yStr) return 'Yesterday';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getRecentDates(): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }));
  }
  return dates;
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function ResultsScreen() {
  const recentDates = getRecentDates();
  const [selectedDate, setSelectedDate] = useState(recentDates[0]);
  const [sessionFilter, setSessionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: ledger, isLoading: ledgerLoading, refetch: refetchLedger, isRefetching } = useQuery<LedgerRow[]>({
    queryKey: ['v_recent_ledger', selectedDate],
    queryFn: async () => {
      const res = await fetchFromSupabase<LedgerRow[]>({
        path: `/rest/v1/histories?select=jurisdiction,game,date_et,session,result_digits&date_et=eq.${selectedDate}&order=session.asc,jurisdiction.asc&limit=500`,
        method: 'GET',
      });
      return Array.isArray(res) ? res : [];
    },
    staleTime: 30000,
  });

  const { data: hits, refetch: refetchHits } = useQuery<HitRow[]>({
    queryKey: ['daily_intelligence_hits', selectedDate],
    queryFn: async () => {
      const res = await fetchFromSupabase<HitRow[]>({
        path: `/rest/v1/daily_intelligence?select=slate_date,scope,mode,rank,combo,best_order,hit_state,hit_session,hit_box,hit_straight,signal_box,signal_pburst,signal_dgc&slate_date=eq.${selectedDate}&on_slate=eq.true&or=(hit_box.eq.true,hit_straight.eq.true)&mode=in.(balanced,conservative,aggressive)&order=rank.asc&limit=500`,
        method: 'GET',
      });
      return Array.isArray(res) ? res : [];
    },
    staleTime: 30000,
  });

  const handleRefresh = async () => {
    await Promise.all([refetchLedger(), refetchHits()]);
  };

  const processed = useMemo<ProcessedEntry[]>(() => {
    if (!ledger) return [];
    return ledger.map(row => {
      const rowDate = row.date_et?.split('T')[0];
      const matchingHits = (hits || []).filter(h => {
        const hDate = h.slate_date?.split('T')[0];
        return h.hit_state === row.jurisdiction &&
          hDate === rowDate &&
          h.hit_session?.toLowerCase() === row.session?.toLowerCase();
      });
      return { ...row, hits: matchingHits };
    });
  }, [ledger, hits]);

  const filtered = useMemo(() => {
    let rows = processed;
    if (sessionFilter !== 'all') {
      rows = rows.filter(r => r.session?.toLowerCase() === sessionFilter);
    }
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

  const stats = useMemo(() => {
    const all = processed;
    return {
      morn:  all.filter(r => r.session === 'morning').length,
      mid:   all.filter(r => r.session === 'midday').length,
      eve:   all.filter(r => r.session === 'evening').length,
      night: all.filter(r => r.session === 'night').length,
      total: all.length,
      hits:  all.filter(r => r.hits.length > 0).length,
    };
  }, [processed]);

  const grouped = useMemo(() => {
    const sessions = ['morning', 'midday', 'evening', 'night'];
    const result: Array<{ type: 'header'; session: string; count: number } | { type: 'row'; data: ProcessedEntry }> = [];
    for (const sess of sessions) {
      const rows = filtered.filter(r => r.session === sess);
      if (rows.length === 0) continue;
      result.push({ type: 'header', session: sess, count: rows.length });
      rows.forEach(r => result.push({ type: 'row', data: r }));
    }
    return result;
  }, [filtered]);

  // ─── RENDERERS ───────────────────────────────────────────────────────────

  const renderItem = ({ item }: { item: typeof grouped[0] }) => {
    if (item.type === 'header') {
      const color = SESSION_COLORS[item.session] ?? D.purple;
      const icon  = SESSION_ICONS[item.session]  ?? '•';
      const label = item.session.charAt(0).toUpperCase() + item.session.slice(1);
      return (
        <View style={s.sectionHeader}>
          <Text style={[s.dot, { color }]}>●</Text>
          <Text style={s.sectionIcon}>{icon}</Text>
          <Text style={[s.sectionText, { color }]}>
            {label.toUpperCase()} DRAWS
          </Text>
          <Text style={s.sectionCount}>— {item.count} results</Text>
        </View>
      );
    }

    const row          = item.data;
    const hasHit       = row.hits.length > 0;
    const sessionColor = SESSION_COLORS[row.session] ?? D.purple;
    const sessionIcon  = SESSION_ICONS[row.session]  ?? '•';
    const stripColor   = hasHit ? D.teal : sessionColor + '80';
    const digitColor   = hasHit ? D.teal : sessionColor;
    const hit          = row.hits[0];

    return (
      <View style={[s.card, hasHit && s.cardHit]}>
        {/* Left glow strip */}
        <View style={[s.strip, { backgroundColor: stripColor }]} />

        <View style={s.cardInner}>
          {/* Row 1: state pill + game info + F/B/S */}
          <View style={s.cardHeader}>
            <View style={[s.statePill, { borderColor: hasHit ? D.teal : sessionColor + '70' }]}>
              <Text style={[s.stateText, { color: hasHit ? D.teal : sessionColor }]}>
                {row.jurisdiction}
              </Text>
            </View>

            <View style={s.gameInfo}>
              <Text style={s.gameName}>{row.jurisdiction} · {row.game || 'Pick 3'}</Text>
              {hasHit && (
                <View style={s.hitBadge}>
                  <Text style={s.hitBadgeText}>
                    {'🎯 ZK6 HIT · '}
                    {row.hits.map(h => {
                      const type = h.hit_straight ? 'Straight' : 'Box';
                      const scope = h.scope.charAt(0).toUpperCase() + h.scope.slice(1);
                      return `${scope} Pick #${h.rank} · ${type}`;
                    }).join('  ')}
                  </Text>
                </View>
              )}
            </View>

            {/* F / B / S signals */}
            <View style={s.signalCol}>
              {hasHit && hit ? (
                <>
                  <View style={s.signalItem}>
                    <Text style={[s.signalKey, { color: theme.colors.cyan }]}>F</Text>
                    <Text style={[s.signalVal, { color: theme.colors.cyan }]}>
                      {Math.round((hit.signal_box ?? 0) * 100)}
                    </Text>
                  </View>
                  <View style={s.signalItem}>
                    <Text style={[s.signalKey, { color: theme.colors.rose }]}>B</Text>
                    <Text style={[s.signalVal, { color: theme.colors.rose }]}>
                      {Math.round((hit.signal_pburst ?? 0) * 100)}
                    </Text>
                  </View>
                  <View style={s.signalItem}>
                    <Text style={[s.signalKey, { color: theme.colors.gold }]}>S</Text>
                    <Text style={[s.signalVal, { color: theme.colors.gold }]}>
                      {Math.round((hit.signal_dgc ?? 0) * 100)}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[s.signalKey, { color: theme.colors.cyan + '40' }]}>F</Text>
                  <Text style={[s.signalKey, { color: theme.colors.rose  + '40' }]}>B</Text>
                  <Text style={[s.signalKey, { color: theme.colors.gold  + '40' }]}>S</Text>
                </>
              )}
            </View>
          </View>

          {/* Row 2: session label + result digits */}
          <View style={s.resultRow}>
            <View style={s.sessionRow}>
              <Text style={s.sessionIcon}>{sessionIcon}</Text>
              <Text style={[s.sessionText, { color: sessionColor }]}>
                {row.session.charAt(0).toUpperCase() + row.session.slice(1)}
              </Text>
            </View>
            <Text style={[s.resultDigits, { color: digitColor }]}>
              {row.result_digits}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* Header */}
      <LinearGradient
        colors={theme.gradients.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={s.header}
      >
        <Text style={s.headerTitle}>
          <Text style={s.headerWhite}>Results </Text>
          <Text style={s.headerPurple}>Ledger</Text>
        </Text>
        <Text style={s.headerSub}>{formatDisplayDate(selectedDate)} · {stats.total} draws</Text>
      </LinearGradient>

      {/* Date tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.dateTabs}
        contentContainerStyle={s.dateTabsContent}
      >
        {recentDates.map(date => {
          const isActive = date === selectedDate;
          return (
            <TouchableOpacity
              key={date}
              onPress={() => setSelectedDate(date)}
              style={[s.dateTab, isActive && s.dateTabActive]}
            >
              <Text style={[s.dateTabText, isActive && s.dateTabTextActive]}>
                {getDateLabel(date)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Search */}
      <View style={s.searchRow}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Search state, game, or digits…"
          placeholderTextColor={D.textDim}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={s.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Session filter pills + draw count */}
      <View style={s.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterRow}
          contentContainerStyle={s.filterRowContent}
        >
          {[
            { key: 'all',     label: '⚡ All'       },
            { key: 'morning', label: '🌅 Morning'   },
            { key: 'midday',  label: '☀️ Midday'    },
            { key: 'evening', label: '🌙 Evening'   },
            { key: 'night',   label: '🌑 Night'     },
          ].map(f => {
            const active = sessionFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setSessionFilter(f.key)}
                style={[s.filterBtn, active && s.filterBtnActive]}
              >
                <Text style={[s.filterText, active && s.filterTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <Text style={s.drawCount}>{filtered.length}</Text>
      </View>

      {/* Stats row */}
      <View style={s.statsRow}>
        {[
          { num: stats.morn,  label: 'Morn',    color: D.orange  },
          { num: stats.mid,   label: 'Mid',     color: D.amber   },
          { num: stats.eve,   label: 'Eve',     color: D.violet  },
          { num: stats.night, label: 'Night',   color: D.indigo  },
          { num: stats.total, label: 'Total',   color: D.text    },
          { num: stats.hits,  label: '🎯 Hits', color: D.teal   },
        ].map((item, i, arr) => (
          <React.Fragment key={item.label}>
            <View style={s.statItem}>
              <Text style={[s.statNum, { color: item.color }]}>{item.num}</Text>
              <Text style={s.statLabel}>{item.label}</Text>
            </View>
            {i < arr.length - 1 && <View style={s.statDivider} />}
          </React.Fragment>
        ))}
      </View>

      {/* List */}
      {ledgerLoading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={D.purple} size="large" />
          <Text style={s.loadingText}>Loading draws…</Text>
        </View>
      ) : (
        <FlatList
          style={s.flatList}
          data={grouped}
          keyExtractor={(item, idx) =>
            item.type === 'header'
              ? `h-${item.session}`
              : `r-${item.data.jurisdiction}-${item.data.date_et}-${item.data.session}-${idx}`
          }
          renderItem={renderItem}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={handleRefresh}
              tintColor={D.purple}
              colors={[D.purple]}
            />
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>📭</Text>
              <Text style={s.emptyText}>No draws found for this date.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: D.bg },

  // Header
  header:       { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, backgroundColor: D.surface, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  headerTitle:  { fontSize: 22, fontWeight: '900', color: D.text, fontFamily: theme.typography.fontFamily.bold },
  headerWhite:  { color: D.text },
  headerPurple: { color: theme.colors.cyan },
  headerSub:    { fontSize: 11, color: D.textDim, marginTop: 3, fontFamily: theme.typography.fontFamily.mono },

  // Date tabs
  dateTabs:        { flexShrink: 0, maxHeight: 46, backgroundColor: D.surface, borderBottomWidth: 1, borderBottomColor: D.border },
  dateTabsContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  dateTab:         { paddingHorizontal: 16, paddingVertical: 7, borderRadius: theme.borderRadius.pill, backgroundColor: D.surface2, borderWidth: 1, borderColor: D.border },
  dateTabActive:   { backgroundColor: theme.colors.purple + '22', borderColor: theme.colors.purple + '88' },
  dateTabText:     { fontSize: 12, fontWeight: '600', color: D.textSub, fontFamily: theme.typography.fontFamily.mono },
  dateTabTextActive: { color: theme.colors.purple, fontWeight: '700' },

  // Search
  searchRow:   { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginVertical: 8, backgroundColor: D.surface2, borderRadius: theme.borderRadius.card, paddingHorizontal: 12, borderWidth: 1, borderColor: D.border },
  searchIcon:  { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: D.text, fontFamily: theme.typography.fontFamily.mono },
  searchClear: { fontSize: 13, color: D.textDim, paddingLeft: 8 },

  // Filter pills
  filterSection:    { flexDirection: 'row', alignItems: 'center', paddingRight: 12, marginBottom: 2, backgroundColor: D.surface, borderBottomWidth: 1, borderBottomColor: D.border },
  filterRow:        { flex: 1, flexShrink: 0, maxHeight: 40 },
  filterRowContent: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  filterBtn:        { paddingHorizontal: 12, paddingVertical: 5, borderRadius: theme.borderRadius.pill, backgroundColor: 'transparent', borderWidth: 1, borderColor: D.border },
  filterBtnActive:  { backgroundColor: theme.colors.cyan + '18', borderColor: theme.colors.cyan + '66' },
  filterText:       { fontSize: 11, fontWeight: '600', color: D.textSub, fontFamily: theme.typography.fontFamily.mono },
  filterTextActive: { color: theme.colors.cyan, fontWeight: '700' },
  drawCount:        { fontSize: 11, color: D.textDim, fontFamily: theme.typography.fontFamily.mono, fontWeight: '700', marginLeft: 8, flexShrink: 0 },

  // Stats row
  statsRow:    { flexDirection: 'row', alignItems: 'center', backgroundColor: D.surface, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4, borderBottomWidth: 1, borderColor: D.border },
  statItem:    { flex: 1, alignItems: 'center' },
  statNum:     { fontSize: 16, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '800' },
  statLabel:   { fontSize: 9, color: D.textDim, fontFamily: theme.typography.fontFamily.mono, fontWeight: '600', marginTop: 1, letterSpacing: 0.5 },
  statDivider: { width: 1, height: 22, backgroundColor: D.border },

  // Section headers
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  dot:           { fontSize: 7 },
  sectionIcon:   { fontSize: 14 },
  sectionText:   { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.mono },
  sectionCount:  { fontSize: 10, color: D.textDim, fontFamily: theme.typography.fontFamily.mono },

  // List / loading
  flatList:    { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: D.textDim },
  list:        { paddingBottom: 40 },
  emptyWrap:   { alignItems: 'center', marginTop: 60, gap: 10 },
  emptyIcon:   { fontSize: 36 },
  emptyText:   { fontSize: 14, color: D.textDim, textAlign: 'center' },

  // Card
  card:      { flexDirection: 'row', backgroundColor: D.surface2, marginHorizontal: 12, marginBottom: 8, borderRadius: theme.borderRadius.card, borderWidth: 1, borderColor: D.border, overflow: 'hidden' },
  cardHit:   { backgroundColor: theme.colors.cyan + '0d', borderColor: theme.colors.cyan + '55' },
  strip:     { width: 6 },
  cardInner: { flex: 1, padding: 12 },

  // Card header row
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  statePill:  { width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: D.bg, marginRight: 8 },
  stateText:  { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  gameInfo:   { flex: 1 },
  gameName:   { fontSize: 13, fontWeight: '700', color: D.text, fontFamily: theme.typography.fontFamily.medium },

  // ZK6 hit badge
  hitBadge:     { marginTop: 4, alignSelf: 'flex-start', backgroundColor: theme.colors.cyan + '18', borderWidth: 1, borderColor: theme.colors.cyan + '55', borderRadius: theme.borderRadius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  hitBadgeText: { fontSize: 9, fontWeight: '900', color: theme.colors.cyan, fontFamily: theme.typography.fontFamily.mono, letterSpacing: 0.5 },

  // F/B/S signals
  signalCol:  { flexDirection: 'row', gap: 6, alignItems: 'center', marginLeft: 6 },
  signalItem: { alignItems: 'center', gap: 1 },
  signalKey:  { fontSize: 9, fontWeight: '900', letterSpacing: 0.5, fontFamily: theme.typography.fontFamily.mono },
  signalVal:  { fontSize: 11, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },

  // Result row
  resultRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sessionIcon: { fontSize: 13 },
  sessionText: { fontSize: 11, fontWeight: '600' },
  resultDigits:{ fontSize: 30, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 8 },
});
