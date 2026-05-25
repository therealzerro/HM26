// ARCH-06 step 7 — ZK30 v1.0 slate view (operator-only, hidden tab).
// Reads slate_snapshots_zk30 (TX, allday, balanced — all implicit in
// the table's CHECK constraints + the single-snapshot-per-day pattern).
// Hidden tab gating lives in app/(tabs)/_layout.tsx `href: null`.

import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFromSupabase } from '@/lib/supabase';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { EmptyState } from '@/components/EmptyState';
import { Layers } from 'lucide-react-native';
import { theme } from '@/constants/theme';

// ─── ZK30 blue palette (deliberately hardcoded; light-only for v1.0 internal use) ───
const BLUE       = '#0ea5e9';
const BLUE_DARK  = '#0284c7';
const BLUE_DEEP  = '#0c4a6e';
const BLUE_LIGHT = '#e0f2fe';
const BLUE_MID   = '#bae6fd';
const BG         = '#f0f9ff';

// Hit-badge palette
const HIT_S    = '#10b981'; // emerald-500 — natural straight
const HIT_B    = '#3b82f6'; // blue-500    — natural box
const HIT_FBS  = '#f97316'; // orange-500  — fireball straight
const HIT_FBB  = '#f59e0b'; // amber-500   — fireball box
const HIT_DIM  = '#cbd5e1'; // slate-300

// ─── Types ──────────────────────────────────────────────────────────────────

interface Pick {
  combo: string;
  comboSet?: string;
  bestOrder?: string;
  energy?: number;
  temperature?: number;
  rank?: number;
  multiplicity?: string;
  topPair?: string;
  /** Set by run-hit-detection-zk30 after a match is recorded. */
  hitType?: 'straight' | 'box' | 'fireball_straight' | 'fireball_box';
  hitSession?: string;
  hitResult?: string;
  hitFireball?: string | null;
  [key: string]: any;
}

interface Snapshot {
  id: string;
  slate_date: string;
  jurisdiction: string;
  scope: string;
  mode: string;
  engine_version: string;
  snapshot_hash: string;
  updated_at_et: string;
  top_k_straights_json: Pick[] | string | null;
  /** Set client-side by useZK30Snapshot when today's slate is missing and
   *  yesterday's is shown instead. */
  _isStale?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function chunkThree<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 3) out.push(arr.slice(i, i + 3));
  return out;
}

function energyColor(e: number): string {
  if (e >= 80) return '#ef4444';
  if (e >= 65) return '#f97316';
  if (e >= 45) return '#eab308';
  return '#94a3b8';
}

/** Derive the 4 boolean hit flags from a pick's single hitType. Multi-hit
 *  picks (e.g., natural box + fireball-substituted straight on same day) are
 *  captured in adaptive_tracking_zk30; the snapshot only carries the primary
 *  match per pick. v1.0 trade-off — see ARCH-06 step 7 audit. */
function deriveHitFlags(hitType: Pick['hitType']): {
  s: boolean; b: boolean; fbs: boolean; fbb: boolean;
} {
  return {
    s:   hitType === 'straight',
    b:   hitType === 'box',
    fbs: hitType === 'fireball_straight',
    fbb: hitType === 'fireball_box',
  };
}

function parsePicks(raw: Pick[] | string | null | undefined): Pick[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

// ─── Hit-badge strip ───────────────────────────────────────────────────────

function HitBadgeStrip({ pick }: { pick: Pick }) {
  const flags = deriveHitFlags(pick.hitType);
  const anyHit = flags.s || flags.b || flags.fbs || flags.fbb;
  // Superset suppression: B suppressed when S is on (every straight is also
  // a box); 🔥B suppressed when 🔥S is on. Matches the run-hit-detection
  // edge function's primary-precedence selection (straight > box >
  // fb_straight > fb_box) so at most one badge is ever fully colored in
  // v1.0 — but the four slots are always rendered to give operators a
  // consistent visual scan target.
  const badges: { letter: string; on: boolean; color: string; }[] = [
    { letter: 'S',  on: flags.s,                          color: HIT_S },
    { letter: 'B',  on: flags.b && !flags.s,              color: HIT_B },
    { letter: '🔥S', on: flags.fbs,                       color: HIT_FBS },
    { letter: '🔥B', on: flags.fbb && !flags.fbs,         color: HIT_FBB },
  ];
  return (
    <View style={[h.strip, !anyHit && h.stripDim]}>
      {badges.map((b, i) => (
        <View
          key={i}
          accessibilityLabel={
            b.letter === 'S'   ? 'Straight match'           :
            b.letter === 'B'   ? 'Box match'                :
            b.letter === '🔥S' ? 'Fireball straight match'  :
                                 'Fireball box match'
          }
          style={[
            h.badge,
            b.on
              ? { backgroundColor: b.color + '22', borderColor: b.color + '88' }
              : { backgroundColor: HIT_DIM + '22', borderColor: HIT_DIM + '55' },
          ]}
        >
          <Text style={[h.badgeText, { color: b.on ? b.color : HIT_DIM }]}>
            {b.letter}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── Pick group card (3 picks per row) ─────────────────────────────────────

function PickGroupCard({ group, groupIdx }: { group: Pick[]; groupIdx: number }) {
  return (
    <View style={c.card}>
      <Text style={c.cardLabel}>GROUP {groupIdx + 1}</Text>
      <View style={c.cardRow}>
        {group.map((pick, i) => {
          const energy = typeof pick.energy === 'number' ? pick.energy
            : typeof pick.temperature === 'number' ? pick.temperature : 0;
          return (
            <View key={i} style={c.pickCell}>
              <Text style={c.comboText}>{pick.bestOrder ?? pick.combo ?? '---'}</Text>
              <View style={[c.energyBadge, { backgroundColor: energyColor(energy) + '22', borderColor: energyColor(energy) + '66' }]}>
                <Text style={[c.energyText, { color: energyColor(energy) }]}>{energy}</Text>
              </View>
              <HitBadgeStrip pick={pick} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Data fetch (today → yesterday fallback) ───────────────────────────────

async function fetchLatestZK30Snapshot(): Promise<Snapshot | null> {
  const today = getTodayET();
  const yesterday = getYesterdayET();

  const fetchOne = async (date: string): Promise<Snapshot | null> => {
    const rows = await fetchFromSupabase<Snapshot[]>({
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

// ─── Screen ────────────────────────────────────────────────────────────────

export default function ZK30Screen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: snapshot, isPending, isError, refetch } = useQuery({
    queryKey: ['zk30-snapshot-latest'],
    queryFn: fetchLatestZK30Snapshot,
    staleTime: 5 * 60 * 1000,
  });

  // 7.6 — refetch on focus so post-09:00-ET drop appears when operator
  // returns from another tab. Invalidate so react-query treats the cached
  // entry as stale and refires queryFn.
  useFocusEffect(
    useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['zk30-snapshot-latest'] });
    }, [queryClient]),
  );

  const picks = parsePicks(snapshot?.top_k_straights_json).slice(0, 30);
  const groups = chunkThree(picks);

  // ─── Header subline + metadata footer copy ────────────────────────────────
  const slateDateLabel = snapshot?.slate_date ?? '—';
  const isStale = snapshot?._isStale === true;
  const headerSubtitle = snapshot
    ? `TX · ALL-DAY · ${slateDateLabel}${isStale ? ' (yesterday)' : ''}`
    : 'TX · ALL-DAY';

  const hash8 = (snapshot?.snapshot_hash ?? '').slice(0, 8);
  const engineV = snapshot?.engine_version ?? '—';
  const genTime = snapshot?.updated_at_et
    ? new Date(snapshot.updated_at_et).toLocaleString()
    : '—';

  return (
    <View style={[c.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={c.header}>
        <Text style={c.title}>ZK30</Text>
        <Text style={c.subtitle}>{headerSubtitle}</Text>
      </View>

      {/* Scope locked label (no chips — v1.0 is single-scope) */}
      <View style={c.scopeBar}>
        <Text style={c.scopeLockedLabel}>◈  ALL-DAY  ·  TEXAS</Text>
      </View>

      {/* Stale banner */}
      {isStale && (
        <View style={c.staleBanner}>
          <Text style={c.staleText}>
            Showing yesterday&apos;s slate ({slateDateLabel}). Today&apos;s slate hasn&apos;t generated yet.
          </Text>
        </View>
      )}

      {/* Body */}
      {isPending ? (
        <View style={c.center}>
          <ActivityIndicator color={BLUE} size="large" />
          <Text style={c.loadingText}>Loading today&apos;s slate…</Text>
        </View>
      ) : isError ? (
        <View style={c.center}>
          <Text style={c.errorText}>Failed to load slate</Text>
          <TouchableOpacity style={c.retryBtn} onPress={() => refetch()}>
            <Text style={c.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !snapshot ? (
        <View style={c.center}>
          <EmptyState
            icon={Layers}
            title="No slate yet"
            message="Next drop: 09:00 ET (Mon–Sat). Regenerate manually from Admin."
          />
          <TouchableOpacity style={c.adminBtn} onPress={() => router.push('/(tabs)/admin')}>
            <Text style={c.adminBtnText}>Open Admin</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={c.scroll} contentContainerStyle={c.scrollContent}>
          <View style={c.metaRow}>
            <Text style={c.metaText}>
              {picks.length} picks · {snapshot.updated_at_et ? new Date(snapshot.updated_at_et).toLocaleString() : '—'}
            </Text>
          </View>
          {groups.map((group, i) => (
            <PickGroupCard key={i} group={group} groupIdx={i} />
          ))}
          {/* 7.7 — Metadata footer */}
          <View style={c.footer}>
            <Text style={c.footerMono}>
              v{engineV} · {hash8 || '——'} · gen {genTime}
            </Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const c = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    backgroundColor: BLUE,
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 24,
  },
  title: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  subtitle: { fontSize: 14, color: BLUE_LIGHT, fontWeight: '600', marginTop: 2 },

  scopeBar: {
    backgroundColor: BLUE_MID,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: BLUE + '33',
  },
  scopeLockedLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: BLUE_DARK,
    letterSpacing: 2,
  },

  staleBanner: {
    backgroundColor: '#fef3c7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  staleText: { fontSize: 11, color: '#92400e', fontWeight: '600', textAlign: 'center' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { fontSize: 14, color: BLUE, marginTop: 10 },
  errorText: { fontSize: 15, color: '#ef4444', fontWeight: '700' },
  retryBtn: { backgroundColor: BLUE, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  adminBtn: { marginTop: 16, backgroundColor: BLUE, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 12 },
  adminBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 10 },

  metaRow: { marginBottom: 4 },
  metaText: { fontSize: 11, color: BLUE_DARK, fontWeight: '600' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BLUE_MID,
    padding: 14,
    gap: 10,
  },
  cardLabel: {
    fontSize: 9, fontWeight: '900', color: BLUE,
    letterSpacing: 2,
  },
  cardRow: { flexDirection: 'row', gap: 8 },
  pickCell: {
    flex: 1, alignItems: 'center', gap: 6,
    backgroundColor: BLUE_LIGHT,
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 6,
  },
  comboText: {
    fontSize: 22,
    fontFamily: theme.typography.fontFamily.monoBold,
    color: BLUE_DEEP,
    letterSpacing: 3,
  },
  energyBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 99, borderWidth: 1,
  },
  energyText: { fontSize: 11, fontWeight: '800' },

  footer: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: BLUE_MID,
    alignItems: 'center',
  },
  footerMono: {
    fontSize: 10,
    fontFamily: theme.typography.fontFamily.mono,
    color: BLUE_DARK,
    letterSpacing: 0.5,
  },
});

const h = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
  },
  stripDim: { opacity: 0.4 },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    minWidth: 22,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
});
