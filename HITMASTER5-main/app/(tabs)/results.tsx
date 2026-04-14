import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, MapPin, Sun, Moon } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { LedgerEntry } from '@/types/core';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '@/lib/supabase';
import { EmptyState } from '@/components/EmptyState';

export default function ResultsScreen() {
  const [selectedJurisdiction, setSelectedJurisdiction] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const ledgerQuery = useQuery<LedgerEntry[]>({
    queryKey: ['v_recent_ledger'],
    queryFn: async () => {
      const url = `/rest/v1/v_recent_ledger?select=jurisdiction,game,date_et,session,result_digits,comboset_sorted&order=date_et.desc&limit=500`;
      const res = await fetchFromSupabase<LedgerEntry[]>({ path: url, method: 'GET' });
      return Array.isArray(res) ? res : [];
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await ledgerQuery.refetch();
    setRefreshing(false);
  };

  const data = ledgerQuery.data ?? [];

  const jurisdictions = useMemo(() => Array.from(new Set(data.map((l) => l.jurisdiction))), [data]);

  const filteredLedger = selectedJurisdiction ? data.filter((l) => l.jurisdiction === selectedJurisdiction) : data;

  const groupedByDate = filteredLedger.reduce((acc, entry) => {
    if (!acc[entry.date_et]) {
      acc[entry.date_et] = [];
    }
    acc[entry.date_et].push(entry);
    return acc;
  }, {} as Record<string, LedgerEntry[]>);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Results Ledger</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.jurisdictionFilter}
        >
          <TouchableOpacity
            style={[styles.filterChip, !selectedJurisdiction && styles.filterChipActive]}
            onPress={() => setSelectedJurisdiction(null)}
            testID="jurisdiction-all"
          >
            <Text style={[styles.filterText, !selectedJurisdiction && styles.filterTextActive]}>All</Text>
          </TouchableOpacity>
          {jurisdictions.map((j) => (
            <TouchableOpacity
              key={j}
              style={[styles.filterChip, selectedJurisdiction === j && styles.filterChipActive]}
              onPress={() => setSelectedJurisdiction(j)}
              testID={`jurisdiction-${j}`}
            >
              <Text style={[styles.filterText, selectedJurisdiction === j && styles.filterTextActive]}>{j}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing || ledgerQuery.isLoading} onRefresh={handleRefresh} tintColor={theme.colors.primary} />}>
        {data.length === 0 ? (
          <EmptyState 
            icon={Calendar}
            title="No results yet"
            message="Once authoritative results are imported, they will appear here."
          />
        ) : (
          Object.entries(groupedByDate).map(([date, entries]) => (
            <View key={date} style={styles.dateGroup}>
              <View style={styles.dateHeader}>
                <Calendar size={16} color={theme.colors.primary} />
                <Text style={styles.dateText}>{date}</Text>
              </View>

              {entries.map((entry, index) => (
                <View key={`${date}-${index}`} style={styles.resultCard} testID={`result-${date}-${index}`}>
                  <View style={styles.resultHeader}>
                    <View style={styles.jurisdictionBadge}>
                      <MapPin size={12} color={theme.colors.text} />
                      <Text style={styles.jurisdictionText}>{entry.jurisdiction}</Text>
                    </View>
                    <View style={styles.sessionBadge}>
                      {entry.session === 'midday' ? <Sun size={14} color={theme.colors.warning} /> : <Moon size={14} color={theme.colors.dataBlue} />}
                      <Text style={styles.sessionText}>{entry.session === 'midday' ? 'Midday' : 'Evening'}</Text>
                    </View>
                  </View>

                  <View style={styles.resultContent}>
                    <Text style={styles.resultDigits}>{entry.result_digits}</Text>
                    <Text style={styles.comboSet}>{entry.comboset_sorted}</Text>
                  </View>

                  <View style={styles.pairPreview}>
                    <Text style={styles.pairLabel}>Front: {entry.result_digits.slice(0, 2)}</Text>
                    <Text style={styles.pairLabel}>Back: {entry.result_digits.slice(1, 3)}</Text>
                    <Text style={styles.pairLabel}>Split: {entry.result_digits[0]}{entry.result_digits[2]}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}

        <View style={styles.ingestPreview}>
          <Text style={styles.ingestTitle}>Ingest Preview</Text>
          <Text style={styles.ingestSubtitle}>Admin users can add new results via the Admin tab</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  jurisdictionFilter: {
    flexDirection: 'row',
    marginTop: theme.spacing.sm,
  },
  filterChip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surfaceLight,
    marginRight: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  filterTextActive: {
    color: theme.colors.background,
  },
  content: {
    flex: 1,
  },
  dateGroup: {
    marginBottom: theme.spacing.lg,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  dateText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  resultCard: {
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  jurisdictionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.borderRadius.sm,
  },
  jurisdictionText: {
    fontSize: theme.typography.fontSize.xs,
    fontWeight: '600',
    color: theme.colors.text,
  },
  sessionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  sessionText: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textSecondary,
  },
  resultContent: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  resultDigits: {
    fontSize: theme.typography.fontSize.xxl,
    fontWeight: 'bold',
    color: theme.colors.text,
    fontFamily: 'monospace',
    letterSpacing: 3,
  },
  comboSet: {
    fontSize: theme.typography.fontSize.lg,
    color: theme.colors.textSecondary,
    fontFamily: 'monospace',
  },
  pairPreview: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  pairLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textTertiary,
    fontFamily: 'monospace',
  },
  ingestPreview: {
    margin: theme.spacing.md,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceLight,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
  },
  ingestTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  ingestSubtitle: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
});