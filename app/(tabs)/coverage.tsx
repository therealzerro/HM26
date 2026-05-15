import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshCw } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { useTheme, type ColorTokens } from '@/lib/theme';
import { HORIZONS, PAIR_CLASSES, SCOPES } from '@/constants/pairClasses';
import { useCoverage } from '@/hooks/useCoverage';
import { useScope } from '@/hooks/useScope';
import { HorizonLabel } from '@/types/core';

export default function CoverageScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { matrix, coveragePctH01Y, refetch } = useCoverage();
  const { scope } = useScope();
  const [selected, setSelected] = useState<{ classId: number; horizon: HorizonLabel } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const rows = useMemo(() => Object.keys(PAIR_CLASSES).map((k) => Number(k)), []);
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } catch (error) {
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Coverage' }} />
      <LinearGradient
        colors={['#0d1b2a', colors.background] as [string, string]}
        start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Coverage Matrix</Text>
            <Text style={styles.subtitle}>ZK6 minimum (H01Y): {coveragePctH01Y}% • All scopes</Text>
          </View>
          <TouchableOpacity 
            style={styles.refreshBtn} 
            onPress={handleRefresh}
            disabled={isRefreshing}
            testID="coverage-refresh"
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <RefreshCw size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>
      <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: theme.spacing.md }}>
        <View>
          <View style={styles.rowHeader}>
            <Text style={styles.cellHeader}>Class</Text>
            {HORIZONS.map((h) => (
              <Text key={h} style={styles.cellHeader}>{h}</Text>
            ))}
          </View>
          {rows.map((cid) => (
            <View key={cid} style={styles.row}>
              <Text style={styles.classLabel}>{(PAIR_CLASSES as any)[cid]?.label ?? `Class ${cid}`}</Text>
              {HORIZONS.map((h) => {
                const cell = matrix[cid]?.[h];
                const ok = !!cell?.present;
                return (
                  <TouchableOpacity
                    key={h}
                    style={[styles.cell, ok ? styles.cellOk : styles.cellMiss]}
                    onPress={() => setSelected({ classId: cid, horizon: h })}
                    testID={`cov-${cid}-${h}`}
                  >
                    <Text style={ok ? styles.ok : styles.miss}>{ok ? '✓' : '⌛'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {selected && (
        <View style={styles.sheet} testID="coverage-detail">
          <Text style={styles.sheetTitle}>Details · Class {selected.classId} · {selected.horizon}</Text>
          <Text style={styles.sheetText}>Present: {matrix[selected.classId]?.[selected.horizon]?.present ? 'yes' : 'no'}</Text>
          <Text style={styles.sheetText}>Rows: {matrix[selected.classId]?.[selected.horizon]?.count ?? 0}</Text>
          {matrix[selected.classId]?.[selected.horizon]?.lastImportId && (
            <Text style={styles.sheetLink}>import_id: {matrix[selected.classId]?.[selected.horizon]?.lastImportId}</Text>
          )}
          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={() => setSelected(null)}>
              <Text style={styles.btnSecondaryText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: theme.spacing.md },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  refreshBtn: { padding: 8, borderRadius: 8, backgroundColor: colors.surface },
  title: { color: colors.text, fontSize: theme.typography.fontSize.xl, fontWeight: '700' as const },
  subtitle: { color: colors.textSecondary, marginTop: 4 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cellHeader: { width: 84, textAlign: 'center' as const, color: colors.textSecondary, fontSize: theme.typography.fontSize.xs },
  classLabel: { width: 160, color: colors.text, fontSize: theme.typography.fontSize.sm },
  cell: { width: 84, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  cellOk: { backgroundColor: colors.success + '20' },
  cellMiss: { backgroundColor: colors.surface },
  ok: { color: colors.success, fontWeight: '700' as const },
  miss: { color: colors.textSecondary },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, borderColor: colors.border, padding: theme.spacing.md },
  sheetTitle: { color: colors.text, fontWeight: '700' as const, marginBottom: 6 },
  sheetText: { color: colors.text },
  sheetLink: { color: colors.primary, marginTop: 4 },
  sheetActions: { marginTop: theme.spacing.md, flexDirection: 'row', justifyContent: 'flex-end' },
  btnSecondary: { paddingHorizontal: theme.spacing.md, paddingVertical: 10, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: colors.border },
  btnSecondaryText: { color: colors.text },
});