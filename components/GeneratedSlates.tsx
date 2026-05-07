import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { RefreshCw, Hash, CalendarClock } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useScope } from '@/hooks/useScope';

export function GeneratedSlates() {
  const { snapshot, lastUpdate, hasLiveData, refreshSnapshot } = useSnapshot();
  const { scope } = useScope();

  const hashShort = useMemo(() => (snapshot?.hash ? snapshot.hash.slice(0, 8) : null), [snapshot?.hash]);
  
  console.log('[GeneratedSlates] Rendering with:', {
    hasSnapshot: !!snapshot,
    hasLiveData,
    scope,
    snapshotScope: snapshot?.scope,
    hash: hashShort,
    topKLength: Array.isArray(snapshot?.top_k_straights_json) ? snapshot.top_k_straights_json.length : 0
  });

  return (
    <View style={styles.card} testID="generated-slates-card">
      <View style={styles.header}>
        <Hash size={18} color={theme.colors.primary} />
        <Text style={styles.title}>Generated Slates</Text>
        <TouchableOpacity onPress={refreshSnapshot} style={styles.refreshBtn} testID="generated-slates-refresh">
          <RefreshCw size={16} color={theme.colors.text} />
        </TouchableOpacity>
      </View>

      {snapshot ? (
        <View style={styles.row}>
          <View style={styles.badge}><Text style={styles.badgeText}>{scope}</Text></View>
          <View style={styles.meta}>
            <Text style={styles.metaLabel}>Hash</Text>
            <Text style={styles.metaValue}>{hashShort ?? '—'}</Text>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaLabel}>Updated</Text>
            <View style={styles.timeRow}>
              <CalendarClock size={14} color={theme.colors.textSecondary} />
              <Text style={styles.timeText}>{lastUpdate ?? '—'}</Text>
            </View>
          </View>
          <View style={styles.meta}>
            <Text style={styles.metaLabel}>Items</Text>
            <Text style={styles.metaValue}>{Array.isArray(snapshot.top_k_straights_json) ? snapshot.top_k_straights_json.length : 0}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No slate yet for {scope}</Text>
          <Text style={styles.emptyText}>Import H01Y for all classes or Re-Generate now.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '700' as const,
    color: theme.colors.text,
  },
  refreshBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surfaceLight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceLight,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  badgeText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: '700' as const,
    color: theme.colors.text,
    textTransform: 'capitalize' as const,
  },
  meta: {
    flex: 1,
  },
  metaLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: theme.typography.fontSize.md,
    fontFamily: 'monospace',
    color: theme.colors.text,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  empty: {
    paddingVertical: theme.spacing.sm,
  },
  emptyTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600' as const,
    color: theme.colors.text,
    marginBottom: 2,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
});
