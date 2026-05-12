import React, { useMemo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '@/lib/supabase';
import { EngineFingerprintScreen, computeFingerprint } from '@/screens/EngineFingerprintScreen';
import { theme } from '@/constants/theme';

export default function FingerprintView() {
  const { data: snapshots, isLoading, error } = useQuery({
    queryKey: ['fingerprint_snapshots'],
    queryFn: async () => {
      const rows = await fetchFromSupabase<any[]>({
        path: '/rest/v1/slate_snapshots?select=scope,top_k_straights_json&order=updated_at_et.desc&limit=100&deleted_at=is.null',
      });
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const stats = useMemo(
    () => computeFingerprint(snapshots ?? []),
    [snapshots],
  );

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <ActivityIndicator color={theme.colors.cyan} />
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
          Loading snapshots…
        </Text>
      </View>
    );
  }

  if (error || !snapshots?.length) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 32, marginBottom: 12 }}>🔬</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 6 }}>
          No snapshot data
        </Text>
        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center' }}>
          Generate at least one slate to see the engine fingerprint.
        </Text>
      </View>
    );
  }

  return <EngineFingerprintScreen stats={stats} />;
}
