import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '@/lib/supabase';
import { EmptyState } from '@/components/EmptyState';
import { Layers } from 'lucide-react-native';
import { theme } from '@/constants/theme';

const BLUE = '#0ea5e9';
const BLUE_DARK = '#0284c7';
const BLUE_LIGHT = '#e0f2fe';
const BLUE_MID = '#bae6fd';

type Scope = 'midday' | 'evening' | 'allday';

const SCOPE_LABELS: Record<Scope, string> = {
  midday: '☀️ Midday',
  evening: '🌙 Evening',
  allday: '◈ Allday',
};

interface Pick {
  combo: string;
  energy?: number;
  rank?: number;
  [key: string]: any;
}

function chunkThree(arr: Pick[]): Pick[][] {
  const out: Pick[][] = [];
  for (let i = 0; i < arr.length; i += 3) out.push(arr.slice(i, i + 3));
  return out;
}

function energyColor(e: number) {
  if (e >= 80) return '#ef4444';
  if (e >= 65) return '#f97316';
  if (e >= 45) return '#eab308';
  return '#94a3b8';
}

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
              <Text style={c.comboText}>{pick.combo ?? '---'}</Text>
              <View style={[c.energyBadge, { backgroundColor: energyColor(energy) + '22', borderColor: energyColor(energy) + '66' }]}>
                <Text style={[c.energyText, { color: energyColor(energy) }]}>{energy}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function ZK30Screen() {
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState<Scope>('allday');

  const { data: snapshot, isLoading, error, refetch } = useQuery({
    queryKey: ['zk30-snapshot', scope],
    queryFn: () =>
      fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?mode=eq.zk30&scope=eq.${encodeURIComponent(scope)}&deleted_at=is.null&order=updated_at_et.desc.nullslast&limit=1&select=*`,
      }).then(rows => (Array.isArray(rows) && rows.length > 0 ? rows[0] : null)),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const picks: Pick[] = Array.isArray(snapshot?.top_k_straights_json)
    ? snapshot.top_k_straights_json.slice(0, 30)
    : [];
  const groups = chunkThree(picks);

  return (
    <View style={[c.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={c.header}>
        <Text style={c.title}>ZK30</Text>
        <Text style={c.subtitle}>Texas 🤠</Text>
      </View>

      {/* Scope selector */}
      <View style={c.scopeRow}>
        {(['midday', 'evening', 'allday'] as Scope[]).map(sc => (
          <TouchableOpacity
            key={sc}
            style={[c.scopeBtn, scope === sc && c.scopeBtnOn]}
            onPress={() => setScope(sc)}
          >
            <Text style={[c.scopeBtnText, scope === sc && c.scopeBtnTextOn]}>
              {SCOPE_LABELS[sc]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Body */}
      {isLoading ? (
        <View style={c.center}>
          <ActivityIndicator color={BLUE} size="large" />
          <Text style={c.loadingText}>Loading ZK30 slate…</Text>
        </View>
      ) : error ? (
        <View style={c.center}>
          <Text style={c.errorText}>Failed to load snapshot</Text>
          <TouchableOpacity style={c.retryBtn} onPress={() => refetch()}>
            <Text style={c.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : !snapshot ? (
        <EmptyState
          icon={Layers}
          title={`No ZK30 snapshot — ${SCOPE_LABELS[scope]}`}
          message="Generate a slate from the Admin screen to populate this view."
        />
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
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const c = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f9ff' },

  header: {
    backgroundColor: BLUE,
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 24,
  },
  title: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  subtitle: { fontSize: 14, color: '#e0f2fe', fontWeight: '600', marginTop: 2 },

  scopeRow: {
    flexDirection: 'row',
    backgroundColor: BLUE_MID,
    padding: 4,
    gap: 4,
  },
  scopeBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    alignItems: 'center', backgroundColor: 'transparent',
  },
  scopeBtnOn: { backgroundColor: BLUE },
  scopeBtnText: { fontSize: 12, fontWeight: '600', color: BLUE_DARK },
  scopeBtnTextOn: { color: '#fff', fontWeight: '700' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { fontSize: 14, color: BLUE, marginTop: 10 },
  errorText: { fontSize: 15, color: '#ef4444', fontWeight: '700' },
  retryBtn: { backgroundColor: BLUE, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  emptyText: { fontSize: 15, color: '#0369a1', fontWeight: '700', textAlign: 'center' },
  emptyHint: { fontSize: 12, color: '#0284c7', textAlign: 'center', lineHeight: 18 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 10 },

  metaRow: { marginBottom: 4 },
  metaText: { fontSize: 11, color: '#0369a1', fontWeight: '600' },

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
    borderRadius: 10, paddingVertical: 10,
  },
  comboText: {
    fontSize: 22,
    fontFamily: theme.typography.fontFamily.monoBold, color: '#0c4a6e',
    letterSpacing: 3,
  },
  energyBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 99, borderWidth: 1,
  },
  energyText: { fontSize: 11, fontWeight: '800' },
});
