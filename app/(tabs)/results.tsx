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

import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { NeonRefreshControl as RefreshControl } from '@/components/NeonRefreshControl';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { Calendar, MoreHorizontal, Search, X } from 'lucide-react-native';
import { EmptyState } from '@/components/EmptyState';

// ─── tokens ─────────────────────────────────────────────────────────────
const D = {
  bg:       theme.colors.background,
  surface:  theme.colors.bgElevated,
  surface2: theme.colors.surface2,
  border:   theme.colors.border,
  purple:   theme.colors.purple,
  teal:     theme.colors.cyan,
  amber:    theme.colors.gold,
  orange:   theme.colors.amber,
  violet:   theme.colors.purple,
  indigo:   theme.colors.blue,
  text:     theme.colors.text,
  textSub:  theme.colors.textSecondary,
  textDim:  theme.colors.textTertiary,
};

interface LedgerRow {
  jurisdiction: string; game: string; date_et: string; session: string; result_digits: string;
}
interface HitRow {
  slate_date: string; scope: string; mode: string; rank: number; combo: string;
  hit_state: string; hit_session: string; hit_box: boolean; hit_straight: boolean;
  signal_box?: number; signal_pburst?: number; signal_dgc?: number;
}
interface ProcessedEntry extends LedgerRow { hits: HitRow[] }

const SESSION_ICONS:  Record<string, string> = { morning: '🌅', midday: '☀️', evening: '🌙', night: '🌑' };
const SESSION_COLORS: Record<string, string> = {
  morning: theme.colors.amber, midday: theme.colors.gold,
  evening: theme.colors.purple, night: theme.colors.blue,
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
function getDateLabel(dateStr: string): string {
  const today = getTodayET();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yStr = y.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  if (dateStr === today) return 'Today';
  if (dateStr === yStr)  return 'Yesterday';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
}

// ─── stats overflow sheet ──────────────────────────────────────────────
function StatsSheet({ visible, onClose, stats, selectedDate }: {
  visible: boolean; onClose: () => void; selectedDate: string;
  stats: { morn: number; mid: number; eve: number; night: number; total: number; hits: number };
}) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={ss.backdrop} onPress={onClose}>
        <Pressable style={ss.sheet} onPress={e => e.stopPropagation()}>
          <View style={ss.handle} />
          <View style={ss.headerRow}>
            <Text style={ss.heading}>{formatDisplayDate(selectedDate)}</Text>
            <TouchableOpacity onPress={onClose}><X size={20} color={theme.colors.textSecondary} /></TouchableOpacity>
          </View>

          <Text style={ss.sectionTitle}>Session breakdown</Text>
          <View style={ss.grid}>
            <Stat n={stats.morn}  label="🌅 Morning" c={D.orange} />
            <Stat n={stats.mid}   label="☀️ Midday"  c={D.amber}  />
            <Stat n={stats.eve}   label="🌙 Evening" c={D.violet} />
            <Stat n={stats.night} label="🌑 Night"   c={D.indigo} />
          </View>

          <Text style={ss.sectionTitle}>Totals</Text>
          <View style={ss.bigRow}>
            <View style={ss.bigStat}>
              <Text style={[ss.bigNum, { color: D.text }]}>{stats.total}</Text>
              <Text style={ss.bigLabel}>Total draws</Text>
            </View>
            <View style={ss.divider} />
            <View style={ss.bigStat}>
              <Text style={[ss.bigNum, { color: D.teal }]}>{stats.hits}</Text>
              <Text style={ss.bigLabel}>🎯 ZK6 hits</Text>
            </View>
            <View style={ss.divider} />
            <View style={ss.bigStat}>
              <Text style={[ss.bigNum, { color: D.amber }]}>
                {stats.total > 0 ? Math.round((stats.hits / stats.total) * 100) : 0}%
              </Text>
              <Text style={ss.bigLabel}>Hit rate</Text>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
function Stat({ n, label, c }: { n: number; label: string; c: string }) {
  return (
    <View style={ss.cell}>
      <Text style={[ss.cellNum, { color: c }]}>{n}</Text>
      <Text style={ss.cellLabel}>{label}</Text>
    </View>
  );
}
const ss = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.bgElevated, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 36, gap: 12, borderTopWidth: 1.5, borderColor: theme.colors.purple + '44' },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, marginBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  sectionTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: theme.colors.textTertiary, fontFamily: theme.typography.fontFamily.monoBold, marginTop: 6 },
  grid: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: theme.colors.card, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border },
  cellNum: { fontSize: 22, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '900' },
  cellLabel: { fontSize: 10, color: theme.colors.textSecondary, marginTop: 4 },
  bigRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.card, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, paddingVertical: 14 },
  bigStat: { flex: 1, alignItems: 'center' },
  bigNum: { fontSize: 26, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '900' },
  bigLabel: { fontSize: 10, color: theme.colors.textTertiary, marginTop: 4 },
  divider: { width: 1, height: 30, backgroundColor: theme.colors.border },
});

// ─── main screen ───────────────────────────────────────────────────────
export default function ResultsScreen() {
  const recentDates = getRecentDates();
  const [selectedDate,  setSelectedDate]  = useState(recentDates[0]);
  const [sessionFilter, setSessionFilter] = useState<string>('all');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchOpen,    setSearchOpen]    = useState(false);
  const [statsOpen,     setStatsOpen]     = useState(false);

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

  // Slates can be tagged with selectedDate OR the next calendar day if the
  // slate was regenerated after midnight ET (BUG-18 late-regen scenario).
  // All three hit-detection queries use in.(selectedDate,nextDay).
  const nextDay = getNextDay(selectedDate);

  const { data: hits, refetch: refetchHits } = useQuery<HitRow[]>({
    queryKey: ['daily_intelligence_hits', selectedDate],
    queryFn: async () => {
      const res = await fetchFromSupabase<HitRow[]>({
        path: `/rest/v1/daily_intelligence?select=slate_date,scope,mode,rank,combo,hit_state,hit_session,hit_box,hit_straight,signal_box,signal_pburst,signal_dgc&slate_date=in.(${selectedDate},${nextDay})&or=(hit_box.eq.true,hit_straight.eq.true)&mode=in.(balanced,conservative,aggressive)&order=rank.asc&limit=500`,
        method: 'GET',
      });
      return Array.isArray(res) ? res : [];
    },
    staleTime: 30000,
  });

  // All on-slate picks — client-side hit detection when backfill hasn't run.
  const { data: onSlatePicks, refetch: refetchOnSlatePicks } = useQuery<HitRow[]>({
    queryKey: ['daily_intelligence_on_slate', selectedDate],
    queryFn: async () => {
      const res = await fetchFromSupabase<HitRow[]>({
        path: `/rest/v1/daily_intelligence?select=slate_date,scope,mode,rank,combo,hit_state,hit_session,hit_box,hit_straight,signal_box,signal_pburst,signal_dgc&slate_date=in.(${selectedDate},${nextDay})&on_slate=eq.true&mode=in.(balanced,conservative,aggressive)&order=rank.asc&limit=500`,
        method: 'GET',
      });
      return Array.isArray(res) ? res : [];
    },
    staleTime: 30000,
  });

  // Tier-3: direct all-scope snapshot query — avoids useSnapshot() scope limitation.
  // Fetches all scopes (midday/evening/allday) so allday slate hits appear regardless
  // of the user's current scope selection.
  const { data: snapshotRows } = useQuery<any[]>({
    queryKey: ['slate_snapshots_hits', selectedDate],
    queryFn: async () => {
      const twoDaysOut = getNextDay(nextDay);
      const res = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?select=scope,top_k_straights_json&deleted_at=is.null&updated_at_et=gte.${selectedDate}&updated_at_et=lt.${twoDaysOut}T09:00:00&mode=neq.zk30&order=updated_at_et.desc.nullslast&limit=20`,
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

  // When today has no draw results yet, auto-select yesterday so the screen
  // is never blank on first load (draws typically land around noon/7:30pm ET).
  useEffect(() => {
    if (!ledgerLoading && ledger !== undefined && ledger.length === 0 && selectedDate === recentDates[0]) {
      setSelectedDate(recentDates[1]);
    }
  }, [ledger, ledgerLoading]);

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

      // Tier 1: DB-confirmed hits (backfill ran, hit_box/hit_straight set)
      const dbHits = (hits || []).filter(h => {
        const hDate = h.slate_date?.split('T')[0];
        return h.hit_state === row.jurisdiction && hDate === rowDate
          && h.hit_session?.toLowerCase() === row.session?.toLowerCase();
      });
      if (dbHits.length > 0) return { ...row, hits: dbHits };

      // Tier 2: daily_intelligence box-match (backfill not yet run)
      const diHits = (csMap.get(rowSet) || []).map(h => ({
        ...h,
        hit_box: true,
        hit_straight: h.combo === row.result_digits,
        hit_state: row.jurisdiction,
        hit_session: row.session,
      }));
      if (diHits.length > 0) return { ...row, hits: diHits };

      // Tier 3: snapshot hitType picks — bypasses daily_intelligence entirely
      const snapHits = (snapMap.get(rowSet) || []).map(h => ({
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
    morn:  processed.filter(r => r.session === 'morning').length,
    mid:   processed.filter(r => r.session === 'midday').length,
    eve:   processed.filter(r => r.session === 'evening').length,
    night: processed.filter(r => r.session === 'night').length,
    total: processed.length,
    hits:  processed.filter(r => r.hits.length > 0).length,
  }), [processed]);

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

  const renderItem = ({ item }: { item: typeof grouped[0] }) => {
    if (item.type === 'header') {
      const color = SESSION_COLORS[item.session] ?? D.purple;
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
    const sessionColor = SESSION_COLORS[row.session] ?? D.purple;
    const sessionIcon  = SESSION_ICONS[row.session]  ?? '•';
    const stripColor   = hasHit ? D.teal : sessionColor + '80';
    const digitColor   = hasHit ? D.teal : sessionColor;
    const hit          = row.hits[0];

    return (
      <View style={[s.card, hasHit && s.cardHit]}>
        <View style={[s.strip, { backgroundColor: stripColor }]} />
        <View style={s.cardInner}>
          <View style={s.cardHeader}>
            <View style={[s.statePill, { borderColor: hasHit ? D.teal : sessionColor + '70' }]}>
              <Text style={[s.stateText, { color: hasHit ? D.teal : sessionColor }]}>{row.jurisdiction}</Text>
            </View>
            <View style={s.gameInfo}>
              <Text style={s.gameName}>{row.jurisdiction} · {row.game || 'Pick 3'}</Text>
              {hasHit && (
                <View style={s.hitBadge}>
                  <Text style={s.hitBadgeText}>
                    {'🎯 ZK6 HIT · '}
                    {row.hits.map(h => {
                      const type  = h.hit_straight ? 'Straight' : 'Box';
                      const scope = h.scope.charAt(0).toUpperCase() + h.scope.slice(1);
                      return `${scope} Pick #${h.rank} · ${type}`;
                    }).join('  ')}
                  </Text>
                </View>
              )}
            </View>
            <View style={s.signalCol}>
              {hasHit && hit ? (
                <>
                  <View style={s.signalItem}>
                    <Text style={[s.signalKey, { color: theme.colors.cyan }]}>F</Text>
                    <Text style={[s.signalVal, { color: theme.colors.cyan }]}>{Math.round((hit.signal_box ?? 0) * 100)}</Text>
                  </View>
                  <View style={s.signalItem}>
                    <Text style={[s.signalKey, { color: theme.colors.rose }]}>B</Text>
                    <Text style={[s.signalVal, { color: theme.colors.rose }]}>{Math.round((hit.signal_pburst ?? 0) * 100)}</Text>
                  </View>
                  <View style={s.signalItem}>
                    <Text style={[s.signalKey, { color: theme.colors.gold }]}>S</Text>
                    <Text style={[s.signalVal, { color: theme.colors.gold }]}>{Math.round((hit.signal_dgc ?? 0) * 100)}</Text>
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
          <View style={s.resultRow}>
            <View style={s.sessionRow}>
              <Text style={s.sessionIcon}>{sessionIcon}</Text>
              <Text style={[s.sessionText, { color: sessionColor }]}>
                {row.session.charAt(0).toUpperCase() + row.session.slice(1)}
              </Text>
            </View>
            <Text style={[s.resultDigits, { color: digitColor }]}>{row.result_digits}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* ── Header ── */}
      <LinearGradient colors={theme.gradients.header} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>
            <Text style={s.headerWhite}>Results </Text>
            <Text style={s.headerCyan}>Ledger</Text>
          </Text>
          <Text style={s.headerSub}>
            {formatDisplayDate(selectedDate)} · {stats.total} draws
            {stats.hits > 0 && <Text style={{ color: D.teal }}> · {stats.hits} 🎯</Text>}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setStatsOpen(true)} style={s.overflowBtn}>
          <MoreHorizontal size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Date tabs ── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={s.dateTabs} contentContainerStyle={s.dateTabsContent}
      >
        {recentDates.map(date => {
          const isActive = date === selectedDate;
          return (
            <TouchableOpacity key={date} onPress={() => setSelectedDate(date)} style={[s.dateTab, isActive && s.dateTabActive]}>
              <Text style={[s.dateTabText, isActive && s.dateTabTextActive]}>{getDateLabel(date)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Compact controls strip — search icon + session pills + count ── */}
      {searchOpen ? (
        <View style={s.searchRow}>
          <Search size={14} color={D.textDim} />
          <TextInput
            style={s.searchInput} placeholder="Search state, game, or digits…"
            placeholderTextColor={D.textDim} value={searchQuery} onChangeText={setSearchQuery} autoFocus
          />
          <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchOpen(false); }}>
            <X size={16} color={D.textDim} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.controlsRow}>
          <TouchableOpacity onPress={() => setSearchOpen(true)} style={s.searchTrigger}>
            <Search size={14} color={searchQuery ? D.teal : D.textDim} />
            {searchQuery ? <Text style={s.searchActiveText}>{searchQuery}</Text> : null}
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.filterRow} contentContainerStyle={s.filterRowContent}>
            {[
              { key: 'all',     label: 'All',     icon: '⚡' },
              { key: 'morning', label: 'Morn',    icon: '🌅' },
              { key: 'midday',  label: 'Mid',     icon: '☀️' },
              { key: 'evening', label: 'Eve',     icon: '🌙' },
              { key: 'night',   label: 'Night',   icon: '🌑' },
            ].map(f => {
              const active = sessionFilter === f.key;
              return (
                <TouchableOpacity key={f.key} onPress={() => setSessionFilter(f.key)}
                  style={[s.filterBtn, active && s.filterBtnActive]}>
                  <Text style={s.filterIcon}>{f.icon}</Text>
                  <Text style={[s.filterText, active && s.filterTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Text style={s.drawCount}>{filtered.length}</Text>
        </View>
      )}

      {/* ── List (the hero) ── */}
      {ledgerLoading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator color={D.purple} size="large" />
          <Text style={s.loadingText}>Loading draws…</Text>
        </View>
      ) : (
        <FlatList
          style={s.flatList} data={grouped}
          keyExtractor={(item, idx) =>
            item.type === 'header' ? `h-${item.session}`
            : `r-${item.data.jurisdiction}-${item.data.date_et}-${item.data.session}-${idx}`}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={D.purple} colors={[D.purple]} />
          }
          ListEmptyComponent={
            <EmptyState icon={Calendar} title="No draws found"
              message="No draws recorded for this date. Import results to see the ledger." />
          }
        />
      )}

      <StatsSheet visible={statsOpen} onClose={() => setStatsOpen(false)} stats={stats} selectedDate={selectedDate} />
    </SafeAreaView>
  );
}

// ─── styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: D.bg },

  // header
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, backgroundColor: D.surface, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  headerTitle: { fontSize: 22, fontWeight: '900', color: D.text, fontFamily: theme.typography.fontFamily.bold },
  headerWhite: { color: D.text },
  headerCyan:  { color: theme.colors.cyan },
  headerSub:   { fontSize: 11, color: D.textDim, marginTop: 3, fontFamily: theme.typography.fontFamily.mono },
  overflowBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: D.border, backgroundColor: D.bg },

  // date tabs
  dateTabs: { flexShrink: 0, maxHeight: 46, backgroundColor: D.surface, borderBottomWidth: 1, borderBottomColor: D.border },
  dateTabsContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  dateTab: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: theme.borderRadius.pill, backgroundColor: D.surface2, borderWidth: 1, borderColor: D.border },
  dateTabActive: { backgroundColor: theme.colors.purple + '22', borderColor: theme.colors.purple + '88' },
  dateTabText: { fontSize: 12, fontWeight: '600', color: D.textSub, fontFamily: theme.typography.fontFamily.mono },
  dateTabTextActive: { color: theme.colors.purple, fontWeight: '700' },

  // controls strip (collapsed default)
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: D.surface, borderBottomWidth: 1, borderBottomColor: D.border },
  searchTrigger: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: theme.borderRadius.pill, backgroundColor: D.surface2, borderWidth: 1, borderColor: D.border, maxWidth: 120 },
  searchActiveText: { fontSize: 11, color: D.teal, fontFamily: theme.typography.fontFamily.mono, maxWidth: 80 },
  filterRow: { flex: 1, flexShrink: 0, maxHeight: 32 },
  filterRowContent: { gap: 4, alignItems: 'center' },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 5, borderRadius: theme.borderRadius.pill, backgroundColor: 'transparent', borderWidth: 1, borderColor: D.border },
  filterBtnActive: { backgroundColor: theme.colors.cyan + '18', borderColor: theme.colors.cyan + '66' },
  filterIcon: { fontSize: 11 },
  filterText: { fontSize: 10, fontWeight: '600', color: D.textSub, fontFamily: theme.typography.fontFamily.mono },
  filterTextActive: { color: theme.colors.cyan, fontWeight: '700' },
  drawCount: { fontSize: 11, color: D.textDim, fontFamily: theme.typography.fontFamily.monoBold, fontWeight: '700', flexShrink: 0 },

  // search expanded
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginVertical: 8, backgroundColor: D.surface2, borderRadius: theme.borderRadius.card, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.cyan + '55' },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 13, color: D.text, fontFamily: theme.typography.fontFamily.mono },

  // section header in list
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  dot: { fontSize: 7 },
  sectionIcon: { fontSize: 14 },
  sectionText: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, fontFamily: theme.typography.fontFamily.monoBold },
  sectionCount: { fontSize: 10, color: D.textDim, fontFamily: theme.typography.fontFamily.mono },

  // list/loading
  flatList: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 13, color: D.textDim },
  list: { paddingBottom: 40 },

  // card
  card: { flexDirection: 'row', backgroundColor: D.surface2, marginHorizontal: 12, marginBottom: 8, borderRadius: theme.borderRadius.card, borderWidth: 1, borderColor: D.border, overflow: 'hidden' },
  cardHit: { backgroundColor: theme.colors.cyan + '0d', borderColor: theme.colors.cyan + '55' },
  strip: { width: 6 },
  cardInner: { flex: 1, padding: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  statePill: { width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: D.bg, marginRight: 8 },
  stateText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  gameInfo: { flex: 1 },
  gameName: { fontSize: 13, fontWeight: '700', color: D.text, fontFamily: theme.typography.fontFamily.medium },
  hitBadge: { marginTop: 4, alignSelf: 'flex-start', backgroundColor: theme.colors.cyan + '18', borderWidth: 1, borderColor: theme.colors.cyan + '55', borderRadius: theme.borderRadius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  hitBadgeText: { fontSize: 9, fontWeight: '900', color: theme.colors.cyan, fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 0.5 },
  signalCol: { flexDirection: 'row', gap: 6, alignItems: 'center', marginLeft: 6 },
  signalItem: { alignItems: 'center', gap: 1 },
  signalKey: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5, fontFamily: theme.typography.fontFamily.monoBold },
  signalVal: { fontSize: 11, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sessionIcon: { fontSize: 13 },
  sessionText: { fontSize: 11, fontWeight: '600' },
  resultDigits: { fontSize: 30, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold, letterSpacing: 8 },
});
