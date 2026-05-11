import React, { useMemo, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { theme } from '@/constants/theme';
import { Import } from '@/types/core';
import { Stack } from 'expo-router';
import { Button } from '@/components/Button';
import { AlertTriangle, Database, Activity as ActivityIcon, Layers, Clock3 } from 'lucide-react-native';
import { EmptyState } from '@/components/EmptyState';

import { useSnapshot } from '@/hooks/useSnapshot';
import { useCoverage } from '@/hooks/useCoverage';

import { useLocalSearchParams } from 'expo-router';

export default function AdminImportsScreen() {
  const { imports, isLoading, softDeleteImport, undoSoftDeleteImport, healthMetrics } = useDataIngestion();
  const queryClient = useQueryClient();
  const { lastUpdate } = useSnapshot();
  const { coveragePctH01Y } = useCoverage();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const params = useLocalSearchParams<{ type?: string; scope?: string }>();

  const sorted = useMemo(() => {
    let data = Array.isArray(imports) ? [...imports] : [];
    if (params?.type) {
      const t = String(params.type);
      data = data.filter((i) => i.type === t);
    }
    if (params?.scope) {
      const s = String(params.scope);
      data = data.filter((i) => (i.scope ?? '') === s);
    }
    data.sort((a, b) => (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    return data;
  }, [imports, params?.type, params?.scope]);

  const handleSoftDelete = useCallback(async (id: string) => {
    setWorkingId(id);
    try {
      await softDeleteImport(id);
    } catch (e) {
      Alert.alert('Soft Delete Failed', String(e instanceof Error ? e.message : e));
    } finally {
      setWorkingId(null);
    }
  }, [softDeleteImport]);

  const handleUndo = useCallback(async (id: string) => {
    setWorkingId(id);
    try {
      await undoSoftDeleteImport(id);
    } finally {
      setWorkingId(null);
    }
  }, [undoSoftDeleteImport]);

  const renderItem = ({ item }: { item: Import }) => {
    const isDeleted = item.status === 'deleted' || item.deleted_at;
    return (
      <TouchableOpacity
        onPress={() => setSelectedId(selectedId === item.id ? null : item.id)}
        style={[styles.row, selectedId === item.id && styles.rowActive]}
        testID={`import-row-${item.id}`}
      >
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle}>{item.type} · {item.scope ?? '—'}</Text>
          <Text style={styles.rowSub}>{new Date(item.created_at).toLocaleString()}</Text>
          <View style={styles.rowChips}>
            <View style={[styles.chip, styles.chipBlue]}>
              <Layers size={12} color={theme.colors.primary} />
              <Text style={styles.chipText}>Horizon: {item.horizon_label ?? '—'}</Text>
            </View>
            <View style={[styles.chip, styles.chipGreen]}>
              <Database size={12} color={theme.colors.success} />
              <Text style={styles.chipText}>Entries: {item.counts ?? 0}</Text>
            </View>
          </View>
        </View>
        <View style={styles.rowMeta}>
          <Text style={[styles.statusText, { color: isDeleted ? theme.colors.error : item.status === 'completed' ? theme.colors.success : theme.colors.warning }]}>
            {isDeleted ? 'deleted' : item.status}
          </Text>
          {workingId === item.id && <ActivityIndicator color={theme.colors.primary} size="small" />}
        </View>
      </TouchableOpacity>
    );
  };

  const loadImports = () => {
    setSelectedId(null);
    queryClient.invalidateQueries({ queryKey: ['imports'] });
    queryClient.invalidateQueries({ queryKey: ['health_metrics'] });
  };

  const hardDeleteImport = (imp: Import) => {
    const confirmDelete = () => {
      const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
      const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

      const xhrDelete = (path: string) => new Promise<number>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('DELETE', url + path, true);
        xhr.setRequestHeader('apikey', key!);
        xhr.setRequestHeader('Authorization', 'Bearer ' + key);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4) {
            console.log('XHR DELETE', path, 'status:', xhr.status);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(xhr.status);
            } else {
              reject(new Error(xhr.status + ': ' + xhr.responseText));
            }
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(null);
      });

      const run = async () => {
        try {
          if (imp.type === 'box_history') {
            await xhrDelete('/rest/v1/datasets_box?import_id=eq.' + imp.id);
            if (imp.scope && imp.horizon_label) {
              await xhrDelete(
                '/rest/v1/datasets_box' +
                '?scope=eq.' + imp.scope +
                '&horizon_label=eq.' + imp.horizon_label +
                '&class_id=eq.1' +
                '&import_id=is.null'
              );
            }
          } else if (imp.type === 'pair_history') {
            await xhrDelete('/rest/v1/datasets_pair?import_id=eq.' + imp.id);
            if (imp.scope && imp.horizon_label) {
              await xhrDelete(
                '/rest/v1/datasets_pair' +
                '?scope=eq.' + imp.scope +
                '&horizon_label=eq.' + imp.horizon_label +
                '&import_id=is.null'
              );
            }
          } else if (imp.type === 'ledger') {
            await xhrDelete('/rest/v1/histories?import_id=eq.' + imp.id);
          }

          await xhrDelete('/rest/v1/imports?id=eq.' + imp.id);

          Alert.alert('Success', 'Import deleted.');
          loadImports();
        } catch(err) {
          Alert.alert('Delete Error', String(err));
        }
      };

      run();
    };

    Alert.alert(
      'Delete Import',
      'Permanently delete this import and its data?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: confirmDelete }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Import History' }} />
      {isLoading ? (
        <View style={styles.center}> 
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.infoHeader} testID="admin-imports-info">
            <View style={styles.infoChip}>
              <ActivityIcon size={16} color={theme.colors.success} />
              <Text style={styles.infoChipText}>Coverage: {Number(coveragePctH01Y ?? 0).toFixed(0)}%</Text>
            </View>
            <View style={styles.infoChip}>
              <Database size={16} color={theme.colors.primary} />
              <Text style={styles.infoChipText}>Box: {healthMetrics?.datasetCounts.boxEntries ?? 0}</Text>
            </View>
            <View style={styles.infoChip}>
              <Clock3 size={16} color={theme.colors.textSecondary} />
              <Text style={styles.infoChipText}>Last: {lastUpdate ?? 'Never'}</Text>
            </View>
          </View>
          {sorted.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No Imports Yet"
              message="Import box history, pair history, or daily data to get started."
            />
          ) : (
            <FlatList
              data={sorted}
              keyExtractor={(i) => i.id}
              renderItem={renderItem}
              ItemSeparatorComponent={() => <View style={styles.sep} />}
              contentContainerStyle={styles.listPad}
              testID="imports-list"
            />
          )}

          {selectedId && (
            <View style={styles.footer}>
              <Button
                title="Soft Delete"
                onPress={() => handleSoftDelete(selectedId)}
                variant="secondary"
                disabled={workingId === selectedId}
                testID="soft-delete-btn"
              />
              <Button
                title="Undo"
                onPress={() => handleUndo(selectedId)}
                disabled={workingId === selectedId}
                testID="undo-delete-btn"
              />
              <Button
                title="Hard Delete"
                onPress={() => {
                  const imp = imports.find(i => i.id === selectedId);
                  if (imp) hardDeleteImport(imp);
                }}
                variant="danger"
                disabled={workingId === selectedId}
                testID="hard-delete-btn"
              />
            </View>
          )}
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listPad: { padding: theme.spacing.md },
  sep: { height: 8 },
  row: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md, padding: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowActive: { borderColor: theme.colors.primary },
  rowMain: { gap: 4 },
  rowTitle: { color: theme.colors.text, fontWeight: '600' as const },
  rowSub: { color: theme.colors.textTertiary, fontSize: theme.typography.fontSize.xs },
  rowChips: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' as const },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  chipBlue: { borderColor: theme.colors.primary + '55', backgroundColor: theme.colors.primary + '10' },
  chipGreen: { borderColor: theme.colors.success + '55', backgroundColor: theme.colors.success + '10' },
  chipText: { color: theme.colors.text, fontSize: theme.typography.fontSize.xs },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontWeight: '600' as const, textTransform: 'capitalize' as const },
  footer: { flexDirection: 'row', gap: theme.spacing.md, padding: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
  infoHeader: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' as const, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm },
  infoChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  infoChipText: { color: theme.colors.text },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: theme.spacing.lg, borderWidth: 1, borderColor: theme.colors.border },
  modalTitle: { color: theme.colors.text, fontWeight: '700' as const, fontSize: theme.typography.fontSize.lg, marginBottom: theme.spacing.xs },
  modalSub: { color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.sm, marginBottom: theme.spacing.md },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.md, paddingHorizontal: theme.spacing.md, paddingVertical: 10, color: theme.colors.text, backgroundColor: theme.colors.background, marginBottom: theme.spacing.md },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.md },
  modalBtnSecondary: { paddingHorizontal: theme.spacing.md, paddingVertical: 10, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  modalBtnSecondaryText: { color: theme.colors.text },
  modalBtnDanger: { paddingHorizontal: theme.spacing.md, paddingVertical: 10, borderRadius: theme.borderRadius.md, backgroundColor: theme.colors.error },
  modalBtnDangerText: { color: '#fff' },
});
