import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { RefreshCw, Database, CheckCircle2, AlertCircle, Zap } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { fetchFromSupabase } from '@/lib/supabase';

import { useScope } from '@/hooks/useScope';
import { useSnapshot } from '@/hooks/useSnapshot';
import { computeSlate } from '@/engines/zk6';
import { Scope } from '@/types/core';

export default function FixRealDataScreen() {
  const { scope } = useScope();
  const { refreshSnapshot } = useSnapshot();
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);

  const runTest = useCallback(async (testName: string, testFn: () => Promise<any>) => {
    const startTime = Date.now();
    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      setTestResults(prev => [...prev, {
        name: testName,
        status: 'success',
        result,
        duration,
        timestamp: new Date().toISOString()
      }]);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      setTestResults(prev => [...prev, {
        name: testName,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        duration,
        timestamp: new Date().toISOString()
      }]);
      throw error;
    }
  }, []);

  const analyzeAndFixData = useCallback(async () => {
    setIsLoading(true);
    setTestResults([]);

    try {
      // Step 1: Analyze what data we actually have
      await runTest('Analyze Imported Data', async () => {
        const scopes = ['allday', 'midday', 'evening'];
        const analysis: any = {};

        for (const testScope of scopes) {
          const scopeFilter = `eq.${encodeURIComponent(testScope)}`;
          
          // Check box data
          const boxData = await fetchFromSupabase<any[]>({
            path: `/rest/v1/datasets_box?select=id,key,ds_normalized,horizon_label,class_id&scope=${scopeFilter}&deleted_at=is.null&limit=100`
          });

          // Check pair data
          const pairData = await fetchFromSupabase<any[]>({
            path: `/rest/v1/datasets_pair?select=id,key,ds_normalized,horizon_label,class_id&scope=${scopeFilter}&deleted_at=is.null&limit=100`
          });

          // Check percentile maps
          const percentileMaps = await fetchFromSupabase<any[]>({
            path: `/rest/v1/percentile_maps?select=id,class_id,horizon_label&scope=${scopeFilter}&deleted_at=is.null&limit=50`
          });

          // Check horizon blends
          const horizonBlends = await fetchFromSupabase<any[]>({
            path: `/rest/v1/horizon_blends?select=id,class_id,available_horizons,weights&scope=${scopeFilter}&deleted_at=is.null&limit=50`
          });

          analysis[testScope] = {
            boxEntries: Array.isArray(boxData) ? boxData.length : 0,
            pairEntries: Array.isArray(pairData) ? pairData.length : 0,
            percentileMaps: Array.isArray(percentileMaps) ? percentileMaps.length : 0,
            horizonBlends: Array.isArray(horizonBlends) ? horizonBlends.length : 0,
            boxSample: Array.isArray(boxData) ? boxData.slice(0, 3) : [],
            pairSample: Array.isArray(pairData) ? pairData.slice(0, 3) : [],
            horizons: Array.isArray(boxData) ? [...new Set(boxData.map(d => d.horizon_label))] : [],
            classes: Array.isArray(pairData) ? [...new Set(pairData.map(d => d.class_id))] : []
          };
        }

        return analysis;
      });

      // Step 2: Check current snapshots
      await runTest('Current Snapshot Status', async () => {
        // Try with hash column first, fallback without it if it doesn't exist
        let snapshots: any[] = [];
        try {
          snapshots = await fetchFromSupabase<any[]>({
            path: `/rest/v1/slate_snapshots?select=id,scope,top_k_straights_json,updated_at_et,hash,snapshot_hash&deleted_at=is.null&order=updated_at_et.desc&limit=10`
          });
        } catch (error) {
          console.log('[FixRealData] Hash column query failed, trying without hash:', error);
          snapshots = await fetchFromSupabase<any[]>({
            path: `/rest/v1/slate_snapshots?select=id,scope,top_k_straights_json,updated_at_et&deleted_at=is.null&order=updated_at_et.desc&limit=10`
          });
        }

        return {
          totalSnapshots: Array.isArray(snapshots) ? snapshots.length : 0,
          snapshots: Array.isArray(snapshots) ? snapshots.map(s => ({
            id: s.id,
            scope: s.scope,
            hasData: Array.isArray(s.top_k_straights_json) && s.top_k_straights_json.length > 0,
            dataCount: Array.isArray(s.top_k_straights_json) ? s.top_k_straights_json.length : 0,
            hash: (s.hash || s.snapshot_hash)?.slice(0, 8) || 'no-hash',
            updatedAt: s.updated_at_et
          })) : []
        };
      });

      // Step 3: Generate slate with real data for current scope
      await runTest(`Generate Real Slate for ${scope}`, async () => {
        console.log('[FixRealData] Generating slate for scope:', scope);
        
        // First check if we have the required data
        const scopeFilter = `eq.${encodeURIComponent(scope)}`;
        
        const boxCheck = await fetchFromSupabase<any[]>({
          path: `/rest/v1/datasets_box?select=id&scope=${scopeFilter}&class_id=eq.1&horizon_label=eq.H01Y&deleted_at=is.null&limit=1`
        });

        if (!Array.isArray(boxCheck) || boxCheck.length === 0) {
          throw new Error(`No H01Y box data found for scope: ${scope}. Please import H01Y data first.`);
        }

        // Generate the slate using the ZK6 engine
        const snapshot = await computeSlate({ 
          scope: scope as Scope,
          weightsKey: 'balanced',
          excludedCombos: new Set()
        });

        return {
          snapshotId: snapshot.id,
          scope: snapshot.scope,
          hash: snapshot.hash?.slice(0, 8),
          topKCount: Array.isArray(snapshot.top_k_straights_json) ? snapshot.top_k_straights_json.length : 0,
          topK: Array.isArray(snapshot.top_k_straights_json) ? snapshot.top_k_straights_json.slice(0, 5) : [],
          componentsCount: Array.isArray(snapshot.components_json) ? snapshot.components_json.length : 0,
          horizonsPresent: snapshot.horizons_present_json
        };
      });

      // Step 4: Verify the generated slate is visible
      await runTest('Verify Slate Visibility', async () => {
        // Wait a moment for the database to be consistent
        await new Promise(resolve => setTimeout(() => resolve(undefined), 1000));

        let verification: any[] = [];
        try {
          verification = await fetchFromSupabase<any[]>({
            path: `/rest/v1/slate_snapshots?select=id,scope,top_k_straights_json,hash,snapshot_hash&scope=eq.${encodeURIComponent(scope)}&deleted_at=is.null&order=updated_at_et.desc&limit=1`
          });
        } catch (error) {
          console.log('[FixRealData] Hash column verification failed, trying without hash:', error);
          verification = await fetchFromSupabase<any[]>({
            path: `/rest/v1/slate_snapshots?select=id,scope,top_k_straights_json&scope=eq.${encodeURIComponent(scope)}&deleted_at=is.null&order=updated_at_et.desc&limit=1`
          });
        }

        const latest = Array.isArray(verification) && verification.length > 0 ? verification[0] : null;
        
        return {
          found: !!latest,
          id: latest?.id,
          scope: latest?.scope,
          hash: (latest?.hash || latest?.snapshot_hash)?.slice(0, 8) || 'no-hash',
          hasTopK: Array.isArray(latest?.top_k_straights_json) && latest.top_k_straights_json.length > 0,
          topKCount: Array.isArray(latest?.top_k_straights_json) ? latest.top_k_straights_json.length : 0,
          topKSample: Array.isArray(latest?.top_k_straights_json) ? latest.top_k_straights_json.slice(0, 3) : []
        };
      });

      // Step 5: Refresh the UI snapshot
      await runTest('Refresh UI Snapshot', async () => {
        await refreshSnapshot();
        return { refreshed: true, scope };
      });

      console.log('✅ Real Data Fixed!', `Successfully generated slate with your real imported data for ${scope}. The UI should now show your actual data instead of placeholders.`);

    } catch (error) {
      console.error('Fix real data failed:', error);
      console.error('Fix Failed', error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, [scope, refreshSnapshot, runTest]);

  const clearResults = useCallback(() => {
    setTestResults([]);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Fix Real Data Display' }} />
      
      <View style={styles.header}>
        <Text style={styles.title}>Fix Real Data Display</Text>
        <Text style={styles.subtitle}>
          Analyze your imported data and generate slates using your real data instead of placeholders
        </Text>
        <View style={styles.scopeBadge}>
          <Text style={styles.scopeText}>Current Scope: {scope}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={analyzeAndFixData}
          disabled={isLoading}
        >
          <Zap size={20} color={theme.colors.text} />
          <Text style={styles.buttonText}>
            {isLoading ? 'Fixing Data...' : 'Analyze & Fix Real Data'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={clearResults}
          disabled={isLoading}
        >
          <RefreshCw size={20} color={theme.colors.text} />
          <Text style={styles.buttonText}>Clear Results</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.results}>
        {testResults.map((result) => (
          <View key={`${result.name}-${result.timestamp}`} style={styles.resultCard}>
            <View style={styles.resultHeader}>
              {result.status === 'success' ? (
                <CheckCircle2 size={16} color={theme.colors.success} />
              ) : (
                <AlertCircle size={16} color={theme.colors.error} />
              )}
              <Text style={styles.resultName}>{result.name}</Text>
              <Text style={styles.resultDuration}>{result.duration}ms</Text>
            </View>
            
            {result.status === 'success' ? (
              <View style={styles.resultContent}>
                <Text style={styles.resultData}>
                  {JSON.stringify(result.result, null, 2)}
                </Text>
              </View>
            ) : (
              <View style={styles.resultContent}>
                <Text style={styles.errorText}>{result.error}</Text>
              </View>
            )}
          </View>
        ))}
        
        {testResults.length === 0 && !isLoading && (
          <View style={styles.emptyState}>
            <Database size={48} color={theme.colors.textTertiary} />
            <Text style={styles.emptyText}>Ready to fix your data display</Text>
            <Text style={styles.emptySubtext}>
              This will analyze your imported data and generate slates using your real data
            </Text>
          </View>
        )}
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
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: theme.typography.fontSize.xl,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  scopeBadge: {
    backgroundColor: theme.colors.primary + '20',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    alignSelf: 'flex-start',
  },
  scopeText: {
    fontSize: theme.typography.fontSize.sm,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  actions: {
    flexDirection: 'row',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
  },
  primaryButton: {
    backgroundColor: theme.colors.success,
    borderColor: theme.colors.success,
  },
  secondaryButton: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  buttonText: {
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  results: {
    flex: 1,
    padding: theme.spacing.lg,
  },
  resultCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  resultName: {
    flex: 1,
    fontSize: theme.typography.fontSize.md,
    fontWeight: '600',
    color: theme.colors.text,
  },
  resultDuration: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    fontFamily: 'monospace',
  },
  resultContent: {
    padding: theme.spacing.md,
  },
  resultData: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.text,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  errorText: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.error,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    marginTop: theme.spacing.xl,
  },
  emptyText: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  emptySubtext: {
    fontSize: theme.typography.fontSize.md,
    color: theme.colors.textTertiary,
    textAlign: 'center',
  },
});