import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { RefreshCw, Database, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { theme } from '@/constants/theme';
import { fetchFromSupabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export default function TestSlateDataScreen() {
  const { user } = useAuth();
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

  const testDatabaseConnection = useCallback(async () => {
    setIsLoading(true);
    setTestResults([]);

    try {
      // Test 1: Basic connection
      await runTest('Database Connection', async () => {
        const result = await fetchFromSupabase<any[]>({
          path: '/rest/v1/slate_snapshots?select=id&limit=1'
        });
        return { connected: true, rowCount: Array.isArray(result) ? result.length : 0 };
      });

      // Test 2: Check for snapshots in all scopes
      const scopes = ['allday', 'midday', 'evening'];
      for (const scope of scopes) {
        await runTest(`Snapshots for ${scope}`, async () => {
          const result = await fetchFromSupabase<any[]>({
            path: `/rest/v1/slate_snapshots?select=id,scope,top_k_straights_json,updated_at_et&scope=eq.${encodeURIComponent(scope)}&deleted_at=is.null&order=updated_at_et.desc&limit=5`
          });
          return {
            scope,
            count: Array.isArray(result) ? result.length : 0,
            snapshots: Array.isArray(result) ? result.map(r => ({
              id: r.id,
              hasTopK: Array.isArray(r.top_k_straights_json) && r.top_k_straights_json.length > 0,
              topKLength: Array.isArray(r.top_k_straights_json) ? r.top_k_straights_json.length : 0,
              updatedAt: r.updated_at_et
            })) : []
          };
        });
      }

      // Test 3: Check latest view
      await runTest('Latest Snapshots View', async () => {
        const result = await fetchFromSupabase<any[]>({
          path: '/rest/v1/v_latest_slate_snapshots?select=id,scope,top_k_straights_json&limit=10'
        });
        return {
          count: Array.isArray(result) ? result.length : 0,
          byScope: Array.isArray(result) ? result.reduce((acc, r) => {
            acc[r.scope] = (acc[r.scope] || 0) + 1;
            return acc;
          }, {} as Record<string, number>) : {}
        };
      });

      // Test 4: Create comprehensive mock data
      await runTest('Create/Verify Mock Data', async () => {
        const scopes = ['allday', 'midday', 'evening'];
        const results = [];
        
        for (const testScope of scopes) {
          const mockSnapshot = {
            scope: testScope,
            snapshot_hash: `test_hash_${testScope}_${Date.now()}`,
            hash: `test_hash_${testScope}_${Date.now()}`,
            horizons_present_json: {
              'H01Y': true,
              'H02Y': true,
              'H03Y': testScope === 'allday' || testScope === 'evening'
            },
            weights_json: {
              'H01Y': testScope === 'allday' ? 0.4 : 0.6,
              'H02Y': testScope === 'allday' ? 0.35 : 0.4,
              ...(testScope === 'evening' || testScope === 'allday' ? { 'H03Y': 0.25 } : {})
            },
            top_k_straights_json: [
              { combo: '123', indicator: 0.95, box: 0.85, pburst: 0.78, co: 0.72, bestOrder: 'straight', multiplicity: 'singles', topPair: '12' },
              { combo: '456', indicator: 0.92, box: 0.78, pburst: 0.69, co: 0.65, bestOrder: 'straight', multiplicity: 'singles', topPair: '45' },
              { combo: '789', indicator: 0.88, box: 0.72, pburst: 0.61, co: 0.58, bestOrder: 'straight', multiplicity: 'singles', topPair: '78' },
              { combo: '012', indicator: 0.84, box: 0.68, pburst: 0.55, co: 0.52, bestOrder: 'straight', multiplicity: 'singles', topPair: '01' },
              { combo: '345', indicator: 0.81, box: 0.64, pburst: 0.51, co: 0.48, bestOrder: 'straight', multiplicity: 'singles', topPair: '34' }
            ],
            top_k_boxes_json: [
              { combo: '12', indicator: 0.88, box: 0.72, pburst: 0.65, co: 0.58 },
              { combo: '45', indicator: 0.84, box: 0.68, pburst: 0.61, co: 0.54 }
            ],
            components_json: [
              {
                combo: '123',
                components: { BOX: 0.85, PBURST: 0.78, CO: 0.72 },
                temperature: 95,
                multiplicity: 'singles' as const,
                topPair: '12',
                indicator: 0.95
              },
              {
                combo: '456',
                components: { BOX: 0.78, PBURST: 0.69, CO: 0.65 },
                temperature: 92,
                multiplicity: 'singles' as const,
                topPair: '45',
                indicator: 0.92
              }
            ],
            updated_at_et: new Date().toISOString()
          };

          try {
            const result = await fetchFromSupabase<any>({
              path: '/rest/v1/slate_snapshots',
              method: 'POST',
              headers: { 'Prefer': 'return=representation' },
              body: mockSnapshot
            });

            results.push({
              scope: testScope,
              created: true,
              id: Array.isArray(result) ? result[0]?.id : result?.id,
              topKCount: mockSnapshot.top_k_straights_json.length
            });
          } catch (error) {
            results.push({
              scope: testScope,
              created: false,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        return {
          totalScopes: scopes.length,
          results,
          successCount: results.filter(r => r.created).length
        };
      });

      // Test 5: Verify final data state
      await runTest('Final Data Verification', async () => {
        const finalResult = await fetchFromSupabase<any[]>({
          path: '/rest/v1/slate_snapshots?select=id,scope,top_k_straights_json,updated_at_et&deleted_at=is.null&order=updated_at_et.desc&limit=10'
        });
        return {
          totalSnapshots: Array.isArray(finalResult) ? finalResult.length : 0,
          scopeCounts: Array.isArray(finalResult) ? finalResult.reduce((acc, r) => {
            acc[r.scope] = (acc[r.scope] || 0) + 1;
            return acc;
          }, {} as Record<string, number>) : {},
          hasValidData: Array.isArray(finalResult) && finalResult.length > 0
        };
      });

    } catch (error) {
      console.error('Test suite failed:', error);
      Alert.alert('Test Failed', error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, [user?.role, runTest]);

  const clearResults = useCallback(() => {
    setTestResults([]);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Test Slate Data' }} />
      
      <View style={styles.header}>
        <Text style={styles.title}>Database & Slate Data Test</Text>
        <Text style={styles.subtitle}>Test database connection and slate data availability</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={testDatabaseConnection}
          disabled={isLoading}
        >
          <RefreshCw size={20} color={theme.colors.text} />
          <Text style={styles.buttonText}>
            {isLoading ? 'Running Tests...' : 'Run Tests'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={clearResults}
          disabled={isLoading}
        >
          <Database size={20} color={theme.colors.text} />
          <Text style={styles.buttonText}>Clear Results</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.results}>
        {testResults.map((result, index) => (
          <View key={index} style={styles.resultCard}>
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
            <Text style={styles.emptyText}>No test results yet</Text>
            <Text style={styles.emptySubtext}>Run tests to check database connectivity and slate data</Text>
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
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
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