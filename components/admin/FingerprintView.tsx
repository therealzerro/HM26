import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '@/lib/supabase';
import { EngineFingerprintScreen, computeFingerprint } from '@/screens/EngineFingerprintScreen';
import { theme } from '@/constants/theme';
import { useTheme } from '@/lib/theme';

export default function FingerprintView() {
  const { colors } = useTheme();
  const { data: snapshots, isLoading, error } = useQuery({
    // queryKey bumped to invalidate any stale empty-cache from the pre-BUG-31
    // era (pre-2026-05-12) when snapshot INSERTs were silently dropping
    // top_k_straights_json.
    queryKey: ['fingerprint_snapshots_v2'],
    queryFn: async () => {
      const rows = await fetchFromSupabase<any[]>({
        path: '/rest/v1/slate_snapshots?select=scope,top_k_straights_json&deleted_at=is.null&mode=in.(balanced,conservative,aggressive)&top_k_straights_json=not.is.null&order=updated_at_et.desc&limit=100',
      });
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always', // force fresh fetch each time the screen mounts
  });

  const stats = useMemo(
    () => computeFingerprint(snapshots ?? []),
    [snapshots],
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={colors.cyan} />
        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
          Loading snapshots…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 32, marginBottom: 12 }}>⚠️</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 }}>
          Failed to load snapshots
        </Text>
        <Text style={{ fontSize: 11, color: colors.textSecondary, textAlign: 'center', fontFamily: theme.typography.fontFamily.mono }}>
          {error instanceof Error ? error.message : String(error)}
        </Text>
      </View>
    );
  }

  if (!snapshots?.length) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 32, marginBottom: 12 }}>🔬</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 }}>
          No snapshot data
        </Text>
        <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center' }}>
          Generate at least one slate to see the engine fingerprint.
        </Text>
      </View>
    );
  }

  return <EngineFingerprintScreen stats={stats} />;
}
