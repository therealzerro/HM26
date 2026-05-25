// app/(tabs)/zk30.tsx
//
// ARCH-06 v1.2 — Data Ring tile + chrome compression.
//
// Compact: 6×5 grid of CompactTile (data-ring layout) — all 30 picks fit
//   on iPhone SE in one screen, ring shows energy, pips show signals.
// List:    full ZK30PickCardRow with horizontal right-side stack.
// Hits:    filtered; empty state has inline "run detection now" trigger.
//
// Header compressed: meta info (version / hash / gen-time) moved into an
// info popover behind ⓘ. Stale-day shown as a chip in the header, not a
// full-width banner.
//
// View-mode preference persisted in AsyncStorage (`zk30-view-mode`).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Modal,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, RefreshCw, Layers, Grid3x3, List, Sparkles, Info, Play, X, TrendingUp, MoreHorizontal } from 'lucide-react-native';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { storage } from '@/lib/storage';
import { theme } from '@/constants/theme';
import { EmptyState } from '@/components/EmptyState';
import { CompactTile } from '@/components/zk30/CompactTile';
import { ZK30PickCardRow } from '@/components/zk30/PickCard';
import { ZK30PickDetailModal } from '@/components/zk30/PickDetailModal';
import { ZK30PickItem, ZK30Snapshot } from '@/components/zk30/types';

type ViewMode = 'compact' | 'list' | 'hits' | 'results' | 'tbd1' | 'tbd2';
const PRIMARY_MODES: readonly ViewMode[] = ['compact', 'list', 'hits'] as const;
const VIEW_MODE_KEY = 'zk30-view-mode';

// ─── Data fetch (today → yesterday fallback) ───────────────────────────────

async function fetchLatestZK30Snapshot(): Promise<ZK30Snapshot | null> {
  const today = getTodayET();
  const yesterday = getYesterdayET();

  const fetchOne = async (date: string): Promise<ZK30Snapshot | null> => {
    const rows = await fetchFromSupabase<ZK30Snapshot[]>({
      path: `/rest/v1/slate_snapshots_zk30?slate_date=eq.${date}` +
            `&deleted_at=is.null&order=updated_at_et.desc&limit=1&select=*`,
    });
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  };

  const t = await fetchOne(today);
  if (t) return t;
  const y = await fetchOne(yesterday);
  return y ? { ...y, _isStale: true } : null;
}

function parsePicks(raw: ZK30PickItem[] | string | null | undefined): ZK30PickItem[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function ZK30Screen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const s = useMemo(() => makeS(colors), [colors]);

  // Blue is the ZK30 brand accent — swap for ZK6's purple.
  const brandBlue = colors.dataBlue;

  const [viewMode, setViewMode] = useState<ViewMode>('compact');
  const [detail, setDetail] = useState<ZK30PickItem | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [hitTriggerBusy, setHitTriggerBusy] = useState(false);
  const [hitTriggerStatus, setHitTriggerStatus] = useState<string>('');

  // Load persisted view mode on mount.
  useEffect(() => {
    storage.getItem(VIEW_MODE_KEY).then((v) => {
      if (v === 'compact' || v === 'list' || v === 'hits' || v === 'results' || v === 'tbd1' || v === 'tbd2') {
        setViewMode(v as ViewMode);
      }
    });
  }, []);
  const changeViewMode = useCallback((m: ViewMode) => {
    setViewMode(m);
    storage.setItem(VIEW_MODE_KEY, m).catch(() => {});
  }, []);

  const { data: snapshot, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: ['zk30-snapshot-latest'],
    queryFn: fetchLatestZK30Snapshot,
    staleTime: 5 * 60 * 1000,
  });

  // Refetch on focus so post-09:00-ET drop appears when operator returns.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['zk30-snapshot-latest'] });
    }, [queryClient]),
  );

  // Inline hit-detection trigger for the empty-hits state. Mirrors the admin
  // DashboardView button so operator doesn't need to leave /zk30.
  const triggerHitDetection = useCallback(async () => {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) { setHitTriggerStatus('✗ config missing'); return; }
    setHitTriggerBusy(true);
    setHitTriggerStatus('');
    try {
      const res = await fetch(`${url}/functions/v1/run-hit-detection-zk30`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: getTodayET() }),
      });
      const text = await res.text();
      if (!res.ok) {
        setHitTriggerStatus(`✗ ${res.status}`);
      } else {
        try {
          const json = JSON.parse(text);
          const hits = typeof json?.hitsFound === 'number' ? json.hitsFound : 0;
          setHitTriggerStatus(`✓ ${hits} hit${hits !== 1 ? 's' : ''}`);
          queryClient.invalidateQueries({ queryKey: ['zk30-snapshot-latest'] });
        } catch {
          setHitTriggerStatus('✓ done');
        }
      }
    } catch (e) {
      setHitTriggerStatus(`✗ ${String(e instanceof Error ? e.message : e).slice(0, 40)}`);
    } finally {
      setHitTriggerBusy(false);
    }
  }, [queryClient]);

  const allPicks = parsePicks(snapshot?.top_k_straights_json).slice(0, 30);
  const hitPicks = allPicks.filter((p) => p.hitType);

  // Filter by view mode for body.
  const visiblePicks = viewMode === 'hits' ? hitPicks : allPicks;

  // ─── Header subline metadata ─────────────────────────────────────────────
  const slateDateLabel = snapshot?.slate_date ?? '—';
  const isStale = snapshot?._isStale === true;
  const hash8 = (snapshot?.snapshot_hash ?? '').slice(0, 8);
  const engineV = snapshot?.engine_version ?? '—';
  const genTime = snapshot?.updated_at_et
    ? new Date(snapshot.updated_at_et).toLocaleString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York',
      }) + ' ET'
    : '—';

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* Header — back + brand + stale pill + info + refresh */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="Back">
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={s.headerTitleRow}>
            <Text style={s.headerTitle}>
              ZK30  <Text style={[s.headerBrand, { color: brandBlue }]}>·</Text>  TX
            </Text>
            {isStale && (
              <View style={[s.stalePill, { backgroundColor: colors.warning + '20', borderColor: colors.warning + '88' }]}>
                <Text style={[s.stalePillText, { color: colors.warning }]}>YESTERDAY</Text>
              </View>
            )}
          </View>
          <Text style={s.headerSub}>{slateDateLabel}</Text>
        </View>
        <TouchableOpacity onPress={() => setInfoOpen(true)} style={s.iconBtn} accessibilityLabel="Slate info">
          <Info size={17} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => refetch()} style={s.iconBtn} accessibilityLabel="Refresh">
          {isRefetching
            ? <ActivityIndicator size="small" color={brandBlue} />
            : <RefreshCw size={17} color={colors.textSecondary} />}
        </TouchableOpacity>
      </View>

      {/* Primary view-mode chips — data shapes */}
      <View style={s.modeRow}>
        <ModeChip
          active={viewMode === 'compact'}
          onPress={() => changeViewMode('compact')}
          Icon={Grid3x3}
          label="COMPACT"
          count={allPicks.length}
          colors={colors}
          brand={brandBlue}
        />
        <ModeChip
          active={viewMode === 'list'}
          onPress={() => changeViewMode('list')}
          Icon={List}
          label="LIST"
          count={allPicks.length}
          colors={colors}
          brand={brandBlue}
        />
        <ModeChip
          active={viewMode === 'hits'}
          onPress={() => changeViewMode('hits')}
          Icon={Sparkles}
          label="HITS"
          count={hitPicks.length}
          colors={colors}
          brand={brandBlue}
          highlight={hitPicks.length > 0}
        />
      </View>

      {/* Secondary chips — sections (compact: smaller chip height to save vertical) */}
      <View style={s.modeRowSecondary}>
        <ModeChip
          active={viewMode === 'results'}
          onPress={() => changeViewMode('results')}
          Icon={TrendingUp}
          label="RESULTS"
          colors={colors}
          brand={brandBlue}
          compact
        />
        <ModeChip
          active={viewMode === 'tbd1'}
          onPress={() => changeViewMode('tbd1')}
          Icon={MoreHorizontal}
          label="TBD · 1"
          colors={colors}
          brand={brandBlue}
          compact
        />
        <ModeChip
          active={viewMode === 'tbd2'}
          onPress={() => changeViewMode('tbd2')}
          Icon={MoreHorizontal}
          label="TBD · 2"
          colors={colors}
          brand={brandBlue}
          compact
        />
      </View>

      {/* Body */}
      {isPending ? (
        <View style={s.center}>
          <ActivityIndicator color={brandBlue} size="large" />
          <Text style={[s.loadingText, { color: brandBlue }]}>Loading today&apos;s slate…</Text>
        </View>
      ) : isError ? (
        <View style={s.center}>
          <Text style={[s.errorText, { color: colors.error }]}>Failed to load slate</Text>
          <TouchableOpacity style={[s.primaryBtn, { backgroundColor: brandBlue }]} onPress={() => refetch()}>
            <Text style={s.primaryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !snapshot ? (
        <View style={s.center}>
          <EmptyState
            icon={Layers}
            title="No slate yet"
            message="Next drop: 09:00 ET (Mon–Sat). Regenerate manually from Admin."
          />
          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: brandBlue }]}
            onPress={() => router.push('/(tabs)/admin')}
          >
            <Text style={s.primaryBtnText}>Open Admin</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === 'hits' && hitPicks.length === 0 ? (
        <View style={s.center}>
          <EmptyState
            icon={Sparkles}
            title="No hits yet"
            message="Nightly detection runs at 23:30 ET. Trigger it now to score today's slate against any draws that have landed."
          />
          <TouchableOpacity
            disabled={hitTriggerBusy}
            onPress={triggerHitDetection}
            style={[s.primaryBtn, { backgroundColor: brandBlue, flexDirection: 'row', gap: 8 }]}
          >
            {hitTriggerBusy ? <ActivityIndicator size="small" color="#fff" /> : <Play size={14} color="#fff" />}
            <Text style={s.primaryBtnText}>
              {hitTriggerBusy ? 'Running…' : 'Run Hit Detection Now'}
            </Text>
          </TouchableOpacity>
          {hitTriggerStatus !== '' && (
            <Text style={[s.statusText, { color: hitTriggerStatus.startsWith('✓') ? colors.success : colors.error }]}>
              {hitTriggerStatus}
            </Text>
          )}
          <TouchableOpacity
            style={[s.secondaryBtn, { borderColor: brandBlue }]}
            onPress={() => changeViewMode('compact')}
          >
            <Text style={[s.secondaryBtnText, { color: brandBlue }]}>Show all 30 picks</Text>
          </TouchableOpacity>
        </View>
      ) : viewMode === 'results' ? (
        <ResultsPlaceholder
          colors={colors}
          brand={brandBlue}
          hitsToday={hitPicks.length}
          slateDate={slateDateLabel}
          onTriggerDetection={triggerHitDetection}
          triggerBusy={hitTriggerBusy}
          triggerStatus={hitTriggerStatus}
        />
      ) : viewMode === 'tbd1' ? (
        <TbdPlaceholder colors={colors} brand={brandBlue} label="TBD · 1" />
      ) : viewMode === 'tbd2' ? (
        <TbdPlaceholder colors={colors} brand={brandBlue} label="TBD · 2" />
      ) : viewMode === 'compact' ? (
        // No ScrollView in compact mode — pure flexbox so the 5×6 grid claims
        // all available vertical space. Tiles get flex:1 per row + row gets
        // flex:1 per column = equal-share auto-sizing tiles.
        <View style={s.gridContainer}>
          <View style={s.gridArea}>
            {Array.from({ length: Math.ceil(visiblePicks.length / 5) }).map((_, rowIdx) => (
              <View key={rowIdx} style={s.gridRowFlex}>
                {visiblePicks.slice(rowIdx * 5, rowIdx * 5 + 5).map((p) => (
                  <CompactTile
                    key={`tile-${p.rank}`}
                    pick={p}
                    brandBlue={brandBlue}
                    onPress={() => setDetail(p)}
                  />
                ))}
                {visiblePicks.slice(rowIdx * 5, rowIdx * 5 + 5).length < 5 &&
                  Array.from({
                    length: 5 - visiblePicks.slice(rowIdx * 5, rowIdx * 5 + 5).length,
                  }).map((_, i) => <View key={`pad-${i}`} style={{ flex: 1 }} />)}
              </View>
            ))}
          </View>
        </View>
      ) : (
        // List + Hits: ScrollView (rows always scroll regardless of count).
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        >
          {visiblePicks.map((p) => (
            <ZK30PickCardRow
              key={`row-${p.rank}`}
              pick={p}
              brandBlue={brandBlue}
              onPress={() => setDetail(p)}
            />
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Detail modal */}
      <ZK30PickDetailModal
        pick={detail}
        brandBlue={brandBlue}
        onClose={() => setDetail(null)}
      />

      {/* Info popover — replaces the always-visible meta strip */}
      <Modal transparent animationType="fade" visible={infoOpen} onRequestClose={() => setInfoOpen(false)}>
        <TouchableOpacity style={s.popBackdrop} activeOpacity={1} onPress={() => setInfoOpen(false)}>
          <View style={[s.popCard, { borderColor: brandBlue + '55' }]}>
            <View style={s.popHeader}>
              <Text style={[s.popTitle, { color: brandBlue }]}>SLATE METADATA</Text>
              <TouchableOpacity onPress={() => setInfoOpen(false)} style={s.popClose}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <PopKV label="Jurisdiction"   value="TX" colors={colors} />
            <PopKV label="Scope"          value="allday" colors={colors} />
            <PopKV label="Mode"           value="balanced" colors={colors} />
            <PopKV label="Engine"         value={`v${engineV}`} colors={colors} />
            <PopKV label="Slate date"     value={slateDateLabel} colors={colors} />
            <PopKV label="Snapshot hash"  value={hash8 || '——'} colors={colors} mono />
            <PopKV label="Generated"      value={genTime} colors={colors} />
            <PopKV label="Pick count"     value={String(allPicks.length)} colors={colors} />
            <PopKV label="Hits annotated" value={String(hitPicks.length)} colors={colors} />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Section subcomponents (Results + TBD placeholders) ────────────────────

function ResultsPlaceholder({
  colors, brand, hitsToday, slateDate, onTriggerDetection, triggerBusy, triggerStatus,
}: {
  colors: ColorTokens; brand: string; hitsToday: number; slateDate: string;
  onTriggerDetection: () => void; triggerBusy: boolean; triggerStatus: string;
}) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {/* Today's at-a-glance */}
      <View style={[placeholderStyles.card, { borderColor: brand + '44' }]}>
        <Text style={[placeholderStyles.sectionLabel, { color: brand }]}>TODAY  ·  {slateDate}</Text>
        <View style={placeholderStyles.statsRow}>
          <View style={placeholderStyles.statBlock}>
            <Text style={[placeholderStyles.statNum, { color: hitsToday > 0 ? colors.gold : colors.textTertiary }]}>
              {hitsToday}
            </Text>
            <Text style={[placeholderStyles.statLabel, { color: colors.textTertiary }]}>HITS</Text>
          </View>
          <View style={[placeholderStyles.statBlock, { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 18 }]}>
            <Text style={[placeholderStyles.statNum, { color: colors.text }]}>30</Text>
            <Text style={[placeholderStyles.statLabel, { color: colors.textTertiary }]}>PICKS</Text>
          </View>
          <View style={[placeholderStyles.statBlock, { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 18 }]}>
            <Text style={[placeholderStyles.statNum, { color: colors.text }]}>
              {hitsToday > 0 ? Math.round((hitsToday / 30) * 100) : 0}<Text style={{ fontSize: 13 }}>%</Text>
            </Text>
            <Text style={[placeholderStyles.statLabel, { color: colors.textTertiary }]}>RATE</Text>
          </View>
        </View>
        <TouchableOpacity
          disabled={triggerBusy}
          onPress={onTriggerDetection}
          style={[placeholderStyles.runBtn, { backgroundColor: brand + '15', borderColor: brand + '88' }]}
        >
          {triggerBusy && <ActivityIndicator size="small" color={brand} />}
          <Text style={[placeholderStyles.runBtnText, { color: brand }]}>
            {triggerBusy ? 'Running…' : 'Run Hit Detection Now'}
          </Text>
        </TouchableOpacity>
        {triggerStatus !== '' && (
          <Text style={[{ fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 4 },
            { color: triggerStatus.startsWith('✓') ? colors.success : colors.error }]}>
            {triggerStatus}
          </Text>
        )}
      </View>

      {/* Coming-soon roadmap */}
      <View style={[placeholderStyles.card, { borderColor: colors.border }]}>
        <Text style={[placeholderStyles.sectionLabel, { color: colors.textTertiary }]}>COMING SOON</Text>
        {[
          '7-day hit rollup chart',
          'By-session breakdown (Morning / Day / Evening / Night)',
          'Fireball-only vs natural-only split',
          'Best-performing energy band',
          'Cron health (last 14 runs · success/failure)',
        ].map((line, i) => (
          <View key={i} style={placeholderStyles.bullet}>
            <Text style={[placeholderStyles.bulletDot, { color: brand }]}>·</Text>
            <Text style={[placeholderStyles.bulletText, { color: colors.textSecondary }]}>{line}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function TbdPlaceholder({ colors, brand, label }: { colors: ColorTokens; brand: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
      <View style={{
        width: 64, height: 64, borderRadius: 32,
        borderWidth: 2, borderColor: brand + '55',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <MoreHorizontal size={24} color={brand} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '900', color: colors.text, letterSpacing: 1 }}>{label}</Text>
      <Text style={{ fontSize: 12, color: colors.textTertiary, textAlign: 'center', maxWidth: 240, lineHeight: 17 }}>
        Reserved slot. Defines later when the data model + operator workflow are sketched.
      </Text>
    </View>
  );
}

const placeholderStyles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1, borderRadius: 12,
    padding: 14, gap: 10,
  },
  sectionLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  statsRow: { flexDirection: 'row', alignItems: 'baseline', gap: 18, paddingVertical: 4 },
  statBlock: { alignItems: 'flex-start' },
  statNum: { fontSize: 28, fontWeight: '900', fontFamily: theme.typography.fontFamily.monoBold },
  statLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  runBtn: {
    flexDirection: 'row', gap: 6,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  runBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  bullet: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  bulletDot: { fontSize: 16, fontWeight: '900', lineHeight: 16 },
  bulletText: { fontSize: 11, flex: 1, lineHeight: 16 },
});

function PopKV({ label, value, colors, mono }: { label: string; value: string; colors: ColorTokens; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 }}>
      <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textTertiary, letterSpacing: 0.5 }}>{label}</Text>
      <Text style={{
        fontSize: 12, fontWeight: '700', color: colors.text,
        fontFamily: mono ? theme.typography.fontFamily.mono : undefined,
      }}>
        {value}
      </Text>
    </View>
  );
}

// ─── Mode chip subcomponent ────────────────────────────────────────────────

interface ChipProps {
  active: boolean;
  onPress: () => void;
  Icon: React.ComponentType<{ size: number; color: string }>;
  label: string;
  count?: number;
  colors: ColorTokens;
  brand: string;
  highlight?: boolean;
  compact?: boolean;
}
function ModeChip({ active, onPress, Icon, label, count, colors, brand, highlight, compact }: ChipProps) {
  const color = active ? brand : colors.textTertiary;
  const padV = compact ? 5 : 8;
  const iconSize = compact ? 11 : 12;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        chipStyles.chip,
        {
          paddingVertical: padV,
          backgroundColor: active ? brand + '18' : 'transparent',
          borderColor: active ? brand + '88' : colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} view${typeof count === 'number' ? `, ${count} picks` : ''}`}
    >
      <Icon size={iconSize} color={color} />
      <Text style={[chipStyles.label, { color }]}>{label}</Text>
      {typeof count === 'number' && (
        <View
          style={[
            chipStyles.count,
            {
              backgroundColor: active ? brand + '33' : colors.surfaceLight,
              borderColor: highlight && count > 0 ? colors.gold + '88' : 'transparent',
              borderWidth: highlight && count > 0 ? 1 : 0,
            },
          ]}
        >
          <Text style={[chipStyles.countText, { color: highlight && count > 0 ? colors.gold : color }]}>
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const chipStyles = StyleSheet.create({
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  label: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  count: {
    minWidth: 22,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 99,
    alignItems: 'center',
  },
  countText: { fontSize: 9, fontWeight: '900' },
});

const makeS = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: colors.surface2,
  },
  iconBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 18,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: {
    fontSize: 18, fontWeight: '900', color: colors.text,
    letterSpacing: 1, fontFamily: theme.typography.fontFamily.bold,
  },
  headerBrand: { fontSize: 18, fontWeight: '900' },
  headerSub: {
    fontSize: 11, color: colors.textSecondary, fontWeight: '600',
    marginTop: 1,
  },
  stalePill: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, borderWidth: 1,
  },
  stalePillText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },

  statusText: { fontSize: 11, fontWeight: '700', marginTop: 4 },

  // Info popover
  popBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 64,
    paddingRight: 8,
  },
  popCard: {
    minWidth: 260,
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 1,
  },
  popHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  popTitle: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  popClose: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },

  // View-mode chips — primary (data shapes)
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
    gap: 6,
  },
  // Secondary (sections — Results / TBD / TBD)
  modeRowSecondary: {
    flexDirection: 'row',
    paddingHorizontal: 12, paddingTop: 0, paddingBottom: 8,
    gap: 6,
  },

  // States
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, gap: 12,
  },
  loadingText: { fontSize: 13, marginTop: 8 },
  errorText: { fontSize: 14, fontWeight: '700' },
  primaryBtn: {
    paddingHorizontal: 24, paddingVertical: 11,
    borderRadius: 10, marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  secondaryBtn: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1.5,
    marginTop: 8,
  },
  secondaryBtnText: { fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },

  // Body
  scroll: { flex: 1 },
  listContent: { padding: 10, gap: 8 },

  // Compact grid — pure flexbox, fills available vertical space.
  gridContainer: { flex: 1, paddingHorizontal: 8, paddingVertical: 8 },
  gridArea: { flex: 1, gap: 6 },
  gridRowFlex: { flex: 1, flexDirection: 'row', gap: 6 },
});
