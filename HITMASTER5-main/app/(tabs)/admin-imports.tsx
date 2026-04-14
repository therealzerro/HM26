import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Modal, TextInput } from 'react-native';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { theme } from '@/constants/theme';
import { Import } from '@/types/core';
import { Stack } from 'expo-router';
import { Button } from '@/components/Button';
import { AlertTriangle, Database, Activity as ActivityIcon, Layers, Clock3 } from 'lucide-react-native';

import { useSnapshot } from '@/hooks/useSnapshot';
import { useCoverage } from '@/hooks/useCoverage';

import { useLocalSearchParams } from 'expo-router';

export default function AdminImportsScreen() {
  const { imports, isLoading, softDeleteImport, undoSoftDeleteImport, hardDeleteImport, healthMetrics } = useDataIngestion();
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
          <Text style={styles.status(isDeleted ? theme.colors.error : item.status === 'completed' ? theme.colors.success : theme.colors.warning)}>
            {isDeleted ? 'deleted' : item.status}
          </Text>
          {workingId === item.id && <ActivityIndicator color={theme.colors.primary} size="small" />}
        </View>
      </TouchableOpacity>
    );
  };

  const [showConfirm, setShowConfirm] = useState<boolean>(false);
  const [confirmText, setConfirmText] = useState<string>('');

  const confirmHardDelete = useCallback(async () => {
    if ((confirmText ?? '').trim().toUpperCase() !== 'DELETE' || !selectedId) return;
    setShowConfirm(false);
    setConfirmText('');
    setWorkingId(selectedId);
    try {
      await hardDeleteImport(selectedId);
      setSelectedId(null);
    } finally {
      setWorkingId(null);
    }
  }, [confirmText, selectedId, hardDeleteImport]);

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
            <View style={styles.empty}> 
              <AlertTriangle size={20} color={theme.colors.textSecondary} />
              <Text style={styles.emptyText}>No imports yet</Text>
            </View>
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
                onPress={() => setShowConfirm(true)}
                variant="danger"
                disabled={workingId === selectedId}
                testID="hard-delete-btn"
              />
            </View>
          )}
        </View>
      )}

      <Modal
        transparent
        visible={showConfirm}
        animationType="fade"
        onRequestClose={() => setShowConfirm(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="hard-delete-modal">
            <Text style={styles.modalTitle}>Type DELETE to confirm</Text>
            <Text style={styles.modalSub}>This will permanently remove rows and associated aggregates.</Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="DELETE"
              autoCapitalize="characters"
              style={styles.input}
              testID="confirm-input"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => { setShowConfirm(false); setConfirmText(''); }} testID="cancel-confirm-btn" style={styles.modalBtnSecondary}>
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmHardDelete} testID="confirm-delete-btn" style={styles.modalBtnDanger}>
                <Text style={styles.modalBtnDangerText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { marginTop: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.sm },
  emptyText: { color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.sm },
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
  status: (color: string) => ({ color, fontWeight: '600' as const, textTransform: 'capitalize' as const }),
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
