import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Upload, Database, Activity as ActivityIcon, RefreshCw, FileText, AlertCircle, History, Copy } from 'lucide-react-native';
import { GeneratedSlates } from '@/components/GeneratedSlates';
import { theme } from '@/constants/theme';
import { RoleGuard } from '@/components/RoleGuard';
import { Button } from '@/components/Button';
import { useRouter } from 'expo-router';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useCoverage } from '@/hooks/useCoverage';
import { useDataIngestion } from '@/hooks/useDataIngestion';
import { useScope } from '@/hooks/useScope';
import { RegenerateResult } from '@/types/core';

export default function AdminScreen() {
  const router = useRouter();
  const { refreshSnapshot } = useSnapshot();
  const { refreshHealth, regenerateSlate, imports, isLoading, healthMetrics } = useDataIngestion();
  const { coveragePctH01Y, missingH01Y } = useCoverage();
  const { scope } = useScope();
  const [generating] = useState<boolean>(false);
  const [showErrors, setShowErrors] = useState<boolean>(false);

  const failedImports = useMemo(() => (imports || []).filter(i => i.status === 'failed'), [imports]);

  const copyTextSafe = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (Platform.OS === 'web') {
        const navAny = (globalThis as unknown as { navigator?: any }).navigator;
        if (navAny?.clipboard?.writeText) {
          try {
            await navAny.clipboard.writeText(text);
            return true;
          } catch {}
        }
        const docAny = globalThis as unknown as { document?: any };
        const d = docAny.document;
        if (d?.body) {
          const ta = d.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          d.body.appendChild(ta);
          ta.select();
          const ok = d.execCommand && d.execCommand('copy');
          d.body.removeChild(ta);
          return !!ok;
        }
        return false;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const handleImportHistory = () => {
    router.push('/import-wizard');
  };

  const handleDailyInput = () => {
    router.push('/import-wizard');
  };

  const [regenLoading, setRegenLoading] = useState<boolean>(false);
  const handleRegenerateSlate = async () => {
    try {
      setRegenLoading(true);
      console.log('[Admin] Starting slate regeneration for scope:', scope);
      
      const result: RegenerateResult = await regenerateSlate(scope);
      console.log('[Admin] Regeneration result:', result);
      
      // Refresh snapshot deterministically after successful regeneration
      if (result.status === 'success') {
        console.log('[Admin] Regeneration successful, refreshing snapshot');
        await refreshSnapshot();
        Alert.alert('✅ Slate regenerated', `Hash ${result.hash ?? '—'}`);
      } else if (result.status === 'missing') {
        Alert.alert('Missing H01Y', result.message, [
          { text: 'Go to Coverage →', onPress: () => router.push('/(tabs)/coverage' as any) },
          { text: 'OK' }
        ]);
      } else if (result.status === 'noop') {
        Alert.alert('No-Op', result.message);
      } else if (result.status === 'busy') {
        Alert.alert('Materializer busy—try again soon.');
      } else {
        Alert.alert('Error', result.message || 'Failed to regenerate slate');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to regenerate slate');
      console.log('[Admin] Regenerate error:', error);
    } finally {
      setRegenLoading(false);
    }
  };
  


  return (
    <RoleGuard allowedRoles={['admin']}>
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <TouchableOpacity style={[styles.healthCard, { margin: theme.spacing.md }]} onPress={() => router.push('/(tabs)/coverage' as any)} testID="coverage-matrix-link">
          <ActivityIcon size={20} color={theme.colors.success} />
          <Text style={styles.healthLabel}>Open Coverage Matrix</Text>
        </TouchableOpacity>
        <ScrollView style={styles.content}>
          <View style={styles.section}>
            <GeneratedSlates />
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Import & Health</Text>
            
            <View style={styles.laneContainer}>
              <View style={styles.lane}>
                <View style={styles.laneHeader}>
                  <Database size={20} color={theme.colors.primary} />
                  <Text style={styles.laneTitle}>History Lane</Text>
                </View>
                <Text style={styles.laneDescription}>
                  Import annual history files for Box and Pair classes
                </Text>
                <Button
                  title="Import History Upload"
                  onPress={handleImportHistory}
                  variant="secondary"
                  testID="import-history-btn"
                />
              </View>

              <View style={styles.lane}>
                <View style={styles.laneHeader}>
                  <History size={20} color={theme.colors.dataBlue} />
                  <Text style={styles.laneTitle}>Import History</Text>
                </View>
                <Text style={styles.laneDescription}>
                  Browse, filter and manage previous imports
                </Text>
                <Button
                  title="Open Import History"
                  onPress={() => router.push('/(tabs)/admin-imports' as any)}
                  variant="secondary"
                  testID="open-import-history"
                />
              </View>

              <View style={styles.lane}>
                <View style={styles.laneHeader}>
                  <Upload size={20} color={theme.colors.success} />
                  <Text style={styles.laneTitle}>Daily Lane</Text>
                </View>
                <Text style={styles.laneDescription}>
                  Ingest daily results and ledger entries
                </Text>
                <Button
                  title="Daily Input"
                  onPress={handleDailyInput}
                  variant="secondary"
                  testID="daily-input-btn"
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Health Panel</Text>
            
            <View style={styles.healthGrid}>
              <TouchableOpacity style={styles.healthCard} onPress={() => router.push('/(tabs)/coverage' as any)} testID="coverage-card">
                <ActivityIcon size={24} color={theme.colors.success} />
                <Text style={styles.healthValue}>{Number(coveragePctH01Y ?? 0).toFixed(0)}%</Text>
                <Text style={styles.healthLabel}>Coverage (H01Y)</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.healthCard} onPress={() => router.push({ pathname: '/(tabs)/admin-imports', params: { type: 'box_history', scope } } as any)} testID="box-entries-card">
                <Database size={24} color={theme.colors.primary} />
                <Text style={styles.healthValue}>{healthMetrics?.datasetCounts.boxEntries ?? 0}</Text>
                <Text style={styles.healthLabel}>Box Entries</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.healthCard} onPress={() => router.push({ pathname: '/(tabs)/admin-imports', params: { type: 'pair_history', scope } } as any)} testID="pair-entries-card">
                <FileText size={24} color={theme.colors.warning} />
                <Text style={styles.healthValue}>{healthMetrics?.datasetCounts.pairEntries ?? 0}</Text>
                <Text style={styles.healthLabel}>Pair Entries</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.healthCard} onPress={() => router.push({ pathname: '/(tabs)/admin-imports', params: { type: 'daily_input', scope } } as any)} testID="daily-imports-card">
                <History size={24} color={theme.colors.dataBlue} />
                <Text style={styles.healthValue}>{healthMetrics?.datasetCounts.dailyImports ?? 0}</Text>
                <Text style={styles.healthLabel}>Daily Imports</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.healthCard} onPress={() => router.push({ pathname: '/(tabs)/admin-imports', params: { type: 'ledger', scope } } as any)} testID="ledger-imports-card">
                <FileText size={24} color={theme.colors.text} />
                <Text style={styles.healthValue}>{healthMetrics?.datasetCounts.ledgerImports ?? 0}</Text>
                <Text style={styles.healthLabel}>Ledger Imports</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.healthCard} onPress={() => setShowErrors(true)} testID="errors-card">
                <AlertCircle size={24} color={theme.colors.error} />
                <Text style={styles.healthValue}>{failedImports.length}</Text>
                <Text style={styles.healthLabel}>Errors</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actions</Text>
            
            <View style={styles.actionsContainer}>
              <TouchableOpacity 
                style={styles.actionCard}
                onPress={async () => {
                  const missing = missingH01Y;
                  if (missing.length > 0) {
                    Alert.alert('Missing H01Y', `Missing H01Y: ${missing.map(m => m.label).join(', ')}`, [
                      { text: 'Go to Coverage →', onPress: () => router.push('/(tabs)/coverage' as any) },
                      { text: 'OK' }
                    ]);
                    return;
                  }
                  await handleRegenerateSlate();
                }}
                disabled={regenLoading}
                testID="regenerate-slate"
              >
                <RefreshCw size={24} color={theme.colors.primary} />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Re-Generate Slate</Text>
                  <Text style={styles.actionDescription}>
                    {regenLoading ? 'Regenerating…' : 'Force regeneration of ZK6 slate with current data'}
                  </Text>
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => router.push('/settings/test-backend')}
                testID="test-backend"
              >
                <ActivityIcon size={24} color={theme.colors.success} />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Test Backend & Run-2E</Text>
                  <Text style={styles.actionDescription}>
                    System diagnostics and health checks
                  </Text>
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => router.push('/test-slate-data')}
                testID="test-slate-data"
              >
                <Database size={24} color={theme.colors.primary} />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Test Slate Data</Text>
                  <Text style={styles.actionDescription}>
                    Test database connection and create mock slate data
                  </Text>
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => router.push('/fix-slate-data')}
                testID="fix-slate-data"
              >
                <RefreshCw size={24} color={theme.colors.success} />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Fix Slate Display</Text>
                  <Text style={styles.actionDescription}>
                    Create mock slate data to fix display issues
                  </Text>
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.actionCard}
                onPress={() => router.push('/fix-real-data')}
                testID="fix-real-data"
              >
                <Database size={24} color={theme.colors.hotGlow} />
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>🔥 Fix Real Data Display</Text>
                  <Text style={styles.actionDescription}>
                    Generate slates using your actual imported data instead of placeholders
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.importHistory}>
            <Text style={styles.historyTitle}>Recent Imports</Text>
            {(imports || []).length === 0 ? (
              <View style={styles.historyItem}>
                <View style={styles.historyDot} />
                <Text style={styles.historyText}>No imports yet</Text>
              </View>
            ) : (
              imports.slice(0, 5).map((importItem) => (
                <View key={importItem.id} style={styles.historyItem}>
                  <View style={[
                    styles.historyDot, 
                    { backgroundColor: importItem.status === 'completed' ? theme.colors.success : 
                                     importItem.status === 'failed' ? theme.colors.error : 
                                     theme.colors.warning }
                  ]} />
                  <Text style={styles.historyText}>
                    {importItem.type} - {importItem.scope} - {importItem.status}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <Modal transparent visible={showErrors} animationType="fade" onRequestClose={() => setShowErrors(false)}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard} testID="errors-drawer">
              <View style={styles.modalHeader}>
                <AlertCircle size={18} color={theme.colors.error} />
                <Text style={styles.modalTitle}>Recent Import Failures</Text>
              </View>
              {failedImports.length === 0 ? (
                <Text style={styles.emptyErrors}>No recent failures</Text>
              ) : (
                <ScrollView style={styles.errorsList}>
                  {failedImports.slice(0, 50).map((imp) => (
                    <TouchableOpacity key={imp.id} style={styles.errorRow} onPress={() => { setShowErrors(false); router.push('/(tabs)/admin-imports' as any); }}>
                      <View style={styles.errorDot} />
                      <View style={styles.errorContent}>
                        <Text style={styles.errorTitle}>{imp.type} • {imp.scope} • {new Date(imp.created_at).toLocaleString()}</Text>
                        <Text style={styles.errorBody} numberOfLines={2}>{(imp.error_text ?? '').split('\n')[0] || 'Unknown error'}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={async () => { const ok = await copyTextSafe(imp.error_text ?? ''); if (!ok) console.error('Copy blocked'); }}
                        style={styles.copyBtn}
                        testID={`copy-error-${imp.id}`}
                      >
                        <Copy size={14} color={theme.colors.text} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <View style={styles.modalActions}>
                <Button title="Close" onPress={() => setShowErrors(false)} variant="secondary" />
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </RoleGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  modalBackdrop: { flex: 1, backgroundColor: '#0009', alignItems: 'center', justifyContent: 'center', padding: theme.spacing.lg },
  modalCard: { width: '100%', maxWidth: 520, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.lg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  modalTitle: { color: theme.colors.text, fontSize: theme.typography.fontSize.lg, fontWeight: '700' as const },
  errorsList: { maxHeight: 360 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.sm, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  errorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.error },
  errorTitle: { color: theme.colors.text, fontSize: theme.typography.fontSize.sm, fontWeight: '600' as const },
  errorBody: { color: theme.colors.textSecondary, fontSize: theme.typography.fontSize.xs },
  emptyErrors: { color: theme.colors.textSecondary },
  modalActions: { marginTop: theme.spacing.md, flexDirection: 'row', justifyContent: 'flex-end' },
  copyBtn: { padding: 6, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.borderRadius.sm },
  content: {
    flex: 1,
  },
  section: {
    padding: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  laneContainer: {
    gap: theme.spacing.md,
  },
  lane: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  laneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  laneTitle: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.text,
  },
  laneDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  healthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  healthCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  healthValue: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: theme.spacing.sm,
    fontFamily: 'monospace',
  },
  healthLabel: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  actionsContainer: {
    gap: theme.spacing.md,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  actionDescription: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  importHistory: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    marginTop: theme.spacing.md,
  },
  historyTitle: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  historyText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  errorContent: {
    flex: 1,
  },
});