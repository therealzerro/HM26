// app/(tabs)/zk30.tsx
//
// Phase 7.A → 7.E rewrite (ARCH-06 v1.1 UI overhaul).
//
// Dark cosmic theme honoring useTheme(); blue (colors.dataBlue) replaces
// purple as the brand accent. Back arrow → router.back(). Three view modes:
//
//   Compact (default): 5×6 grid of CompactTile — all 30 picks visible.
//   List:              scroll of ZK30PickCardRow — full signal bars + pressure.
//   Hits:              filtered to picks with hitType set — wins surface.
//
// Tap any tile/row → ZK30PickDetailModal (with fireball substitution
// explainer when applicable).
//
// View-mode preference persisted in AsyncStorage (`zk30-view-mode`).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, RefreshCw, Layers, Grid3x3, List, Sparkles } from 'lucide-react-native';
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

type ViewMode = 'compact' | 'list' | 'hits';
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

  // Load persisted view mode on mount.
  useEffect(() => {
    storage.getItem(VIEW_MODE_KEY).then((v) => {
      if (v === 'compact' || v === 'list' || v === 'hits') setViewMode(v);
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
      {/* Header — back arrow + brand + actions */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconBtn} accessibilityLabel="Back">
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>
            ZK30  <Text style={[s.headerBrand, { color: brandBlue }]}>·</Text>  TX
          </Text>
          <Text style={s.headerSub}>
            {slateDateLabel}
            {isStale && <Text style={[s.staleInline, { color: colors.warning }]}>  (yesterday)</Text>}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => refetch()}
          style={s.iconBtn}
          accessibilityLabel="Refresh"
        >
          {isRefetching
            ? <ActivityIndicator size="small" color={brandBlue} />
            : <RefreshCw size={18} color={colors.textSecondary} />}
        </TouchableOpacity>
      </View>

      {/* Meta strip (mono, low contrast) */}
      <View style={[s.metaStrip, { borderTopColor: brandBlue + '33' }]}>
        <Text style={s.metaText}>
          v{engineV}  ·  {hash8 || '——'}  ·  gen {genTime}
        </Text>
      </View>

      {/* Stale banner */}
      {isStale && (
        <View style={[s.staleBanner, { backgroundColor: colors.warning + '18', borderColor: colors.warning + '55' }]}>
          <Text style={[s.staleText, { color: colors.warning }]}>
            Today&apos;s slate hasn&apos;t generated yet — showing {slateDateLabel}.
          </Text>
        </View>
      )}

      {/* View-mode chips */}
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
            message="Nightly hit detection runs at 23:30 ET. Trigger it now from Admin."
          />
          <TouchableOpacity
            style={[s.secondaryBtn, { borderColor: brandBlue }]}
            onPress={() => changeViewMode('compact')}
          >
            <Text style={[s.secondaryBtnText, { color: brandBlue }]}>Show all 30 picks</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={
            viewMode === 'compact'
              ? s.gridContent
              : s.listContent
          }
          showsVerticalScrollIndicator={false}
        >
          {viewMode === 'compact' ? (
            // 5 columns × 6 rows
            <View style={s.grid}>
              {Array.from({ length: Math.ceil(visiblePicks.length / 5) }).map((_, rowIdx) => (
                <View key={rowIdx} style={s.gridRow}>
                  {visiblePicks.slice(rowIdx * 5, rowIdx * 5 + 5).map((p) => (
                    <CompactTile
                      key={`tile-${p.rank}`}
                      pick={p}
                      brandBlue={brandBlue}
                      onPress={() => setDetail(p)}
                    />
                  ))}
                  {/* Pad incomplete rows so last row tiles don't stretch */}
                  {visiblePicks.slice(rowIdx * 5, rowIdx * 5 + 5).length < 5 &&
                    Array.from({
                      length: 5 - visiblePicks.slice(rowIdx * 5, rowIdx * 5 + 5).length,
                    }).map((_, i) => <View key={`pad-${i}`} style={{ flex: 1 }} />)}
                </View>
              ))}
            </View>
          ) : (
            // list + hits both render full PickCardRow
            visiblePicks.map((p) => (
              <ZK30PickCardRow
                key={`row-${p.rank}`}
                pick={p}
                brandBlue={brandBlue}
                onPress={() => setDetail(p)}
              />
            ))
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Detail modal */}
      <ZK30PickDetailModal
        pick={detail}
        brandBlue={brandBlue}
        onClose={() => setDetail(null)}
      />
    </View>
  );
}

// ─── Mode chip subcomponent ────────────────────────────────────────────────

interface ChipProps {
  active: boolean;
  onPress: () => void;
  Icon: React.ComponentType<{ size: number; color: string }>;
  label: string;
  count: number;
  colors: ColorTokens;
  brand: string;
  highlight?: boolean;
}
function ModeChip({ active, onPress, Icon, label, count, colors, brand, highlight }: ChipProps) {
  const color = active ? brand : colors.textTertiary;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        chipStyles.chip,
        {
          backgroundColor: active ? brand + '18' : 'transparent',
          borderColor: active ? brand + '88' : colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} view, ${count} picks`}
    >
      <Icon size={12} color={color} />
      <Text style={[chipStyles.label, { color }]}>{label}</Text>
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
  headerTitle: {
    fontSize: 18, fontWeight: '900', color: colors.text,
    letterSpacing: 1, fontFamily: theme.typography.fontFamily.bold,
  },
  headerBrand: { fontSize: 18, fontWeight: '900' },
  headerSub: {
    fontSize: 11, color: colors.textSecondary, fontWeight: '600',
    marginTop: 1,
  },
  staleInline: { fontWeight: '700' },

  // Meta strip
  metaStrip: {
    paddingHorizontal: 16, paddingVertical: 5,
    backgroundColor: colors.surface2,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  metaText: {
    fontSize: 9, color: colors.textTertiary,
    fontFamily: theme.typography.fontFamily.mono,
    letterSpacing: 0.5,
  },

  // Stale banner
  staleBanner: {
    marginHorizontal: 12, marginTop: 8,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 8, borderWidth: 1,
  },
  staleText: {
    fontSize: 11, fontWeight: '700', textAlign: 'center',
  },

  // View-mode chips
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: 12, paddingVertical: 10,
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
  gridContent: { padding: 10, gap: 8 },
  listContent: { padding: 10, gap: 8 },

  // Compact grid
  grid: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },
});
